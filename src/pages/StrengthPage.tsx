import {useEffect,useMemo,useRef,useState} from 'react'
import {Icon} from '../components/Icon'
import {EI_EXERCISES} from '../lib/eiExercises'
import type {EIExercise} from '../lib/eiExercises'
import {berlinDate,crossKind,loadCrossTraining,saveCrossTraining} from '../lib/crossTrainingClient'
import type {CrossResponse,CrossKind} from '../lib/crossTrainingClient'
import '../styles/strength-studio.css'

type Topic='stabi'|'mobility'|'rowing'
type Phase='work'|'rest'
type Player={index:number;round:number;phase:Phase;remaining:number;running:boolean;done:boolean}
const STABI=['dead-bug','bird-dog','pallof-press','forearm-plank','glute-bridge','side-plank','calf-raise']
const MOBILITY=['cat-cow','hip-flexor-stretch','thoracic-rotation','knee-to-wall','adductor-rockback']
const mobilityIds=new Set(['cat-cow','adductor-rockback','hip-flexor-stretch','thoracic-rotation',
 'knee-to-wall','child-pose-breathing','short-foot'])
const categories=[
 {id:'all',name:'Alle'}, {id:'core',name:'Core'}, {id:'hips',name:'Hüfte'},
 {id:'ankle',name:'Fuß & Wade'}, {id:'strength',name:'Kraft'}
] as const
const iconFor=(exercise:EIExercise)=>
 exercise.focusAreas?.includes('core')?'shield-check':
 exercise.focusAreas?.includes('ankle')?'footprints':
 exercise.focusAreas?.includes('hips')?'activity':'move'
