import {useEffect,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminPublishableKey,garminSupabase,garminSupabaseReady,garminSupabaseUrl} from '../lib/garminSupabase'
import '../styles/aerobic-evidence.css'

type Run = {
  id:string;name:string;date:string|null;distanceKm:number;durationMinutes:number
  classification:'comparable'|'limited'|'excluded';reason:string
  earlyHr:number|null;lateHr:number|null;hrDifference:number|null
  speedDifferencePercent:number|null;speedVariabilityPercent:number|null
  validHr:number;total:number;timing:'elapsed'|'timestamp'|'unverified'
  timelineGapCount:number;hrArtifactCount:number
}
type WorkerHealth = {
  scheduler:{configured:boolean;active:boolean|null;schedule:string|null;
    lastDispatchAt:string|null;lastDispatchStatus:string|null};
  progress:{storedLastHour:number;storedLast24h:number;lastStoredAt:string|null;
    queued:number;retry:number;processing:number;paused:number;
    unavailable:number;notEnqueued:number};
}
function formatTime(raw:string|null):string{
  if(!raw)return 'Keine Angabe'
  const date=new Date(raw)
  return Number.isNaN(date.getTime())?'Keine Angabe':new Intl.DateTimeFormat('de-DE',{
    day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
  }).format(date)
}
function describeWorker(h:WorkerHealth):{label:string;detail:string}{
  if(!h.scheduler.configured)return {label:'Cron nicht gefunden',detail:'Der erwartete Detailimport-Job ist nicht eingetragen.'}
  if(!h.scheduler.active)return {label:'Cron pausiert',detail:'Der Detailimport-Job ist nicht aktiv.'}
  const at=h.scheduler.lastDispatchAt?Date.parse(h.scheduler.lastDispatchAt):NaN
  if(!Number.isFinite(at))return {label:'Cron aktiv · Lauf nicht nachgewiesen',detail:'Für den geplanten Job liegt noch kein Laufprotokoll vor.'}
  if(Date.now()-at>25*60*1000)return {label:'Cron aktiv · letzter Lauf älter als 25 Min.',detail:'Zeitplan ist aktiv, aber der letzte protokollierte Aufruf ist nicht aktuell.'}
  if(h.scheduler.lastDispatchStatus==='failed')return {label:'Letzter Cron-Aufruf fehlgeschlagen',detail:'Im Cron-Protokoll wurde ein Fehler gemeldet.'}
  if(h.scheduler.lastDispatchStatus==='running')return {label:'Cron-Aufruf läuft',detail:'Der laufende Auftrag ist noch nicht abgeschlossen.'}
  return {label:'Cron aktiv · Aufruf protokolliert',detail:'Das bestätigt nur den geplanten Aufruf, nicht die erfolgreiche Garmin-Abfrage.'}
}
type Audit = {
  analyzedAt:string;scan:{runningRead:number;capped:boolean;metadataCandidates:number;
    withHrDetails:number;detailEvaluated:number;detailLimit:number;
    comparable:number;limited:number;excluded:number};
  coverage:{missing:number;queued:number;processing:number;retry:number;paused:number;
    unavailable:number;withoutSufficientHr:number;ready:number};
  workerHealth:WorkerHealth|null;
  comparable:Run[];limited:Run[];excluded:Run[];conclusion:string
}
function num(v:number|null,unit:string){return v===null?'–':`${v.toLocaleString('de-DE',{maximumFractionDigits:1})} ${unit}`}
async function fetchAudit(session:Session):Promise<Audit>{
  const response=await fetch(`${garminSupabaseUrl}/functions/v1/read-garmin-aerobic`,{
    method:'GET',cache:'no-store',headers:{authorization:`Bearer ${session.access_token}`,apikey:garminPublishableKey},
  })
  if(!response.ok)throw new Error(`Aerobic-Datenabfrage: HTTP ${response.status}`)
  return response.json() as Promise<Audit>
}
export function AerobicEvidencePanel({active}:{active:boolean}){
  const [session,setSession]=useState<Session|null>(null)
  const [authReady,setAuthReady]=useState(false)
  const [data,setData]=useState<Audit|null>(null)
  const [refresh,setRefresh]=useState(0)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!active||!garminSupabase)return
    let mounted=true
    void garminSupabase.auth.getSession().then(({data:auth})=>{
      if(mounted){setSession(auth.session);setAuthReady(true)}
    }).catch(()=>{if(mounted)setAuthReady(true)})
    const {data:{subscription}}=garminSupabase.auth.onAuthStateChange((_event,current)=>{
      if(mounted)setSession(current)
    })
    return ()=>{mounted=false;subscription.unsubscribe()}
  },[active])
  useEffect(()=>{
    if(!active||!session)return
    let mounted=true
    setLoading(true);setError('')
    void fetchAudit(session).then(result=>{if(mounted)setData(result)})
      .catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Auswertung nicht verfügbar')})
      .finally(()=>{if(mounted)setLoading(false)})
    return ()=>{mounted=false}
  },[active,session?.access_token,refresh])
  if(!active)return null
  return <section className="ae-wrap" aria-label="Aerobic Evidence Audit">
    <header className="ae-head"><div><span className="micro-label">GARMIN_AI / AEROBIC EVIDENCE · v0.6.5</span>
      <h2>Wie aussagekräftig sind deine Läufe?</h2>
      <p>Wir suchen gleichmäßige Abschnitte mit verwertbaren HF- und Tempodaten. Noch keine Berechnung der aeroben Schwelle.</p>
    </div>{session&&<button className="secondary" type="button" disabled={loading} onClick={()=>setRefresh(r=>r+1)}>{loading?'Prüfe …':'Erneut prüfen'}</button>}</header>
    {!garminSupabaseReady&&<div className="ae-note">Supabase ist noch nicht eingerichtet.</div>}
    {garminSupabaseReady&&!authReady&&<div className="ae-note">Anmeldung wird geprüft …</div>}
    {authReady&&!session&&<div className="ae-note">Bitte unter Einstellungen anmelden, damit wir deine privaten Garmin-Daten prüfen können.</div>}
    {session&&loading&&!data&&<div className="ae-note">Prüfe vorhandene Lauf-Messreihen …</div>}
    {session&&error&&<div className="ae-error" role="alert">{error}</div>}
    {data&&<>
      <div className="ae-stats">
        <div><span>LÄUFE IM ABFRAGEFENSTER</span><strong>{data.scan.runningRead}</strong></div>
        <div><span>MIT HF-DETAILS</span><strong>{data.scan.withHrDetails}</strong></div>
        <div><span>MESSREIHEN GEPRÜFT</span><strong>{data.scan.detailEvaluated}</strong></div>
        <div><span>GUT VERGLEICHBAR</span><strong>{data.scan.comparable}</strong></div>
      </div>
      <p className="ae-scope">Von {data.scan.metadataCandidates} Läufen mit passender Dauer, Distanz und Laufart lagen für {data.scan.withHrDetails} ausreichend HF-Details vor. Davon wurden maximal {data.scan.detailLimit} Messreihen geprüft. {data.scan.capped?'Abfragegrenze von 800 Laufeinträgen erreicht.':'Nicht jede der insgesamt importierten Aktivitäten ist ein Lauf.'} Fehlende oder noch nicht importierte Details werden nicht als valide gewertet.</p>
      <div className="ae-coverage" aria-label="Detailimport-Abdeckung">
        <div className="ae-coverage-title"><strong>HF-Datenabdeckung</strong><span>{data.scan.metadataCandidates>0?Math.round(data.coverage.ready/data.scan.metadataCandidates*100):0}% der geeigneten Läufe mit HF-Messreihe</span></div>
        <div className="ae-coverage-track"><div style={{width:`${data.scan.metadataCandidates>0?Math.min(100,100*data.coverage.ready/data.scan.metadataCandidates):0}%`}}/></div>
        <p><b>{data.coverage.missing}</b> noch nicht eingereiht · <b>{data.coverage.queued+data.coverage.processing+data.coverage.retry}</b> warten / in Bearbeitung · <b>{data.coverage.withoutSufficientHr}</b> importiert ohne ausreichende HF · <b>{data.coverage.paused+data.coverage.unavailable}</b> pausiert / nicht verfügbar</p>
        <small>Gezählt werden nur Läufe mit passender Dauer, Distanz und Laufart. Der Detail-Worker verarbeitet höchstens zwei Aktivitäten pro Aufruf (konfigurierter 5-Minuten-Takt). Diese Seite liest nur gespeicherte Daten; sie startet keinen Import.</small>
      </div>
      <div className="ae-worker" aria-label="Garmin-Detailimport Status">
        <div className="ae-worker-head"><strong>Garmin-Detailimport</strong><span>Nur Statusabfrage · keine Änderung am Worker</span></div>
        {data.workerHealth?(()=>{
          const health=data.workerHealth
          const diagnostic=describeWorker(health)
          return <>
            <div className="ae-worker-stat"><strong>{diagnostic.label}</strong><span>{diagnostic.detail}</span></div>
            <div className="ae-worker-grid">
              <div><span>Letzter Cron-Aufruf</span><b>{formatTime(health.scheduler.lastDispatchAt)}</b></div>
              <div><span>Letzter gespeicherter Detailimport</span><b>{formatTime(health.progress.lastStoredAt)}</b></div>
              <div><span>Neue Details · 60 Minuten</span><b>{health.progress.storedLastHour}</b></div>
              <div><span>Neue Details · 24 Stunden</span><b>{health.progress.storedLast24h}</b></div>
            </div>
            <small>Der Fortschritt zählt alle Sportarten. {health.progress.queued+health.progress.retry+health.progress.processing} offene Detailaufträge, {health.progress.notEnqueued} noch ohne Detailzeile, {health.progress.paused+health.progress.unavailable} pausiert / nicht verfügbar (alle Aktivitäten). Ein erfolgreicher Cron-Aufruf belegt keine erfolgreiche Garmin-Antwort.</small>
          </>
        })():<div className="ae-worker-unknown">Cron-Diagnose noch nicht verfügbar. Die Laufdaten-Auswertung darüber funktioniert unabhängig davon.</div>}
      </div>
      <div className="ae-findings">
        {data.comparable.length>0?<>
          <h3>Gleichmäßige Vergleichsläufe</h3>
          <div className="ae-run-list">{data.comparable.map(run=><article key={run.id} className="ae-run">
            <div className="ae-run-title"><strong>{run.name}</strong><small>{run.date?.slice(0,10)??'Datum fehlt'} · {num(run.distanceKm,'km')} · {run.durationMinutes} Min.</small></div>
            <div className="ae-run-numbers"><div><span>FRÜHER / SPÄTER</span><b>{run.earlyHr===null||run.lateHr===null?'–':`${Math.round(run.earlyHr)} → ${Math.round(run.lateHr)} bpm`}</b></div>
              <div><span>HF-ÄNDERUNG</span><b>{run.hrDifference!==null&&run.hrDifference>0?'+':''}{num(run.hrDifference,'bpm')}</b></div>
              <div><span>GESCHWINDIGKEIT</span><b>{run.speedDifferencePercent!==null&&run.speedDifferencePercent>0?'+':''}{num(run.speedDifferencePercent,'%')}</b></div></div>
            <p>Vergleich der mittleren Laufabschnitte. {run.validHr} gültige HF-Punkte; Zeitachse: {run.timing==='elapsed'?'verifizierte Laufzeit':'Zeitstempel'}. {run.timelineGapCount>0||run.hrArtifactCount>0?`Signalhinweise: ${run.timelineGapCount} Zeitlücken, ${run.hrArtifactCount} abrupte HF-Sprünge. `:''}Keine Schwellenbestimmung.</p>
          </article>)}</div>
        </>:<div className="ae-note"><strong>Noch kein ausreichend vergleichbarer Lauf</strong><p>Das ist kein negatives Trainingsergebnis. Wir benötigen mehr durchgehend gemessene, gleichmäßige Abschnitte. Der Detailimport kann noch laufen.</p></div>}
        {(data.limited.length>0||data.excluded.length>0)&&<details className="ae-details"><summary>Weitere geprüfte Läufe und Datenlücken ({data.scan.limited+data.scan.excluded})</summary>
          <div className="ae-reasons">{[...data.limited,...data.excluded].map(run=><div key={run.id}><b>{run.name}</b><span>{run.date?.slice(0,10)??''} · {run.reason}</span></div>)}</div>
          <p>Es werden höchstens fünf eingeschränkte und fünf ausgeschlossene Läufe als Beispiele angezeigt.</p>
        </details>}
      </div>
      <div className="ae-bottom"><strong>Physiologische Schwelle: nicht bestimmt</strong><p>Cardiac Drift und konstantes Tempo sind Beobachtungen, keine Messung von LT1/VT1. Klima, Steigung, Ermüdung, Erkrankung und Messfehler können den HF-Verlauf beeinflussen. Die Daten ändern keine Garmin-Zonen und keinen Trainingsplan.</p></div>
    </>}
  </section>
}
