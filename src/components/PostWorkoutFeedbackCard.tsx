import {useEffect,useMemo,useState} from 'react'
import {berlinDateToday} from '../lib/coachGoal'
import {coachAddDays} from '../lib/coachSevenDay.mjs'
import {evaluateWorkoutFeedback} from '../lib/postWorkoutFeedback.mjs'
import type {WorkoutFeedback} from '../lib/postWorkoutFeedback.mjs'
import type {CoachContextPayload} from './CoachLifeContext'
import {Icon} from './Icon'
import '../styles/post-workout-feedback.css'

type Activity={activity_id:string;activity_name:string|null;start_time_local:string|null;
 sport_type:string|null;duration_s:number|null;rpe_raw:number|null}
type Input={action:string;[key:string]:string|number|boolean|null}
type Props={activities:Activity[];life:CoachContextPayload|null;
 busy:boolean;onSave:(input:Input)=>Promise<void>}
const short=(iso:string)=>iso.slice(8,10)+'.'+iso.slice(5,7)+'.'
export function PostWorkoutFeedbackCard({activities,life,busy,onSave}:Props){
 const today=berlinDateToday()
 const saved=life?.context?.post_workout_feedback||[]
 const recent=useMemo(()=>{
  const lower=coachAddDays(today,-14)
  const all=activities.filter(a=>typeof a.activity_id==='string'&&
   typeof a.start_time_local==='string'&&a.start_time_local.slice(0,10)>=lower&&
   a.start_time_local.slice(0,10)<=today)
  return [...new Map(all.map(a=>[a.activity_id,a])).values()]
   .sort((a,b)=>String(b.start_time_local).localeCompare(String(a.start_time_local))).slice(0,16)
 },[activities,today])
 const [chosenId,setChosenId]=useState('')
 const initial=recent.find(a=>!saved.some(f=>f.activityId===a.activity_id))||recent[0]||null
 const selected=recent.find(a=>a.activity_id===chosenId)||initial
 const existing:WorkoutFeedback|undefined=saved.find(x=>x.activityId===selected?.activity_id)
 const [rpe,setRpe]=useState<number|null>(null)
 const [legs,setLegs]=useState<WorkoutFeedback['legs']|' '>(' ')
 const [symptoms,setSymptoms]=useState<WorkoutFeedback['symptoms']>('none')
 const [feel,setFeel]=useState<WorkoutFeedback['feel']>('as_expected')
 const [note,setNote]=useState('')
 useEffect(()=>{
  setRpe(existing?.rpe??null)
  setLegs(existing?.legs??' ')
  setSymptoms(existing?.symptoms??'none')
  setFeel(existing?.feel??'as_expected')
  setNote(existing?.note??'')
 },[selected?.activity_id,existing?.rpe,existing?.legs,existing?.symptoms,existing?.feel,existing?.note])
 if(!life||!selected)return null
 const incomplete=rpe===null||legs===' '
 const preview=!incomplete?evaluateWorkoutFeedback({activityId:selected.activity_id,
  activityDate:selected.start_time_local!.slice(0,10),activityName:selected.activity_name||'Garmin-Einheit',
  reportedOn:today,rpe:rpe!,legs:legs as WorkoutFeedback['legs'],symptoms,feel,note}):null
 return <section className="pwf-root" aria-label="Deine Rückmeldung zu einer abgeschlossenen Garmin-Einheit">
  <div className="pwf-header">
   <div><span className="pwf-eyebrow"><Icon name="activity"/> P1 / DEIN TRAININGSFEEDBACK</span>
    <h3>Wie war deine letzte Einheit?</h3>
    <p>Ein kurzer Check, damit der Coach deine nächsten Tage besser planen kann.</p></div>
   {existing&&<span className="pwf-saved"><Icon name="check"/> Bereits erfasst</span>}
  </div>
  <label className="pwf-picker">Garmin-Einheit
   <select value={selected.activity_id} disabled={busy} onChange={e=>setChosenId(e.target.value)}>
    {recent.map(a=><option key={a.activity_id} value={a.activity_id}>
     {short(a.start_time_local!.slice(0,10))} · {a.activity_name||a.sport_type||'Training'}
    </option>)}
   </select>
  </label>
  <div className="pwf-form">
   <label>Anstrengung
    <select value={rpe??''} disabled={busy} onChange={e=>setRpe(e.target.value===''?null:Number(e.target.value))}>
     <option value="">Bitte auswählen</option>
     {Array.from({length:10},(_,i)=>i+1).map(x=><option value={x} key={x}>
      {x}/10 {x<=3?'· leicht':x<=6?'· moderat':x<=8?'· anstrengend':'· sehr hart'}
     </option>)}
    </select>
   </label>
   <label>Wie fühlen sich die Beine an?
    <select value={legs} disabled={busy} onChange={e=>setLegs(e.target.value as typeof legs)}>
     <option value=" ">Bitte auswählen</option>
     <option value="fresh">Frisch</option><option value="ok">In Ordnung</option>
     <option value="tired">Müde</option><option value="heavy">Schwer</option>
     <option value="destroyed">Komplett platt</option>
    </select>
   </label>
   <label>Beschwerden
    <select value={symptoms} disabled={busy} onChange={e=>setSymptoms(e.target.value as typeof symptoms)}>
     <option value="none">Keine</option><option value="light">Leicht</option>
     <option value="clear">Deutlich</option>
    </select>
   </label>
   <label>Im Vergleich zum Plan
    <select value={feel} disabled={busy} onChange={e=>setFeel(e.target.value as typeof feel)}>
     <option value="easier">Leichter</option><option value="as_expected">Wie erwartet</option>
     <option value="harder">Härter als gedacht</option>
    </select>
   </label>
  </div>
  <label className="pwf-note">Optional: Was sollte der Coach wissen?
   <textarea value={note} maxLength={280} rows={2} disabled={busy}
    placeholder="z. B. Beine schwer, Puls ruhig, letzter Anstieg anstrengend"
    onChange={e=>setNote(e.target.value)}/>
  </label>
  {preview&&<div className={'pwf-assessment is-'+preview.level} role="status">
   <strong>{preview.title}</strong><p>{preview.message}</p>
  </div>}
  <div className="pwf-actions">
   <span>{existing?'Du kannst deine Angaben korrigieren.':'Keine erfundenen Werte: Du entscheidest, wie es sich angefühlt hat.'}</span>
   <button type="button" disabled={busy||incomplete} onClick={()=>void onSave({
    action:'record_workout_feedback',activityId:selected.activity_id,rpe:rpe!,
    legs:legs as string,symptoms,feel,note
   })}><Icon name="check"/> {busy?'Speichere …':existing?'Feedback aktualisieren':'Feedback speichern & Coach neu bewerten'}</button>
  </div>
 </section>
}
