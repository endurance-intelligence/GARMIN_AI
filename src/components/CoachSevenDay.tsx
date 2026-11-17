import {useEffect,useMemo,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {buildSevenDayCoach} from '../lib/coachSevenDay.mjs'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {CoachDay} from '../lib/coachSevenDay.mjs'
import {Icon} from './Icon'
import {CoachLifeContext} from './CoachLifeContext'
import {CoachDecisionLive} from './CoachDecisionLive'
import {CoachPostRaceBarometer} from './CoachPostRaceBarometer'
import {PostWorkoutFeedbackCard} from './PostWorkoutFeedbackCard'
import {assessCustomProposal} from '../lib/coachCustomProposal.mjs'
import type {CoachContextPayload} from './CoachLifeContext'
import '../styles/coach-seven-day.css'

type SubmitResponse={saved?:boolean;id?:string;state?:string;revision?:number;error?:string}
const formatDate=(day:string)=>new Intl.DateTimeFormat('de-DE',{
 timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'
}).format(new Date(day+'T12:00:00Z'))

export function CoachSevenDay({active,focus,onCalendar,sharedSnapshot}:{
 active:boolean;focus?:{date:string;token:number}|null;
 onCalendar:(date?:string)=>void;sharedSnapshot?:CoachSnapshot|null
}){
 const [snapshot,setSnapshot]=useState<CoachSnapshot|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [contextBusy,setContextBusy]=useState(false)
 const [reload,setReload]=useState(0)
 const [review,setReview]=useState<string|null>(null)
 const [startTime,setStartTime]=useState('18:00')
 const [saving,setSaving]=useState<string|null>(null)
 const [savedDay,setSavedDay]=useState<string|null>(null)
 const [selectedDay,setSelectedDay]=useState(berlinDateToday)
 const [customDate,setCustomDate]=useState<string|null>(null)
 const [customKind,setCustomKind]=useState<'walk'|'mobility'|'rowing'|'run'>('walk')
 const [customMinutes,setCustomMinutes]=useState(25)
 const [customTitle,setCustomTitle]=useState('')
 const [customAcknowledged,setCustomAcknowledged]=useState(false)
 const ids=useRef<Record<string,string>>({})
 const lastFocus=useRef<number|null>(null)
 const today=berlinDateToday()
 useEffect(()=>{
  if(!active||!garminSupabase)return
  if(sharedSnapshot){setSnapshot(sharedSnapshot);setLoading(false);setError('');return}
  let mounted=true
  const controller=new AbortController()
  setLoading(true);setError('');setNotice('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden.')
   const data=await loadCoachSnapshot(session,today,controller.signal)
   if(mounted)setSnapshot(data)
  })().catch(e=>{
   if(mounted&&!(e instanceof Error&&e.name==='AbortError'))
    setError(e instanceof Error?e.message:'Coach-Daten nicht verfügbar.')
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,today,reload,sharedSnapshot])
 const plan=useMemo(()=>snapshot?buildSevenDayCoach({
  today,health:snapshot.health,options:snapshot.options,boards:snapshot.boards,
  plans:snapshot.plans,goal:snapshot.goal,life:snapshot.life
 }):null,[snapshot,today])
 useEffect(()=>{
  if(!active||!focus||lastFocus.current===focus.token||!plan)return
  lastFocus.current=focus.token
  // Never silently select a different day if the date is outside the visible 7 days.
  if(!plan.days.some(day=>day.date===focus.date))return
  setSelectedDay(focus.date);setReview(null);setCustomDate(null)
  requestAnimationFrame(()=>document.getElementById('c7-week-overview')?.scrollIntoView({
   behavior:'smooth',block:'start'
  }))
 },[active,focus,plan])
 const recentActivities=(snapshot?.boards||[]).flatMap(board=>
  Array.isArray(board.activities)?board.activities:[]) as Array<{
   activity_id:string;activity_name:string|null;start_time_local:string|null;
   sport_type:string|null;duration_s:number|null;rpe_raw:number|null
  }>
 const customDay=plan?.days.find(day=>day.date===customDate)||null
 const customAssessment=useMemo(()=>customDay&&plan?
  assessCustomProposal({day:customDay,plan,kind:customKind,minutes:customMinutes,
   goal:(snapshot?.goal?.goal||null) as {race_name?:string}|null}):null,
  [customDay,plan,customKind,customMinutes,snapshot?.goal])
 async function updateLife(action:{action:string;[key:string]:string|number|boolean|null}){
  if(!garminSupabase||contextBusy||saving!==null)return
  setContextBusy(true);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-context',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'},
    body:JSON.stringify(action)
   })
   const result=await response.json().catch(()=>({})) as {
    saved?:boolean;context?:CoachContextPayload['context'];runs?:CoachContextPayload['runs'];error?:string
   }
   if(!response.ok||result.saved!==true||!result.context||!Array.isArray(result.runs))
    throw Error(result.error||'Coach-Kontext konnte nicht gespeichert werden.')
   setSnapshot(prev=>prev?{...prev,life:{context:result.context!,runs:result.runs!}}:prev)
   window.dispatchEvent(new Event('garmin-ai-coach-changed'))
   setReview(null)
   setCustomDate(null)
   setSavedDay(null)
   setNotice('Deine Angaben wurden gespeichert und der 7-Tage-Coach neu berechnet. Keine Garmin-Änderung.')
  }catch(e){setError(e instanceof Error?e.message:'Coach-Kontext nicht gespeichert.')}
  finally{setContextBusy(false)}
 }
 async function accept(day:CoachDay){
  if(!garminSupabase||saving||contextBusy||!plan||!snapshot||
   !(day.approvable||day.kind==='option')||review!==day.date)return
  if(plan.days.find(x=>x.date===day.date)!==day)return
  setSaving(day.date);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   const requestId=ids.current[day.date]||(ids.current[day.date]=crypto.randomUUID())
   const structured=day.sport==='running'&&
    ['easy','long','return_easy'].includes(day.kind)&&Number.isSafeInteger(day.minutes)
   const payload=structured?{
    action:'create_coach_workout',clientRequestId:requestId,date:day.date,
    title:day.title,kind:day.kind,minutes:day.minutes,startTime
   }:{
    action:'create',clientRequestId:requestId,date:day.date,
    title:day.title,sessionType:'event',sport:day.kind==='mobility'?'strength':day.sport,
    notes:'Coach Intelligence · '+(day.minutes===null?'Freiwillige Gruppenoption':day.minutes+' Min.')+
      ' · Nur Kalendereintrag. Keine automatische Garmin-Übertragung.'
   }
   const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-training-plan',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'},
    body:JSON.stringify(payload)
   })
   const json=await res.json().catch(()=>({})) as SubmitResponse
   if(!res.ok||!json.saved)throw Error(json.error||'Entwurf nicht gespeichert.')
   setSnapshot(prev=>prev?{
    ...prev,plans:{entries:[...prev.plans.entries,{
     id:json.id,training_date:day.date,title:day.title,
     sport:day.kind==='mobility'?'strength':day.sport,
     state:'draft',session_type:'event',revision:json.revision||1,
     notes:structured?'Coach · '+day.minutes+' Min. ab '+startTime+
      ' · 3 zeitgesteuerte Abschnitte · ohne Pace/HF-Ziel':'Nur Kalendereintrag'
    }]}
   }:prev)
   setReview(null)
   setCustomDate(null)
   setSavedDay(day.date)
   window.dispatchEvent(new Event('garmin-ai-coach-changed'))
   setNotice((structured?
    'Zeitgesteuertes Lauf-Workout ('+day.minutes+' Min., Start '+startTime+
    ') als Entwurf gespeichert. Nächster Schritt: im Kalender freigeben und danach bewusst an Intervals.icu senden.':
    'Kalendereintrag als Entwurf gespeichert; keine strukturierte Garmin-Übertragung.')+
    ' Es wurde noch nichts an Garmin oder Intervals.icu gesendet.')
  }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}
  finally{setSaving(null)}
 }
 async function saveCustom(day:CoachDay){
  if(!garminSupabase||saving||contextBusy||!snapshot||customDate!==day.date||
   ['illness','blocked','race','existing','completed'].includes(day.kind)||Boolean(day.decision))return
  const minutes=Number(customMinutes)
  const assessment=customAssessment
  if(!assessment?.canSave){
   setError(assessment?.message||'Bitte Vorschlag und Datum prüfen.')
   return
  }
  if(assessment.requiresAcknowledgment&&!customAcknowledged){
   setError('Bitte zuerst die Coach-Einschätzung bestätigen oder den Vorschlag anpassen.')
   return
  }
  const runningAllowed=day.approvable||day.kind==='option'
  if(!Number.isInteger(minutes)||minutes<10||minutes>120||
   (customKind==='run'&&!runningAllowed)){
   setError('Bitte nur eine zulässige, leichte Einheit von 10–120 Minuten wählen.')
   return
  }
  const choices={
   walk:{title:'Spaziergang',sport:'other'},
   mobility:{title:'Stabi & Mobility',sport:'strength'},
   rowing:{title:'Rudern locker',sport:'other'},
   run:{title:'Lockerer Lauf',sport:'running'}
  } as const
  const pick=choices[customKind]
  const title=customTitle.trim()||pick.title+' · '+minutes+' Min.'
  if(title.length>120){setError('Titel darf maximal 120 Zeichen haben.');return}
  setSaving(day.date);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   const k='custom:'+day.date+':'+customKind+':'+minutes+':'+title
   const clientRequestId=ids.current[k]||(ids.current[k]=crypto.randomUUID())
   const notes='Eigener Vorschlag · '+minutes+' Min. · Coach: '+
    assessment.title+'. '+assessment.message.slice(0,235)+
    ' Nur Entwurf, keine Garmin-/Intervals-Übertragung.'
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-training-plan',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'},
    body:JSON.stringify({action:'create',clientRequestId,date:day.date,title,
     sport:pick.sport,sessionType:'event',notes})
   })
   const answer=await response.json().catch(()=>({})) as SubmitResponse
   if(!response.ok||!answer.saved)throw Error(answer.error||'Eigener Entwurf konnte nicht gespeichert werden.')
   setSnapshot(prev=>prev?{...prev,plans:{entries:[...prev.plans.entries,{
    id:answer.id,training_date:day.date,title,sport:pick.sport,
    state:'draft',session_type:'event',revision:answer.revision||1,notes
   }]}}:prev)
   setSavedDay(day.date);setCustomDate(null);setReview(null)
   window.dispatchEvent(new Event('garmin-ai-coach-changed'))
   setNotice('Eigener Vorschlag als Kalenderentwurf gespeichert. Bitte im Kalender prüfen und freigeben. Keine automatische Übertragung an Garmin oder Intervals.icu.')
  }catch(e){setError(e instanceof Error?e.message:'Eigener Vorschlag konnte nicht gespeichert werden.')}
  finally{setSaving(null)}
 }
 if(!active)return null
 return <section className="c7-root" aria-label="Coach Intelligence mit sieben Tagen Trainingsvorschlägen">
  <div className="c7-top">
   <div><span className="c7-eyebrow"><Icon name="sparkles"/> COACH INTELLIGENCE / V1.3</span>
    <h2>Deine nächsten 7 Tage.</h2>
    <p>Garmin-Daten, Erholung, Hauptziel und freiwillige Gruppentermine – erklärt statt bewertet.</p>
   </div>
   <button type="button" className="c7-refresh" disabled={loading||saving!==null}
    onClick={()=>{setReload(x=>x+1);window.dispatchEvent(new Event('garmin-ai-coach-changed'));setReview(null);setSavedDay(null)}}><Icon name="refresh-cw"/> Aktualisieren</button>
  </div>
  {snapshot&&<PostWorkoutFeedbackCard activities={recentActivities} life={snapshot.life}
   busy={contextBusy||saving!==null} onSave={updateLife}/>}
  {snapshot&&<CoachPostRaceBarometer goal={snapshot.goal} life={snapshot.life}
    busy={contextBusy||saving!==null} onSave={updateLife}/>}
  {snapshot&&<details className="c7-settings" id="c7-life-settings">
    <summary>Coach-Einstellungen · Pausen, Beschwerden und Verfügbarkeit</summary>
    <CoachLifeContext life={snapshot.life} busy={contextBusy||saving!==null} onAction={updateLife}/>
   </details>} 
  {loading&&!plan&&<p className="c7-alert" role="status">Prüfe aktuelle Garmin- und Kalenderdaten …</p>}
  {error&&<p className="c7-error" role="alert">{error}</p>}
  {snapshot&&snapshot.plans.entries.some(p=>p.training_date<today&&
   ['draft','pending'].includes(String(p.state||'')))&&
   <p className="c7-stale-plan">Ein älterer Trainingsentwurf ist noch offen.
    <button type="button" className="c7-secondary" onClick={()=>onCalendar()}>
     Vergangene Entwürfe im Kalender prüfen <Icon name="arrow-up-right"/></button>
   </p>}
  {plan&&<>
   <div className="c7-day-nav" id="c7-week-overview" role="tablist"
    aria-label="Wähle einen Tag für deine persönliche Coach-Entscheidung">
    {plan.days.map(day=><button type="button" key={day.date} role="tab"
      aria-selected={selectedDay===day.date} className={selectedDay===day.date?'is-selected':''}
      disabled={saving!==null||contextBusy}
      onClick={()=>{setSelectedDay(day.date);setReview(null);setCustomDate(null);
       setCustomAcknowledged(false);setNotice('')}}>
     <span>{formatDate(day.date)}</span>
     <strong title={day.title}>{day.title}</strong>
     {day.decision&&<small className="c7-day-choice">
      {day.decision==='accepted'?'✓ Angenommen':'× Abgelehnt'}</small>}
    </button>)}
   </div>
   <CoachDecisionLive plan={plan} snapshot={snapshot!} reviewDate={review}
    selectedDate={selectedDay} saving={saving!==null||contextBusy}
    onReview={date=>{
     setSelectedDay(date);setCustomDate(null);setReview(date);setStartTime('18:00')
     requestAnimationFrame(()=>document.getElementById('c7-day-'+date)?.scrollIntoView({
      behavior:'smooth',block:'center'
     }))
    }}
    onDecline={date=>void updateLife({action:'set_day_decision',date,choice:'declined'})}
    onAcceptRest={date=>void updateLife({action:'set_day_decision',date,choice:'accepted'})}
    onReset={date=>void updateLife({action:'set_day_decision',date,choice:'open'})}
    onCustom={date=>{
     setSelectedDay(date);setReview(null);setCustomDate(date);setCustomKind('walk')
     setCustomTitle('');setCustomMinutes(25);setCustomAcknowledged(false)
     requestAnimationFrame(()=>document.getElementById('c7-day-'+date)?.scrollIntoView({
      behavior:'smooth',block:'center'
     }))
    }}
    onCalendar={onCalendar}
    onPlan={()=>document.getElementById('c7-week-overview')?.scrollIntoView({behavior:'smooth',block:'start'})}/>
   <div className="c7-week" role="list">
    {plan.days.filter(day=>day.date===selectedDay&&(review===day.date||customDate===day.date)).map(day=><article className={'c7-day c7-'+day.kind} id={'c7-day-'+day.date} key={day.date} role="listitem">
     <div className="c7-editor-head">
      <span>{review===day.date?'ENTWURF PRÜFEN':'DEIN EIGENER VORSCHLAG'} · {formatDate(day.date)}</span>
      <strong>{day.title}</strong>
     </div>
     {review===day.date&&(day.approvable||day.kind==='option')&&!contextBusy&&<div className="c7-actions">
      {review===day.date?<div className="c7-confirm">
       <span>Nur diesen Vorschlag als Entwurf speichern?</span>
       {day.sport==='running'&&['easy','long','return_easy'].includes(day.kind)&&
        <div className="c7-structured-preview">
         <span>Garmin-Workout: {day.minutes} Min. · Einlaufen, lockerer Lauf, Auslaufen.
          Automatisch zeitgesteuert, ohne Pace- oder HF-Ziel.</span>
         <label>Startzeit in Intervals.icu
          <select value={startTime} onChange={e=>setStartTime(e.target.value)}
           disabled={saving!==null}>
           {Array.from({length:31},(_,i)=>{
            const time=String(6+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')
            return <option value={time} key={time}>{time} Uhr</option>
           })}
          </select>
         </label>
         <small>Erst hier speichern, danach im Kalender freigeben und ausdrücklich senden.
          Intervals.icu muss das Workout korrekt bestätigen, bevor du es auf Garmin verwendest.</small>
        </div>}
       <div><button type="button" disabled={saving!==null} onClick={()=>void accept(day)}>
        {saving===day.date?'Speichere …':'Ja, Entwurf speichern'}</button>
        <button type="button" className="c7-secondary" disabled={saving!==null}
         onClick={()=>setReview(null)}>Abbrechen</button></div>
      </div>:
       <button type="button" disabled={saving!==null} onClick={()=>{setReview(day.date);setStartTime('18:00')}}>
        Vorschlag prüfen</button>}
     </div>}
     {customDate===day.date&&<div className="c7-custom-form">
      <strong>Dein eigener Vorschlag für {formatDate(day.date)}</strong>
      <p>Wird nur als Entwurf gespeichert. Keine automatische Zusage und keine Garmin-Übertragung.</p>
      <div className="c7-custom-fields">
       <label>Aktivität
        <select value={customKind} disabled={saving!==null}
         onChange={e=>{setCustomKind(e.target.value as typeof customKind);setCustomAcknowledged(false)}}>
         <option value="walk">Spaziergang</option>
         <option value="mobility">Stabi / Mobility</option>
         <option value="rowing">Rudern locker</option>
         <option value="run" disabled={!(day.approvable||day.kind==='option')}>Lockerer Lauf</option>
        </select></label>
       <label>Dauer in Minuten
        <input type="number" min="10" max="120" step="5" value={customMinutes}
         disabled={saving!==null} onChange={e=>{setCustomMinutes(Number(e.target.value));setCustomAcknowledged(false)}}/></label>
       <label>Titel (optional)
        <input type="text" maxLength={120} value={customTitle} disabled={saving!==null}
         placeholder="z. B. 30 Min. Spaziergang" onChange={e=>setCustomTitle(e.target.value)}/></label>
      </div>
      {customAssessment&&<div className={'c7-custom-assessment is-'+customAssessment.level}
       role="status" aria-live="polite">
       <span className="c7-assessment-eyebrow">COACH-CHECK / VERGLEICH MIT DEM TAGESPLAN</span>
       <strong>{customAssessment.title}</strong>
       <p>{customAssessment.message}</p>
       <small>Abgleich der eingegebenen Dauer mit Coach-Plan, Wettkampfphase und verfügbaren Garmin-Signalen.
        Keine automatische Trainingsfreigabe.</small>
      </div>}
      {customAssessment?.requiresAcknowledgment&&<label className="c7-custom-ack">
       <input type="checkbox" checked={customAcknowledged} disabled={saving!==null}
        onChange={e=>setCustomAcknowledged(e.target.checked)}/>
       Ich habe die Einschätzung gelesen und möchte die Abweichung bewusst als Entwurf speichern.
      </label>}
      <div className="c7-custom-actions">
       <button type="button" disabled={saving!==null||!customAssessment?.canSave||
        (customAssessment.requiresAcknowledgment&&!customAcknowledged)}
        onClick={()=>void saveCustom(day)}>
        {saving===day.date?'Speichere …':customAssessment?.requiresAcknowledgment?
         'Trotz Coach-Hinweis als Entwurf speichern':'Meinen Vorschlag als Entwurf speichern'}</button>
       <button type="button" className="c7-secondary" disabled={saving!==null}
        onClick={()=>setCustomDate(null)}>Abbrechen</button>
      </div>
     </div>}
    </article>)}
   </div>
   {notice&&<div className="c7-saved-next" role="status">
    <p className="c7-ok">{notice}</p>
    {savedDay&&<button type="button" className="c7-next-calendar" onClick={()=>onCalendar(savedDay)}>
     Im Kalender weiter · {formatDate(savedDay)} <Icon name="arrow-up-right"/>
    </button>}
   </div>}
   <div className="c7-footer">
    <p>Nur Vorschläge: Keine direkten Garmin-Schreibzugriffe, kein automatisches Intervals-Publishing.
     Zeitgesteuerte Lauf-Workouts benötigen drei separate Schritte: Entwurf, Kalenderfreigabe, Intervals-Versand.
     Jeder Kalendereintrag entsteht erst nach deiner Bestätigung.
     Deine Krankheits- und Verfügbarkeitsangaben haben Vorrang vor den Messwerten.</p>
    <button type="button" className="c7-secondary" onClick={()=>onCalendar()}>
     Kalender ansehen <Icon name="arrow-up-right"/></button>
   </div>
  </>}
 </section>
}
