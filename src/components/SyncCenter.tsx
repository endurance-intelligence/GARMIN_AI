import {useEffect,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseReady,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/sync-center.css'

type Source={checkedAt?:string|null;result?:string;latestDate?:string|null;scope?:string}
type Weight={weigh_date:string;weight_kg:number;state:string;updated_at:string;confirmed_at:string|null}
type SyncPayload={sources:{
  activities:Source;health:Source;equipment:Source;calendar:Source;fit:Source
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

export function SyncCenter({active,mode}:{active:boolean;mode:'weight'|'status'}){
  const [session,setSession]=useState<Session|null>(null)
  const [data,setData]=useState<SyncPayload|null>(null)
  const [date,setDate]=useState(berlinDay)
  const [weight,setWeight]=useState('')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [refresh,setRefresh]=useState(0)

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

  if(!active)return null
  const today=data?.weightEntries.find(v=>v.weigh_date===date)
  const rows=[
    {name:'Aktivitäten',timestamp:data?.sources.activities.checkedAt,
      detail:data?.sources.activities.result==='success'?'Letzter Import erfolgreich':'Status prüfen'},
    {name:'Gesundheitsdaten',timestamp:data?.sources.health.checkedAt,
      detail:data?.sources.health.latestDate?('Letzter Messtag: '+data.sources.health.latestDate):'Noch keine Messungen'},
    {name:'Ausrüstung',timestamp:data?.sources.equipment.checkedAt,
      detail:data?.sources.equipment.scope==='complete'?'Vollständige Zuordnungen':'Unvollständige Zuordnungen'},
    {name:'Trainingskalender',timestamp:data?.sources.calendar.checkedAt,detail:'Letzter bestätigter Snapshot'}
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
          <strong>{row.name}</strong><span>{dateText(row.timestamp)}</span><small>{row.detail}</small>
        </div>)}</div>:<p className="sync-hint">{session?'Lese Status …':'Bitte zuerst unter Einstellungen anmelden.'}</p>}
      <p className="sync-weight-note">Schuhzuordnungen und Garmin Connect-Kalender benötigen derzeit noch den separaten manuellen Abgleich. Neue Aktivitäten und Gesundheitsdaten haben bereits serverseitige Jobs.</p>
    </>}
    {notice&&<p className="sync-notice" role="status">{notice}</p>}
    {error&&<p className="sync-error" role="alert">{error}</p>}
  </section>
}
