import {useEffect,useMemo,useRef,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from '../components/Icon'
import {WorkoutArchivePanel} from '../components/WorkoutArchivePanel'
import {WeeklyTrainingOptions} from '../components/WeeklyTrainingOptions'
import {CalendarWeekBoard} from '../components/CalendarWeekBoard'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {buildSevenDayCoach} from '../lib/coachSevenDay.mjs'
import type {CoachDay} from '../lib/coachSevenDay.mjs'
import '../styles/horizon-calendar.css'

type Plan={
 id:string;training_date:string;title:string;state:string;session_type:string;
 sport:string;garmin_workout_id:number|null;notes:string;revision:number;
 intervals_event_id:number|null;intervals_published_revision:number|null;intervals_sync_status:string;intervals_export_version:number|null
}
type CalendarEntry={key:string;date:string;title:string;sub:string;note:string;source:'plan';status:string}
type IntervalsPublication={id:string;revision:number;intervals_published_revision:number|null;intervals_sync_status:string;intervals_event_id:number|null;intervals_export_version:number|null}
const LOCAL_TZ='Europe/Berlin'
function todayBerlin(){
 const parts=new Intl.DateTimeFormat('de-DE',{
  timeZone:LOCAL_TZ,year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date())
 const value=(key:string)=>parts.find(part=>part.type===key)?.value||''
 return [value('year'),value('month'),value('day')].join('-')
}
function moveDay(iso:string,delta:number){
 return new Date(Date.parse(iso+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10)
}
function monday(iso:string){
 const d=new Date(iso+'T12:00:00Z').getUTCDay()
 return moveDay(iso,-((d+6)%7))
}
function monthTitle(iso:string){
 return new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',month:'long',year:'numeric'}).format(
  new Date(iso+'T12:00:00Z'))
}
function longDate(iso:string){
 return new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(
  new Date(iso+'T12:00:00Z'))
}
function readState(state:string){
 switch(state){
  case 'confirmed':return {text:'Mit Garmin bestätigt',type:'verified'}
  case 'pending':return {text:'Freigegeben · Intervals.icu ausstehend',type:'waiting'}
  case 'sending':return {text:'Übertragung läuft',type:'waiting'}
  case 'needs_review':return {text:'Prüfung erforderlich',type:'warning'}
  case 'cancelled':return {text:'Abgesagt',type:'muted'}
  default:return {text:'Entwurf · nicht übertragen',type:'draft'}
 }
}
async function ownerPost<T>(session:Session,endpoint:string,body:Record<string,unknown>):Promise<T>{
 const res=await fetch(garminSupabaseUrl+'/functions/v1/'+endpoint,{
  method:'POST',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,'content-type':'application/json'},
  body:JSON.stringify(body)
 })
 const payload=await res.json().catch(()=>({})) as Record<string,unknown>
 if(!res.ok)throw Error(typeof payload.error==='string'?payload.error:'HTTP '+res.status)
 return payload as T
}
async function ownerGet<T>(session:Session,endpoint:string):Promise<T>{
 const res=await fetch(garminSupabaseUrl+'/functions/v1/'+endpoint,{
  cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
 })
 if(!res.ok)throw Error('HTTP '+res.status)
 return await res.json() as T
}

export function CalendarPage({active,focus}:{
 active:boolean;focus:{date:string;token:number}|null
}){
 const today=useMemo(todayBerlin,[])
 const [selected,setSelected]=useState(today)
 const [week,setWeek]=useState(0)
 const [plans,setPlans]=useState<Plan[]>([])
 const [intervalsConnected,setIntervalsConnected]=useState(false)
 const [eligiblePlanIds,setEligiblePlanIds]=useState<string[]>([])
 const [published,setPublished]=useState<Record<string,IntervalsPublication>>({})
 const [acting,setActing]=useState<string|null>(null)
 const [repairArmed,setRepairArmed]=useState<string|null>(null)
 const [deleteArmed,setDeleteArmed]=useState<string|null>(null)
 const [cleanupArmed,setCleanupArmed]=useState<string|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [coachSnapshot,setCoachSnapshot]=useState<CoachSnapshot|null>(null)
 const [coachError,setCoachError]=useState('')
 const [coachLoading,setCoachLoading]=useState(false)
 const [coachReview,setCoachReview]=useState<string|null>(null)
 const [coachStartTime,setCoachStartTime]=useState('18:00')
 const [weekChosen,setWeekChosen]=useState<Record<string,boolean>>({})
 const [weekTimes,setWeekTimes]=useState<Record<string,string>>({})
 const [weekWorking,setWeekWorking]=useState<'approve'|'publish'|null>(null)
 const [weekResult,setWeekResult]=useState('')
 const coachRequestIds=useRef<Record<string,string>>({})
 const lastFocusToken=useRef<number|null>(null)
 const [refresh,setRefresh]=useState(0)
 const start=moveDay(monday(today),week*7)
 const coachPlan=useMemo(()=>coachSnapshot?buildSevenDayCoach({
  today,health:coachSnapshot.health,boards:coachSnapshot.boards,
  options:coachSnapshot.options,plans:coachSnapshot.plans,
  goal:coachSnapshot.goal,life:coachSnapshot.life
 }):null,[coachSnapshot,today])
 const coachDay=coachPlan?.days.find(d=>d.date===selected)||null
 const coachPreview=coachDay&&!['existing','completed','chosen','option'].includes(coachDay.kind)&&
  !plans.some(p=>p.training_date===selected&&p.state!=='cancelled')?coachDay:null
 const days=Array.from({length:7},(_,i)=>moveDay(start,i))
 const horizonDay=moveDay(today,6)
 const weekOffers=(coachPlan?.days||[]).filter(d=>d.approvable&&
  !plans.some(p=>p.training_date===d.date&&p.state!=='cancelled'))
 const weekSelected=weekOffers.filter(d=>weekChosen[d.date]!==false)
 // Only Coach-authored running sessions, not archived/ORC sessions. Old or
 // already confirmed exports are never offered for resending.
 const coachPending=plans.filter(p=>p.training_date>=today&&
  p.training_date<=horizonDay&&p.state==='pending'&&
  (p.notes||'').startsWith('Coach Intelligence ·')&&
  eligiblePlanIds.includes(p.id)&&
  !(p.intervals_sync_status==='confirmed'&&
   p.intervals_published_revision===p.revision&&
   Number(p.intervals_event_id)>0&&Number(p.intervals_export_version)>=2))
 const entries=useMemo<CalendarEntry[]>(()=>plans.filter(p=>p.state!=='cancelled').map(p=>({
  key:'p-'+p.id,date:p.training_date,title:p.title,
  sub:p.title.startsWith('ORC · ')?'ORC Bahntraining':eligiblePlanIds.includes(p.id)?'Strukturiertes Lauftraining · Intervals.icu bereit':p.session_type==='workout'?'Strukturiertes Training':'GARMIN_AI Planung',
  note:p.notes||'',source:'plan' as const,status:p.state
 })),[plans,eligiblePlanIds])
 const matching=entries.filter(e=>e.date===selected)
 const cleanupPending=plans.filter(p=>p.state==='cancelled'&&p.intervals_event_id&&p.intervals_sync_status==='needs_review')
 const countInWeek=entries.filter(e=>e.date>=start&&e.date<=days[6]).length
 const suggestionsInWeek=coachPlan?.days.filter(d=>d.date>=start&&d.date<=days[6]&&
  d.approvable&&!plans.some(p=>p.training_date===d.date&&p.state!=='cancelled')).length||0

 useEffect(()=>{
  if(!active||!focus||lastFocusToken.current===focus.token)return
  if(!/^\d{4}-\d{2}-\d{2}$/.test(focus.date))return
  const targetWeek=Math.round((Date.parse(monday(focus.date)+'T12:00:00Z')-
   Date.parse(monday(today)+'T12:00:00Z'))/(7*86400000))
  if(!Number.isFinite(targetWeek)||targetWeek< -1||targetWeek>5)return
  lastFocusToken.current=focus.token
  setWeek(targetWeek);setSelected(focus.date);setCoachReview(null)
 },[active,focus,today])
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setCoachLoading(true);setCoachError('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const snapshot=await loadCoachSnapshot(session,today,controller.signal)
   if(mounted)setCoachSnapshot(snapshot)
  })().catch(e=>{
   if(mounted&&!(e instanceof Error&&e.name==='AbortError')){
    setCoachSnapshot(null)
    setCoachError(e instanceof Error?e.message:'Coach-Vorschläge nicht verfügbar.')
   }
  }).finally(()=>{if(mounted)setCoachLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,today,refresh])

 useEffect(()=>{
  if(!active||!garminSupabase)return
  const client=garminSupabase
  let mounted=true
  async function load(){
   setBusy(true)
   try{
    const {data:{session}}=await client.auth.getSession()
    if(!session)throw Error('Bitte zuerst anmelden')
    const outcomes=await Promise.allSettled([
     ownerGet<{entries:Plan[]}>(session,'garmin-training-plan'),
     ownerGet<{configured:boolean;eligiblePlanIds:string[];publications:IntervalsPublication[]}>(session,'garmin-intervals')
    ])
    if(!mounted)return
    if(outcomes[0].status==='fulfilled')setPlans(outcomes[0].value.entries||[])
    if(outcomes[1].status==='fulfilled'){
     const status=outcomes[1].value
     setIntervalsConnected(status.configured===true)
     setEligiblePlanIds(status.eligiblePlanIds||[])
     setPublished(Object.fromEntries((status.publications||[]).map(p=>[p.id,p])))
    }
    if(outcomes.some(outcome=>outcome.status==='rejected')){
     setError('Ein Teil der Kalenderdaten ist gerade nicht erreichbar.')
    }
   }catch{
    if(mounted)setError('Kalender nicht abrufbar. Prüfe die Anmeldung unter Mehr → Einstellungen.')
   }finally{if(mounted)setBusy(false)}
  }
  void load()
  return ()=>{mounted=false}
 },[active,refresh])

 async function approveCoachWeek(){
  if(!garminSupabase||acting||weekWorking||coachLoading||!weekSelected.length)return
  setWeekWorking('approve');setWeekResult('');setError('');setNotice('')
  let approved=0;const failed:string[]=[]
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   for(const day of weekSelected){
    try{
     const structured=day.sport==='running'&&
      ['easy','long','return_easy'].includes(day.kind)&&Number.isSafeInteger(day.minutes)
     const chosenTime=weekTimes[day.date]||'18:00'
     const key=['week',day.date,day.kind,day.minutes,structured?chosenTime:'event'].join(':')
     const requestId=coachRequestIds.current[key]||
      (coachRequestIds.current[key]=crypto.randomUUID())
     const payload=structured?{
      action:'create_coach_workout',clientRequestId:requestId,
      date:day.date,title:day.title,kind:day.kind,minutes:day.minutes,
      startTime:chosenTime
     }:{
      action:'create',clientRequestId:requestId,date:day.date,
      title:day.title,sessionType:'event',
      sport:day.kind==='mobility'?'strength':day.sport,
      notes:'Coach Intelligence · '+day.minutes+' Minuten · freiwillig. Nur Kalendertermin.'
     }
     const created=await ownerPost<{saved:boolean;id:string;revision:number;state:string}>(
      session,'garmin-training-plan',payload)
     if(!created.saved||!created.id)throw Error('Entwurf nicht bestätigt')
     let approvedEntry=created
     if(created.state==='draft'){
      approvedEntry=await ownerPost<{saved:boolean;id:string;revision:number;state:string}>(
       session,'garmin-training-plan',{action:'approve',id:created.id,revision:created.revision})
     }
     if(!approvedEntry.saved||approvedEntry.state!=='pending')
      throw Error('Kalenderfreigabe nicht bestätigt')
     const plan:Plan={id:created.id,training_date:day.date,title:day.title,
      state:'pending',session_type:'event',
      sport:day.kind==='mobility'?'strength':day.sport,
      garmin_workout_id:null,notes:'Coach Intelligence · '+day.minutes+
       ' Minuten'+(structured?' · Start '+chosenTime:' · nur Kalender'),
      revision:approvedEntry.revision,intervals_event_id:null,
      intervals_published_revision:null,intervals_sync_status:'not_published',
      intervals_export_version:null}
     setPlans(old=>[...old.filter(p=>p.id!==plan.id),plan])
     if(structured)setEligiblePlanIds(old=>old.includes(plan.id)?old:[...old,plan.id])
     approved++
    }catch(e){
     failed.push(day.date+': '+(e instanceof Error?e.message:'Freigabe fehlgeschlagen'))
    }
   }
   setWeekResult(approved+' Training'+(approved===1?'':'s')+
    ' übernommen und freigegeben. '+(failed.length?
     failed.length+' offen – bitte Kalenderstatus prüfen.':'Keine Übertragung an Intervals.icu ausgelöst.'))
   if(failed.length)setError(failed.join(' · '))
  }catch(e){setError(e instanceof Error?e.message:'Wochenfreigabe fehlgeschlagen')}
  finally{setWeekWorking(null);setRefresh(n=>n+1)}
 }
 async function publishCoachWeek(){
  if(!garminSupabase||acting||weekWorking||!intervalsConnected||!coachPending.length)return
  setWeekWorking('publish');setWeekResult('');setError('');setNotice('')
  let publishedCount=0;const failed:string[]=[]
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   for(const plan of coachPending){
    try{
     const result=await ownerPost<{published:boolean;intervalsConfirmed:boolean;intervalsEventId:number}>(
      session,'garmin-intervals',{action:'publish',planId:plan.id})
     if(!result.published||!result.intervalsConfirmed)throw Error('Intervals-Bestätigung fehlt')
     setPlans(old=>old.map(p=>p.id===plan.id?{
      ...p,intervals_event_id:result.intervalsEventId,
      intervals_published_revision:p.revision,intervals_sync_status:'confirmed',
      intervals_export_version:2}:p))
     publishedCount++
    }catch(e){
     // A POST can succeed while its browser response is lost. Never resend
     // blindly: reconcile with the owner calendar before displaying failure.
     try{
      const remote=await ownerGet<{entries:Plan[]}>(session,'garmin-training-plan')
      const confirmed=remote.entries?.find(p=>p.id===plan.id&&
       p.revision===plan.revision&&p.intervals_sync_status==='confirmed'&&
       p.intervals_published_revision===p.revision&&
       Number(p.intervals_event_id)>0&&Number(p.intervals_export_version)>=2)
      if(confirmed){
       setPlans(old=>old.map(p=>p.id===plan.id?confirmed:p))
       publishedCount++
       continue
      }
      failed.push(plan.training_date+': '+(e instanceof Error?e.message:'Nicht bestätigt'))
     }catch{
      failed.push(plan.training_date+': Antwort unklar – zuerst Status aktualisieren, nicht erneut senden')
     }
    }
   }
   setWeekResult(publishedCount+' Workout'+(publishedCount===1?'':'s')+
    ' bei Intervals.icu bestätigt. '+(failed.length?
     failed.length+' Statusprüfungen offen.':'Bitte Garmin Connect und Uhr separat prüfen.'))
   if(failed.length)setError(failed.join(' · '))
  }catch(e){setError(e instanceof Error?e.message:'Wochenübertragung fehlgeschlagen')}
  finally{setWeekWorking(null);setRefresh(n=>n+1)}
 }
 async function acceptCoach(day:CoachDay){
  if(!garminSupabase||acting||!day.approvable||coachReview!==day.date||
   coachPlan?.days.find(d=>d.date===day.date)!==day)return
  if(plans.some(p=>p.training_date===day.date&&p.state!=='cancelled'))return
  setActing('coach-'+day.date);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const structured=day.sport==='running'&&
    ['easy','long','return_easy'].includes(day.kind)&&Number.isSafeInteger(day.minutes)
   const key=[day.date,day.kind,day.minutes,structured?coachStartTime:'event'].join(':')
   const requestId=coachRequestIds.current[key]||
    (coachRequestIds.current[key]=crypto.randomUUID())
   const payload=structured?{
    action:'create_coach_workout',clientRequestId:requestId,
    date:day.date,title:day.title,kind:day.kind,minutes:day.minutes,
    startTime:coachStartTime
   }:{
    action:'create',clientRequestId:requestId,date:day.date,
    title:day.title,sessionType:'event',
    sport:day.kind==='mobility'?'strength':day.sport,
    notes:'Coach Intelligence · '+day.minutes+
     ' Minuten. Nur Kalendereintrag, kein strukturiertes Lauftraining.'
   }
   const result=await ownerPost<{saved:boolean;id:string;revision:number;state:string}>(
    session,'garmin-training-plan',payload)
   if(!result.saved||!result.id)throw Error('Coach-Entwurf nicht bestätigt.')
   const newPlan:Plan={
    id:result.id,training_date:day.date,title:day.title,state:result.state||'draft',
    session_type:'event',sport:day.kind==='mobility'?'strength':day.sport,
    garmin_workout_id:null,revision:result.revision||1,
    intervals_event_id:null,intervals_published_revision:null,
    intervals_sync_status:'not_published',intervals_export_version:null,
    notes:structured?'Coach-Workout · '+day.minutes+' Min. · Start '+coachStartTime+
     ' · 3 Zeitabschnitte':'Coach-Kalenderentwurf'
   }
   setPlans(old=>old.some(p=>p.id===newPlan.id)?old:[...old,newPlan])
   if(structured)setEligiblePlanIds(old=>old.includes(newPlan.id)?old:[...old,newPlan.id])
   setCoachSnapshot(old=>old?{
    ...old,plans:{entries:[...old.plans.entries.filter(x=>x.id!==newPlan.id),
     {id:newPlan.id,training_date:day.date,state:newPlan.state,
      sport:newPlan.sport,title:day.title}]}
   }:old)
   setCoachReview(null)
   setNotice(structured?
    'Lauf-Workout als Entwurf übernommen. Direkt hier freigeben und anschließend an Intervals.icu senden.':
    'Coach-Vorschlag als Kalendereintrag übernommen. Keine automatische Übertragung.')
  }catch(e){
   setError(e instanceof Error?e.message:'Vorschlag konnte nicht übernommen werden.')
  }finally{setActing(null)}
 }
 async function approvePlan(plan:Plan){
  if(acting||!garminSupabase)return
  setActing(plan.id);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden')
   const result=await ownerPost<{saved:boolean;revision:number;state:string}>(session,'garmin-training-plan',{
    action:'approve',id:plan.id,revision:plan.revision
   })
   if(!result.saved)throw Error('Freigabe nicht bestätigt')
   setPlans(old=>old.map(p=>p.id===plan.id?{...p,revision:result.revision,state:result.state}:p))
   setNotice('Training freigegeben. Jetzt kannst du es an Intervals.icu übertragen.')
  }catch(e){setError(e instanceof Error?e.message:'Freigabe fehlgeschlagen')}
  finally{setActing(null)}
 }
 async function publishPlan(plan:Plan){
  if(acting||!garminSupabase||!intervalsConnected)return
  setActing(plan.id);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden')
   try{
    const result=await ownerPost<{published:boolean;intervalsConfirmed:boolean;intervalsEventId:number}>(session,
     'garmin-intervals',{action:'publish',planId:plan.id})
    if(!result.published||!result.intervalsConfirmed)throw Error('Intervals-Bestätigung fehlt')
    setPublished(old=>({...old,[plan.id]:{
     id:plan.id,revision:plan.revision,intervals_published_revision:plan.revision,
     intervals_sync_status:'confirmed',intervals_event_id:result.intervalsEventId,intervals_export_version:2}}))
    setPlans(old=>old.map(p=>p.id===plan.id?{...p,
     intervals_event_id:result.intervalsEventId,intervals_published_revision:p.revision,
     intervals_sync_status:'confirmed',intervals_export_version:2}:p))
    setNotice('Intervals.icu hat das Workout bestätigt. Bitte anschließend auf deiner Garmin-Uhr prüfen.')
   }catch(e){
    // Browser network errors do not prove that a remote write failed.
    // Re-read the owner record before offering another publish action.
    try{
     const fresh=await ownerGet<{entries:Plan[]}>(session,'garmin-training-plan')
     const verified=fresh.entries?.find(p=>p.id===plan.id&&
      p.revision===plan.revision&&p.intervals_sync_status==='confirmed'&&
      p.intervals_published_revision===p.revision&&
      Number(p.intervals_event_id)>0&&Number(p.intervals_export_version)>=2)
     if(!verified)throw e
     setPlans(old=>old.map(p=>p.id===plan.id?verified:p))
     setPublished(old=>({...old,[plan.id]:{
      id:plan.id,revision:plan.revision,
      intervals_published_revision:verified.intervals_published_revision,
      intervals_sync_status:'confirmed',intervals_event_id:verified.intervals_event_id,
      intervals_export_version:verified.intervals_export_version}}))
     setNotice('Übertragung bestätigt – die Browserantwort war unterbrochen. Workout ist bei Intervals.icu gespeichert. Keine erneute Übertragung nötig.')
    }catch{
     throw Error('Intervals-Status noch unklar. Bitte erst Kalender aktualisieren, nicht erneut senden.')
    }
   }
  }catch(e){setError(e instanceof Error?e.message:'Übertragungsstatus nicht bestätigt')}
  finally{setActing(null)}
 }
 async function repairPublishedWorkout(plan:Plan){
  if(acting||!garminSupabase||!intervalsConnected)return
  setActing(plan.id);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden')
   const result=await ownerPost<{published:boolean;intervalsConfirmed:boolean;intervalsEventId:number;validatedStructure:boolean}>(session,
    'garmin-intervals',{action:'repair',planId:plan.id,acknowledge:true})
   if(!result.published||!result.intervalsConfirmed||!result.validatedStructure)
    throw Error('Die korrigierte Trainingsstruktur wurde nicht bestätigt.')
   setPublished(old=>({...old,[plan.id]:{
    id:plan.id,revision:plan.revision,intervals_published_revision:plan.revision,
    intervals_sync_status:'confirmed',intervals_event_id:result.intervalsEventId,intervals_export_version:2
   }}))
   setRepairArmed(null)
   setNotice('Korrigierte Intervalle sind in Intervals.icu gespeichert und geprüft. Bitte auch Garmin Connect kontrollieren.')
  }catch(e){setError(e instanceof Error?e.message:'Korrektur fehlgeschlagen')}
  finally{setActing(null)}
 }
 async function deletePlan(plan:Plan){
  if(acting||!garminSupabase||deleteArmed!==plan.id)return
  setActing(plan.id);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   // Published workouts must be removed from Intervals.icu before local cancel.
   const remote=Number.isSafeInteger(plan.intervals_event_id)&&Number(plan.intervals_event_id)>0
   const result=remote?
    await ownerPost<{saved:boolean;remoteRemoved:boolean;remoteRemovalPending?:boolean;remoteProblem?:string|null}>(session,'garmin-intervals',{
     action:'delete_published',planId:plan.id,revision:plan.revision,acknowledge:true
    }):
    await ownerPost<{saved:boolean;remoteRemoved?:boolean}>(session,'garmin-training-plan',{
     action:'cancel',id:plan.id,revision:plan.revision
    })
   if(result.saved!==true)throw Error('Trainingslöschung nicht bestätigt.')
   setPlans(old=>old.map(p=>p.id===plan.id?{...p,state:'cancelled',revision:p.revision+1,
    intervals_event_id:remote&&result.remoteRemoved?null:p.intervals_event_id,
    intervals_sync_status:remote&&!result.remoteRemoved?'needs_review':'not_published'}:p))
   setPublished(old=>{const next={...old};delete next[plan.id];return next})
   setDeleteArmed(null);setRepairArmed(null)
   setNotice(remote&&!result.remoteRemoved?
    'Training aus GARMIN_AI entfernt. Die Löschung bei Intervals.icu konnte nicht bestätigt werden – unten als offene Bereinigung sichtbar.':
    remote?
    'Training aus GARMIN_AI und Intervals.icu entfernt. Bereits übertragene Garmin-Kopien separat prüfen.':
    'Trainingsentwurf aus GARMIN_AI entfernt. Garmin-Aktivitäten bleiben erhalten.')
  }catch(e){setError(e instanceof Error?e.message:'Training konnte nicht gelöscht werden.')}
  finally{setActing(null)}
 }
 async function verifyRemoteCleanup(plan:Plan){
  if(acting||!garminSupabase)return
  setActing(plan.id);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const result=await ownerPost<{checked?:boolean;saved:boolean;remoteRemoved:boolean;
    remoteAlreadyAbsent?:boolean;remoteStillPresent?:boolean;remoteProblem?:string|null}>(
    session,'garmin-intervals',{action:'verify_cleanup',planId:plan.id,
     revision:plan.revision,acknowledge:true})
   if(result.saved&&result.remoteRemoved){
    setPlans(old=>old.map(p=>p.id===plan.id?{...p,revision:p.revision+1,
     intervals_event_id:null,intervals_sync_status:'not_published'}:p))
    setCleanupArmed(null)
    setNotice('Bei Intervals.icu geprüft: Das Training war bereits gelöscht. Die offene Bereinigung ist abgeschlossen. Garmin Connect gegebenenfalls separat prüfen.')
   }else if(result.remoteStillPresent){
    setCleanupArmed(plan.id)
    setNotice('Das Training existiert bei Intervals.icu noch. Falls du es entfernen möchtest, bestätige die Löschung unten.')
   }else{
    setError(result.remoteProblem||'Der externe Löschstatus ist weiterhin unklar. Bitte später erneut prüfen.')
   }
  }catch(e){setError(e instanceof Error?e.message:'Externer Abgleich fehlgeschlagen.')}
  finally{setActing(null)}
 }
 async function cleanupRemote(plan:Plan){
  if(acting||!garminSupabase||cleanupArmed!==plan.id)return
  setActing(plan.id);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const result=await ownerPost<{saved:boolean;remoteRemoved:boolean;remoteAlreadyAbsent?:boolean;remoteProblem?:string|null}>(session,
    'garmin-intervals',{action:'cleanup_published',planId:plan.id,revision:plan.revision,acknowledge:true})
   if(!result.saved)throw Error('Bereinigung nicht gespeichert.')
   setPlans(old=>old.map(p=>p.id===plan.id?{...p,revision:p.revision+1,
    intervals_event_id:result.remoteRemoved?null:p.intervals_event_id,
    intervals_sync_status:result.remoteRemoved?'not_published':'needs_review'}:p))
   setCleanupArmed(null)
   setNotice(result.remoteRemoved?
    (result.remoteAlreadyAbsent?
     'Bei Intervals.icu geprüft: Das Training war bereits gelöscht. Offene Bereinigung abgeschlossen. Garmin Connect gegebenenfalls separat prüfen.':
     'Intervals.icu hat die Entfernung bestätigt. Garmin Connect gegebenenfalls separat prüfen.'):
    'Intervals.icu konnte erneut nicht bestätigt werden. Der Eintrag bleibt als offene Bereinigung sichtbar.')
  }catch(e){setError(e instanceof Error?e.message:'Bereinigung fehlgeschlagen.')}
  finally{setActing(null)}
 }
 function changeWeek(delta:number){
  const next=Math.max(-1,Math.min(5,week+delta))
  setWeek(next)
  setSelected(moveDay(monday(today),next*7))
  setNotice('')
 }
 return <section className={active?'page active':'page'} aria-label="Trainingskalender">
  <div className="hc-intro">
   <div className="hc-eyebrow"><span className="hc-pulse"/> TRAININGSPLAN / HORIZON</div>
   <h1>Deine Woche.<br/><span>Dein Rhythmus.</span></h1>
   <p>Alle Einheiten an einem Ort: Garmin-Läufe, Coach-Vorschläge, deine bestätigten Trainings und ORC-Optionen.</p>
  </div>
  <div className="hc-overview">
   <div><small>WOCHE</small><strong>{monthTitle(start)}</strong><span>{countInWeek} gespeicherte Trainings · {suggestionsInWeek} Coach-Vorschläge</span></div>
   <button type="button" className="hc-refresh" onClick={()=>setRefresh(v=>v+1)} disabled={busy}>
    <Icon name="refresh-cw"/>{busy?'Prüfe …':'Aktualisieren'}
   </button>
  </div>
  <section className="hc-week-planner" aria-label="Coach Woche in zwei Schritten planen">
   <div className="hc-week-planner-heading">
    <div>
     <span className="hc-week-planner-kicker"><Icon name="sparkles"/> COACH / WOCHENPLANUNG</span>
     <h2>Deine Woche. Eine Entscheidung.</h2>
     <p>Die nächsten sieben Tage ({today} bis {horizonDay}).
      Wähle deine Vorschläge, prüfe die Startzeiten und gib sie gesammelt frei.
      Erst der zweite Klick sendet freigegebene Lauf-Workouts an Intervals.icu.</p>
    </div>
    <span className="hc-week-planner-count">{weekOffers.length} Vorschläge · {coachPending.length} bereit zum Senden</span>
   </div>
   {weekResult&&<p className="hc-week-planner-result" role="status">{weekResult}</p>}
   {coachLoading&&<p className="hc-coach-loading">Prüfe deinen Wochenvorschlag …</p>}
   {coachError&&<p className="hc-coach-unavailable">Wochenvorschläge derzeit nicht vollständig verfügbar. Es werden keine Trainingstage erfunden.</p>}
   {!coachLoading&&!coachError&&weekOffers.length>0&&<>
    <div className="hc-week-planner-list">
     {weekOffers.map(day=>{
      const chosen=weekChosen[day.date]!==false
      const structured=day.sport==='running'&&['easy','long','return_easy'].includes(day.kind)
      return <div className={'hc-week-planner-row'+(chosen?' is-chosen':'')} key={day.date}>
       <label className="hc-week-planner-choice">
        <input type="checkbox" checked={chosen}
         disabled={weekWorking!==null||acting!==null}
         onChange={e=>setWeekChosen(old=>({...old,[day.date]:e.target.checked}))}/>
        <span><strong>{longDate(day.date)}</strong><small>{day.title} · {day.minutes} Min.</small></span>
       </label>
       {chosen&&structured&&<label className="hc-week-planner-time">
        <span>Start</span>
        <select aria-label={'Startzeit '+longDate(day.date)}
         value={weekTimes[day.date]||'18:00'}
         disabled={weekWorking!==null||acting!==null}
         onChange={e=>setWeekTimes(old=>({...old,[day.date]:e.target.value}))}>
         {Array.from({length:31},(_,i)=>{
          const time=String(6+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')
          return <option value={time} key={time}>{time}</option>
         })}
        </select>
       </label>}
       {chosen&&!structured&&<span className="hc-week-planner-note">Nur Kalender · kein Garmin-Workout</span>}
      </div>
     })}
    </div>
    <button type="button" className="hc-week-plan-action"
     onClick={()=>void approveCoachWeek()} disabled={!weekSelected.length||acting!==null||weekWorking!==null}>
     <Icon name="check"/> {weekWorking==='approve'?'Prüfe & gebe frei …':
      weekSelected.length+' ausgewählte Trainings übernehmen & freigeben'}
    </button>
   </>}
   {!coachLoading&&!coachError&&!weekOffers.length&&!coachPending.length&&
    <p className="hc-week-planner-idle">Aktuell keine neuen freigabefähigen Coach-Vorschläge.
     Gespeicherte oder bereits bestätigte Trainings bleiben unverändert;
     ORC- und Fußballtermine bleiben freiwillig.</p>}
   {coachPending.length>0&&<div className="hc-week-planner-publish">
    <div><strong>{coachPending.length} freigegebene Lauf-Workouts bereit</strong>
     <p>{coachPending.map(p=>p.training_date).join(' · ')} · noch nicht an Intervals.icu bestätigt.</p></div>
    <button type="button" onClick={()=>void publishCoachWeek()}
     disabled={acting!==null||weekWorking!==null||!intervalsConnected}>
     <Icon name="send"/> {weekWorking==='publish'?'Prüfe Intervals.icu …':
      'Alle '+coachPending.length+' Workouts an Intervals.icu senden'}
    </button>
    {!intervalsConnected&&<small>Intervals.icu unter Einstellungen verbinden. Ohne Verbindung wird nichts gesendet.</small>}
   </div>}
   <small className="hc-week-planner-disclaimer">Nur bestätigte Garmin-Daten und dein aktueller Coach-Status.
    Echte Krankheiten, Urlaubstage und bereits belegte Tage sperren die Freigabe.
    Keine automatische externe Veröffentlichung und keine direkten Garmin-Schreibzugriffe.</small>
  </section>
  {cleanupPending.length>0&&<div className="hc-remote-pending" role="status">
   <div><strong>Intervals.icu · {cleanupPending.length} offene Bereinigung{cleanupPending.length===1?'':'en'}</strong>
    <p>Diese Trainings sind aus GARMIN_AI ausgeblendet. Klicke auf „Bei Intervals.icu abgleichen“, um eine manuelle Löschung zu erkennen. Der Abgleich löscht nichts bei Intervals.icu.</p>
    {cleanupPending.map(plan=><div key={plan.id} className="hc-remote-pending-item">
     <strong>{plan.title} · {plan.training_date}</strong>
     {cleanupArmed===plan.id?<div className="hc-remote-actions">
      <button type="button" disabled={acting!==null} onClick={()=>void cleanupRemote(plan)}>
       {acting===plan.id?'Prüfe …':'Jetzt bei Intervals.icu entfernen'}</button>
      <button type="button" disabled={acting!==null} onClick={()=>setCleanupArmed(null)}>Abbrechen</button>
     </div>:<button type="button" disabled={acting!==null}
      onClick={()=>void verifyRemoteCleanup(plan)}>
      {acting===plan.id?'Prüfe Intervals.icu …':'Bei Intervals.icu abgleichen'}</button>}
    </div>)}
   </div>
  </div>}
  <div className="hc-weekpanel">
   <div className="hc-toolbar">
    <div><small>DEIN TRAININGSKALENDER</small><h2>Wochenansicht</h2></div>
    <div className="hc-weekactions">
     <button type="button" aria-label="Vorherige Woche" onClick={()=>changeWeek(-1)} disabled={week<=-1}>‹</button>
     <button type="button" aria-label="Zur aktuellen Woche" onClick={()=>{setWeek(0);setSelected(today)}}>Heute</button>
     <button type="button" aria-label="Nächste Woche" onClick={()=>changeWeek(1)} disabled={week>=5}>›</button>
    </div>
   </div>
   <div className="hc-coach-legend" aria-label="Kalenderstatus erklärt">
    <span><i className="hc-key-actual"/> Garmin · gemacht</span>
    <span><i className="hc-key-plan"/> GARMIN_AI · gespeichert</span>
    <span><i className="hc-key-coach"/> Coach · Vorschlag</span>
    <span><i className="hc-key-option"/> ORC · optional</span>
   </div>
   <CalendarWeekBoard active={active} start={start} selected={selected}
    today={today} onSelect={day=>{setSelected(day);setCoachReview(null)}}
    plans={plans} coachDays={coachPlan?.days||[]}/>
   <div className="hc-day-content">
    <div className="hc-day-heading">
     <div><span>AUSGEWÄHLTER TAG</span><h3>{longDate(selected)}</h3></div>
     <span className="hc-day-count">{matching.length} {matching.length===1?'gespeicherter Termin':'gespeicherte Termine'}{coachPreview?' · 1 Coach-Hinweis':''}</span>
    </div>
    {coachLoading&&<p className="hc-coach-loading" role="status">Lade Coach-Empfehlungen …</p>}
    {coachError&&<p className="hc-coach-unavailable" role="status">
     Coach-Empfehlungen derzeit nicht erreichbar. Keine Trainingsvorgaben geschätzt.
    </p>}
    {error&&<p className="hc-error" role="alert">{error}</p>}
    {notice&&<p className="hc-notice" role="status">{notice}</p>}
    {coachPreview&&<article className={'hc-coach-proposal'+(coachPreview.approvable?' is-actionable':' is-rest')}
      aria-label="Coach-Empfehlung für diesen Kalendertag">
     <div className="hc-coach-proposal-top">
      <span><Icon name="sparkles"/> COACH / EMPFEHLUNG</span>
      <small>{coachPreview.approvable?'Noch nicht gespeichert · freiwillig':
       'Nur Orientierung · keine automatische Planung'}</small>
     </div>
     <h4>{coachPreview.title}</h4>
     <p>{coachPreview.reason}</p>
     {coachPreview.minutes!==null&&<span className="hc-coach-minutes">
      {coachPreview.minutes} Minuten · {coachPreview.kind==='mobility'?'Stabi/Mobility':
       'Sprechtempo · ohne Pace- oder HF-Zwang'}
     </span>}
     {coachPreview.approvable&&selected>=today&&
      (coachReview===selected?
       <div className="hc-coach-confirm">
        <strong>Vorschlag als GARMIN_AI-Entwurf übernehmen?</strong>
        <p>Erst nach deiner Freigabe im Kalender lässt sich das Workout an Intervals.icu senden.</p>
        {coachPreview.kind!=='mobility'&&<label>Startzeit des Workouts
         <select value={coachStartTime} onChange={e=>setCoachStartTime(e.target.value)}
          disabled={acting!==null}>
          {Array.from({length:31},(_,i)=>{
           const time=String(6+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')
           return <option value={time} key={time}>{time} Uhr</option>
          })}
         </select>
        </label>}
        <div className="hc-coach-confirm-actions">
         <button type="button" className="hc-coach-accept"
          disabled={acting!==null} onClick={()=>void acceptCoach(coachPreview)}>
          {acting==='coach-'+selected?'Speichere …':'Ja, als Entwurf übernehmen'}
         </button>
         <button type="button" className="hc-coach-cancel"
          disabled={acting!==null} onClick={()=>setCoachReview(null)}>Abbrechen</button>
        </div>
       </div>:
       <button type="button" className="hc-coach-accept"
        disabled={acting!==null} onClick={()=>{setCoachReview(selected);setCoachStartTime('18:00')}}>
        <Icon name="check"/> Vorschlag übernehmen
       </button>)}
    </article>}
    {matching.length?
     <div className="hc-entries">
      {matching.map(entry=>{
       const plan=plans.find(p=>'p-'+p.id===entry.key)
       // The owner calendar is the canonical confirmation. An optional
       // Intervals status GET may fail after a successful POST; never show
       // "unsent" solely because that second endpoint was unreachable.
       const publication=plan?(published[plan.id]||{
        id:plan.id,revision:plan.revision,
        intervals_published_revision:plan.intervals_published_revision,
        intervals_event_id:plan.intervals_event_id,
        intervals_sync_status:plan.intervals_sync_status,
        intervals_export_version:plan.intervals_export_version
       }):undefined
       const previouslyPublished=!!(plan&&publication&&
        publication.intervals_published_revision===plan.revision&&publication.intervals_event_id)
       const needsRepair=previouslyPublished&&!(publication?.intervals_sync_status==='confirmed'&&
        (Number(publication?.intervals_export_version)>=2))
       const sent=previouslyPublished&&!needsRepair
       const eligible=!!plan&&eligiblePlanIds.includes(plan.id)
       const state=sent?{text:'Intervals.icu bestätigt · Garmin prüfen',type:'verified'}:readState(entry.status)
       return <article className={'hc-entry hc-entry-'+state.type} key={entry.key}>
        <div className="hc-entry-symbol"><Icon name="calendar-days"/></div>
        <div className="hc-entry-copy">
         <strong>{entry.title}</strong>
         <small>{entry.sub}</small>
         <span className={'hc-entry-state '+state.type}>{state.text}</span>
         {plan&&eligible&&<div className="hc-publish-steps" aria-label="Workout-Freigabeschritte">
          <span className="is-done">1 · Entwurf</span>
          <span className={plan.state==='pending'||sent?'is-done':''}>2 · Freigabe</span>
          <span className={sent?'is-done':''}>3 · Intervals.icu</span>
         </div>}
         {entry.note&&<details className="hc-plan-notes"><summary>Ablauf ansehen</summary><p>{entry.note}</p></details>}
         {plan&&<div className="hc-delete-area">
          {deleteArmed===plan.id?<>
            <p className="hc-delete-warning">{plan.intervals_event_id?
             'Dieses geplante Training wird auch bei Intervals.icu gelöscht. Bereits synchronisierte Garmin-Kopien können erhalten bleiben.':
             'Nur dieser GARMIN_AI-Trainingsentwurf wird entfernt. Echte Garmin-Aktivitäten bleiben bestehen.'}</p>
            <button type="button" disabled={acting!==null} className="hc-delete-confirm"
             onClick={()=>void deletePlan(plan)}>{acting===plan.id?'Entferne …':'Ja, Training löschen'}</button>
            <button type="button" disabled={acting!==null} className="hc-delete-cancel"
             onClick={()=>setDeleteArmed(null)}>Abbrechen</button>
           </>:<button type="button" className="hc-delete-trigger"
             disabled={acting!==null} onClick={()=>{setDeleteArmed(plan.id);setRepairArmed(null)}}>
             <Icon name="trash-2"/> Training löschen</button>}
         </div>}
         {plan&&eligible&&plan.state==='draft'&&deleteArmed!==plan.id&&<button type="button" className="hc-intervals-button"
           disabled={acting!==null} onClick={()=>void approvePlan(plan)}>
            {acting===plan.id?'Freigabe …':'Training freigeben'}</button>}
         {plan&&eligible&&plan.state==='pending'&&needsRepair&&deleteArmed!==plan.id&&<>
          <p className="hc-error">Der bisherige Intervals-Export hatte ungültige Zeit-/Distanzwerte. Nicht auf Garmin starten.</p>
          {repairArmed!==plan.id?
           <button type="button" className="hc-intervals-button" disabled={acting!==null||!intervalsConnected}
             onClick={()=>{setRepairArmed(plan.id);setDeleteArmed(null)}}>Korrigierten Export vorbereiten</button>:
           <div className="hc-repair-confirm">
            <small>Das bestehende Training bei Intervals.icu wird am selben Termin überschrieben. Kein neues Training wird angelegt.</small>
            <button type="button" disabled={acting!==null} className="hc-intervals-button"
             onClick={()=>void repairPublishedWorkout(plan)}>
             {acting===plan.id?'Korrigiere …':'Ja, vorhandenes Training korrigieren'}</button>
            <button type="button" disabled={acting!==null} className="hc-intervals-button"
             onClick={()=>setRepairArmed(null)}>Abbrechen</button>
           </div>}
         </>}
         {plan&&eligible&&plan.state==='pending'&&!sent&&!needsRepair&&deleteArmed!==plan.id&&<>
          <button type="button" className="hc-intervals-button"
           disabled={!intervalsConnected||acting!==null} onClick={()=>void publishPlan(plan)}>
            {acting===plan.id?'Übertrage …':'An Intervals.icu senden'}</button>
          {!intervalsConnected&&<small>Intervals.icu bitte zuerst unter Einstellungen verbinden.</small>}
         </>}
        </div>
       </article>
      })}
     </div>:
     !coachPreview&&!coachLoading&&<div className="hc-empty">
      <div className="hc-empty-icon"><Icon name="calendar-days"/></div>
      <strong>Noch kein eigener Trainingsplan.</strong>
      <span>Kein eigener Termin oder Coach-Vorschlag für diesen Tag.
       Freiwillige ORC-Angebote findest du in der Wochenübersicht.</span>
     </div>}
   </div>
   <WeeklyTrainingOptions active={active} weekStart={start} selectedDate={selected} compact/>
   <WorkoutArchivePanel active={active} date={selected}
    onPlanned={()=>setRefresh(n=>n+1)}/>
  </div>
  <div className="hc-source-grid">
   <article><div className="hc-source-icon"><Icon name="check"/></div>
    <div><strong>Garmin-Aktivitäten</strong>
     <small>Nur tatsächlich absolvierte Einheiten – keine alten Garmin-Kalendervorlagen.</small>
     <span className="hc-source-ok">Echte Daten aus der Garmin Personal API</span>
    </div></article>
   <article><div className="hc-source-icon"><Icon name="sparkles"/></div>
    <div><strong>GARMIN_AI Coach</strong>
     <small>{plans.filter(p=>p.state!=='cancelled').length} eigene Trainingspläne</small>
     <span>Übertragung und Löschen nur nach deiner Freigabe</span>
    </div></article>
  </div>
  <p className="hc-footnote">Coach-Vorschläge erscheinen nur zur Orientierung – ohne automatische Speicherung.
    Du übernimmst einen Vorschlag, gibst ihn selbst frei und sendest erst danach an Intervals.icu.
    Garmin-Aktivitäten bleiben unverändert. Garmin-Kalendervorlagen werden ausgeblendet.</p>
 </section>
}
