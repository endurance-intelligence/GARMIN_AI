/** One read-only, owner-authorized Coach data source for both Coach and calendar.
 * No publication, no generated data, no guessed unavailable training days.
 */
import type {Session} from '@supabase/supabase-js'
import {garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
import {coachMonday,coachAddDays} from './coachSevenDay.mjs'
import type {CoachContextPayload} from '../components/CoachLifeContext'
import {exactGoalRoute} from './goalTrainingFocus.mjs'
import type {GoalRouteEvidence} from './goalTrainingFocus.mjs'
export type CoachSnapshot={
 health:Record<string,unknown>;boards:Record<string,unknown>[];
 options:Record<string,unknown>;plans:{entries:Array<Record<string,unknown>>;historyFrom?:string};
 goal:Record<string,unknown>;life:CoachContextPayload;goalRoute?:GoalRouteEvidence|null;
 racePortfolio?:{primary?:Record<string,unknown>|null;others?:Array<Record<string,unknown>>}
}
export async function loadCoachSnapshot(session:Session,today:string,signal?:AbortSignal,visibleWeek?:string,historyWeeks=1):Promise<CoachSnapshot>{
 const get=async(endpoint:string):Promise<Record<string,unknown>>=>{
  const response=await fetch(garminSupabaseUrl+'/functions/v1/'+endpoint,{
   cache:'no-store',signal,headers:{
    authorization:'Bearer '+session.access_token,apikey:garminPublishableKey
   }
  })
  if(!response.ok)throw Error('Coach-Daten aktuell nicht vollständig erreichbar ('+response.status+').')
  return await response.json() as Record<string,unknown>
 }
 const first=coachMonday(today),second=coachMonday(coachAddDays(today,6))
 // Fetch the visible week as well. A calendar navigating into race week
 // must not reuse only the rolling seven-day Coach preview.
 const visible=visibleWeek?coachMonday(visibleWeek):first
 // Include the previous completed calendar week: recent Saturday intervals
 // must remain available in Tuesday's Coach reasoning.
 const previous=coachAddDays(first,-7)
 // Goals can request four *completed* ISO weeks for its evidence-only progress view.
 // Coach / calendar retain their previous minimal fetch behavior.
 const back=Number.isInteger(historyWeeks)?Math.max(1,Math.min(4,historyWeeks)):1
 const older=Array.from({length:back},(_,i)=>coachAddDays(first,-7*(i+1)))
 const weeks=[...new Set([previous,first,second,visible])]
 for(const olderWeek of older){if(!weeks.includes(olderWeek))weeks.push(olderWeek)}
 const [health,options,plans,goal,life,racePortfolio,raceResearch,...boards]=await Promise.all([
  get('read-garmin-health'),get('garmin-weekly-options'),get('garmin-training-plan'),
  get('garmin-coach-goal'),get('garmin-coach-context'),
  // The preexisting goal archive is optional: a transient failure must not
  // erase the main Coach snapshot or disable safe training suggestions.
  get('garmin-race-goals').catch(()=>({} as Record<string,unknown>)),
  // Optional confirmed course evidence; an unavailable route never blocks the Coach.
  get('garmin-race-research').catch(()=>({} as Record<string,unknown>)),
  ...weeks.map(week=>get('garmin-week-board?start='+encodeURIComponent(week)))
 ])
 if(!life.context||!Array.isArray((life.context as Record<string,unknown>).blocked_periods)||
  !Array.isArray((life.context as Record<string,unknown>).run_reviews)||
  !Array.isArray(life.runs)||!Array.isArray(options.options)||
  !Array.isArray(plans.entries)||
  !boards.every(board=>Array.isArray(board.activities)&&Array.isArray(board.manual)))
  throw Error('Einige Coach-/Kalenderdaten sind unvollständig; keine Vorschläge eingeblendet.')
 return {health,options,plans:{entries:plans.entries as Array<Record<string,unknown>>,
   historyFrom:typeof plans.historyFrom==='string'?plans.historyFrom:undefined},
  goal,boards,life:life as CoachContextPayload,goalRoute:exactGoalRoute(goal.goal,raceResearch.saved),
  racePortfolio:{primary:racePortfolio.primary as Record<string,unknown>|null|undefined,
   others:Array.isArray(racePortfolio.others)?racePortfolio.others as Array<Record<string,unknown>>:[]}}
}
