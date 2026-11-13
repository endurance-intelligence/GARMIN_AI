import {useEffect,useMemo,useRef,useState} from 'react'
import {Icon} from '../components/Icon'
import {ExerciseComic} from '../components/ExerciseComic'
import {EI_EXERCISES} from '../lib/eiExercises'
import type {EIExercise} from '../lib/eiExercises'
import {buildMovementPlan,MOVEMENT_MINUTES,MOVEMENT_PATTERNS} from '../lib/movementSession'
import type {MovementPlan,MovementStep} from '../lib/movementSession'
import {berlinDate,crossKind,loadCrossTraining,saveCrossTraining} from '../lib/crossTrainingClient'
import type {CrossResponse} from '../lib/crossTrainingClient'
import '../styles/strength-studio.css'
import '../styles/movement-studio-v2.css'

type Player={index:number;rest:boolean;remaining:number;running:boolean;done:boolean}
const DAY=berlinDate
const categories=[
 {id:'all',name:'Alle'}, {id:'core',name:'Core'},
 {id:'hips',name:'Hüfte'}, {id:'ankle',name:'Fuß & Wade'},
 {id:'strength',name:'Kraft'}, {id:'back',name:'Rücken'}
] as const
const BODYWEIGHT_EXERCISES=EI_EXERCISES.filter(x=>
 !x.equipment?.some(item=>!['mat'].includes(item))&&
 !(x.equipmentAny?.length))
