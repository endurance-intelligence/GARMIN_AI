import {useEffect,useMemo,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {buildSevenDayCoach} from '../lib/coachSevenDay.mjs'
import {TrainingQualityMark} from './TrainingQualityMark'
import {WeeklyTrainingCard} from './WeeklyTrainingCard'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {CoachDay} from '../lib/coachSevenDay.mjs'
import {Icon} from './Icon'
import {CoachLifeContext} from './CoachLifeContext'
import {CoachDecisionLive} from './CoachDecisionLive'
import {CoachPostRaceBarometer} from './CoachPostRaceBarometer'
import {CoachRaceRecoveryCard} from './CoachRaceRecoveryCard'
import {GarminFeedbackCard} from './GarminFeedbackCard'
import {WeeklyPlanActualCard} from './WeeklyPlanActualCard'
import {CoachNextImpactCard} from './CoachNextImpactCard'
import {CoachFourWeekCard} from './CoachFourWeekCard'
import {CoachMemoryCard} from './CoachMemoryCard'
import {boundedCoachReason} from '../lib/coachMemory.mjs'
import {CoachLongTermCard} from './CoachLongTermCard'
import {CoachAdaptiveVolumeCard} from './CoachAdaptiveVolumeCard'
import {assessCustomProposal} from '../lib/coachCustomProposal.mjs'
import {trainingAlternativeForDate} from '../lib/goalTrainingFocus.mjs'
import type {GoalSupplementSuggestion} from '../lib/goalTrainingFocus.mjs'
import {SupplementSessionDetails} from './SupplementSessionDetails'
import type {CoachContextPayload} from './CoachLifeContext'
import '../styles/coach-seven-day.css'

type SubmitResponse={saved?:boolean;id?:string;state?:string;revision?:number;error?:string}
const formatDate=(day:string)=>new Intl.DateTimeFormat('de-DE',{
 timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'
}).format(new Date(day+'T12:00:00Z'))

export function CoachSevenDay({active,focus,onCalendar,sharedSnapshot,onRacePrep,reviewStart,snapshotWeek,singleDay=false}:{
 active:boolean;focus?:{date:string;token:number}|null;
 onCalendar:(date?:string)=>void;sharedSnapshot?:CoachSnapshot|null;
 onRacePrep?:()=>void;reviewStart?:string;snapshotWeek?:string;singleDay?:boolean
}){
 const [snapshot,setSnapshot]=useState<CoachSnapshot|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [contextBusy,setContextBusy]=useState(false)
 const [reload,setReload]=useState(0)
 const [review,setReview]=useState<string|null>(null)
 const [variant,setVariant]=useState<'original'|'alternative'>('original')
 const variantLock=useRef(false)
 const [startTime,setStartTime]=useState('18:00')
 const [saving,setSaving]=useState<string|null>(null)
 const [savedDay,setSavedDay]=useState<string|null>(null)
 const [selectedDay,setSelectedDay]=useState(()=>singleDay&&focus?.date?focus.date:berlinDateToday())
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
   const data=await loadCoachSnapshot(session,today,controller.signal,undefined,4)
   if(mounted)setSnapshot(data)
  })().catch(e=>{
   if(mounted&&!(e instanceof Error&&e.name==='AbortError'))
    setError(e instanceof Error?e.message:'Coach-Daten nicht verfügbar.')
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,today,reload,sharedSnapshot])
 const plan=useMemo(()=>snapshot?buildSevenDayCoach({
  today,startDate:reviewStart,health:snapshot.health,options:snapshot.options,boards:snapshot.boards,
  plans:snapshot.plans,goal:snapshot.goal,life:snapshot.life,
  racePortfolio:snapshot.racePortfolio,goalRoute:snapshot.goalRoute
 }):null,[snapshot,today,reviewStart])
 useEffect(()=>{
  if(!active||!focus||lastFocus.current===focus.token||!plan)return
  // Wait until the requested day's actual calendar horizon is available.
  if(!plan.days.some(day=>day.date===focus.date))return
  lastFocus.current=focus.token
  setSelectedDay(focus.date);setReview(null);setCustomDate(null)
  if(!singleDay)requestAnimationFrame(()=>document.getElementById('c7-week-overview')?.scrollIntoView({
   behavior:'smooth',block:'start'
  }))
 },[active,focus,plan,singleDay])
 const alternative=trainingAlternativeForDate(plan,selectedDay)
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
   setSnapshot(prev=>prev?{...prev,life:{...prev.life,context:result.context!,runs:result.runs!}}:prev)
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
   variantLock.current||!(day.approvable||day.kind==='option')||review!==day.date)return
  if(plan.days.find(x=>x.date===day.date)!==day)return
  variantLock.current=true
  setSaving(day.date);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   const requestId=ids.current[day.date]||(ids.current[day.date]=crypto.randomUUID())
   const structured=day.sport==='running'&&
    ['easy','long','return_easy','intervals'].includes(day.kind)&&(Number.isSafeInteger(day.minutes)||!!day.qualityArchive)
   const payload=structured?{
    action:'create_coach_workout',clientRequestId:requestId,date:day.date,
    title:day.title,kind:day.kind,minutes:day.minutes,startTime,
    ...(day.qualityArchive?{archiveTemplateId:day.qualityArchive.templateId,archiveGroup:day.qualityArchive.group}:{}),
    coachReason:boundedCoachReason(day.reason)
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
    ...prev,plans:{...prev.plans,entries:[...prev.plans.entries,{
     id:json.id,training_date:day.date,title:day.title,
     sport:day.kind==='mobility'?'strength':day.sport,
     state:'draft',session_type:'event',revision:json.revision||1,
     notes:day.qualityArchive?'Coach-Archiv · '+(day.qualityArchive.totalMeters/1000).toLocaleString('de-DE')+' km':structured?'Coach · '+day.minutes+' Min. ab '+startTime+
      (day.kind==='intervals'?' · 4 × 2 Min. kontrolliert · 3 Trabpausen':' · 3 zeitgesteuerte Abschnitte · ohne Pace/HF-Ziel'):'Nur Kalendereintrag'
    }]}
   }:prev)
   setReview(null)
   setCustomDate(null)
   setSavedDay(day.date)
   window.dispatchEvent(new Event('garmin-ai-coach-changed'))
   setNotice((day.qualityArchive?'Geprüfte Archivgruppe als distanzgesteuerten Entwurf gespeichert. Im Kalender freigeben und bewusst senden.':structured?
    'Zeitgesteuertes Lauf-Workout ('+day.minutes+' Min., Start '+startTime+
    ') als Entwurf gespeichert. Nächster Schritt: im Kalender freigeben und danach bewusst an Intervals.icu senden.':
    'Kalendereintrag als Entwurf gespeichert; keine strukturierte Garmin-Übertragung.')+
    ' Es wurde noch nichts an Garmin oder Intervals.icu gesendet.')
  }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}
  finally{variantLock.current=false;setSaving(null)}
 }
 async function acceptAlternative(day:CoachDay,choice:GoalSupplementSuggestion){
  if(!garminSupabase||!plan||!snapshot||saving||contextBusy||variantLock.current||review!==day.date||day.date<today||
   plan.days.find(x=>x.date===day.date)!==day||trainingAlternativeForDate(plan,day.date)!==choice)return
  variantLock.current=true;setSaving(day.date);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   // Refresh evidence before using the existing explicitly confirmed calendar
   // event path. Same day request ID is shared with the original choice.
   const fresh=await loadCoachSnapshot(session,today,undefined,snapshotWeek,4)
   const current=buildSevenDayCoach({today,startDate:reviewStart,health:fresh.health,boards:fresh.boards,options:fresh.options,plans:fresh.plans,goal:fresh.goal,life:fresh.life,racePortfolio:fresh.racePortfolio,goalRoute:fresh.goalRoute})
   const next=trainingAlternativeForDate(current,day.date)
   if(!next||JSON.stringify(next)!==JSON.stringify(choice)||fresh.plans.entries.some(p=>p.training_date===day.date&&p.state!=='cancelled')){
    setSnapshot(fresh);setReview(null);throw Error('Die Trainingslage hat sich geändert. Bitte die aktuelle Empfehlung erneut prüfen.')
   }
   const title=choice.title.replace(/ als Alternative$/,'')+' · '+choice.minutes+' Min.'
   const sport=choice.kind==='treadmill-run'?'running':choice.kind==='cycling'?'cycling':choice.kind==='strength'?'strength':'other'
   const segments=choice.segments?.map(s=>s.minutes+' Min. '+s.label+' ('+s.incline+' %)').join(' / ')||''
   const notes=('Coach-Alternative · '+choice.minutes+' Min. · '+choice.intensity+'. '+segments+' '+choice.reason+' Nur Kalendereintrag, kein strukturiertes Workout.').slice(0,500)
   const requestId=ids.current[day.date]||(ids.current[day.date]=crypto.randomUUID())
   const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-training-plan',{method:'POST',cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,'content-type':'application/json'},body:JSON.stringify({action:'create',clientRequestId:requestId,date:day.date,title,sessionType:'event',sport,notes})})
   const result=await res.json().catch(()=>({})) as SubmitResponse
   if(!res.ok||result.saved!==true||result.state!=='draft'||!result.id)throw Error(result.error||'Alternative nicht als Entwurf bestätigt.')
   setSnapshot({...fresh,plans:{...fresh.plans,entries:[...fresh.plans.entries,{id:result.id,training_date:day.date,title,sport,state:'draft',session_type:'event',revision:result.revision||1,notes}]}})
   setReview(null);setCustomDate(null);setSavedDay(day.date)
   window.dispatchEvent(new Event('garmin-ai-coach-changed'))
   setNotice('Gewählte Alternative als Entwurf gespeichert. Die ursprüngliche Einheit wurde nicht zusätzlich eingeplant. Keine strukturierte Garmin-Übertragung.')
  }catch(e){setError(e instanceof Error?e.message:'Alternative konnte nicht gespeichert werden.')}
  finally{variantLock.current=false;setSaving(null)}
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
   setSnapshot(prev=>prev?{...prev,plans:{...prev.plans,entries:[...prev.plans.entries,{
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
 if(singleDay&&focus&&!plan?.days.some(day=>day.date===focus.date))return <p role="status">Die Empfehlung für diesen Tag wird geprüft …</p>
 return <section className="c7-root" aria-label="Coach Intelligence mit sieben Tagen Trainingsvorschlägen">
  <div className="c7-top">
   <div><span className="c7-eyebrow"><Icon name="sparkles"/> DEIN TRAININGSPLAN</span>
    <h2>{singleDay?'Deine Tagesentscheidung':'Deine nächsten 7 Tage'}</h2>
    <p>{singleDay?'Prüfe die Empfehlung für diesen Kalendertag.':'Wähle einen Tag und entscheide gemeinsam mit deinem Coach.'}</p>
   </div>
   <button type="button" className="c7-refresh" disabled={loading||saving!==null}
    onClick={()=>{setReload(x=>x+1);window.dispatchEvent(new Event('garmin-ai-coach-changed'));setReview(null);setSavedDay(null)}}><Icon name="refresh-cw"/> Aktualisieren</button>
  </div>
  {plan?.autoRaceRecovery&&<CoachRaceRecoveryCard review={plan.autoRaceRecovery}
    onRacePrep={onRacePrep}/>}
  {snapshot&&plan?.autoRaceRecovery&&plan.autoRaceRecovery.daysSince!==null&&
   plan.autoRaceRecovery.daysSince>=0&&plan.autoRaceRecovery.daysSince<=21&&
   <details className="c7-settings">
    <summary>Optional: persönliches Erholungs-Barometer ergänzen</summary>
    <CoachPostRaceBarometer goal={snapshot.goal} life={snapshot.life}
     busy={contextBusy||saving!==null} onSave={updateLife}/>
   </details>}
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
   {!singleDay&&<WeeklyTrainingCard budget={plan.weeklyBudgets?.find(w=>w.current)}/>}
   <div className="c7-day-nav" id="c7-week-overview" role="tablist" hidden={singleDay}
    aria-label="Wähle einen Tag für deine persönliche Coach-Entscheidung">
    {plan.days.map(day=><button type="button" key={day.date} role="tab"
      data-coach-date={day.date} aria-selected={selectedDay===day.date}
      className={'c7-road-day c7-road-'+day.kind+(selectedDay===day.date?' is-selected':'')+(day.date===today?' is-today':'')+(day.selectedGroup?' is-group':'')}
      disabled={saving!==null||contextBusy}
      onClick={()=>{setSelectedDay(day.date);setReview(null);setCustomDate(null);
       setCustomAcknowledged(false);setNotice('')}}>
     <span className="c7-road-date"><span>{day.date===today?'HEUTE':new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'short'}).format(new Date(day.date+'T12:00:00Z')).replace('.','')}</span><strong>{day.date.slice(8,10)}</strong></span>
     <span className="c7-road-icon"><Icon name={day.kind==='race'?'flag':day.selectedGroup?'check-circle':['recovery','illness','blocked'].includes(day.kind)?'heart-pulse':'footprints'}/></span>
     {day.selectedGroup?<strong title={day.selectedGroup.title}>{day.selectedGroup.title}</strong>:<strong title={day.title}>{day.title}</strong>}
     <TrainingQualityMark compact intent={day.qualityIntent} blocked={day.qualityBlocked}/>
     {day.selectedGroup&&<small className="c7-group-label">{day.selectedGroup.advice==='skip'?'Coach rät ab':day.selectedGroup.advice==='easy'?'Locker & verkürzt':'Bestätigt'}</small>}
     {day.decision&&<small className="c7-day-choice">
      {day.decision==='accepted'?'✓ Angenommen':'× Abgelehnt'}</small>}
    </button>)}
   </div>
   <CoachDecisionLive plan={plan} snapshot={snapshot!} reviewDate={review}
    selectedDate={selectedDay} saving={saving!==null||contextBusy}
    onReview={date=>{
     setSelectedDay(date);setCustomDate(null);setVariant('original');setReview(date);setStartTime('18:00')
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
    onPlan={()=>singleDay?onCalendar(selectedDay):document.getElementById('c7-week-overview')?.scrollIntoView({behavior:'smooth',block:'start'})}/>
   <div className="c7-week" role="list">
    {plan.days.filter(day=>day.date===selectedDay&&(review===day.date||customDate===day.date)).map(day=><article className={'c7-day c7-'+day.kind} id={'c7-day-'+day.date} key={day.date} role="listitem">
     <div className="c7-editor-head">
      <span>{review===day.date?'ENTWURF PRÜFEN':'DEIN EIGENER VORSCHLAG'} · {formatDate(day.date)}</span>
      <strong>{day.title}</strong>
     </div>
     {review===day.date&&(day.approvable||day.kind==='option')&&!contextBusy&&<div className="c7-actions">
      {review===day.date?<div className="c7-confirm">
       <span>{alternative?'Wähle einen Trainingsreiz. Nur die ausgewählte Variante wird als Entwurf gespeichert.':'Nur diesen Vorschlag als Entwurf speichern?'}</span>
       {alternative&&<fieldset className="c7-variants"><legend>Deine Trainingsvarianten</legend><label className={variant==='original'?'is-selected':''}><input type="radio" name="coach-variant" checked={variant==='original'} disabled={saving!==null} onChange={()=>setVariant('original')}/><span><strong>{day.title}</strong><small>{day.minutes} Min. · {day.sport==='running'?'Laufspezifischer Reiz':'Ursprünglicher Trainingsreiz'}</small></span></label><label className={variant==='alternative'?'is-selected':''}><input type="radio" name="coach-variant" checked={variant==='alternative'} disabled={saving!==null} onChange={()=>setVariant('alternative')}/><span><strong>{alternative.title} · {alternative.minutes} Min.</strong><small>{alternative.intensity}</small></span></label>{variant==='alternative'&&<div className="cdb-supplement"><p>{alternative.reason}</p><SupplementSessionDetails suggestion={alternative}/><small>Nur Kalendereintrag; keine automatische Steuerung deines Geräts.</small></div>}</fieldset>}
       {variant==='original'&&day.sport==='running'&&['easy','long','return_easy','intervals'].includes(day.kind)&&
        <div className="c7-structured-preview">
         <span>{day.qualityArchive?'Archiv-Workout: '+day.qualityArchive.title+' · '+day.qualityArchive.group+' · '+(day.qualityArchive.totalMeters/1000).toLocaleString('de-DE')+' km. '+(day.qualityArchive.warmupMeters/1000).toLocaleString('de-DE')+' km einlaufen, '+day.qualityArchive.efforts+' Intervalle, '+(day.qualityArchive.recoveryMeters/1000).toLocaleString('de-DE')+' km Trabpausen, '+(day.qualityArchive.cooldownMeters/1000).toLocaleString('de-DE')+' km auslaufen. Distanzgesteuert; nur vorhandene Pace-Vorgaben.':day.kind==='intervals'?'Garmin-Workout: 12 Min. einlaufen · 4 × 2 Min. kontrolliert zügig, 3 × 2 Min. traben · 10 Min. auslaufen. Kein Sprint, keine Ausbelastung.':'Garmin-Workout: '+day.minutes+' Min. · Einlaufen, lockerer Lauf, Auslaufen.'}{!day.qualityArchive&&' Automatisch zeitgesteuert, ohne Pace- oder HF-Ziel.'}</span>
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
       <div><button type="button" disabled={saving!==null||(variant==='alternative'&&!alternative)} onClick={()=>{if(variant==='alternative'){if(alternative)void acceptAlternative(day,alternative)}else void accept(day)}}>
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
   {!singleDay&&<details className="c7-settings" id="c7-analysis-details">
    <summary>Trainingsanalyse &amp; Coach-Gedächtnis</summary>
    {snapshot&&<GarminFeedbackCard snapshot={snapshot} today={today}/>}
   <p className="c7-polarized-method" role="note">
    <Icon name="activity"/> Polarisiert · überwiegend locker · gezielte Qualität nach Wochenplanung.
    <span>{plan.trainingMethod?.message}</span>
   </p>
   <CoachNextImpactCard impact={plan.nextImpact}/>
   {plan.adaptiveVolume&&<CoachAdaptiveVolumeCard review={plan.adaptiveVolume}/>}
   {snapshot&&<CoachFourWeekCard today={today} snapshot={snapshot}/>}
   {snapshot&&<CoachMemoryCard today={today} snapshot={snapshot}/>}
    {snapshot&&<CoachLongTermCard today={today} snapshot={snapshot} active={active}/>}
   {plan.completedWeek&&<WeeklyPlanActualCard review={plan.completedWeek}
    onCalendar={()=>onCalendar()}/>}
   </details>}
  </>}
 </section>
}
