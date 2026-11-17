import {useEffect,useState} from 'react'
import {berlinDateToday} from '../lib/coachGoal'
import {coachMonday,coachAddDays} from '../lib/coachSevenDay.mjs'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {buildRaceReview,estimateRaceBudget} from '../lib/raceExecution.mjs'
import type {RaceReview} from '../lib/raceExecution.mjs'
import type {CoachGoal} from '../lib/coachGoal'
import {Icon} from './Icon'
import '../styles/race-review.css'

type GoalView=Pick<CoachGoal,'race_date'|'race_name'|'target_hours'> & {distance_km:number|null}
type Current={goal:GoalView;review:RaceReview|null;strategy:Record<string,unknown>|null}
const safe=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null
const minKm=(seconds:number|null)=>seconds===null?'–':
 Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' min/km'
const duration=(mins:number|null)=>mins===null?'–':
 Math.floor(mins/60)+'h '+String(mins%60).padStart(2,'0')+'m'
const format=(value:number)=>value.toLocaleString('de-DE',{maximumFractionDigits:1})
const displayDate=(date:string)=>date.split('-').reverse().join('.')
export function RaceReviewCard({active,onCoach}:{
 active:boolean;onCoach:()=>void
}){
 const today=berlinDateToday()
 const [current,setCurrent]=useState<Current|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!active||!garminSupabase)return
  const controller=new AbortController()
  let live=true
  setLoading(true);setError('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const headers={authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   const request=async(name:string)=>{
    const response=await fetch(garminSupabaseUrl+'/functions/v1/'+name,{
     method:'GET',signal:controller.signal,cache:'no-store',headers})
    if(!response.ok)throw Error('Renn- und Coach-Daten nicht erreichbar ('+response.status+').')
    return await response.json() as Record<string,unknown>
   }
   const [result,pastPlanResult]=await Promise.all([
    request('garmin-coach-goal'),
    garminSupabase.from('garmin_race_strategy').select('*')
     .eq('user_id',session.user.id).lte('race_date',today)
     .gte('race_date',coachAddDays(today,-60))
     .order('race_date',{ascending:false}).limit(1).maybeSingle()
   ])
   if(pastPlanResult.error)throw Error('Rennarchiv derzeit nicht erreichbar.')
   if(!live)return
   const activeGoal=(result.goal||null) as CoachGoal|null
   const pastPlan=(pastPlanResult.data||null) as Record<string,unknown>|null
   const fromArchive:GoalView|null=pastPlan?{
    race_date:String(pastPlan.race_date),race_name:String(pastPlan.race_name),
    distance_km:safe(pastPlan.race_distance_km),
    target_hours:safe(pastPlan.goal_target_hours)
   }:null
   const activeIsRecent=activeGoal&&activeGoal.race_date<=today&&
    activeGoal.race_date>=coachAddDays(today,-60)
   const goal:GoalView|null=fromArchive&&
    (!activeIsRecent||fromArchive.race_date>=activeGoal!.race_date)?
     {...fromArchive,
      distance_km:fromArchive.distance_km??(
       activeGoal?.race_date===fromArchive.race_date&&
       activeGoal?.race_name===fromArchive.race_name?activeGoal.distance_km:null),
      target_hours:fromArchive.target_hours??(
       activeGoal?.race_date===fromArchive.race_date&&
       activeGoal?.race_name===fromArchive.race_name?activeGoal.target_hours:null)}:
     activeIsRecent?activeGoal:activeGoal||null
   if(!goal){setCurrent(null);return}
   if(goal.race_date>today||goal.race_date<coachAddDays(today,-60)){
    setCurrent({goal,review:null,strategy:null});return
   }
   const week=coachMonday(goal.race_date)
   const [board,contextResult]=await Promise.all([
    request('garmin-week-board?start='+encodeURIComponent(week)),
    request('garmin-coach-context')
   ])
   const strategy=pastPlan&&pastPlan.race_date===goal.race_date&&
    pastPlan.race_name===goal.race_name?pastPlan:null
   const context=(contextResult.context||null) as Record<string,unknown>|null
   const review=buildRaceReview({today,
    race:{raceDate:goal.race_date,raceName:goal.race_name,
     distanceKm:goal.distance_km},
    strategy,board,context})
   if(live)setCurrent({goal,review,strategy})
  })().catch(e=>{
   if(live&&e?.name!=='AbortError')setError(
    e instanceof Error?e.message:'Rennnachbereitung derzeit nicht verfügbar.')
  }).finally(()=>{if(live)setLoading(false)})
  return ()=>{live=false;controller.abort()}
 },[active,today])
 if(!active||(!current&&!loading&&!error))return null
 const goal=current?.goal
 const report=current?.review
 const strategy=current?.strategy
 const budget=goal&&report?.plan?estimateRaceBudget({
  distanceKm:goal.distance_km,targetHours:goal.target_hours,
  calculation:report.plan,
  carbsPerHour:safe(strategy?.carbs_g_per_hour),
  fluidPerHour:safe(strategy?.fluid_ml_per_hour),
  sodiumPerHour:safe(strategy?.sodium_mg_per_hour)
 }):null
 return <details className="rrv-root" aria-label="Rennnachbereitung auf Basis des Plans und echter Garmin-Daten">
  <summary className="rrv-summary">
   <span className="rrv-icon"><Icon name="clipboard-check"/></span>
   <span className="rrv-summary-text">
    <small>RACE PREP / NACH DEM RENNEN</small>
    <strong>Rennplan → Garmin → Erholung</strong>
    <span>{goal?
     goal.race_date>today?'Automatischer Vergleich ab '+displayDate(goal.race_date):
      'Dein Rennen vom '+displayDate(goal.race_date)+' im Rückblick':
     loading?'Lade Renndaten …':'Rennziel festlegen, um nach dem Start auszuwerten'}</span>
   </span>
   <Icon name="chevron-down"/>
  </summary>
  <div className="rrv-body">
   {error&&<p className="rrv-error" role="alert">{error}</p>}
   {goal&&goal.race_date>today&&<p>
    Nach dem Rennen verbindet dieser Bereich deinen gespeicherten Pacing- und
    Verpflegungsplan mit einer eindeutig passenden Garmin-Aufzeichnung und deinem
    bereits vorhandenen Erholungs-Check. Keine zusätzlichen Formulare.</p>}
   {report&&<>
    <div className="rrv-subtitle">
     <strong>{goal?.race_name}</strong>
     <span>{report.status==='matched'?'Plausible Garmin-Zuordnung':
      'Garmin-Zuordnung noch offen'}</span>
    </div>
    <div className="rrv-compare">
     <div><span>Rennplan · Gesamtzeit inkl. Pausen</span>
      <strong>{report.plan?.formattedTotal||'Nicht eingetragen'}</strong></div>
     <div><span>Garmin · dokumentierte Aktivitätsdauer</span>
      <strong>{report.garmin?duration(report.garmin.activityMinutes):'Nicht eindeutig'}</strong></div>
     <div><span>Garmin · erfasste Distanz</span>
      <strong>{report.garmin?format(report.garmin.recordedKm)+' km':'Nicht eindeutig'}</strong></div>
     <div><span>Garmin · Schnitt aus Aktivitätsdauer</span>
      <strong>{report.garmin?minKm(report.garmin.avgPaceSeconds):'Nicht eindeutig'}</strong></div>
    </div>
    <p className="rrv-evidence">{report.message} {report.timingNote}</p>
    <div className="rrv-fuel">
     <strong>Verpflegung aus deinem Plan</strong>
     {budget?<p>{budget.plannedCarbsGrams===null?'Kohlenhydrate nicht geplant':
      format(budget.plannedCarbsGrams)+' g Kohlenhydrate'} · {' '}
      {budget.plannedFluidMl===null?'Trinkmenge nicht geplant':
       format(budget.plannedFluidMl/1000)+' l Getränke'} · {' '}
      {budget.plannedSodiumMg===null?'Natrium nicht geplant':
       format(budget.plannedSodiumMg)+' mg Natrium'}</p>:
      <p>Keine vollständig berechenbare Rennstrategie gespeichert.</p>}
     <small>{report.fuelingNote}</small>
    </div>
    <div className="rrv-recovery">
     <strong>Erholung nach dem Rennen</strong>
     {report.recovery?<p>Letzter Check: Erschöpfung
      {' '+report.recovery.fatigue+'/10'} · Beine
      {' '+report.recovery.soreness+'/10'}
      {report.recovery.warning?' · Warnzeichen gemeldet':''}</p>:
      <p>Du hast noch keinen Erholungs-Check für dieses Rennen eingetragen.</p>}
     <small>{report.following}</small>
    </div>
    <button className="rrv-coach-link" type="button" onClick={onCoach}>
     <Icon name="activity"/> Zum bestehenden Erholungs-Check im Coach
     <Icon name="arrow-up-right"/>
    </button>
   </>}
   <small className="rrv-foot">Rennvorbereitung und Nachbereitung werden hier nur verglichen.
    Keine automatisch geänderten Trainings oder Garmin-Aktivitäten.</small>
  </div>
 </details>
}