const byId=new Map(BODYWEIGHT_EXERCISES.map(x=>[x.id,x]))
const formatClock=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')
const short=(n:string)=>n.slice(8,10)+'.'+n.slice(5,7)+'.'
const movementLabel=(part:MovementStep['part'])=>part==='warmup'?'Mobilisieren':part==='strength'?'Kraft & Stabilität':'Auslockern'
function advance(p:Player,plan:MovementPlan):Player{
 const step=plan.steps[p.index]
 if(!step)return {...p,running:false,done:true,remaining:0}
 if(!p.rest&&step.restSeconds>0)return {...p,rest:true,remaining:step.restSeconds}
 const index=p.index+1
 if(index>=plan.steps.length)return {...p,running:false,done:true,remaining:0}
 return {...p,index,rest:false,remaining:plan.steps[index].workSeconds}
}
export function StrengthPage({active}:{active:boolean}){
 const [date,setDate]=useState(DAY)
 const [rotation,setRotation]=useState(0)
 const [focus,setFocus]=useState('all')
 const [search,setSearch]=useState('')
 const [detail,setDetail]=useState<EIExercise|null>(null)
 const [player,setPlayer]=useState<Player|null>(null)
 const [rpe,setRpe]=useState('')
 const [history,setHistory]=useState<CrossResponse|null>(null)
 const [loading,setLoading]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [additional,setAdditional]=useState(false)
 const idempotency=useRef(crypto.randomUUID())
 const today=DAY()
 const plan=useMemo(()=>buildMovementPlan(date,rotation),[date,rotation])
 const exercises=useMemo(()=>BODYWEIGHT_EXERCISES.filter(x=>{
  if(focus!=='all'&&!x.focusAreas?.includes(focus))return false
  const text=(x.name+' '+x.group+' '+(x.purpose||'')).toLocaleLowerCase('de-DE')
  return text.includes(search.trim().toLocaleLowerCase('de-DE'))
 }),[focus,search])
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setLoading(true);setError('')
  void loadCrossTraining().then(x=>{if(mounted)setHistory(x)})
   .catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Verlauf nicht erreichbar')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active])
 useEffect(()=>{
  if(!active||!player?.running||player.done)return
  const interval=setInterval(()=>setPlayer(p=>{
   if(!p||!p.running||p.done)return p
   return p.remaining>1?{...p,remaining:p.remaining-1}:advance(p,plan)
  }),1000)
  return ()=>clearInterval(interval)
 },[active,player?.running,player?.done,plan])
 useEffect(()=>{if(!active)setPlayer(p=>p?{...p,running:false}:p)},[active])
 function mixAgain(){
  if(player?.running)return
  setRotation(x=>x+1);setPlayer(null);setNotice('')
 }
 function begin(){
  if(player?.running)return
  setPlayer({index:0,rest:false,remaining:plan.steps[0].workSeconds,running:true,done:false})
  setError('');setNotice('')
 }
 async function save(){
  if(saving||date>today)return
  setSaving(true);setNotice('');setError('')
  try{
   const res=await saveCrossTraining({clientRequestId:idempotency.current,
    kind:'strength',date,durationMinutes:MOVEMENT_MINUTES,
    distanceMeters:null,rpe:rpe?Number(rpe):null,exerciseIds:plan.exerciseIds,
    note:'Stabi & Mobility · 30 Min. · 4 Min. Mobility, 24 Min. Kraft/Stabi, 2 Min. Lockerung',
    confirmAdditional:additional})
   if(!res.saved)throw Error('Einheit nicht bestätigt')
   setNotice('30 Minuten Stabi & Mobility gespeichert. Coach berücksichtigt die Belastung.')
   setAdditional(false);idempotency.current=crypto.randomUUID()
   setHistory(await loadCrossTraining())
  }catch(e){
   const err=e as Error&{duplicateGarmin?:boolean}
   if(err.duplicateGarmin)setAdditional(true)
   setError(e instanceof Error?e.message:'Speichern fehlgeschlagen')
  }finally{setSaving(false)}
 }
 const records=useMemo(()=>{
  if(!history)return []
  const g=history.garmin.map(a=>({id:'g-'+a.activity_id,
   date:a.start_time_local.slice(0,10),name:a.activity_name||a.sport_type,
   kind:crossKind(a.sport_type),minutes:Math.round((a.duration_s||0)/60),source:'Garmin'}))
  const m=history.manual.map(a=>({id:'m-'+a.id,date:a.session_date,
   name:a.kind==='strength'?'Stabi & Mobility':a.kind==='mobility'?'Mobility':'Rudern',
   kind:a.kind,minutes:a.duration_minutes,source:'Manuell'}))
  return [...g,...m].filter(x=>x.kind==='strength'||x.kind==='mobility')
   .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6)
 },[history])
 if(!active)return null
 const current=player?plan.steps[player.index]:null
 const currentExercise=current?byId.get(current.exerciseId):null
 const upcoming=player?.rest?plan.steps[player.index+1]:null
 const shownStep=upcoming||current
 const shownExercise=shownStep?byId.get(shownStep.exerciseId):null
 return <section className="ss-root page active ms-root" aria-label="Stabi und Mobility Studio">
  <header className="ss-hero ms-hero">
   <div><span className="ss-kicker">GARMIN_AI / MOVEMENT STUDIO</span>
    <h1>Stark laufen.<br/><em>Stabil bleiben.</em></h1>
    <p>Kraft und Mobility in einer Einheit, nur mit deinem Körpergewicht. Der Coach stellt die Übungen
     nach Bewegungsmustern zusammen – ohne Hanteln, Bänder oder künstliche Fitness-Scores.</p></div>
   <div className="ms-hero-time"><strong>30<span>min</span></strong><small>DEIN STANDARD</small></div>
  </header>
  <section className="ss-session ms-session">
   <div className="ss-section-title">
    <div><span>DEIN MIX / AUSGEWOGEN STATT BELIEBIG</span>
     <h2>Stabi + Mobility</h2>
     <p>8 Kraftbewegungen, 3 Runden · Mobilität am Anfang und Ende.
      Die Reihenfolge ist bewusst gewählt; die Varianten wechseln.</p></div>
    <div className="ss-session-stat"><strong>{MOVEMENT_MINUTES}</strong><small>Minuten</small></div>
   </div>
   <div className="ms-structure" aria-label="Aufteilung der 30 Minuten">
    <div style={{flex:4}}><b>4'</b><small>Warm-up</small></div>
    <div style={{flex:24}}><b>24'</b><small>Kraft / Stabi</small></div>
    <div style={{flex:2}}><b>2'</b><small>Mobility</small></div>
   </div>
   <div className="ms-plan-preview">
    {(['warmup','strength','cooldown'] as const).map(part=>{
     const steps=plan.steps.filter(x=>x.part===part)
     const unique=part==='strength'?steps.slice(0,8):steps
     return <div className="ms-plan-section" key={part}>
      <div className="ms-plan-heading"><strong>{movementLabel(part)}</strong>
       <span>{part==='warmup'?'4 × 60 Sek.':part==='strength'?'3 × 8 × (40 + 20 Sek.)':'2 × 60 Sek.'}</span></div>
      <div className="ms-plan-exercises">{unique.map((s,i)=>{
       const e=byId.get(s.exerciseId)
       return <button type="button" key={s.exerciseId+'-'+i}
        onClick={()=>e&&setDetail(e)} title="Übungsanleitung öffnen">
        <span>{e?.name||s.exerciseId}</span><small>{part==='strength'?MOVEMENT_PATTERNS[i].id.replace('-',' '):'Mobility'}</small>
       </button>
      })}</div>
     </div>
    })}
   </div>
   <div className="ss-actions">
    <button className="ss-main-action" type="button" onClick={begin}>
     <Icon name="play"/> 30-Minuten-Einheit starten</button>
    <button className="ss-alt-action" type="button" onClick={mixAgain} disabled={!!player?.running}>
     Neu zusammenstellen</button>
   </div>
   <p className="ms-caption">Die Mischung ist ein Vorschlag, keine automatische Trainingsfreigabe.
    Für echten Zugkraftaufbau im oberen Rücken wäre später ein Widerstand nötig – Bodenübungen trainieren hier vor allem die Schulterblätter.
    Vor harten Einheiten kann der Coach leichtere Varianten empfehlen.</p>
  </section>
  <section className="ss-library">
   <div className="ss-section-title"><div>
    <span>DEINE ÜBUNGSBIBLIOTHEK</span><h2>Alle Übungen, ein Studio.</h2>
    <p>Technik, häufige Fehler und leichtere/schwerere Varianten aus Endurance Intelligence.
     Nur Körpergewichtsübungen – keine vorausgesetzten Hanteln, Bänder oder Geräte.</p></div>
    <span className="ss-count">{BODYWEIGHT_EXERCISES.length} Übungen ohne Geräte</span></div>
   <div className="ss-filters">
    <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
     placeholder="Übung suchen …" aria-label="Übungen suchen"/>
    <div>{categories.map(cat=><button type="button" key={cat.id}
     className={focus===cat.id?'active':''} aria-pressed={focus===cat.id}
     onClick={()=>setFocus(cat.id)}>{cat.name}</button>)}</div>
   </div>
   <div className="ss-exercises">{exercises.map(exercise=>
    <article className="ss-exercise" key={exercise.id}>
     <div className="ss-exercise-icon"><Icon name={exercise.focusAreas?.includes('core')?'shield-check':exercise.focusAreas?.includes('ankle')?'footprints':'activity'}/></div>
     <div className="ss-exercise-info">
      <span>{exercise.group} · {exercise.seconds||60} Sek.</span>
      <h3>{exercise.name}</h3><p>{exercise.purpose||exercise.instruction}</p></div>
     <div className="ss-exercise-art"><ExerciseComic id={exercise.id} name={exercise.name} compact/></div>
     <div className="ss-exercise-buttons">
      <button type="button" onClick={()=>setDetail(exercise)}>Anleitung öffnen</button>
      {plan.exerciseIds.includes(exercise.id)&&
       <span className="ms-in-session">✓ Im heutigen Mix</span>}
     </div>
    </article>)}</div>
  </section>
  <section className="ss-log">
   <div className="ss-section-title"><div><span>ABGESCHLOSSENES TRAINING</span>
    <h2>Einheit dokumentieren</h2>
    <p>Nur speichern, wenn du die Einheit wirklich durchgeführt hast.
     Garmin-Aufzeichnungen werden nicht doppelt übernommen.</p></div></div>
   <div className="ss-log-fields ms-log-fields">
    <label>Datum<input type="date" max={today} value={date}
     onChange={e=>{setDate(e.target.value);setRotation(0);setPlayer(null);setAdditional(false)}}/></label>
    <label>Umfang<input value="30 Minuten · Stabi & Mobility" readOnly/></label>
    <label>Empfundene Anstrengung<select value={rpe} onChange={e=>setRpe(e.target.value)}>
     <option value="">Nicht angegeben</option>
     {Array.from({length:10},(_,i)=>i+1).map(i=><option key={i} value={i}>RPE {i}/10</option>)}
    </select></label>
   </div>
   <button type="button" className="ss-main-action" disabled={saving||date>today}
    onClick={()=>void save()}>{saving?'Speichere …':additional?'Trotz Garmin-Eintrag zusätzlich speichern':'Absolvierte Einheit speichern'}</button>
   {error&&<p className="ss-error" role="alert">{error}</p>}
   {notice&&<p className="ss-notice" role="status">{notice}</p>}
  </section>
  <section className="ss-history">
   <div className="ss-section-title"><div><span>DEINE LETZTEN EINHEITEN</span>
    <h2>Konstanz statt Punktesammeln.</h2><p>Garmin und bestätigte, manuelle Stabi-/Mobility-Einheiten.</p></div></div>
   {loading&&<p>Lade Verlauf …</p>}
   <div className="ss-history-list">{records.map(r=><div className="ss-history-item" key={r.id}>
    <span>🧘</span><div><strong>{r.name}</strong><small>{short(r.date)} · {r.source}</small></div>
    <b>{r.minutes} Min.</b></div>)}</div>
   {!loading&&!records.length&&<p className="ss-info">Noch keine Einträge vorhanden.</p>}
   <p className="ms-caption">Weitere Ausdauerbelastungen fließen über Garmin in den Coach ein – ohne künstliche Umrechnung in Laufkilometer.</p>
  </section>
  {detail&&<div className="ss-overlay" role="presentation" onPointerDown={e=>{
   if(e.target===e.currentTarget)setDetail(null)}}>
   <section className="ss-detail" role="dialog" aria-modal="true" aria-label={'Anleitung '+detail.name}>
    <button type="button" className="ss-close" onClick={()=>setDetail(null)} aria-label="Schließen">×</button>
    <span className="ss-kicker">{detail.group} / COACH-GEPRÜFTE ÜBUNGEN</span>
    <h2>{detail.name}</h2><p>{detail.quickStart||detail.instruction}</p>
    <div className="ss-detail-illustration">
     <ExerciseComic id={detail.id} name={detail.name} priority/>
    </div>
    <div className="ss-detail-meta"><span>{detail.seconds||60} Sekunden</span>
     <span>Ohne Geräte · ggf. weiche Unterlage</span></div>
    <h3>So geht's</h3><ol>{(detail.steps||[]).map((s,i)=><li key={i}>{s}</li>)}</ol>
    <div className="ss-guide-grid">
     <div><h3>Darauf achten</h3><ul>{(detail.cues||[]).map((s,i)=><li key={i}>{s}</li>)}</ul></div>
     <div><h3>Typische Fehler</h3><ul>{(detail.mistakes||[]).map((s,i)=><li key={i}>{s}</li>)}</ul></div></div>
    <div className="ss-easier"><p><b>Leichter:</b> {detail.easier||'Bewegung leichter ausführen.'}</p>
     <p><b>Schwieriger:</b> {detail.harder||'Bewegung kontrollierter oder einbeinig ausführen.'}</p></div>
    
    <button className="ss-main-action" type="button" onClick={()=>setDetail(null)}>Zurück zum Training</button>
   </section></div>}
  {player&&<div className="ss-overlay" role="presentation">
   <section className="ss-player" role="dialog" aria-modal="true" aria-label="30-Minuten-Kraft-und-Mobility-Training">
    <span className="ss-kicker">WORKOUT PLAYER / {current?movementLabel(current.part).toUpperCase():'FERTIG'}</span>
    <h2>{player.done?'30 Minuten geschafft.':player.rest?'Wechselpause':currentExercise?.name||'Übung'}</h2>
    {player.rest&&shownExercise&&<p className="ss-player-next">
     <strong>Als Nächstes:</strong> {shownExercise.name}</p>}
    <p>{player.done?'Training dokumentieren, wenn es tatsächlich absolviert wurde.':
     (current?.part==='strength'?'Runde '+current.round+' von 3 · ':'')+
     'Schritt '+(player.index+1)+' von '+plan.steps.length+
     (player.rest?' · Nächste Übung vorbereiten':' · Kontrolliert ausführen')}</p>
    {!player.done&&shownExercise&&<div className="ss-player-art">
     <ExerciseComic id={shownExercise.id} name={shownExercise.name} priority/>
    </div>}
    <div className="ss-player-timer" aria-live="off">{formatClock(player.remaining)}</div>
    {!player.done&&shownExercise&&<div className="ss-player-guide">
     <small>{player.rest?'NÄCHSTE ÜBUNG VORBEREITEN':'SAUBERE AUSFÜHRUNG'}</small>
     <span>{shownExercise.quickStart||shownExercise.instruction}</span>
     {(shownExercise.cues||[]).slice(0,2).map((cue,i)=>
      <span key={i}>✓ {cue}</span>)}
    </div>}
    <div className="ss-player-actions">
     {!player.done&&<button type="button" onClick={()=>setPlayer(p=>p?{...p,running:!p.running}:p)}>
      {player.running?'Pause':'Fortsetzen'}</button>}
     {!player.done&&<button type="button" onClick={()=>setPlayer(p=>p?advance(p,plan):p)}>Nächster Abschnitt</button>}
     <button type="button" onClick={()=>setPlayer(null)}>Schließen</button>
    </div>
    <p>Eigene Comic-Illustrationen · Technik vor Tempo. 40 Sekunden Arbeit / 20 Sekunden Wechsel im Kraftteil.
     Keine automatische Übertragung an Garmin.</p>
   </section></div>}
 </section>
}
