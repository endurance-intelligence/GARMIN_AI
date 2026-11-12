import {useEffect,useMemo,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from '../components/Icon'
import {WorkoutArchivePanel} from '../components/WorkoutArchivePanel'
import {WeeklyTrainingOptions} from '../components/WeeklyTrainingOptions'
import {CalendarWeekBoard} from '../components/CalendarWeekBoard'
import '../styles/horizon-calendar.css'

type Plan={
 id:string;training_date:string;title:string;state:string;session_type:string;
 sport:string;garmin_workout_id:number|null;notes:string;revision:number;
 intervals_event_id:number|null;intervals_published_revision:number|null;intervals_sync_status:string
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

export function CalendarPage({active}:{active:boolean}){
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
 const [refresh,setRefresh]=useState(0)
 const start=moveDay(monday(today),week*7)
 const days=Array.from({length:7},(_,i)=>moveDay(start,i))
 const entries=useMemo<CalendarEntry[]>(()=>plans.filter(p=>p.state!=='cancelled').map(p=>({
  key:'p-'+p.id,date:p.training_date,title:p.title,
  sub:p.title.startsWith('ORC · ')?'ORC Bahntraining':eligiblePlanIds.includes(p.id)?'Strukturiertes Lauftraining · Intervals.icu bereit':p.session_type==='workout'?'Strukturiertes Training':'GARMIN_AI Planung',
  note:p.notes||'',source:'plan' as const,status:p.state
 })),[plans])
 const matching=entries.filter(e=>e.date===selected)
 const cleanupPending=plans.filter(p=>p.state==='cancelled'&&p.intervals_event_id&&p.intervals_sync_status==='needs_review')
 const countInWeek=entries.filter(e=>e.date>=start&&e.date<=days[6]).length

 useEffect(()=>{
  if(!active||!garminSupabase)return
  const client=garminSupabase
  let mounted=true
  async function load(){
   setBusy(true);setError('');setNotice('')
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
   const result=await ownerPost<{published:boolean;intervalsConfirmed:boolean;intervalsEventId:number}>(session,
    'garmin-intervals',{action:'publish',planId:plan.id})
   if(!result.published||!result.intervalsConfirmed)throw Error('Intervals-Bestätigung fehlt')
   setPublished(old=>({...old,[plan.id]:{
    id:plan.id,revision:plan.revision,intervals_published_revision:plan.revision,
    intervals_sync_status:'confirmed',intervals_event_id:result.intervalsEventId,intervals_export_version:2}}))
   setNotice('Intervals.icu hat das Training bestätigt. Prüfe es nach der Synchronisierung in Garmin Connect bzw. auf deiner Uhr.')
  }catch(e){setError(e instanceof Error?e.message:'Übertragung fehlgeschlagen')}
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
   <p>Absolvierte Aktivitäten aus Garmin, deine eigenen Trainings und Wochenoptionen – ohne alte Garmin-Workout-Vorlagen.</p>
  </div>
  <div className="hc-overview">
   <div><small>WOCHE</small><strong>{monthTitle(start)}</strong><span>{countInWeek} Einträge in dieser Woche</span></div>
   <button type="button" className="hc-refresh" onClick={()=>setRefresh(v=>v+1)} disabled={busy}>
    <Icon name="refresh-cw"/>{busy?'Prüfe …':'Aktualisieren'}
   </button>
  </div>
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
   <CalendarWeekBoard active={active} start={start} selected={selected}
    today={today} onSelect={setSelected} plans={plans}/>
   <div className="hc-day-content">
    <div className="hc-day-heading">
     <div><span>AUSGEWÄHLTER TAG</span><h3>{longDate(selected)}</h3></div>
     <span className="hc-day-count">{matching.length} {matching.length===1?'Eintrag':'Einträge'}</span>
    </div>
    {matching.length?
     <div className="hc-entries">
      {matching.map(entry=>{
       const plan=plans.find(p=>'p-'+p.id===entry.key)
       const publication=plan?published[plan.id]:undefined
       const previouslyPublished=!!(plan&&publication&&publication.intervals_published_revision===plan.revision&&publication.intervals_event_id)
       const needsRepair=previouslyPublished&&!(publication?.intervals_export_version&&publication.intervals_export_version>=2&&publication.intervals_sync_status==='confirmed')
       const sent=previouslyPublished&&!needsRepair
       const eligible=!!plan&&eligiblePlanIds.includes(plan.id)
       const state=sent?{text:'Intervals.icu bestätigt · Garmin prüfen',type:'verified'}:readState(entry.status)
       return <article className={'hc-entry hc-entry-'+state.type} key={entry.key}>
        <div className="hc-entry-symbol"><Icon name="calendar-days"/></div>
        <div className="hc-entry-copy">
         <strong>{entry.title}</strong>
         <small>{entry.sub}</small>
         <span className={'hc-entry-state '+state.type}>{state.text}</span>
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
     <div className="hc-empty">
      <div className="hc-empty-icon"><Icon name="calendar-days"/></div>
      <strong>Noch kein eigener Trainingsplan.</strong>
      <span>Feste ORC-/Fußballangebote und deren Wetter stehen direkt darunter. An freien Tagen kann der Coach später eine Empfehlung vorschlagen.</span>
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
  {error&&<p className="hc-error" role="alert">{error}</p>}
  {notice&&<p className="hc-notice" role="status">{notice}</p>}
  <p className="hc-footnote">Absolvierte Garmin-Aktivitäten sind die Datenbasis. Garmin-Kalendervorlagen werden ausgeblendet. Das Wetter steht direkt am Trainingstermin. Eigene Trainings kannst du freigeben oder nach Bestätigung entfernen; echte Aktivitäten werden nicht gelöscht.</p>
 </section>
}
