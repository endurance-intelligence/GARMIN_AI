import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { garminSupabase, garminSupabaseUrl, garminPublishableKey } from '../lib/garminSupabase'
import { Icon } from './Icon'
import {fetchShoeImages, uploadShoeImage, removeShoeImage} from '../lib/gearImages'
import '../styles/garmin-connect-snapshot.css'

type Gear = { id:string; name:string; brand:string|null; model:string|null; type:string|null; status?:'active'|'retired'|'unknown' }
type Workout = { date:string; id:string|null; workoutId:string|null; name:string|null; sport:string|null; restDay:boolean }
type Link = { activityId:string; gearId:string }
type Snapshot = {gear:Gear[];schedule:Workout[];activity_gear:Link[];activity_gear_scope:string;checked_at:string;synced_at:string;gear_links_checked_at?:string|null}
type LocalSnapshot = {source:string;readOnly:true;checkedAt:string;gear:Gear[];schedule:Workout[];activityGear:Link[];completeHistory?:boolean}
type GearUsage = {gearId:string;linkedActivities:number;missingActivities:number;knownDistanceKm:number}
type StatusReport = {mode:'gear-status';source:string;readOnly:true;checkedAt:string;gear:{id:string;type:string|null;status:'active'|'retired'|'unknown'}[]}
type GearLinkReport = {mode:'gear-links';source:string;readOnly:true;checkedAt:string;gearIds:string[];gearChecked:number;activityGear:Link[]}
type SyncStatus = {state:'idle'|'running'|'complete'|'error';done:number;total:number;error?:string}

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

