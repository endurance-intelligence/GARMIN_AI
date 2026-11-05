import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { garminSupabase, garminSupabaseUrl, garminPublishableKey } from '../lib/garminSupabase'
import '../styles/garmin-connect-snapshot.css'

type Gear = { id:string; name:string; brand:string|null; model:string|null; type:string|null; status?:'active'|'retired'|'unknown' }
type Workout = { date:string; id:string|null; workoutId:string|null; name:string|null; sport:string|null; restDay:boolean }
type Link = { activityId:string; gearId:string }
type Snapshot = {gear:Gear[];schedule:Workout[];activity_gear:Link[];activity_gear_scope:string;checked_at:string;synced_at:string}
type LocalSnapshot = {source:string;readOnly:true;checkedAt:string;gear:Gear[];schedule:Workout[];activityGear:Link[];completeHistory?:boolean}
type GearUsage = {gearId:string;linkedActivities:number;missingActivities:number;knownDistanceKm:number}
type StatusReport = {mode:'gear-status';source:string;readOnly:true;checkedAt:string;gear:{id:string;type:string|null;status:'active'|'retired'|'unknown'}[]}

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
  const [usage,setUsage]=useState<GearUsage[]>([])
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
    void contextRequest<{snapshot:Snapshot|null;usage:GearUsage[]}>(session,'GET').then(result=>{
      if(mounted){setSnapshot(result.snapshot);setUsage(result.usage||[]);setError('')}
    }).catch(()=>{if(mounted)setError('Gespeicherte Garmin-Connect-Daten nicht abrufbar.')})
    return ()=>{mounted=false}
  },[session?.access_token])

  async function synchronizeGearStatus() {
    if (!session || busy || !snapshot) return
    setBusy(true);setError('');setNotice('')
    try {
      const response=await fetch('/api/garmin-context-local/gear-status',{cache:'no-store'})
      if(!response.ok) throw Error('Aktueller lokaler Garmin-Statusbericht fehlt. Prüfe zuvor die Garmin-Verifikation.')
      const report=await response.json() as StatusReport
      if(report.mode!=='gear-status' || report.readOnly!==true || !Array.isArray(report.gear))
        throw Error('Statusbericht unvollständig.')
      const retired=report.gear.filter(g=>g.status==='retired').length
      const active=report.gear.filter(g=>g.status==='active').length
      const unknown=report.gear.filter(g=>g.status==='unknown').length
      if(!window.confirm(
        `Garmin-Status vom ${formatDate(report.checkedAt)} übernehmen?\n`+
        `${active} aktiv · ${retired} aussortiert · ${unknown} unbekannt.\n`+
        `${snapshot.activity_gear.length} historische Zuordnungen bleiben unverändert. Keine Garmin-Schreibzugriffe.`
      )) return
      await contextRequest(session,'POST',report)
      const latest=await contextRequest<{snapshot:Snapshot|null;usage:GearUsage[]}>(session,'GET')
      setSnapshot(latest.snapshot)
      setUsage(latest.usage||[])
      setNotice('Garmin-Ausrüstungsstatus aktualisiert. Historische Zuordnungen unverändert.')
    } catch(e) {
      setError(e instanceof Error?e.message:'Statusaktualisierung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  async function synchronize() {
    if(!session || busy)return
    setBusy(true);setError('');setNotice('')
    try {
      const response=await fetch('/api/garmin-context-local/snapshot',{cache:'no-store'})
      if(!response.ok) throw Error('Lokaler Garmin-Bericht fehlt. Erst node scripts/garmin-connect-verify.mjs ausführen und localhost neu starten.')
      const report=await response.json() as LocalSnapshot
      if(report.readOnly!==true || !Array.isArray(report.gear) || !Array.isArray(report.schedule) || !Array.isArray(report.activityGear))
        throw Error('Bericht ist unvollständig.')
      if(!window.confirm(`Garmin-Connect-Bericht vom ${formatDate(report.checkedAt)} übernehmen?\n${report.gear.length} Ausrüstungsgegenstände, ${report.schedule.length} Kalendereinträge und ${report.activityGear.length} Zuordnungen.\n${report.completeHistory ? 'Vollständiger Ausrüstungsabgleich wurde lokal verifiziert.' : 'Nur eine Aktivitätszuordnung ist geprüft.'} Keine Garmin-Schreibzugriffe.`)) return
      await contextRequest(session,'POST',report)
      const latest=await contextRequest<{snapshot:Snapshot|null;usage:GearUsage[]}>(session,'GET')
      setSnapshot(latest.snapshot)
      setUsage(latest.usage||[])
      setNotice('Garmin-Connect-Daten erfolgreich in GARMIN_AI gespeichert.')
    } catch(e) {
      setError(e instanceof Error?e.message:'Synchronisierung fehlgeschlagen')
    } finally{setBusy(false)}
  }


  const allGear = snapshot?.gear ?? []
  const statusOf = (g:Gear) => g.status === 'active' || g.status === 'retired' ? g.status : 'unknown'
  const isShoe = (g:Gear) => /shoes?|schuh/i.test(g.type ?? '')
  const activeShoes = allGear.filter(g=>statusOf(g)==='active' && isShoe(g))
  const activeOther = allGear.filter(g=>statusOf(g)==='active' && !isShoe(g))
  const retired = allGear.filter(g=>statusOf(g)==='retired')
  const unknown = allGear.filter(g=>statusOf(g)==='unknown')

  function gearCards(items:Gear[]) {
    return <div className="gcs-list">{items.map(g=>{
      const u = snapshot?.activity_gear_scope==='complete' ? usage.find(item=>item.gearId===g.id) : undefined
      return <div className="gcs-row" key={g.id}>
        <strong>{g.name}</strong>
        <small>{[g.brand,g.type].filter(Boolean).join(' · ')||'Garmin Connect'}</small>
        {u && <small>{u.knownDistanceKm.toLocaleString('de-DE',{maximumFractionDigits:2})} bekannte km · {u.linkedActivities} Aktivitäten{u.missingActivities>0?` · ${u.missingActivities} ohne Distanzdaten`:''}</small>}
      </div>
    })}</div>
  }

  return <section className="gcs-card" aria-label={mode==='gear'?'Garmin-Ausrüstung':'Garmin-Trainingskalender'}>
    <div className="gcs-title">
      <div><span className="small-eyebrow">GARMIN CONNECT · LIVE SNAPSHOT</span>
        <h3>{mode==='gear'?'Deine Garmin-Ausrüstung':'Geplante Garmin-Workouts'}</h3>
        <p>{snapshot ? `Stand: ${formatDate(snapshot.checked_at)} · Speicherung: ${formatDate(snapshot.synced_at)}` :
        'Noch kein Garmin-Connect-Snapshot gespeichert.'}</p>
      </div>
      {mode==='gear' && <button type="button" className="secondary"
        onClick={()=>void (snapshot?.activity_gear_scope==='complete' ? synchronizeGearStatus() : synchronize())}
        disabled={busy||!session}>
        {busy?'Übernehme …':snapshot?.activity_gear_scope==='complete'?'Garmin-Status aktualisieren':'Lokalen Garmin-Bericht übernehmen'}
      </button>}
    </div>
    {!garminSupabase && <p className="gcs-note">Supabase ist nicht konfiguriert.</p>}
    {loading && <p className="gcs-note">Anmeldung wird geprüft …</p>}
    {!loading && !session && <p className="gcs-note">Bitte zuerst unter Einstellungen anmelden.</p>}
    {error && <p className="gcs-error" role="alert">{error}</p>}
    {notice && <p className="gcs-note" role="status">{notice}</p>}
    {snapshot && mode==='gear' && <>
      <p className="gcs-note">{snapshot.gear.length} Ausrüstungsgegenstände · {snapshot.activity_gear.length} bestätigte Aktivitätszuordnungen.</p>
      {activeShoes.length>0 && <div className="gcs-group">
        <h4>Aktive Laufschuhe <span>{activeShoes.length}</span></h4>
        {gearCards(activeShoes)}
      </div>}
      {activeOther.length>0 && <div className="gcs-group">
        <h4>Weitere aktive Ausrüstung <span>{activeOther.length}</span></h4>
        {gearCards(activeOther)}
      </div>}
      {retired.length>0 && <details className="gcs-archive">
        <summary>Aussortiert / Archiv <span>{retired.length}</span></summary>
        <p className="gcs-note">Bleibt für historische Aktivitäten erhalten, erscheint aber nicht bei den aktiven Schuhen.</p>
        {gearCards(retired)}
      </details>}
      {unknown.length>0 && <details className="gcs-archive">
        <summary>Status nicht erkannt <span>{unknown.length}</span></summary>
        <p className="gcs-note">Diese Einträge werden nicht automatisch als aktiv eingestuft. Bitte den Garmin-Bericht mit v0.7.3.4 aktualisieren.</p>
        {gearCards(unknown)}
      </details>}
      <p className="gcs-warning">{snapshot.activity_gear_scope==='complete'
        ? 'Ausrüstungshistorie vollständig von Garmin abgerufen. Distanzen stammen aus den bereits importierten Aktivitäten; fehlende Aktivitätsdaten sind ausdrücklich markiert.'
        : 'Historische Ausrüstungszuordnungen sind noch unvollständig: nur die Testaktivität wurde abgefragt. Deshalb werden keine Gesamt-Schuhkilometer behauptet.'}</p>
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
