import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { garminSupabase, garminSupabaseUrl, garminPublishableKey } from '../lib/garminSupabase'
import '../styles/garmin-connect-snapshot.css'

type Gear = { id:string; name:string; brand:string|null; model:string|null; type:string|null }
type Workout = { date:string; id:string|null; workoutId:string|null; name:string|null; sport:string|null; restDay:boolean }
type Link = { activityId:string; gearId:string }
type Snapshot = {gear:Gear[];schedule:Workout[];activity_gear:Link[];activity_gear_scope:string;checked_at:string;synced_at:string}
type LocalSnapshot = {source:string;readOnly:true;checkedAt:string;gear:Gear[];schedule:Workout[];activityGear:Link[]}

async function contextRequest<T>(session:Session, method:'GET'|'POST',payload?:unknown):Promise<T> {
  const response=await fetch(`${garminSupabaseUrl}/functions/v1/garmin-connect-snapshot`,{
    method,headers:{
      authorization:`Bearer ${session.access_token}`,
      apikey:garminPublishableKey,
      ...(method==='POST'?{'content-type':'application/json'}:{})
    },
    ...(payload?{body:JSON.stringify(payload)}:{}),
    cache:'no-store'
  })
  if (!response.ok) throw Error('Garmin-Connect-Snapshot: HTTP '+response.status)
  return await response.json() as T
}
function formatDate(raw:string|null|undefined) {
  if(!raw) return '–'
  const date=new Date(raw.length===10?raw+'T00:00:00':raw)
  return Number.isNaN(date.getTime())?raw:date.toLocaleDateString('de-DE')
}

export function GarminConnectSnapshot({mode}:{mode:'gear'|'calendar'}) {
  const [session,setSession]=useState<Session|null>(null)
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    if(!garminSupabase) return
    const client=garminSupabase
    let mounted=true
    void client.auth.getSession().then(({data})=>{if(mounted){setSession(data.session);setLoading(false)}})
      .catch(()=>{if(mounted)setLoading(false)})
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,current)=>{
      if(mounted)setSession(current)
    })
    return ()=>{mounted=false;subscription.unsubscribe()}
  },[])
  useEffect(()=>{
    if(!session){return}
    let mounted=true
    void contextRequest<{snapshot:Snapshot|null}>(session,'GET').then(result=>{
      if(mounted){setSnapshot(result.snapshot);setError('')}
    }).catch(()=>{if(mounted)setError('Gespeicherte Garmin-Connect-Daten nicht abrufbar.')})
    return ()=>{mounted=false}
  },[session?.access_token])

  async function synchronize() {
    if(!session || busy)return
    setBusy(true);setError('');setNotice('')
    try {
      const response=await fetch('/api/garmin-context-local/snapshot',{cache:'no-store'})
      if(!response.ok) throw Error('Lokaler Garmin-Bericht fehlt. Erst node scripts/garmin-connect-verify.mjs ausführen und localhost neu starten.')
      const report=await response.json() as LocalSnapshot
      if(report.readOnly!==true || !Array.isArray(report.gear) || !Array.isArray(report.schedule) || !Array.isArray(report.activityGear))
        throw Error('Bericht ist unvollständig.')
      if(!window.confirm(`Garmin-Connect-Bericht vom ${formatDate(report.checkedAt)} übernehmen?\n${report.gear.length} Ausrüstungsgegenstände, ${report.schedule.length} Kalendereinträge und ${report.activityGear.length} Zuordnungen.\nNur eine Aktivitätszuordnung ist geprüft. Keine Garmin-Schreibzugriffe.`)) return
      await contextRequest(session,'POST',report)
      const latest=await contextRequest<{snapshot:Snapshot|null}>(session,'GET')
      setSnapshot(latest.snapshot)
      setNotice('Garmin-Connect-Daten erfolgreich in GARMIN_AI gespeichert.')
    } catch(e) {
      setError(e instanceof Error?e.message:'Synchronisierung fehlgeschlagen')
    } finally{setBusy(false)}
  }

  return <section className="gcs-card" aria-label={mode==='gear'?'Garmin-Ausrüstung':'Garmin-Trainingskalender'}>
    <div className="gcs-title">
      <div><span className="small-eyebrow">GARMIN CONNECT · LIVE SNAPSHOT</span>
        <h3>{mode==='gear'?'Deine Garmin-Ausrüstung':'Geplante Garmin-Workouts'}</h3>
        <p>{snapshot ? `Stand: ${formatDate(snapshot.checked_at)} · Speicherung: ${formatDate(snapshot.synced_at)}` :
        'Noch kein Garmin-Connect-Snapshot gespeichert.'}</p>
      </div>
      {mode==='gear' && <button type="button" className="secondary" onClick={()=>void synchronize()} disabled={busy||!session}>
        {busy?'Übernehme …':'Lokalen Garmin-Bericht übernehmen'}
      </button>}
    </div>
    {!garminSupabase && <p className="gcs-note">Supabase ist nicht konfiguriert.</p>}
    {loading && <p className="gcs-note">Anmeldung wird geprüft …</p>}
    {!loading && !session && <p className="gcs-note">Bitte zuerst unter Einstellungen anmelden.</p>}
    {error && <p className="gcs-error" role="alert">{error}</p>}
    {notice && <p className="gcs-note" role="status">{notice}</p>}
    {snapshot && mode==='gear' && <>
      <p className="gcs-note">{snapshot.gear.length} Ausrüstungsgegenstände · {snapshot.activity_gear.length} bestätigte Aktivitätszuordnungen.</p>
      <div className="gcs-list">{snapshot.gear.map(g=><div className="gcs-row" key={g.id}>
        <strong>{g.name}</strong><small>{[g.brand,g.type].filter(Boolean).join(' · ')||'Garmin Connect'}</small>
      </div>)}</div>
      <p className="gcs-warning">Historische Ausrüstungszuordnungen sind noch unvollständig: nur die Testaktivität wurde abgefragt. Deshalb werden keine Gesamt-Schuhkilometer behauptet.</p>
    </>}
    {snapshot && mode==='calendar' && <>
      <p className="gcs-note">{snapshot.schedule.length} Einträge aus dem zuletzt geprüften Zeitraum. Garmin bleibt führend für die Planung.</p>
      <div className="gcs-list">{snapshot.schedule.slice().sort((a,b)=>a.date.localeCompare(b.date)).map((w,i)=>
        <div className="gcs-row" key={w.id||w.workoutId||w.date+'-'+i}>
          <strong>{formatDate(w.date)} · {w.name|| (w.restDay?'Ruhetag':'Workout')}</strong>
          <small>{w.sport||'Garmin Connect'}</small>
        </div>)}</div>
      {!snapshot.schedule.length && <p className="gcs-note">Keine Einträge im gespeicherten Zeitraum.</p>}
    </>}
  </section>
}
