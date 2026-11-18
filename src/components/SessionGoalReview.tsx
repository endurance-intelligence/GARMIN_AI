import {useMemo,useState} from 'react'
import type {SessionSample} from '../lib/sessionAnalysis'
import {reviewSessionGoal} from '../lib/sessionGoalReview'
import type {SessionGoal} from '../lib/sessionGoalReview'
import {safeZoneMax} from '../lib/garminHrProfile'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import '../styles/session-intelligence.css'
import '../styles/hr-profile-session.css'
import {IntensityEvidencePanel} from './IntensityEvidencePanel'
import {assessIntensity} from '../lib/intensityEvidence'
import {coachFinding} from '../lib/coachFeedback'
import '../styles/coach-feedback.css'

const goals:{value:SessionGoal;label:string}[]=[
  {value:'unknown',label:'Noch nicht zugeordnet'},
  {value:'easy',label:'Easy Run · locker'},
  {value:'recovery',label:'Recovery · regenerativ'},
  {value:'long',label:'Long Run · langer Lauf'},
  {value:'tempo',label:'Tempo · zügig'},
  {value:'intervals',label:'Intervalle · Wiederholungen'},
]
export function SessionGoalReview({samples,lapCount,activityDate,plannedGoal=null}:{
  samples:SessionSample[];lapCount:number;activityDate:string|null;
  plannedGoal?:'easy'|'long'|'return_easy'|null
}) {
  // A new activity must not inherit an earlier activity's manual objective or illness context.
  // The parent also keys this component by Garmin activity id; the date guard is defensive.
  const contextKey=activityDate??'no-date'
  const [context,setContext]=useState<{key:string;goal:SessionGoal;limitText:string;recentIllness:boolean;touched:boolean}>(
    {key:contextKey,goal:'unknown',limitText:'',recentIllness:false,touched:false})
  const current=context.key===contextKey?context:{key:contextKey,goal:'unknown' as SessionGoal,limitText:'',recentIllness:false,touched:false}
  const {limitText,recentIllness}=current
  // A uniquely time-correlated Coach workout provides an initial purpose,
  // but the athlete can always correct or explicitly remove this inference.
  const goal:SessionGoal=current.touched?current.goal:
    plannedGoal==='return_easy'?'recovery':plannedGoal??'unknown'
  const setGoal=(next:SessionGoal)=>setContext({...current,goal:next,touched:true})
  const setLimitText=(next:string)=>setContext({...current,limitText:next})
  const setRecentIllness=(next:boolean)=>setContext({...current,recentIllness:next})
  const {data}=useGarminHrProfile(true)
  const runTime=activityDate?Date.parse(activityDate):NaN
  // A newer Garmin profile cannot be retroactively assigned to an older run.
  const historical=Number.isFinite(runTime)?data?.history?.filter(s=>Date.parse(s.observedAt)<=runTime)
    .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]:null
  const isEasy=goal==='easy'||goal==='recovery'
  const reference=isEasy?safeZoneMax(historical?.profile??null,goal==='recovery'?1:2):null
  const capManual=limitText.trim()?Number(limitText):null
  const manualValid=capManual!==null && Number.isInteger(capManual) && capManual>=75 && capManual<=210 ? capManual:null
  const appliedCap=manualValid??reference
  const autoCap=manualValid===null && reference!==null
  const review=useMemo(()=>reviewSessionGoal(samples,goal,appliedCap,recentIllness,lapCount,autoCap),
    [samples,goal,appliedCap,recentIllness,lapCount,autoCap])
  const referenceKind=historical?'historical':data?.profile?'current':'missing'
  const intensity=useMemo(()=>assessIntensity(samples,historical?.profile??data?.profile??null),
    [samples,historical?.profile,data?.profile])
  const finding=useMemo(()=>coachFinding({samples,goal,recentIllness,lapCount,
    cap:appliedCap,capSource:manualValid!==null?'manual':reference!==null?'historical-garmin':'none',
    intensity,profileSource:referenceKind}),
    [samples,goal,recentIllness,lapCount,appliedCap,manualValid,reference,intensity,referenceKind])
  return <section className="lsi-wrap" aria-label="Trainingszielbezogene Analyse">
    <div className="lsi-heading"><div><span className="micro-label">SESSION INTELLIGENCE / v0.7.1</span><h3>Wofür war diese Einheit gedacht?</h3></div><span className="lsi-pill">{plannedGoal&&!current.touched?
  'Trainingszweck aus Coach-Plan · manuell korrigierbar':
  'Manueller Trainingszweck · Garmin-Referenz automatisch'}</span></div>
    <p className="lsi-description">Der Coach nutzt echte HF- und Tempodaten. Gerätezonen sind eine Orientierung, keine getesteten Stoffwechselschwellen.</p>
    <div className="lsi-controls">
      <label>Trainingsziel<select value={goal} onChange={event=>setGoal(event.target.value as SessionGoal)}>{goals.map(g=><option key={g.value} value={g.value}>{g.label}</option>)}</select></label>
      {isEasy && <div className="lsi-ref-zone">
        <span>HF-Referenz zum Lauftag</span><strong>{autoCap?`Garmin Zone ${goal==='easy'?2:1}: ≤ ${reference} bpm`:manualValid!==null?`Manuell: ≤ ${manualValid} bpm`:'Nicht historisch belegt'}</strong>
        <small>{!historical?'Für diesen älteren Lauf liegt noch kein zum Aktivitätsdatum gespeicherter Garmin-Zonensatz vor. Wir übertragen heutige Zonen nicht rückwirkend.':autoCap?'Nur deskriptiver Vergleich – keine bestätigte LT1/VT1.':'Falls benötigt, kannst du unten eine eigene Grenze angeben.'}</small>
        <details><summary>Optionale HF-Grenze selbst setzen</summary><input type="number" min="75" max="210" step="1" value={limitText} placeholder="BPM · freiwillig" onChange={event=>setLimitText(event.target.value)}/>{limitText && manualValid===null && <small className="lsi-validation">Ganze Zahl zwischen 75 und 210 bpm eingeben.</small>}</details>
      </div>}
      <label className="lsi-illness"><input type="checkbox" checked={recentIllness} onChange={event=>setRecentIllness(event.target.checked)}/><span>Wiedereinstieg nach Erkrankung</span></label>
    </div>
    <article className={`cfb-panel cfb-${finding.level}`} aria-label="Coach-Befund">
      <div className="cfb-eyebrow">COACH-BEFUND · DATENBASIERT</div>
      <h4>{finding.title}</h4>
      <p>{finding.explanation}</p>
      <small>{finding.evidence}</small>
    </article>
    <IntensityEvidencePanel samples={samples} activityDate={activityDate} profileData={data} />
    <details className="cfb-more">
      <summary>Messdaten und Einschränkungen ({review.signals.length})</summary>
      <div className="lsi-signals">{review.signals.map((signal,index)=><article key={`${signal.title}-${index}`} className={`lsi-signal lsi-${signal.level}`}><strong>{signal.title}</strong><p>{signal.explanation}</p></article>)}</div>
    </details>
    <p className="lsi-disclaimer">Ein Coach-Trainingszweck wird nur nach eindeutig plausibler Plan-Ist-Zuordnung vorgewählt.
    Das beweist nicht, dass die Workout-Schritte exakt absolviert wurden.
    Trainingszweck und eigene Angaben werden nicht gespeichert. Keine automatische Änderung an Garmin oder Trainingsplan.</p>
  </section>
}
