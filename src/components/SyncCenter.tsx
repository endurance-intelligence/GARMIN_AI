import {useEffect,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseReady,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {WeightWheelPicker} from './WeightWheelPicker'
import '../styles/sync-center.css'

type Source={
  checkedAt?:string|null;lastSuccessAt?:string|null;result?:string;latestDate?:string|null;
  scope?:string;state?:string;syncSource?:'manual'|'cloud';reason?:string;ageMinutes?:number|null;
  pending?:number|null;counts?:Record<string,number>
}
type Weight={weigh_date:string;weight_kg:number;state:string;updated_at:string;confirmed_at:string|null}
type IntervalsPublication={
  id:string;revision:number;intervals_published_revision:number|null;
  intervals_sync_status:string;intervals_event_id:number|null;
  intervals_published_at?:string|null
}
type IntervalsStatus={
  configured:boolean;connectedAt:string|null;
  publications:IntervalsPublication[];eligiblePlanIds:string[];garminConfirmed:boolean
}

type CronJob={name:string;active:boolean;lastStartedAt:string|null;lastFinishedAt:string|null;lastDispatchStatus:string|null}
type SyncPayload={sources:{
  activities:Source;health:Source;equipment:Source;calendar:Source;fit:Source
};scheduler?:{available:boolean;jobs:CronJob[]};cloudConnect?:{
  connected:boolean;status:string;lastResult?:string;lastCheckedAt?:string|null;lastSuccessAt?:string|null
};cloudBackoff?:{available:boolean;active:boolean;retryAfter:string|null;lastLimitedAt?:string|null;attempts:number};
  weightEntries:Weight[];weightTransferAvailable:boolean}
function berlinDay(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const item=(type:string)=>parts.find(p=>p.type===type)?.value||''
  return [item('year'),item('month'),item('day')].join('-')
}
function shortWeightDate(day:string):string {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return day
  const instant=Date.parse(day+'T12:00:00Z')
  if(!Number.isFinite(instant))return day
  return new Intl.DateTimeFormat('de-DE',{
    timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'
  }).format(new Date(instant))
}
function dateText(raw?:string|null){
  if(!raw)return 'Noch kein bestätigter Stand'
  const timestamp=Date.parse(raw)
  return Number.isFinite(timestamp)?
    new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(timestamp)):
    raw
}
async function api<T>(session:Session,method:'GET'|'POST',body?:unknown):Promise<T>{
  const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-sync-center',{
    method,
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
      ...(method==='POST'?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    cache:'no-store'
  })
  const payload=await response.json() as T&{error?:string}
  if(!response.ok)throw Error(payload.error||'Synchronisierung nicht erreichbar.')
  return payload
}

