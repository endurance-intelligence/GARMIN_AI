import {createClient} from 'npm:@supabase/supabase-js@2'
import {readTraining,utcDay} from './coach-health-read.ts'
import {coachMonday,coachAddDays} from '../../../src/lib/coachSevenDay.mjs'
import {exactGoalRoute} from '../../../src/lib/goalTrainingFocus.mjs'
import {normalizeEquipmentProfile} from '../../../src/lib/equipmentProfile.mjs'
import {normalizeRhythm} from '../../../src/lib/trainingRhythm.mjs'

type DB=ReturnType<typeof createClient>
const metricFields='metric_date,hrv_ms,resting_heart_rate,sleep_seconds,stress_avg,body_battery_max,synced_at'
const activityFields='activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw'
const planFields='id,training_date,title,session_type,sport,garmin_workout_id,notes,state,revision,approved_at,confirmed_at,garmin_remote_id,intervals_event_id,intervals_published_revision,intervals_sync_status,intervals_export_version,archive_snapshot,created_at,updated_at'
const goalFields='race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at,maintenance_weekly_km'
const contextFields='user_id,illness_state,illness_started_on,illness_expected_end_on,illness_kind,return_started_on,blocked_periods,run_reviews,day_decisions,race_recovery_checks,race_activity_links,post_workout_feedback,updated_at'
async function rows(q:PromiseLike<{data:any;error:any}>,name:string,cap?:number){
 const {data,error}=await q
 if(error||!Array.isArray(data)||(cap!==undefined&&data.length>=cap))throw Error('Incomplete '+name)
 return data
}
async function one(q:PromiseLike<{data:any;error:any}>,name:string){
 const {data,error}=await q
 if(error)throw Error('Unavailable '+name)
 return data
}
async function week(db:DB,userId:string,start:string){
 const end=coachAddDays(start,7)
 const [activities,health,manual]=await Promise.all([
  rows(db.from('garmin_activities').select(activityFields+',feeling_raw').gte('start_time_local',start).lt('start_time_local',end).order('start_time_local',{ascending:true}).limit(250),'week activities',250),
  rows(db.from('garmin_daily_metrics').select(metricFields).gte('metric_date',start).lt('metric_date',end).order('metric_date',{ascending:true}).limit(7),'week health'),
  rows(db.from('garmin_cross_training_sessions').select('id,session_date,kind,duration_minutes,rowing_distance_m,rpe').eq('user_id',userId).gte('session_date',start).lt('session_date',end).order('session_date',{ascending:true}).limit(80),'manual training',80)
 ])
 return {timezone:'Europe/Berlin',start,endExclusive:end,activities,health,manual,summary:{isDerivedFromActualActivities:true,proprietaryTrainingLoadScore:false},ownerOnly:true}
}
/** Private reader. Same read contracts as the existing owner-only API;
 * errors and truncated collections abort archive rather than fabricate goals. */
export async function readArchiveCoachInput(db:DB,userId:string,today:string,visibleWeek?:string){
 const first=coachMonday(today),second=coachMonday(coachAddDays(today,6))
 const weeks=[...new Set([coachAddDays(first,-7),first,second,visibleWeek||first,...Array.from({length:4},(_,i)=>coachAddDays(first,-7*(i+1)))])]
 const since=new Date(Date.now()-45*86400000).toISOString().slice(0,10)
 const [metrics,training,options,choices,entries,goal,context,others,equipment,rhythm,...boards]=await Promise.all([
  rows(db.from('garmin_daily_metrics').select(metricFields).gte('metric_date',utcDay(29)).order('metric_date',{ascending:true}).limit(31),'health'),
  readTraining(db),
  rows(db.from('garmin_weekly_training_options').select('code,weekday,start_time,timezone,title,sport,location_label,location_lat,location_lon,context_note,enabled,optional').eq('enabled',true).order('weekday').order('start_time').limit(250),'weekly options',250),
  rows(db.from('garmin_weekly_training_choices').select('option_code,training_date,choice,updated_at').gte('training_date',coachAddDays(today,-8)).lte('training_date',coachAddDays(today,60)).order('training_date').limit(1000),'weekly choices',1000),
  rows(db.from('garmin_training_plan').select(planFields).gte('training_date',since).order('training_date',{ascending:true}).limit(180),'training plan',180),
  one(db.from('garmin_coach_goals').select(goalFields).eq('user_id',userId).maybeSingle(),'goal'),
  one(db.from('garmin_coach_context').select(contextFields).eq('user_id',userId).maybeSingle(),'context'),
  rows(db.from('garmin_coach_secondary_goals').select('id,race_name,race_date,distance_km,target_hours,race_location,race_start_time,coach_note,updated_at').eq('user_id',userId).order('race_date',{ascending:true}).limit(60),'race portfolio',60),
  one(db.from('garmin_equipment_profile').select('available,treadmill_max_incline_pct').eq('user_id',userId).maybeSingle(),'equipment'),
  one(db.from('garmin_training_rhythm').select('rhythm').eq('user_id',userId).maybeSingle(),'rhythm'),
  ...weeks.map(w=>week(db,userId,w))
 ])
 // Never archive defaults before the user's legacy settings have been migrated.
 const trainingRhythm=normalizeRhythm(rhythm?.rhythm)
 if(!trainingRhythm)throw Error('Central training rhythm not initialized')
 const equipmentProfile=equipment?normalizeEquipmentProfile({available:equipment.available,treadmillMaxInclinePct:equipment.treadmill_max_incline_pct}):null
 if(equipment&&!equipmentProfile)throw Error('Invalid equipment')
 const c=context||{user_id:userId,illness_state:'well',illness_started_on:null,illness_expected_end_on:null,illness_kind:null,return_started_on:null,blocked_periods:[],run_reviews:[],day_decisions:[],race_recovery_checks:[],race_activity_links:[],post_workout_feedback:[]}
 for(const k of ['day_decisions','race_recovery_checks','race_activity_links','post_workout_feedback'])c[k]=Array.isArray(c[k])?c[k]:[]
 const runs=c.illness_state==='returning'&&c.return_started_on?(await rows(db.from('garmin_activities').select(activityFields).gte('start_time_local',c.return_started_on).order('start_time_local',{ascending:true}).limit(150),'return runs',150)).filter(x=>/run|jog|trail|treadmill/i.test(x.sport_type||'')).slice(0,3):[]
 const research=goal?await rows(db.from('garmin_race_event_research').select('id,race_date,event_url,event_title,details,evidence,reviewed_at,checked_at').eq('user_id',userId).eq('race_date',goal.race_date).order('reviewed_at',{ascending:false}).limit(5),'race research'):[]
 if(training.truncated)throw Error('Incomplete training evidence')
 return {health:{metrics,training},boards,options:{options,choices},plans:{entries,historyFrom:since},goal:{goal},life:{context:c,runs,equipmentProfile,trainingRhythm},goalRoute:exactGoalRoute(goal,research),racePortfolio:{primary:goal,others}}
}
