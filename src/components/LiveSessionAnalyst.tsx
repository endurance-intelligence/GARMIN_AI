import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { garminPublishableKey, garminSupabase, garminSupabaseReady, garminSupabaseUrl } from '../lib/garminSupabase'
import { analyzeSession } from '../lib/sessionAnalysis'
import {normalizeGarminRpe} from '../lib/garminPerception.mjs'
import {summarizeRunMetrics} from '../lib/runMetrics.mjs'
import {SessionIntensityDetails} from './SessionIntensityDetails'
import {CoachEvidenceSummary} from './CoachEvidenceSummary'
import {CoachAvatar} from './CoachAvatar'
import {buildSessionContext} from '../lib/sessionContext.mjs'
import type {TerrainWindow} from '../lib/sessionContext.mjs'
import { SessionGearEditor } from './SessionGearEditor'
import {PlanActualReview} from './PlanActualReview'
import {assessPlanActual} from '../lib/planActual.mjs'
import type {PlanActualPlan} from '../lib/planActual.mjs'
import type { SessionSample } from '../lib/sessionAnalysis'
import '../styles/session-live.css'

type Activity = {
  id: string; name: string; date: string; sport: string
  distanceM: number | null; durationS: number | null; avgHr: number | null
  rpeRaw: number | null; detailStatus: string; hrSamples: number; laps: number
}
type ActivityListResponse = { source: string; activities: Activity[] }
type SessionResponse = {
  activity: Omit<Activity, 'detailStatus' | 'hrSamples' | 'laps'>
  details: { status: string; hrSampleCount: number; lapCount: number; samples: SessionSample[]; terrainWindows?:TerrainWindow[]; fetchedAt: string | null }
}
const runTypes: Record<string,string> = { running: 'Lauf', track_running: 'Bahn', treadmill_running: 'Laufband', ultra_run: 'Ultra' }

function SessionCoachContext({activity,list,terrain}:{activity:SessionResponse['activity'];list:Activity[];terrain:TerrainWindow[]}){
 const [felt,setFelt]=useState('')
 const number= felt.trim()!==''?Number(felt.replace(',','.')):NaN
 const context=buildSessionContext(activity,list,terrain,Number.isFinite(number)&&number>=-80&&number<=65?number:null)
 return <article className="cr-card" aria-label="Persönliches Coach-Fazit">
  <div style={{display:'flex',alignItems:'center',gap:16}}><CoachAvatar mood={context.mood} small/><div><div className="cr-label">DEIN COACH · EINORDNUNG</div><h3>{context.verdict}</h3></div></div>
  <p>Das ist meine Einschätzung anhand der verfügbaren Messwerte, keine medizinische Trainingsfreigabe.</p>
  <div className="lsa-findings">{context.factors.map(f=><div className="lsa-signal info" key={f.label}><b>{f.label}</b><p>{f.text}</p></div>)}</div>
  <label className="lsa-picker">Gefühlte Temperatur beim Lauf (optional, eigene Angabe, nur für diese Ansicht)<input type="number" min={-80} max={65} step="1" value={felt} placeholder="z. B. -6" onChange={e=>setFelt(e.target.value)}/></label>
  <p className="cr-next"><strong>Was bedeutet das für dein nächstes Training?</strong> {context.next}</p>
 </article>
}