const formatClock=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')
const fmtDate=(date:string)=>date.slice(8,10)+'.'+date.slice(5,7)+'.'
export function StrengthPage({active}:{active:boolean}){
 const [topic,setTopic]=useState<Topic>('stabi')
 const [focus,setFocus]=useState('all')
 const [query,setQuery]=useState('')
 const [selected,setSelected]=useState<string[]>(STABI)
 const [detail,setDetail]=useState<EIExercise|null>(null)
 const [player,setPlayer]=useState<Player|null>(null)
 const [history,setHistory]=useState<CrossResponse|null>(null)
 const [loading,setLoading]=useState(false)
 const [saveBusy,setSaveBusy]=useState(false)
 const [date,setDate]=useState(berlinDate)
 const [duration,setDuration]=useState(25)
 const [distance,setDistance]=useState(5000)
 const [rpe,setRpe]=useState('')
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [additional,setAdditional]=useState(false)
 const requestId=useRef(crypto.randomUUID())
 const today=berlinDate()
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setLoading(true);setError('')
  void loadCrossTraining().then(r=>{if(mounted)setHistory(r)})
   .catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Trainingsdaten nicht geladen')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active])
 useEffect(()=>{
  if(!active||!player?.running||player.done)return
  const timer=setInterval(()=>setPlayer(p=>{
   if(!p||!p.running||p.done)return p
   if(p.remaining>1)return {...p,remaining:p.remaining-1}
   if(p.phase==='work')return {...p,phase:'rest',remaining:20}
   if(p.index<selected.length-1)return {...p,index:p.index+1,phase:'work',remaining:40}
   if(p.round<3)return {...p,index:0,round:p.round+1,phase:'work',remaining:40}
   return {...p,running:false,done:true,remaining:0}
  }),1000)
  return ()=>clearInterval(timer)
 },[active,player?.running,player?.done,selected.length])
 useEffect(()=>{
  if(!active)setPlayer(p=>p?{...p,running:false}:p)
 },[active])
 const exercises=useMemo(()=>EI_EXERCISES.filter(e=>{
  if(topic==='rowing')return false
  if(topic==='mobility'&&!mobilityIds.has(e.id)&&!e.focusAreas?.includes('mobility'))return false
  if(topic==='stabi'&&mobilityIds.has(e.id))return false
  if(focus!=='all'&&!e.focusAreas?.includes(focus))return false
  const search=query.trim().toLocaleLowerCase('de-DE')
  return !search||(e.name+' '+e.group+' '+(e.purpose||'')).toLocaleLowerCase('de-DE').includes(search)
 }),[topic,focus,query])
 const chosen=selected.map(id=>EI_EXERCISES.find(e=>e.id===id)).filter((x):x is EIExercise=>!!x)
 const prescribed=chosen.length*3 // 40s activity + 20s transition, 3 rounds
 const recordings=useMemo(()=>{
  if(!history)return []
  const g=history.garmin.map(a=>({
   id:'g-'+a.activity_id,day:a.start_time_local.slice(0,10),
   title:a.activity_name||a.sport_type,source:'Garmin',
   kind:crossKind(a.sport_type),duration:Math.round((a.duration_s||0)/60),
   distance:a.distance_m
  })).filter(x=>x.kind!==null)
  const m=history.manual.map(a=>({
   id:'m-'+a.id,day:a.session_date,title:a.kind==='rowing'?'Rudern':a.kind==='mobility'?'Mobility':'Stabi',
   source:'Manuell',kind:a.kind,duration:a.duration_minutes,
   distance:a.rowing_distance_m
  }))
  return [...g,...m].sort((a,b)=>b.day.localeCompare(a.day)).slice(0,12)
 },[history])
 function chooseTopic(next:Topic){
  setTopic(next);setQuery('');setFocus('all');setError('');setNotice('')
  if(next!=='rowing'){setSelected(next==='stabi'?[...STABI]:[...MOBILITY]);setDuration(next==='stabi'?25:15)}
  else setDuration(30)
  setPlayer(null)
 }
 function toggleExercise(id:string){
  setSelected(prev=>prev.includes(id)?prev.filter(x=>x!==id):prev.length>=12?prev:[...prev,id])
 }
 function startPlayer(){
  if(!chosen.length)return
  setPlayer({index:0,round:1,phase:'work',remaining:40,running:true,done:false})
  setDuration(prescribed)
  setDetail(null)
 }
 async function save(){
  if(saveBusy)return
  setSaveBusy(true);setError('');setNotice('')
  const kind:CrossKind=topic==='stabi'?'strength':topic
  try{
   const response=await saveCrossTraining({
    clientRequestId:requestId.current,kind,date,durationMinutes:duration,
    distanceMeters:kind==='rowing'?distance:null,rpe:rpe?Number(rpe):null,
    exerciseIds:kind==='rowing'?[]:selected,note:'',confirmAdditional:additional
   })
   if(!response.saved)throw Error('Speichern nicht bestätigt')
   setNotice('Einheit dokumentiert. Der Coach sieht sie im Wochenkontext; kein Garmin-Schreibzugriff.')
   setAdditional(false)
   requestId.current=crypto.randomUUID()
   setHistory(await loadCrossTraining())
  }catch(e){
   const issue=e as Error&{duplicateGarmin?:boolean}
   if(issue.duplicateGarmin)setAdditional(true)
   setError(e instanceof Error?e.message:'Einheit konnte nicht gespeichert werden')
  }finally{setSaveBusy(false)}
 }
 if(!active)return null
 return <section className="ss-root page active" aria-label="Stabi und Cross Training">
  <header className="ss-hero">
   <div><span className="ss-kicker">GARMIN_AI / MOVEMENT STUDIO</span>
    <h1>Stark laufen.<br/><em>Stabil bleiben.</em></h1>
    <p>Stabi, Mobility und Rudern. Die bewährten Übungen aus Endurance Intelligence,
     mit deinen echten Garmin-Daten verbunden.</p></div>
   <div className="ss-hero-badge"><Icon name="activity"/><strong>MOVE</strong><small>SMARTER</small></div>
  </header>
  <nav className="ss-tabs" aria-label="Trainingsart">
   {([{id:'stabi',title:'Stabi & Kraft',icon:'shield-check'},{id:'mobility',title:'Mobility',icon:'move'},
      {id:'rowing',title:'Rudern',icon:'waves'}] as const).map(x=>
    <button type="button" key={x.id} aria-pressed={topic===x.id}
      className={topic===x.id?'is-active':''} onClick={()=>chooseTopic(x.id)}>
      <Icon name={x.icon}/>{x.title}</button>)}
  </nav>
  {topic!=='rowing'?<>
   <section className="ss-session">
    <div className="ss-section-title"><div><span>DEINE SESSION</span>
     <h2>{topic==='stabi'?'Laufstabi · 3 Runden':'Mobility · freie Auswahl'}</h2>
     <p>{chosen.length} Übungen · 40 s Belastung / 20 s Wechsel
      {topic==='stabi'?' · 3 Runden':' · flexibel anpassbar'}</p></div>
     <div className="ss-session-stat"><strong>{prescribed}</strong><small>Min. Vorschlag</small></div>
    </div>
    <div className="ss-chosen">
     {chosen.length?chosen.map(e=><button type="button" className="ss-chip" key={e.id}
      onClick={()=>toggleExercise(e.id)} title="Übung aus Auswahl entfernen">{e.name}<span>×</span></button>):
      <span>Wähle unten Übungen für deine Session aus.</span>}
    </div>
    <div className="ss-actions">
     <button type="button" className="ss-main-action" disabled={!chosen.length}
      onClick={startPlayer}><Icon name="play"/> Training starten</button>
     <button type="button" className="ss-alt-action" onClick={()=>{
      setSelected(topic==='stabi'?[...STABI]:[...MOBILITY]);setPlayer(null)
     }}>Vorlage zurücksetzen</button>
    </div>
   </section>
   <section className="ss-library">
    <div className="ss-section-title"><div><span>ENDURANCE INTELLIGENCE / BIBLIOTHEK</span>
     <h2>{topic==='stabi'?'Deine Stabi-Übungen':'Beweglichkeit & Regeneration'}</h2>
     <p>Technik, häufige Fehler und Varianten aus der bewährten Übungsbibliothek.</p></div>
     <span className="ss-count">{exercises.length} Übungen</span></div>
    <div className="ss-filters">
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      aria-label="Übungen durchsuchen" placeholder="Übung suchen …"/>
     <div>{categories.map(x=><button type="button" key={x.id}
      className={focus===x.id?'active':''} aria-pressed={focus===x.id}
      onClick={()=>setFocus(x.id)}>{x.name}</button>)}</div>
    </div>
    <div className="ss-exercises">{exercises.map(e=>
     <article className="ss-exercise" key={e.id}>
      <div className="ss-exercise-icon"><Icon name={iconFor(e)}/></div>
      <div className="ss-exercise-info"><span>{e.group} · {e.seconds||60} s</span>
       <h3>{e.name}</h3><p>{e.purpose||e.instruction||'Kontrollierte Ausführung.'}</p></div>
      <div className="ss-exercise-buttons">
       <button type="button" onClick={()=>setDetail(e)}>Anleitung</button>
       <button type="button" className={selected.includes(e.id)?'in-session':''}
        onClick={()=>toggleExercise(e.id)}
        aria-pressed={selected.includes(e.id)}>
        {selected.includes(e.id)?'✓ Gewählt':'+ Hinzufügen'}</button>
      </div>
     </article>)}</div>
   </section>
  </>:<section className="ss-rowing">
   <div className="ss-section-title"><div><span>RUDERN / ERGOMETER</span>
    <h2>Kilometer auf dem Rudergerät.</h2>
    <p>Rudern ergänzt dein Lauftraining. Echte Garmin-Einheiten erscheinen unten automatisch.</p></div>
    <div className="ss-row-icon"><Icon name="waves"/></div>
   </div>
   <div className="ss-row-guide">
    <div><b>5 km</b><span>Deine häufige Ruderdistanz – nur als Eingabevorschlag</span></div>
    <div><b>30–35 min</b><span>Orientierung, kein vorgeschriebenes Tempo</span></div>
    <div><b>HF & RPE</b><span>Belastung im Coach berücksichtigen</span></div>
   </div>
  </section>}
  <section className="ss-log">
   <div className="ss-section-title"><div><span>TRAINING DOKUMENTIEREN</span>
    <h2>{topic==='rowing'?'Rudereinheit':'Stabi/Mobility-Einheit'} erfassen</h2>
    <p>Nur für tatsächliche Einheiten, die Garmin nicht bereits erfasst hat.</p></div></div>
   <div className="ss-log-fields">
    <label>Datum<input type="date" max={today} value={date} onChange={e=>{setDate(e.target.value);setAdditional(false)}}/></label>
    <label>Dauer (Min.)<input type="number" min={5} max={240} value={duration}
      onChange={e=>setDuration(Number(e.target.value))}/></label>
    {topic==='rowing'&&<label>Distanz (m)<input type="number" min={500} max={100000} step={100}
      value={distance} onChange={e=>setDistance(Number(e.target.value))}/></label>}
    <label>Empfundene Belastung
     <select value={rpe} onChange={e=>setRpe(e.target.value)}>
      <option value="">Nicht angegeben</option>
      {Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>RPE {n}/10</option>)}
     </select></label>
   </div>
   <button type="button" className="ss-main-action"
    disabled={saveBusy||(topic!=='rowing'&&!chosen.length)||!date||date>today}
    onClick={()=>void save()}>{saveBusy?'Speichere …':additional?'Zusätzliche Einheit trotz Garmin-Eintrag speichern':'Durchgeführte Einheit speichern'}</button>
   {error&&<p className="ss-error" role="alert">{error}</p>}
   {notice&&<p className="ss-notice" role="status">{notice}</p>}
  </section>
  <section className="ss-history">
   <div className="ss-section-title"><div><span>DEIN ECHTER TRAININGSVERLAUF</span>
    <h2>Auch abseits der Laufstrecke.</h2>
    <p>Garmin-Import und manuell erfasste ergänzende Einheiten, keine künstlichen Punkte.</p></div></div>
   {loading&&<p>Lade Garmin-Aktivitäten …</p>}
   <div className="ss-history-list">{recordings.slice(0,8).map(x=><div className="ss-history-item" key={x.id}>
    <span>{x.kind==='rowing'?'🚣':x.kind==='strength'?'🏋️':x.kind==='football'?'⚽':'🧘'}</span>
    <div><strong>{x.title}</strong><small>{fmtDate(x.day)} · {x.source}</small></div>
    <b>{x.kind==='rowing'&&x.distance?Math.round(x.distance/100)/10+' km · ':''}{x.duration} Min.</b>
   </div>)}</div>
   {!loading&&!recordings.length&&<p className="ss-info">Noch keine ergänzenden Einheiten in diesem Zeitraum.</p>}
  </section>
  {detail&&<div className="ss-overlay" role="presentation" onPointerDown={e=>{
   if(e.target===e.currentTarget)setDetail(null)
  }}><section className="ss-detail" role="dialog" aria-modal="true" aria-label={'Anleitung '+detail.name}>
   <button className="ss-close" type="button" aria-label="Schließen" onClick={()=>setDetail(null)}>×</button>
   <span className="ss-kicker">{detail.group} / ENDURANCE INTELLIGENCE</span>
   <h2>{detail.name}</h2><p>{detail.quickStart||detail.instruction}</p>
   <div className="ss-detail-meta"><span>{detail.seconds||60} Sekunden</span>
    <span>{detail.equipment?.length?'Equipment: '+detail.equipment.join(', '):'Ohne Zusatzmaterial'}</span></div>
   <h3>So geht's</h3><ol>{(detail.steps||[]).map((s,i)=><li key={i}>{s}</li>)}</ol>
   <div className="ss-guide-grid"><div><h3>Darauf achten</h3>
    <ul>{(detail.cues||[]).map((s,i)=><li key={i}>{s}</li>)}</ul></div>
    <div><h3>Häufige Fehler</h3><ul>{(detail.mistakes||[]).map((s,i)=><li key={i}>{s}</li>)}</ul></div></div>
   <div className="ss-easier"><p><b>Leichter:</b> {detail.easier||'Kontrolliert und ohne Schmerz.'}</p>
    <p><b>Schwerer:</b> {detail.harder||'Belastung nur bei stabiler Technik erhöhen.'}</p></div>
   <a href={'https://www.youtube.com/results?search_query='+encodeURIComponent(detail.name+' Übung Anleitung')}
    target="_blank" rel="noreferrer">Bewegung in einem Video ansehen</a>
   <button className="ss-main-action" type="button" onClick={()=>{toggleExercise(detail.id);setDetail(null)}}>
    {selected.includes(detail.id)?'Aus Session entfernen':'Zur Session hinzufügen'}</button>
  </section></div>}
  {player&&<div className="ss-overlay" role="presentation"><section className="ss-player" role="dialog"
    aria-modal="true" aria-label="Stabi Session">
    <span className="ss-kicker">WORKOUT PLAYER / {topic==='stabi'?'STABI':'MOBILITY'}</span>
    <h2>{player.done?'Session geschafft.':chosen[player.index]?.name||'Übung'}</h2>
    <p>Runde {player.round} von 3 · Übung {Math.min(player.index+1,chosen.length)} von {chosen.length}
      · {player.phase==='work'?'Belastung':'Wechselpause'}</p>
    <div className="ss-timer" aria-live="off">{formatClock(player.remaining)}</div>
    <div className="ss-player-actions">
     {!player.done&&<button type="button" onClick={()=>setPlayer(p=>p?{...p,running:!p.running}:p)}>
      {player.running?'Pause':'Fortsetzen'}</button>}
     <button type="button" onClick={()=>setPlayer(p=>{
      if(!p||p.done)return p
      if(p.phase==='work')return {...p,phase:'rest',remaining:20}
      if(p.index<chosen.length-1)return {...p,index:p.index+1,phase:'work',remaining:40}
      if(p.round<3)return {...p,round:p.round+1,index:0,phase:'work',remaining:40}
      return {...p,done:true,running:false,remaining:0}
     })}>Nächster Schritt</button>
     <button type="button" onClick={()=>setPlayer(null)}>Schließen</button>
    </div>
    <p>Timer ist eine Orientierung, nicht automatisch bei Garmin gespeichert.
     Nach der Einheit kannst du sie dokumentieren.</p>
  </section></div>}
 </section>
}
