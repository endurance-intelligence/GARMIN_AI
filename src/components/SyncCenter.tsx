import {useEffect,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseReady,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/sync-center.css'

type Source={
  checkedAt?:string|null;lastSuccessAt?:string|null;result?:string;latestDate?:string|null;
  scope?:string;state?:string;reason?:string;ageMinutes?:number|null;
  pending?:number|null;counts?:Record<string,number>
}
type Weight={weigh_date:string;weight_kg:number;state:string;updated_at:string;confirmed_at:string|null}
type CronJob={name:string;active:boolean;lastStartedAt:string|null;lastFinishedAt:string|null;lastDispatchStatus:string|null}
type SyncPayload={sources:{
  activities:Source;health:Source;equipment:Source;calendar:Source;fit:Source
};scheduler?:{available:boolean;jobs:CronJob[]};cloudConnect?:{
  connected:boolean;status:string;lastResult?:string;lastCheckedAt?:string|null;lastSuccessAt?:string|null
};weightEntries:Weight[];weightTransferAvailable:boolean}
function berlinDay(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const item=(type:string)=>parts.find(p=>p.type===type)?.value||''
  return [item('year'),item('month'),item('day')].join('-')
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
    manual:'Manueller Abgleich',partial:'Teilweise erfolgreich',
    attention:'Prüfen',processing:'In Bearbeitung',idle:'Keine offenen Aufgaben'
  }
  return states[value||'']||'Status unbekannt'
}
export function SyncCenter({active,mode}:{active:boolean;mode:'weight'|'status'}){
  const [session,setSession]=useState<Session|null>(null)
  const [data,setData]=useState<SyncPayload|null>(null)
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
      if(mounted){setData(payload);setError('')}
    }).catch(err=>{
      if(mounted)setError(err instanceof Error?err.message:'Sync-Status nicht verfügbar.')
    })
    return()=>{mounted=false}
  },[active,session?.access_token,refresh])

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
      setWeight('')
      setRefresh(n=>n+1)
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
  const rows=[
    {name:'Aktivitäten',source:data?.sources.activities,
      detail:'Letzter bestätigter Import: '+dateText(data?.sources.activities.lastSuccessAt)},
    {name:'Gesundheitsdaten',source:data?.sources.health,
      detail:'Letzter Messtag: '+(data?.sources.health.latestDate||'unbekannt')},
    {name:'Ausrüstung',source:data?.sources.equipment,
      detail:'Letzte vollständige Zuordnung: '+dateText(data?.sources.equipment.checkedAt)},
    {name:'Trainingskalender',source:data?.sources.calendar,
      detail:'Letzter lokaler Snapshot: '+dateText(data?.sources.calendar.checkedAt)}
  ]
  return <section className="sync-center" aria-label={mode==='weight'?'Tägliches Gewicht':'Synchronisierungsstatus'}>
    {mode==='weight'?<>
      <div className="sync-top"><div><span className="micro-label">MORGENROUTINE / GARMIN</span><h3>Gewicht eintragen.</h3>
        <p>Einmal morgens wiegen und erfassen. Die Übertragung nach Garmin wird separat bestätigt.</p></div>
      </div>
      {garminSupabaseReady&&!session&&<p className="sync-hint">Bitte unter Einstellungen anmelden.</p>}
      {!garminSupabaseReady&&<p className="sync-hint">Supabase-Zugang fehlt.</p>}
      {session&&<div className="sync-weigh-form">
        <label>Datum<input type="date" value={date} onChange={e=>setDate(e.target.value)}
          max={berlinDay()} disabled={busy}/></label>
        <label>Gewicht in kg<input type="number" inputMode="decimal" step="0.1" min="30" max="300"
          placeholder="z. B. 77,5" value={weight} onChange={e=>setWeight(e.target.value)} disabled={busy}/></label>
        <button type="button" onClick={()=>void save()} disabled={busy||!weight}>
          {busy?'Speichere …':'Gewicht speichern'}
        </button>
      </div>}
      {today&&<p className="sync-hint">Eintrag vom {today.weigh_date}: <strong>{Number(today.weight_kg).toLocaleString('de-DE')} kg</strong> · {today.state==='confirmed'?'In Garmin bestätigt':'Übertragung nach Garmin ausstehend'}</p>}
      <p className="sync-weight-note">Aktuell wird das Gewicht sicher in GARMIN_AI gespeichert. Ein Garmin-Schreibzugriff vom Handy ist noch nicht aktiviert; wir zeigen deshalb keine falsche Übertragungsbestätigung.</p>
    </>:<>
      <div className="sync-top"><div><span className="micro-label">DATA / INTEGRATION</span><h3>Synchronisierungsstatus.</h3>
        <p>Echte Zeitstempel der bestehenden Datenquellen – keine künstlichen Scores.</p></div>
        <button type="button" className="secondary" onClick={()=>setRefresh(n=>n+1)}>Prüfen</button>
      </div>
      {session&&data?<div className="sync-source-list">{rows.map(row=>
        <div className="sync-source" key={row.name}>
          <div className="sync-source-head"><strong>{row.name}</strong>
            <span className={`sync-state sync-state-${row.source?.state||'unknown'}`}>{stateText(row.source?.state)}</span>
          </div>
          <span>Letzter Versuch: {dateText(row.source?.checkedAt)}</span>
          <small>{row.detail}</small>
        </div>)}</div>:<p className="sync-hint">{session?'Lese Status …':'Bitte zuerst unter Einstellungen anmelden.'}</p>}
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
          <button type="button" onClick={()=>void checkCloudLive()}
            disabled={cloudChecking}>
            {cloudChecking?'Prüfe Verbindung …':'Cloud-Verbindung testen'}
          </button>
        </div>}
        {data.cloudConnect?.status==='configured'&&!data.cloudConnect.connected&&
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
      <p className="sync-weight-note">Ausrüstung und Trainingskalender sind noch nicht automatisch mit Garmin Connect verbunden. Ein grüner Eintrag wird nur aus bestätigten Importen abgeleitet; die Zeitstempel und der FIT-Rückstau bleiben sichtbar.</p>
    </>}
    {notice&&<p className="sync-notice" role="status">{notice}</p>}
    {error&&<p className="sync-error" role="alert">{error}</p>}
  </section>
}
