/** One read-only, owner-authorized Coach data source for both Coach and calendar.
 * No publication, no generated data, no guessed unavailable training days.
 */
import type {Session} from '@supabase/supabase-js'
import {garminSupabaseUrl,garminPublishableKey} from './garminSupabase'
import {coachMonday} from './coachSevenDay.mjs'
import type {CoachContextPayload} from '../components/CoachLifeContext'
import type {GoalRouteEvidence} from './goalTrainingFocus.mjs'
import {loadTrainingRhythm} from './trainingHistoryApi'
export type CoachSnapshot={
 health:Record<string,unknown>;boards:Record<string,unknown>[];
 options:Record<string,unknown>;plans:{entries:Array<Record<string,unknown>>;historyFrom?:string};
 goal:Record<string,unknown>;life:CoachContextPayload;goalRoute?:GoalRouteEvidence|null;
 racePortfolio?:{primary?:Record<string,unknown>|null;others?:Array<Record<string,unknown>>}
}
/** All Coach consumers use the same full four-week evidence window as cron.
 * visibleWeek adds one calendar week; historyWeeks is retained for caller compatibility. */
export async function loadCoachSnapshot(session:Session,today:string,signal?:AbortSignal,visibleWeek?:string,_historyWeeks=4):Promise<CoachSnapshot>{
 // Keep one-time legacy browser migration, but the server is the source of truth.
 await loadTrainingRhythm(signal)
 const visible=coachMonday(visibleWeek||today)
 const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-archive?week='+encodeURIComponent(visible),{
  cache:'no-store',signal,headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
 })
 if(response.status===409)throw Error('Bitte zuerst den Trainingsrhythmus in den Einstellungen speichern.')
 if(!response.ok)throw Error('Coach-Daten aktuell nicht vollständig erreichbar ('+response.status+').')
 const data=await response.json()
 if(data.today!==today||!data.life?.context||!Array.isArray(data.life.context.blocked_periods)||
  !Array.isArray(data.life.context.run_reviews)||!Array.isArray(data.life.runs)||!data.life.trainingRhythm||
  !Array.isArray(data.options?.options)||!Array.isArray(data.options?.choices)||
  !Array.isArray(data.plans?.entries)||!Array.isArray(data.boards)||
  !data.boards.some((b:Record<string,unknown>)=>b.start===visible)||
  !data.boards.every((b:Record<string,unknown>)=>Array.isArray(b.activities)&&Array.isArray(b.manual))||
  !Array.isArray(data.health?.metrics)||!data.health.training||data.health.training.truncated)
  throw Error('Einige Coach-/Kalenderdaten sind unvollständig; keine Vorschläge eingeblendet.')
 return data as CoachSnapshot
}
