/** One read-only, owner-authorized Coach data source for both Coach and calendar.
 * No publication, no generated data, no guessed unavailable training days.
 */
import type {Session} from '@supabase/supabase-js'
import {garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
import {coachMonday,coachAddDays} from './coachSevenDay.mjs'
import type {CoachContextPayload} from '../components/CoachLifeContext'
export type CoachSnapshot={
 health:Record<string,unknown>;boards:Record<string,unknown>[];
 options:Record<string,unknown>;plans:{entries:Array<Record<string,unknown>>};
 goal:Record<string,unknown>;life:CoachContextPayload
}
export async function loadCoachSnapshot(session:Session,today:string,signal?:AbortSignal):Promise<CoachSnapshot>{
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
 const weeks=first===second?[first]:[first,second]
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
 return {health,options,plans:{entries:plans.entries as Array<Record<string,unknown>>},
  goal,boards,life:life as CoachContextPayload}
}