export function GarminConnectSnapshot({mode,active=true}:{mode:'gear'|'calendar';active?:boolean}) {
  const [session,setSession]=useState<Session|null>(null)
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null)
  const [usage,setUsage]=useState<GearUsage[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [shoeImages,setShoeImages]=useState<Record<string,string>>({})
  const [imageBusy,setImageBusy]=useState<string|null>(null)
  const [imageNotice,setImageNotice]=useState('')
  const [imageReload,setImageReload]=useState(0)
  const [imageLoading,setImageLoading]=useState(false)
  const [syncBusy,setSyncBusy]=useState(false)
  const [syncProgress,setSyncProgress]=useState('')
  const [snapshotRefresh,setSnapshotRefresh]=useState(0)
  const [snapshotLoading,setSnapshotLoading]=useState(false)

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
    if(!active||!session)return
    let mounted=true
    setSnapshotLoading(true)
    void contextRequest<{snapshot:Snapshot|null;usage:GearUsage[]}>(session,'GET').then(result=>{
      if(mounted){setSnapshot(result.snapshot);setUsage(result.usage||[]);setError('')}
    }).catch(()=>{if(mounted)setError('Gespeicherte Garmin-Connect-Daten nicht abrufbar.')})
      .finally(()=>{if(mounted)setSnapshotLoading(false)})
    return ()=>{mounted=false}
  },[active,session?.access_token,snapshotRefresh])

  useEffect(()=>{
    if(!active||mode!=='gear')return
    // The trusted worker refreshes gear links independently. Refresh the
    // read-only UI after browser focus or while an Equipment view stays open.
    const onFocus=()=>setSnapshotRefresh(n=>n+1)
    window.addEventListener('focus',onFocus)
    const interval=window.setInterval(onFocus,5*60*1000)
    return ()=>{window.removeEventListener('focus',onFocus);window.clearInterval(interval)}
  },[active,mode])

  useEffect(()=>{
    if(mode!=='gear' || !session) return
    let mounted=true
    setImageLoading(true)
    void fetchShoeImages(session).then(images=>{
      if(mounted){setShoeImages(images);setImageNotice('')}
    }).catch(err=>{
      if(mounted)setImageNotice(err instanceof Error?err.message:
        'Schuhbilder momentan nicht erreichbar. Bereits gespeicherte Fotos bleiben erhalten.')
    }).finally(()=>{if(mounted)setImageLoading(false)})
    return ()=>{mounted=false}
  },[mode,session?.access_token,imageReload])

  async function uploadPhoto(gear:Gear,file:File) {
    if(!session || imageBusy) return
    setImageBusy(gear.id);setImageNotice('')
    try {
      await uploadShoeImage(session,gear.id,file)
      setShoeImages(await fetchShoeImages(session))
      setImageNotice('Foto für '+gear.name+' gespeichert.')
    } catch(err) {
      setImageNotice(err instanceof Error?err.message:'Foto konnte nicht gespeichert werden.')
    } finally {
      setImageBusy(null)
    }
  }

  async function removePhoto(gear:Gear) {
    if(!session || imageBusy || !window.confirm('Foto für '+gear.name+' entfernen?')) return
    setImageBusy(gear.id);setImageNotice('')
    try {
      await removeShoeImage(session,gear.id)
      setShoeImages(await fetchShoeImages(session))
      setImageNotice('Foto entfernt. Die Garmin-Ausrüstungsdaten bleiben erhalten.')
    } catch(err) {
      setImageNotice(err instanceof Error?err.message:'Foto konnte nicht entfernt werden.')
    } finally {
      setImageBusy(null)
    }
  }

  async function syncGearLinks() {
    if(!session || syncBusy || busy || !snapshot) return
    setSyncBusy(true);setSyncProgress('Garmin-Abgleich wird gestartet …')
    setError('');setNotice('')
    try {
      const started=await fetch('/api/garmin-context-local/gear-sync-start',{
        method:'POST',cache:'no-store'
      })
      if(!started.ok) throw Error('Lokaler Garmin-Abgleich konnte nicht gestartet werden.')
      let complete=false
      // A timeout keeps already scanned gear locally; retrying resumes at the
      // first outstanding item instead of requesting the whole history again.
      for(let attempt=0;attempt<240;attempt++){
        await new Promise(resolve=>window.setTimeout(resolve,1500))
        const result=await fetch('/api/garmin-context-local/gear-sync-status',{cache:'no-store'})
        if(!result.ok) throw Error('Garmin-Abgleichstatus nicht erreichbar.')
        const state=await result.json() as SyncStatus
        setSyncProgress(`Garmin-Ausrüstung: ${state.done} von ${state.total||snapshot.gear.length} geprüft`)
        if(state.state==='error') throw Error(state.error||'Garmin-Abgleich unterbrochen. Erneuter Klick setzt fort.')
        if(state.state==='complete'){complete=true;break}
      }
      if(!complete) throw Error('Der Garmin-Abgleich ist noch nicht abgeschlossen. Erneuter Klick setzt fort.')
      const local=await fetch('/api/garmin-context-local/gear-links',{cache:'no-store'})
      if(!local.ok) throw Error('Vollständiger lokaler Garmin-Abgleich konnte nicht gelesen werden.')
      const report=await local.json() as GearLinkReport
      if(report.mode!=='gear-links' || report.readOnly!==true ||
         !Array.isArray(report.gearIds) || !Array.isArray(report.activityGear))
        throw Error('Ungültiger Garmin-Zuordnungsbericht.')
      const key=(link:Link)=>link.activityId+':'+link.gearId.replace(/-/g,'').toLowerCase()
      const previous=new Set(snapshot.activity_gear.map(key))
      const current=new Set(report.activityGear.map(key))
      const added=[...current].filter(k=>!previous.has(k)).length
      const removed=[...previous].filter(k=>!current.has(k)).length
      if(!window.confirm(
        `Garmin-Zuordnungen vom ${formatDate(report.checkedAt)} übernehmen?\n`+
        `Bisher: ${previous.size} · Jetzt: ${current.size}\n`+
        `Neu: +${added} · Entfernt/umgehängt: -${removed}\n\n`+
        'Alle bestehenden Schuhbilder, Ausrüstungsstatus und Kalenderdaten bleiben erhalten. Es wird nichts an Garmin geändert.'
      )) {
        setSyncProgress('Abgleich lokal geprüft – noch nicht übernommen.')
        return
      }
      const result=await contextRequest<{saved:boolean;added:number;removed:number}>(session,'POST',report)
      if(!result.saved) throw Error('Garmin-Zuordnungen wurden nicht gespeichert.')
      const latest=await contextRequest<{snapshot:Snapshot|null;usage:GearUsage[]}>(session,'GET')
      setSnapshot(latest.snapshot)
      setUsage(latest.usage||[])
      setNotice(`Garmin-Zuordnungen aktualisiert: +${result.added} / -${result.removed}. Kilometer neu berechnet.`)
      setSyncProgress('Abgleich abgeschlossen.')
    } catch(e) {
      setError(e instanceof Error?e.message:'Garmin-Abgleich fehlgeschlagen.')
      setSyncProgress('Abgleich unvollständig – gespeicherte Daten unverändert.')
    } finally {
      setSyncBusy(false)
    }
  }

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
  // Alphabetical display (requested); mileage and Garmin usage are unchanged.
  const byName = (a:Gear,b:Gear)=>a.name.localeCompare(b.name,'de',{sensitivity:'base'})
  const activeShoes = allGear.filter(g=>statusOf(g)==='active' && isShoe(g)).sort(byName)
  const activeOther = allGear.filter(g=>statusOf(g)==='active' && !isShoe(g))
  const retired = allGear.filter(g=>statusOf(g)==='retired')
  const unknown = allGear.filter(g=>statusOf(g)==='unknown')

  function gearCards(items:Gear[], withPhotos=false) {
    return <div className={withPhotos?'gcs-list gcs-visual-list':'gcs-list'}>{items.map(g=>{
      const u = snapshot?.activity_gear_scope==='complete' ? usage.find(item=>item.gearId===g.id) : undefined
      return <div className={withPhotos?'gcs-row gcs-visual-card':'gcs-row'} key={g.id}>
        {withPhotos && <div className="gcs-photo">
          {shoeImages[g.id] ?
            <img src={shoeImages[g.id]} alt={`Foto von ${g.name}`} loading="lazy"
              onError={()=>{
                setShoeImages(old=>{
                  if(!old[g.id])return old
                  const next={...old};delete next[g.id];return next
                })
                setImageNotice('Ein Schuhfoto konnte nicht angezeigt werden. Bitte Bilder erneut laden.')
              }}/> :
            <div className="gcs-photo-empty" aria-label="Noch kein Foto">
              <Icon name="footprints"/><span>DEIN SCHUH</span>
            </div>}
          <span className="gcs-photo-status">AKTIV</span>
        </div>}
        <div className={withPhotos?'gcs-visual-info':'gcs-row-info'}>
          <strong>{g.name}</strong>
          {!withPhotos && <small>{[g.brand,g.type].filter(Boolean).join(' · ')||'Garmin Connect'}</small>}
          {u && (withPhotos ?
            <div className="gcs-shoe-stats">
              <span className="gcs-shoe-distance">{u.knownDistanceKm.toLocaleString('de-DE',{maximumFractionDigits:2})}<span> km</span></span>
              <small>{u.linkedActivities} Aktivitäten · bekannte Distanz{u.missingActivities>0?` · ${u.missingActivities} ohne Distanz`:''}</small>
            </div> :
            <small>{u.knownDistanceKm.toLocaleString('de-DE',{maximumFractionDigits:2})} bekannte km · {u.linkedActivities} Aktivitäten{u.missingActivities>0?` · ${u.missingActivities} ohne Distanzdaten`:''}</small>)}
          {withPhotos && session && <div className="gcs-photo-controls">
            <label className="gcs-photo-upload">
              {imageBusy===g.id?'Verarbeite …':shoeImages[g.id]?'Bild ändern':'Foto hinzufügen'}
              <input type="file" accept="image/jpeg,image/png,image/webp"
                disabled={imageBusy!==null}
                onChange={event=>{
                  const file=event.currentTarget.files?.[0]
                  event.currentTarget.value=''
                  if(file)void uploadPhoto(g,file)
                }}/>
            </label>
            {shoeImages[g.id] && <button type="button" className="gcs-photo-remove"
              disabled={imageBusy!==null} onClick={()=>void removePhoto(g)}>Entfernen</button>}
          </div>}
        </div>
      </div>
    })}</div>
  }

  return <section className="gcs-card" aria-label={mode==='gear'?'Garmin-Ausrüstung':'Garmin-Trainingskalender'}>
    <div className="gcs-title">
      <div><span className="small-eyebrow">GARMIN CONNECT · BESTÄTIGTER DATENSTAND</span>
        <h3>{mode==='gear'?'Deine Garmin-Ausrüstung':'Geplante Garmin-Workouts'}</h3>
        <p>{snapshot?(mode==='gear'?
          `Ausrüstungskatalog: ${formatDate(snapshot.checked_at)} · Schuhzuordnungen: ${formatDate(snapshot.gear_links_checked_at)}`:
          `Gespeichert: ${formatDate(snapshot.checked_at)}`):
          'Noch kein Garmin-Connect-Snapshot gespeichert.'}</p>
      </div>
      {mode==='gear'&&<button type="button" className="gcs-data-refresh"
        onClick={()=>setSnapshotRefresh(n=>n+1)} disabled={!session||snapshotLoading}>
        {snapshotLoading?'Lade Daten …':'Anzeige aktualisieren'}
      </button>
      {mode==='gear' && import.meta.env.DEV && <div className="gcs-toolbar">
        {snapshot?.activity_gear_scope==='complete' && <button type="button" className="gcs-sync-button"
          onClick={()=>void syncGearLinks()} disabled={!session||busy||syncBusy}>
          {syncBusy?'Abgleich läuft …':'Schuhzuordnungen synchronisieren'}
        </button>}
        <button type="button" className="secondary"
          onClick={()=>void (snapshot?.activity_gear_scope==='complete' ? synchronizeGearStatus() : synchronize())}
          disabled={busy||syncBusy||!session}>
          {busy?'Übernehme …':snapshot?.activity_gear_scope==='complete'?'Garmin-Status aktualisieren':'Lokalen Garmin-Bericht übernehmen'}
        </button>
      </div>}
    </div>
    {!garminSupabase && <p className="gcs-note">Supabase ist nicht konfiguriert.</p>}
    {loading && <p className="gcs-note">Anmeldung wird geprüft …</p>}
    {!loading && !session && <p className="gcs-note">Bitte zuerst unter Einstellungen anmelden.</p>}
    {error && <p className="gcs-error" role="alert">{error}</p>}
    {notice && <p className="gcs-note" role="status">{notice}</p>}
    {snapshot && mode==='gear' && <>
      <p className="gcs-note">{snapshot.gear.length} Ausrüstungsgegenstände · {snapshot.activity_gear.length} bestätigte Aktivitätszuordnungen.
        Automatischer inkrementeller Garmin-Cloud-Abgleich ist alle 3 Stunden geplant.
        Die Kilometersumme ändert sich ausschließlich nach einem erfolgreich bestätigten
        Schuhabgleich; fehlende Zuordnungen werden niemals geschätzt.</p>
      {syncProgress && <p className="gcs-sync-progress" role="status" aria-live="polite">{syncProgress}</p>}
      <p className="gcs-photo-intro">Für aktive Laufschuhe kannst du eigene Bilder hinterlegen. Fotos bleiben privat und werden deinem Garmin-Schuh dauerhaft zugeordnet.</p>
      <div className="gcs-image-availability" role="status">
        <span>{imageLoading?'Lade gespeicherte Schuhfotos …':
          imageNotice||'Private Schuhfotos werden nur dir angezeigt.'}</span>
        <button className="gcs-image-retry" type="button"
          disabled={!session||imageLoading||imageBusy!==null}
          onClick={()=>setImageReload(v=>v+1)}>
          {imageLoading?'Lädt …':'Bilder neu laden'}
        </button>
      </div>
      {activeShoes.length>0 && <div className="gcs-group">
        <h4>Aktive Laufschuhe <span>{activeShoes.length}</span></h4>
        {gearCards(activeShoes,true)}
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