function heartPath(samples: SessionSample[]): string {
  const valid = samples.filter(p => typeof p.hr === 'number' && p.hr>=35 && p.hr<=220)
  if (valid.length < 2) return ''
  const values = valid.map(p=>p.hr!)
  const min = Math.min(...values)-4
  const max = Math.max(...values)+4
  const span = Math.max(15,max-min)
  return valid.map((p,i) => {
    const x = 12 + i / (valid.length-1) * 616
    const y = 192 - ((p.hr!-min)/span)*160
    return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
async function readOwnerPlans(session:Session):Promise<PlanActualPlan[]>{
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-training-plan',{
  method:'GET',cache:'no-store',headers:{
   authorization:'Bearer '+session.access_token,apikey:garminPublishableKey
  }
 })
 if(!response.ok)throw Error('Trainingsplan derzeit nicht abrufbar (HTTP '+response.status+').')
 const data=await response.json() as {entries?:PlanActualPlan[]}
 if(!Array.isArray(data.entries))throw Error('Trainingsplanantwort unvollständig.')
 return data.entries
}
async function readPrivate<T>(session: Session, params = ''): Promise<T> {
  const url = `${garminSupabaseUrl}/functions/v1/read-garmin-session${params}`
  const response = await fetch(url, {
    method: 'GET', headers: {
      authorization: `Bearer ${session.access_token}`,
      apikey: garminPublishableKey,
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Private Session API: HTTP ${response.status}`)
  return await response.json() as T
}

export function LiveSessionAnalyst({ active, focus }: { active: boolean;
 focus?:{activityId:string;token:number}|null }) {
  const [session,setSession] = useState<Session | null>(null)
  const [authReady,setAuthReady] = useState(false)
  const [list,setList] = useState<Activity[]>([])
  const [selected,setSelected] = useState<string>('')
  const [loadedDetails,setDetails] = useState<SessionResponse | null>(null)
  const [planEntries,setPlanEntries]=useState<PlanActualPlan[]>([])
  const [plansLoaded,setPlansLoaded]=useState(false)
  const [planError,setPlanError]=useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)

  useEffect(() => {
    if (!active || !garminSupabase) return
    let mounted = true
    void garminSupabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setAuthReady(true) }
    }).catch(() => { if (mounted) setAuthReady(true) })
    const { data: { subscription } } = garminSupabase.auth.onAuthStateChange((_event, current) => {
      if (mounted) setSession(current)
    })
    return () => { mounted=false; subscription.unsubscribe() }
  }, [active])

  useEffect(() => {
    if (!active || !session) return
    let mounted = true
    const requested=focus?.activityId||''
    if(requested){setSelected('');setDetails(null)}
    setError('')
    void readPrivate<ActivityListResponse>(session).then(response => {
      if (!mounted) return
      if(!Array.isArray(response.activities))throw Error('Garmin-Aktivitätsliste unvollständig.')
      setList(response.activities)
      if(requested){
       const found=response.activities.some(a=>String(a.id)===requested)
       if(found)setSelected(requested)
       else {
        setSelected('');setDetails(null)
        setError('Der ausgewählte Garmin-Lauf ist in der geladenen Analyse-Liste nicht vorhanden. Bitte oben aktualisieren oder später erneut synchronisieren. Es wird kein anderer Lauf stillschweigend geöffnet.')
       }
      }else setSelected(current=>response.activities.some(a=>a.id===current)?
       current:(response.activities[0]?.id??''))
    }).catch(err => { if (mounted) setError(err instanceof Error ? err.message : 'Aktivitätsliste nicht verfügbar') })
    return () => { mounted=false }
  }, [active, session?.access_token, refresh, focus?.token])

  useEffect(()=>{
    if(!active||!session)return
    let mounted=true
    setPlansLoaded(false);setPlanEntries([]);setPlanError('')
    void readOwnerPlans(session).then(entries=>{
     if(mounted){setPlanEntries(entries);setPlansLoaded(true)}
    }).catch(e=>{
     if(mounted)setPlanError(e instanceof Error?e.message:'Plan derzeit nicht verfügbar.')
    })
    return ()=>{mounted=false}
  },[active,session?.access_token,refresh])

  useEffect(() => {
    if (!active || !session || !selected) return
    let mounted = true
    setLoading(true); setError(''); setDetails(null)
    void readPrivate<SessionResponse>(session, `?id=${encodeURIComponent(selected)}`).then(result => {
      if (mounted) setDetails(result)
    }).catch(err => { if (mounted) setError(err instanceof Error ? err.message : 'Detaildaten nicht verfügbar') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted=false }
  }, [active, session?.access_token, selected, refresh])

  const selectedActivity=useMemo(()=>list.find(a=>a.id===selected)||null,[list,selected])
  const planActual=useMemo(()=>plansLoaded&&selectedActivity?
   assessPlanActual(selectedActivity,list,planEntries):null,
   [plansLoaded,selectedActivity,list,planEntries])
  const details=loadedDetails?.activity.id===selected?loadedDetails:null
  const metricActivity=details?.activity??selectedActivity
  const metrics=summarizeRunMetrics(metricActivity)
  const analysis = useMemo(() => details ? analyzeSession(details.details.samples) : null, [details])
  const path = useMemo(() => details ? heartPath(details.details.samples) : '', [details])
  if (!active) return null
  return <section className="lsa-wrap" aria-label="Echter Garmin Session Analyst">
    <div className="lsa-head">
      <div><span className="micro-label">GARMIN / SESSION INTELLIGENCE · LIVE</span>
        <h2>Mein Lauf</h2>
        <p>Deine Leistung, das Coach-Fazit und die wichtigsten Messwerte.</p></div>
      {session && <button className="secondary" type="button" onClick={()=>setRefresh(r=>r+1)} disabled={loading}>Aktualisieren</button>}
    </div>
    {!garminSupabaseReady && <p className="lsa-note">Supabase ist lokal noch nicht konfiguriert.</p>}
    {garminSupabaseReady && !authReady && <p className="lsa-note">Login wird geprüft …</p>}
    {garminSupabaseReady && authReady && !session && <p className="lsa-note">Bitte zuerst unter <strong>Einstellungen</strong> anmelden. Der Analyst nutzt denselben privaten Supabase-Zugang wie Recovery.</p>}
    {session && <>
      <label className="lsa-picker">Garmin-Lauf auswählen
        <select value={selected} onChange={e=>{setDetails(null);setSelected(e.target.value)}}>
          {!list.length && <option value="">Noch keine Läufe geladen</option>}
          {list.map(a=><option key={a.id} value={a.id}>{a.date?.slice(0,10)} · {a.name} · {runTypes[a.sport]??a.sport}{a.hrSamples>0?' · HF verfügbar':' · Details ausstehend'}</option>)}
        </select>
      </label>
      {error && <div className="lsa-error" role="alert">{error}</div>}
      {metricActivity&&<div className="lsa-run-summary" aria-label="Garmin-Kerndaten des ausgewählten Laufs">
       <div className="lsa-run-heading"><strong>{metricActivity.name}</strong><small>{metricActivity.date?.slice(0,10).split('-').reverse().join('.')} · Garmin</small></div>
       <div className="lsa-stat-grid lsa-run-metrics">
        {metrics.map(metric=><div key={metric.key}><span>{metric.label}</span><strong>{metric.value} {metric.unit&&<small>{metric.unit}</small>}</strong></div>)}
       </div>
       <small className="lsa-metric-note">Ø Pace aus Garmin-Dauer und Distanz; kein Nachweis von Bewegungszeit oder Trainingsintensität.</small>
      </div>}
      {loading && <p className="lsa-note">Lese Garmin-Aktivität …</p>}
      {details && analysis && <>
        <SessionCoachContext key={details.activity.id} activity={details.activity} list={list} terrain={details.details.terrainWindows||[]}/>
        <CoachEvidenceSummary active={active} mode="training" activityId={details.activity.id}/>
        <PlanActualReview match={planActual} loading={!plansLoaded&&!planError}
         error={planError}/>
        <SessionIntensityDetails key={details.activity.id} samples={details.details.samples}
          activityDate={details.activity.date} activityId={details.activity.id} active={active}/>
        <details className="lsa-deep-dive">
          <summary>HF-Verlauf, Messwerte und technische Beobachtungen <span>Optional ansehen</span></summary>
          <div className="lsa-deep-dive-content">
        {import.meta.env.DEV ? <SessionGearEditor key={details.activity.id} activityId={details.activity.id} session={session}/> : <p className="lsa-demo-divider">Laufschuhe werden hier aktuell nur gelesen. Direktes Ändern folgt nach der sicheren Cloud-Schreibanbindung.</p>}
        <div className="lsa-panels">
          <article className="lsa-chart">
            <div className="lsa-section-title"><strong>Herzfrequenz im Verlauf</strong><small>Messpunkte · keine geschätzten Werte</small></div>
            {path ? <svg viewBox="0 0 640 210" role="img" aria-label="Herzfrequenzverlauf der ausgewählten Aktivität" preserveAspectRatio="none">
              <g stroke="#334057" strokeWidth="1"><line x1="12" y1="52" x2="628" y2="52"/><line x1="12" y1="112" x2="628" y2="112"/><line x1="12" y1="172" x2="628" y2="172"/></g>
              <path d={path} stroke="#7CCFFF" fill="none" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
            </svg> : <p className="lsa-note">HF-Verlauf für diese Einheit noch nicht verfügbar.</p>}
            <div className="lsa-chart-axis"><span>Beginn</span><span>Mitte</span><span>Ende</span></div>
            <p className="lsa-quality">Technischer Datenstatus: {details.details.status} ·
              {normalizeGarminRpe(details.activity.rpeRaw)===null?'RPE nicht hinterlegt oder ungültig':`Garmin-RPE ${normalizeGarminRpe(details.activity.rpeRaw)}/10`}. {analysis.validHr} valide HF-Messpunkte von {details.details.samples.length}.
              Die tatsächlichen FIT-Belastungsabschnitte stehen im Coach-Fazit oben.</p>
          </article>
          <article className="lsa-findings"><div className="lsa-section-title"><strong>Was zeigen die Daten?</strong><small>Belegbasiert · v0.6.0</small></div>
            {analysis.signals.filter(signal=>signal.title!=='Trainingsziel noch nicht hinterlegt')
              .map((signal,i)=><div className={`lsa-signal ${signal.level}`}
              key={`${i}-${signal.title}`}><b>{signal.title}</b>
              <p>{signal.explanation}</p></div>)}
            <p className="lsa-note">Dies sind technische Zusatzbeobachtungen. Das eigentliche Lauf-Fazit oben
              nutzt die vom Coach erkannten Belastungsabschnitte und das Hauptziel.</p>
          </article>
        </div>
          </div>
        </details>
        <p className="lsa-foot">Der Coach erkennt den Trainingstyp aus Garmin-Aktivität und FIT-Belastungen.
          Die Intensitätszonen sind optionale Zusatzinformationen, keine Voraussetzung für ein Fazit.
          Keine automatischen Änderungen am Trainingsplan.</p>
      </>}
    </>}
  </section>
}
