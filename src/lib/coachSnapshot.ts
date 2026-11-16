/** One read-only, owner-authorized Coach data source for both Coach and calendar.
 * No publication, no generated data, no guessed unavailable training days.
 */
import type {Session} from '@supabase/supabase-js'
import {readCoachPrivate} from './coachRequestPool'
import {coachMonday,coachAddDays} from './coachSevenDay.mjs'
import type {CoachContextPayload} from '../components/CoachLifeContext'
export type RecentCoachEvidence={
 activity:{id:string;name:string;date:string;distanceKm:number|null;averageHr:number|null;rpe:number|null};
 review:{headline:string;positive:string;attention:string;goal:string;quality:string}|null;
 intervals:{load:number|null;comparison:{available:boolean;median?:number;category?:string;count?:number}|null}|null
}
export type CoachSnapshot={
 health:Record<string,unknown>;boards:Record<string,unknown>[];
 options:Record<string,unknown>;plans:{entries:Array<Record<string,unknown>>};
 goal:Record<string,unknown>;life:CoachContextPayload;
 recent:RecentCoachEvidence|null
}
export async function loadCoachSnapshot(session:Session,today:string,signal?:AbortSignal,visibleWeek?:string):Promise<CoachSnapshot>{
 const get=(endpoint:string)=>readCoachPrivate(endpoint,session.access_token,signal)
 const first=coachMonday(today),second=coachMonday(coachAddDays(today,6))
 const previous=coachMonday(coachAddDays(today,-7))
 // Fetch the visible week as well. A calendar navigating into race week
 // must not reuse only the rolling seven-day Coach preview.
 const visible=visibleWeek?coachMonday(visibleWeek):first
 const weeks=[...new Set([previous,first,second,visible])]
 const [health,options,plans,goal,life,...boards]=await Promise.all([
  get('read-garmin-health'),get('garmin-weekly-options'),get('garmin-training-plan'),
  get('garmin-coach-goal'),get('garmin-coach-context'),
  ...weeks.map(week=>get('garmin-week-board?start='+encodeURIComponent(week)))
 ])
 if(!life.context||!Array.isArray((life.context as Record<string,unknown>).blocked_periods)||
  !Array.isArray((life.context as Record<string,unknown>).run_reviews)||
  !Array.isArray(life.runs)||!Array.isArray(options.options)||
  !Array.isArray(plans.entries)||
  !boards.every(board=>Array.isArray(board.activities)&&Array.isArray(board.manual)))
  throw Error('Einige Coach-/Kalenderdaten sind unvollständig; keine Vorschläge eingeblendet.')
 // The previous calendar week is essential on Mondays: otherwise a Saturday
 // interval workout cannot influence the next decision.
 const activities=boards.flatMap(board=>Array.isArray(board.activities)?board.activities as Record<string,unknown>[]:[])
 const recentRuns=activities.filter(a=>/run|jog/i.test(String(a.sport_type||''))&&
  String(a.start_time_local||'').slice(0,10)<=today)
  .sort((a,b)=>String(b.start_time_local).localeCompare(String(a.start_time_local)))
 const last=recentRuns[0]||null
 const date=String(last?.start_time_local||'').slice(0,10)
 const age=date?Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000):99
 const id=String(last?.activity_id||'')
 let recent:RecentCoachEvidence|null=null
 if(last&&age>=0&&age<=8&&/^[a-zA-Z0-9_:-]{1,80}$/.test(id)){
  const [reviewed,intervals]=await Promise.allSettled([
   get('garmin-coach-review?id='+encodeURIComponent(id)),
   get('garmin-intervals-insights?id='+encodeURIComponent(id))
  ])
  const reviewData=reviewed.status==='fulfilled'?reviewed.value:null
  const matched=Array.isArray(reviewData?.reviews)?
   (reviewData.reviews as Record<string,unknown>[]).find(r=>String(r.activityId)===id):null
  const loadData=intervals.status==='fulfilled'?intervals.value:null
  const loadActivity=loadData?.activity as Record<string,unknown>|null
  const loadContext=loadData?.loadContext as Record<string,unknown>|null
  const compared=loadContext?.activity as Record<string,unknown>|null
  const n=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:null
  recent={activity:{id,name:String(last.activity_name||'Lauf'),date,
   distanceKm:n(last.distance_m)===null?null:Math.round(Number(last.distance_m)/10)/100,
   averageHr:n(last.average_heart_rate),rpe:n(last.rpe_raw)},
   review:matched?{headline:String(matched.headline||''),positive:String(matched.positive||''),
    attention:String(matched.attention||''),goal:String(matched.goal||''),
    quality:String(matched.quality||'limited')}:null,
   intervals:loadData?.connected&&loadActivity?{
    load:n(loadActivity.load),
    comparison:compared?{available:compared.available===true,
     median:n(compared.median)??undefined,
     category:String(compared.category||'')||undefined,
     count:n(compared.count)??undefined}:null}:null}
 }
 return {health,options,plans:{entries:plans.entries as Array<Record<string,unknown>>},
  goal,boards,life:life as CoachContextPayload,recent}
}
