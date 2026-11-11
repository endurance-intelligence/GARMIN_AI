import {useEffect,useMemo,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from '../components/Icon'
import {WeatherPanel} from '../components/WeatherPanel'
import {WorkoutArchivePanel} from '../components/WorkoutArchivePanel'
import {WeeklyTrainingOptions} from '../components/WeeklyTrainingOptions'
import {CalendarWeekBoard} from '../components/CalendarWeekBoard'
import '../styles/horizon-calendar.css'

type GarminWorkout={
 date:string;id:string|null;workoutId:string|null;name:string|null;
 sport:string|null;restDay:boolean
}
type GarminSnapshot={schedule:GarminWorkout[];checked_at:string;synced_at:string}
type Plan={
 id:string;training_date:string;title:string;state:string;session_type:string;
 sport:string;garmin_workout_id:number|null;notes:string;revision:number
}
type CalendarEntry={key:string;date:string;title:string;sub:string;note:string;source:'garmin'|'plan';status:string}
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
 const [snapshot,setSnapshot]=useState<GarminSnapshot|null>(null)
 const [plans,setPlans]=useState<Plan[]>([])
 const [intervalsConnected,setIntervalsConnected]=useState(false)
 const [eligiblePlanIds,setEligiblePlanIds]=useState<string[]>([])
 const [published,setPublished]=useState<Record<string,IntervalsPublication>>({})
 const [acting,setActing]=useState<string|null>(null)
 const [repairArmed,setRepairArmed]=useState<string|null>(null)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [refresh,setRefresh]=useState(0)
 const start=moveDay(monday(today),week*7)
 const days=Array.from({length:7},(_,i)=>moveDay(start,i))
 const entries=useMemo<CalendarEntry[]>(()=>{
  const garmin=(snapshot?.schedule||[])
   .filter(w=>w.date&&/^\d{4}-\d{2}-\d{2}$/.test(w.date))
   .map((w,i)=>({
    key:'g-'+w.date+'-'+(w.id||w.workoutId||String(i)),
    date:w.date,title:w.name||(w.restDay?'Ruhetag':'Garmin-Training'),
    sub:w.restDay?'Ruhetag':(w.sport||'Training'),note:'',
    source:'garmin' as const,status:'garmin'
   }))
  const local=plans.filter(p=>p.state!=='cancelled').map(p=>({
   key:'p-'+p.id,date:p.training_date,title:p.title,
   sub:p.title.startsWith('ORC · ')?'ORC Bahntraining · Entwurf':p.session_type==='workout'?'Garmin-Workout-Vorlage':'GARMIN_AI-Planung',
   note:p.notes||'',
   source:'plan' as const,status:p.state
  }))
  return [...garmin,...local]
 },[snapshot,plans])
 const matching=entries.filter(e=>e.date===selected)
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
     ownerGet<{snapshot:GarminSnapshot|null}>(session,'garmin-connect-snapshot'),
     ownerGet<{entries:Plan[]}>(session,'garmin-training-plan'),
     ownerGet<{configured:boolean;eligiblePlanIds:string[];publications:IntervalsPublication[]}>(session,'garmin-intervals')
    ])
    if(!mounted)return
    if(outcomes[0].status==='fulfilled')setSnapshot(outcomes[0].value.snapshot)
    if(outcomes[1].status==='fulfilled')setPlans(outcomes[1].value.entries||[])
    if(outcomes[2].status==='fulfilled'){
     const status=outcomes[2].value
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
 function changeWeek(delta:number){
  const next=Math.max(-1,Math.min(5,week+delta))
  setWeek(next)
  setSelected(moveDay(monday(today),next*7))
  setNotice('')
 }
 const isOld=snapshot?.checked_at?
  Date.now()-Date.parse(snapshot.checked_at)>36*3600000:true

 return <section className={active?'page active':'page'} aria-label="Trainingskalender">
  <div className="hc-intro">
   <div className="hc-eyebrow"><span className="hc-pulse"/> TRAININGSPLAN / HORIZON</div>
   <h1>Deine Woche.<br/><span>Dein Rhythmus.</span></h1>
   <p>Was Garmin bereits kennt und was GARMIN_AI für dich plant – sauber getrennt, ohne doppelte Kalender.</p>
  </div>
  <div className="hc-overview">
   <div><small>WOCHE</small><strong>{monthTitle(start)}</strong><span>{countInWeek} Einträge in dieser Woche</span></div>
   <button type="button" className="hc-refresh" onClick={()=>setRefresh(v=>v+1)} disabled={busy}>
    <Icon name="refresh-cw"/>{busy?'Prüfe …':'Aktualisieren'}
   </button>
  </div>
  <WeatherPanel active={active} mode="training" date={selected} compact/>
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
    today={today} onSelect={setSelected} plans={plans} garminPlans={snapshot?.schedule||[]}/>
   <div className="hc-day-content">
    <div className="hc-day-heading">
     <div><span>AUSGEWÄHLTER TAG</span><h3>{longDate(selected)}</h3></div>
     <span className="hc-day-count">{matching.length} {matching.length===1?'Eintrag':'Einträge'}</span>
    </div>
    {matching.length?
     <div className="hc-entries">
      {matching.map(entry=>{
       const plan=entry.source==='plan'?plans.find(p=>'p-'+p.id===entry.key):undefined
       const publication=plan?published[plan.id]:undefined
       const previouslyPublished=!!(plan&&publication&&publication.intervals_published_revision===plan.revision&&publication.intervals_event_id)
       const needsRepair=previouslyPublished&&!(publication?.intervals_export_version&&publication.intervals_export_version>=2&&publication.intervals_sync_status==='confirmed')
       const sent=previouslyPublished&&!needsRepair
       const eligible=!!plan&&eligiblePlanIds.includes(plan.id)
       const state=entry.source==='garmin'?
        {text:'Aus Garmin übernommen',type:'verified'}:
        sent?{text:'Intervals.icu bestätigt · Garmin prüfen',type:'verified'}:readState(entry.status)
       return <article className={'hc-entry hc-entry-'+state.type} key={entry.key}>
        <div className="hc-entry-symbol"><Icon name={entry.source==='garmin'?'activity':'calendar-days'}/></div>
        <div className="hc-entry-copy">
         <strong>{entry.title}</strong>
         <small>{entry.sub}</small>
         <span className={'hc-entry-state '+state.type}>{state.text}</span>
         {entry.note&&<details className="hc-plan-notes"><summary>Ablauf ansehen</summary><p>{entry.note}</p></details>}
         {plan&&eligible&&plan.state==='draft'&&<button type="button" className="hc-intervals-button"
           disabled={acting!==null} onClick={()=>void approvePlan(plan)}>
            {acting===plan.id?'Freigabe …':'Training freigeben'}</button>}
         {plan&&eligible&&plan.state==='pending'&&needsRepair&&<>
          <p className="hc-error">Der bisherige Intervals-Export hatte ungültige Zeit-/Distanzwerte. Nicht auf Garmin starten.</p>
          {repairArmed!==plan.id?
           <button type="button" className="hc-intervals-button" disabled={acting!==null||!intervalsConnected}
             onClick={()=>setRepairArmed(plan.id)}>Korrigierten Export vorbereiten</button>:
           <div className="hc-repair-confirm">
            <small>Das bestehende Training bei Intervals.icu wird am selben Termin überschrieben. Kein neues Training wird angelegt.</small>
            <button type="button" disabled={acting!==null} className="hc-intervals-button"
             onClick={()=>void repairPublishedWorkout(plan)}>
             {acting===plan.id?'Korrigiere …':'Ja, vorhandenes Training korrigieren'}</button>
            <button type="button" disabled={acting!==null} className="hc-intervals-button"
             onClick={()=>setRepairArmed(null)}>Abbrechen</button>
           </div>}
         </>}
         {plan&&eligible&&plan.state==='pending'&&!sent&&!needsRepair&&<>
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
      <strong>Hier ist noch nichts geplant.</strong>
      <span>Ein freier Tag bleibt frei – wir erfinden keine Trainingseinheit.</span>
     </div>}
   </div>
   <WorkoutArchivePanel active={active} date={selected}
    onPlanned={()=>setRefresh(n=>n+1)}/>
  </div>
  <WeeklyTrainingOptions active={active} weekStart={start}/>
  <div className="hc-source-grid">
   <article>
    <div className="hc-source-icon"><Icon name="check"/></div>
    <div><strong>Garmin Connect</strong>
      <small>{snapshot?((snapshot.schedule||[]).length+' Kalendereinträge im gespeicherten Snapshot'):'Noch keine Kalendereinträge'}</small>
      <span className={isOld?'hc-source-warning':'hc-source-ok'}>
       {snapshot?.checked_at?
        (isOld?'Stand ist älter als 36 Stunden':'Letzter Garmin-Abruf bestätigt'):
        'Noch kein bestätigter Garmin-Abruf'}
      </span>
    </div>
   </article>
   <article>
    <div className="hc-source-icon"><Icon name="sparkles"/></div>
    <div><strong>GARMIN_AI Coach</strong><small>{plans.length} lokale Trainingspläne</small>
     <span>Übertragung nur nach Freigabe über Intervals.icu</span>
    </div>
   </article>
  </div>
  {error&&<p className="hc-error" role="alert">{error}</p>}
  {notice&&<p className="hc-notice" role="status">{notice}</p>}
  <p className="hc-footnote">Die App zeigt bestätigte Garmin-Snapshots und gespeicherte Entwürfe. Ein Entwurf ist kein Garmin-Termin. Nur ein ausdrücklich freigegebenes und anschließend gesendetes Training wird an Intervals.icu veröffentlicht.</p>
 </section>
}