function stateText(value?:string) {
  const states:Record<string,string>={
    ok:'Aktuell',stale:'Veraltet',failed:'Fehlgeschlagen',unknown:'Nicht verifiziert',
    manual:'Manueller Leseimport',partial:'Teilweise erfolgreich',
    attention:'Prüfen',processing:'In Bearbeitung',idle:'Keine offenen Aufgaben'
  }
  return states[value||'']||'Status unbekannt'
}
export function SyncCenter({active,mode,onSaved,inlineWheel=false}:{active:boolean;mode:'weight'|'status';onSaved?:(kg:number)=>void;inlineWheel?:boolean}){
  const [session,setSession]=useState<Session|null>(null)
  const [data,setData]=useState<SyncPayload|null>(null)
  const [intervals,setIntervals]=useState<IntervalsStatus|null>(null)
  const [intervalsUnavailable,setIntervalsUnavailable]=useState(false)
  const [date,setDate]=useState(berlinDay)
  const [weight,setWeight]=useState('')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [refresh,setRefresh]=useState(0)
  const [connecting,setConnecting]=useState(false)
  const [cloudChecking,setCloudChecking]=useState(false)

  useEffect(()=>{
    if(!active||!garminSupabase)return
    let mounted=true
    void garminSupabase.auth.getSession().then(({data})=>{
      if(mounted)setSession(data.session)
    })
    const {data:{subscription}}=garminSupabase.auth.onAuthStateChange((_event,current)=>{
      if(mounted)setSession(current)
    })
    return()=>{mounted=false;subscription.unsubscribe()}
  },[active])
  useEffect(()=>{
    if(!active||!session)return
    let mounted=true
    void api<SyncPayload>(session,'GET').then(payload=>{
      if(mounted){
        setData(payload);setError('')
        // Prefill from the latest recorded measurement at or before the date,
        // without replacing a value already selected by the athlete.
        const recent=payload.weightEntries
          .filter(entry=>entry.weigh_date<=date)
          .sort((a,b)=>b.weigh_date.localeCompare(a.weigh_date))[0]
        const lastKg=recent?.weight_kg
        if(typeof lastKg==='number'&&lastKg>=30&&lastKg<=300)
          setWeight(current=>current||lastKg.toFixed(1))
      }
    }).catch(err=>{
      if(mounted)setError(err instanceof Error?err.message:'Sync-Status nicht verfügbar.')
    })
    return()=>{mounted=false}
  },[active,session?.access_token,refresh])
  // Read existing, authenticated Intervals bridge status separately from the
  // historic Garmin Connect calendar snapshot. Never infer device delivery.
  useEffect(()=>{
    if(!active||mode!=='status'||!session)return
    let mounted=true
    setIntervalsUnavailable(false)
    void fetch(garminSupabaseUrl+'/functions/v1/garmin-intervals',{
      cache:'no-store',headers:{
        authorization:'Bearer '+session.access_token,apikey:garminPublishableKey
      }
    }).then(async res=>{
      if(!res.ok)throw Error('Intervals status HTTP '+res.status)
      return await res.json() as IntervalsStatus
    }).then(payload=>{
      if(mounted){setIntervals(payload);setIntervalsUnavailable(false)}
    }).catch(()=>{
      if(mounted){setIntervals(null);setIntervalsUnavailable(true)}
    })
    return()=>{mounted=false}
  },[active,mode,session?.access_token,refresh])

  async function save(){
    if(!session||busy)return
    const kg=Number(weight.replace(',','.'))
    if(!/\d/.test(weight)||!Number.isFinite(kg)||kg<30||kg>300||
      Math.abs(kg*100-Math.round(kg*100))>.00001){
      setError('Bitte ein gültiges Gewicht in kg eingeben (30–300 kg).')
      return
    }
    setBusy(true);setError('');setNotice('')
    try{
      const answer=await api<{saved:boolean;transferStatus:string;garminUpdated:boolean}>(
        session,'POST',{date,kg})
      if(!answer.saved||answer.garminUpdated)throw Error('Unerwartete Antwort des Gewichtsdienstes.')
      setNotice('Gewicht gespeichert. Übertragung zu Garmin Connect steht noch aus.')
      setWeight(kg.toFixed(1))
      setRefresh(n=>n+1)
      onSaved?.(kg)
    }catch(err){
      setError(err instanceof Error?err.message:'Gewicht konnte nicht gespeichert werden.')
    }finally{setBusy(false)}
  }

  async function connectCloudFromLocal() {
    if(!session||connecting||!data||data.cloudConnect?.status!=='configured' ||
      data.cloudConnect.connected)return
    const accepted=window.confirm(
      'Garmin Connect Cloud einmalig verbinden?\n\n'+
      'Die bestehende lokale Garmin-Connect-OAuth-Sitzung wird über eine geschützte Verbindung '+
      'verschlüsselt in Supabase Vault gespeichert.\n\n'+
      'Der Cloud-Live-Test und die automatische Synchronisierung sind damit noch NICHT aktiviert. '+
      'Es wird nichts in Garmin geändert.'
    )
    if(!accepted)return
    setConnecting(true);setError('');setNotice('')
    try {
      const response=await fetch('/api/garmin-connect-bootstrap',{
        method:'POST',
        headers:{
          authorization:'Bearer '+session.access_token,
          'x-garmin-cloud-consent':'ja'
        },
        cache:'no-store'
      })
      const answer=await response.json() as {saved?:boolean;message?:string;error?:string}
      if(!response.ok||answer.saved!==true)
        throw Error(answer.error||'Vault-Übertragung konnte nicht bestätigt werden.')
      setNotice(answer.message||'Sitzung in Supabase Vault gespeichert, Cloud-Test ausstehend.')
      const latest=await api<SyncPayload>(session,'GET')
      setData(latest)
    } catch(e) {
      setError(e instanceof Error?e.message:'Cloud-Übertragung konnte nicht bestätigt werden.')
    } finally {
      setConnecting(false)
    }
  }

  async function checkCloudLive() {
    if(!session||!data?.cloudConnect?.connected||cloudChecking)return
    setCloudChecking(true);setError('');setNotice('')
    try{
      const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-connect-cloud-check',{
        method:'POST',cache:'no-store',
        headers:{
          authorization:'Bearer '+session.access_token,
          apikey:garminPublishableKey
        }
      })
      const result=await response.json() as {
        verified?:boolean;status?:string;error?:string
      }
      if(!response.ok)
        throw Error(result.error||'Cloud-Verbindungstest nicht verfügbar.')
      const labels:Record<string,string>={
        verified:'Garmin Connect direkt von Supabase erreicht – lesender Cloud-Test erfolgreich.',
        expired:'Gespeicherte Sitzung ist abgelaufen. Sie muss serverseitig erneuert werden.',
        auth_failed:'Garmin hat die Sitzung abgelehnt. Bitte noch keine automatische Synchronisierung starten.',
        rate_limited:'Garmin begrenzt Anfragen. Kein sofortiger erneuter Versuch.',
        unavailable:'Garmin nicht erreichbar. Der Cloud-Test war nicht erfolgreich.',
        invalid_response:'Garmin hat keine erwartete Profilantwort geliefert.'
      }
      setNotice(labels[result.status||'']||'Cloud-Testergebnis ist unklar.')
      const latest=await api<SyncPayload>(session,'GET')
      setData(latest)
    }catch(e){
      setError(e instanceof Error?e.message:'Cloud-Test nicht verfügbar.')
    }finally{
      setCloudChecking(false)
    }
  }

  if(!active)return null
  const today=data?.weightEntries.find(v=>v.weigh_date===date)
  const gearFromCloud=data?.sources.equipment.syncSource==='cloud'
  const automaticRows=[
    {name:'Aktivitäten',source:data?.sources.activities,
      detail:'Letzter bestätigter Import: '+dateText(data?.sources.activities.lastSuccessAt)},
    {name:'Gesundheitsdaten',source:data?.sources.health,
      detail:'Letzter Messtag: '+(data?.sources.health.latestDate||'unbekannt')},
    ...(gearFromCloud?[{name:'Laufschuhe · Garmin-Cloud-Abgleich',source:data?.sources.equipment,
      detail:'Letzter bestätigter Schuhabgleich: '+dateText(data?.sources.equipment.checkedAt)}]:[])
  ]
  const manualRows=[
    ...(!gearFromCloud?[{name:'Garmin-Ausrüstung · bisheriger Import',source:data?.sources.equipment,
      detail:'Vor dem ersten erfolgreichen Cloud-Abgleich: '+dateText(data?.sources.equipment.checkedAt)}]:[]),
    {name:'Garmin-Kalender · Leseimport',source:data?.sources.calendar,
      detail:'Optionaler Garmin-Connect-Snapshot: '+dateText(data?.sources.calendar.checkedAt)+
       '. Nicht die Coach-Übertragung via Intervals.icu.'}
  ]
  return <section className={mode==='weight'?'sync-center sync-center-weight':'sync-center'} aria-label={mode==='weight'?'Tägliches Gewicht':'Synchronisierungsstatus'}>
    {mode==='weight'?<>
      <div className="sync-top sync-weight-top">
        <div className="sync-weight-heading">
          <span className="micro-label">MORGENROUTINE / GARMIN</span>
          <h3>Gewicht</h3>
        </div>
        {session&&<label className="sync-date-field">
          <span className="sync-date-caption">Datum</span>
          <span className="sync-date-display" aria-hidden="true">
            <strong>{shortWeightDate(date)}</strong>
            <span className="sync-date-action">Ändern</span>
          </span>
          <input type="date" aria-label="Datum auswählen" value={date}
            onChange={event=>{
              const selectedDate=event.target.value
              if(!selectedDate)return
              setDate(selectedDate)
              const existing=data?.weightEntries.find(entry=>entry.weigh_date===selectedDate)
              if(existing)setWeight(Number(existing.weight_kg).toFixed(1))
            }}
            max={berlinDay()} disabled={busy}/>
        </label>}
      </div>
      {garminSupabaseReady&&!session&&<p className="sync-hint">Bitte unter Einstellungen anmelden.</p>}
      {!garminSupabaseReady&&<p className="sync-hint">Supabase-Zugang fehlt.</p>}
      {session&&<div className="sync-weigh-form">
        <div className="sync-weight-field">
          {inlineWheel&&!data?<p className="sync-hint">Lade letztes Gewicht …</p>:
           <WeightWheelPicker key={inlineWheel?date:undefined}
            value={weight} onChange={setWeight} disabled={busy} inline={inlineWheel}/>}

        </div>
        <button type="button" className="sync-weight-save" onClick={()=>void save()}
          disabled={busy||!weight}>
          {busy?'Speichere …':'Gewicht speichern'}
        </button>
      </div>}
      {today&&<p className="sync-hint">Eintrag {shortWeightDate(today.weigh_date)}: <strong>{Number(today.weight_kg).toLocaleString('de-DE')} kg</strong> · {today.state==='confirmed'?'In Garmin bestätigt':'Garmin-Übertragung ausstehend'}</p>}
      <p className="sync-weight-note">In GARMIN_AI gespeichert · Garmin-Übertragung folgt nach Freigabe.</p>
    </>:<>
      <div className="sync-top"><div><span className="micro-label">DATA / INTEGRATION</span><h3>Synchronisierungsstatus.</h3>
        <p>Echte Zeitstempel der bestehenden Datenquellen – keine künstlichen Scores.</p></div>
        <button type="button" className="secondary" onClick={()=>setRefresh(n=>n+1)}>Prüfen</button>
      </div>
      {session&&data?<>
        {data.cloudBackoff?.active&&<div className="sync-garmin-backoff" role="status">
          <strong>Garmin-Zugang vorübergehend pausiert (HTTP 429)</strong>
          <p>Garmin hat den Tokenabruf begrenzt. Der automatische Cloud-Job
            sendet während der gespeicherten Sperrfrist keine weiteren Garmin-Anfragen.
            Nächster Versuch frühestens nach {dateText(data.cloudBackoff.retryAfter)}.
            Die vorhandenen Schuhzuordnungen bleiben erhalten.</p>
        </div>}
        <div className="sync-source-list">{automaticRows.map(row=>
          <div className="sync-source" key={row.name}>
            <div className="sync-source-head"><strong>{row.name}</strong>
              <span className={`sync-state sync-state-${row.source?.state||'unknown'}`}>{stateText(row.source?.state)}</span>
            </div>
            <span>Letzter Versuch: {dateText(row.source?.checkedAt)}</span>
            <small>{row.detail}</small>
          </div>)}</div>
        <details className="sync-manual-imports">
          <summary>{gearFromCloud?'Optionaler alter Garmin-Kalendersnapshot':
            'Optionale Garmin-Leseimporte · bisherige Ausrüstung &amp; Kalender'}</summary>
          <p>{gearFromCloud?
            'Schuhzuordnungen werden über den Cloud-Job geprüft. Der alte Garmin-Kalender-Snapshot bleibt optional und wird nicht als Workout-Übertragung verwendet.':
            'Der inkrementelle Garmin-Schuhabgleich ist eingerichtet, aber der erste erfolgreiche Cloud-Lauf ist noch nicht bestätigt. Bis dahin bleibt der bisherige Ausrüstungsstand sichtbar. Der alte Kalenderimport ist optional.'}</p>
          <div className="sync-source-list">{manualRows.map(row=>
            <div className="sync-source" key={row.name}>
              <div className="sync-source-head"><strong>{row.name}</strong>
                <span className={`sync-state sync-state-${row.source?.state||'unknown'}`}>{stateText(row.source?.state)}</span>
              </div>
              <span>Letzter Stand: {dateText(row.source?.checkedAt)}</span>
              <small>{row.detail}</small>
            </div>)}</div>
        </details>
      </>:<p className="sync-hint">{session?'Lese Status …':'Bitte zuerst unter Einstellungen anmelden.'}</p>}
      {session&&data&&<div className="sync-intervals" aria-label="Coach-Workouts und Intervals.icu">
        <div className="sync-source-head"><strong>Coach → Intervals.icu → Garmin-Uhr</strong>
          <span className={'sync-state '+(intervals?.configured?'sync-state-ok':'sync-state-unknown')}>
            {intervalsUnavailable?'Abfrage nicht verfügbar':intervals?.configured?'API-Key hinterlegt':
             intervals?'Nicht verbunden':'Prüfe Verbindung …'}
          </span>
        </div>
        <p>{intervals?.configured?
          'Intervals.icu-Verbindung eingerichtet. Veröffentlichungen brauchen deine Freigabe und einen strukturierten Workout-Entwurf.':
          'Der Garmin-Connect-Kalenderimport oben ist für diesen Übertragungsweg nicht erforderlich.'}</p>
        {intervals&&<p className="sync-intervals-count">Bei Intervals.icu bestätigte Workout-Exporte: <strong>{
          (intervals.publications||[]).filter(x=>x.intervals_sync_status==='confirmed'&&
            Number.isSafeInteger(x.intervals_event_id)&&Number(x.intervals_event_id)>0).length
        }</strong> · Zuletzt: {dateText((intervals.publications||[])
          .filter(x=>x.intervals_sync_status==='confirmed'&&x.intervals_published_at)
          .map(x=>x.intervals_published_at!).sort().at(-1)||null)}</p>}
        <small>Wichtig: Der 7-Tage-Coach erzeugt derzeit zunächst einfache Kalenderentwürfe,
          keine direkt übertragbaren strukturierten Workouts. Die Intervals.icu-Brücke akzeptiert
          aktuell nur ausdrücklich freigegebene Workout-Archiv-Trainings.
          Eine Intervals-Bestätigung belegt noch nicht die Ankunft bei Garmin oder auf der Uhr.
          Dort „Upload planned workouts“ aktivieren und auf der Forerunner prüfen.</small>
      </div>}
      {session&&data&&<div className="sync-technical">
        <div className="sync-source-head"><strong>FIT-Verarbeitung</strong>
          <span className={`sync-state sync-state-${data.sources.fit.state||'unknown'}`}>{stateText(data.sources.fit.state)}</span>
        </div>
        <p>{data.sources.fit.pending??'–'} offene FIT-Aktivitäten · {data.sources.fit.counts?.retry??'–'} Wiederholungen · {data.sources.fit.counts?.complete??'–'} vollständig</p>
        <p>Garmin Connect Cloud: {data.cloudConnect?.status!=='configured'?
          'Cloud-Speicherstatus unklar – Supabase-Migration prüfen':
          data.cloudConnect.connected?
            data.cloudConnect.lastResult==='verified'
              ? 'Sitzung im Supabase Vault gespeichert – Cloud-Zugriff zuletzt bestätigt'
              : 'Sitzung im Supabase Vault gespeichert – Cloud-Zugriff noch nicht bestätigt'
            : 'Noch keine Cloud-Sitzung eingerichtet'}</p>
        {data.cloudConnect?.connected&&<div className="sync-cloud-bootstrap">
          <div className="sync-cloud-readout">
            <p>Letzter Cloud-Live-Test: {data.cloudConnect.lastCheckedAt?
              dateText(data.cloudConnect.lastCheckedAt):'noch nicht ausgeführt'}</p>
            <p>Ergebnis: {({
              verified:'Garmin erreichbar',expired:'Sitzung abgelaufen',
              auth_failed:'Garmin-Anmeldung abgelehnt',rate_limited:'Anfragen begrenzt',
              unavailable:'Nicht erreichbar',invalid_response:'Antwort ungültig',
              never:'Noch nicht geprüft',unknown:'Status unbekannt'
            } as Record<string,string>)[data.cloudConnect.lastResult||'unknown']||'Unbekannt'}</p>
            <small>Reiner Lesezugriff. Es werden weder Garmin-Daten noch Token geändert.</small>
          </div>
          {import.meta.env.DEV && <button type="button" onClick={()=>void checkCloudLive()}
            disabled={cloudChecking}>
            {cloudChecking?'Prüfe Verbindung …':'Cloud-Verbindung testen'}
          </button>}
        </div>}
        {import.meta.env.DEV && data.cloudConnect?.status==='configured'&&!data.cloudConnect.connected&&
          <div className="sync-cloud-bootstrap">
            <p>Deine bestehende lokale Garmin-Connect-Sitzung kann einmalig in den verschlüsselten
              Supabase Vault übernommen werden. Es werden keine Garmin-Daten geändert.</p>
            <button type="button" onClick={()=>void connectCloudFromLocal()}
              disabled={connecting}>
              {connecting?'Verbinde sicher …':'Garmin Connect Cloud verbinden'}
            </button>
          </div>}
        <p>Scheduler: {data.scheduler?.available?
          `${data.scheduler.jobs.length} Garmin-Jobs erkannt (${data.scheduler.jobs.filter(j=>j.active).length} aktiv)`:
          'Cron-Status nicht verfügbar'}</p>
        <small>Der Scheduler-Nachweis allein beweist keine erfolgreiche Garmin-Datenübertragung.</small>
        {!!data.scheduler?.jobs.length&&<details className="sync-cron-details">
          <summary>Geplante Garmin-Jobs anzeigen</summary>
          {data.scheduler.jobs.slice(0,12).map(job=><div className="sync-cron-job" key={job.name}>
            <strong>{job.name}</strong>
            <small>{job.active?'Zeitplan aktiv':'Zeitplan deaktiviert'} · Dispatch: {job.lastDispatchStatus||'unbekannt'} · {dateText(job.lastFinishedAt)}</small>
          </div>)}
        </details>}
      </div>}
      <p className="sync-weight-note">Die manuell gelesenen Garmin-Connect-Ausrüstungsdaten und
        der optionale Garmin-Kalendersnapshot sind getrennt von der Coach-Übertragung.
        Coach-Workouts gehen nach Freigabe über Intervals.icu zu Garmin;
        ein tatsächlicher Eingang auf der Uhr wird hier nicht behauptet.
        Die FIT-Zeitstempel und Import-Rückstände bleiben unverändert sichtbar.</p>
    </>}
    {notice&&<p className="sync-notice" role="status">{notice}</p>}
    {error&&<p className="sync-error" role="alert">{error}</p>}
  </section>
}
