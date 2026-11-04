import {useMemo,useState} from 'react'
import type {SessionSample} from '../lib/sessionAnalysis'
import {reviewSessionGoal} from '../lib/sessionGoalReview'
import type {SessionGoal} from '../lib/sessionGoalReview'
import {safeZoneMax} from '../lib/garminHrProfile'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import '../styles/session-intelligence.css'
import '../styles/hr-profile-session.css'
import {IntensityEvidencePanel} from './IntensityEvidencePanel'

const goals:{value:SessionGoal;label:string}[]=[
  {value:'unknown',label:'Noch nicht zugeordnet'},
  {value:'easy',label:'Easy Run · locker'},
  {value:'recovery',label:'Recovery · regenerativ'},
  {value:'long',label:'Long Run · langer Lauf'},
  {value:'tempo',label:'Tempo · zügig'},
  {value:'intervals',label:'Intervalle · Wiederholungen'},
]
export function SessionGoalReview({samples,lapCount,activityDate}:{
  samples:SessionSample[];lapCount:number;activityDate:string|null
}) {
  const [goal,setGoal]=useState<SessionGoal>('unknown')
  const [limitText,setLimitText]=useState('')
  const [recentIllness,setRecentIllness]=useState(false)
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
  return <section className="lsi-wrap" aria-label="Trainingszielbezogene Analyse">
    <div className="lsi-heading"><div><span className="micro-label">SESSION INTELLIGENCE / v0.6.2</span><h3>Wofür war diese Einheit gedacht?</h3></div><span className="lsi-pill">Manueller Trainingszweck · Garmin-Referenz automatisch</span></div>
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
    <IntensityEvidencePanel samples={samples} activityDate={activityDate} profileData={data} />
    <div className="lsi-signals">{review.signals.map((signal,index)=><article key={`${signal.title}-${index}`} className={`lsi-signal lsi-${signal.level}`}><strong>{signal.title}</strong><p>{signal.explanation}</p></article>)}</div>
    <p className="lsi-disclaimer">Trainingszweck und eigene Angaben werden nicht gespeichert. Keine automatische Änderung an Garmin oder Trainingsplan.</p>
  </section>
}
