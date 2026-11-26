/** The archive job executes the very same rules as the interactive Coach.
 * No approval, no publishing, no Garmin/Intervals writes. */
import {buildSevenDayCoach,coachMonday} from './coachSevenDay.mjs'
import {makePlanSnapshot} from './trainingHistory.mjs'

export function archiveFromCoach(today,input){
 if(!input||!Array.isArray(input.health?.metrics)||!input.health?.training||
  input.health.training.truncated||!Array.isArray(input.boards)||!Array.isArray(input.plans?.entries)||
  !Array.isArray(input.options?.options)||!Array.isArray(input.options?.choices)||
  !Array.isArray(input.life?.context?.blocked_periods)||!Array.isArray(input.life?.context?.run_reviews)||
  !Array.isArray(input.life?.runs)||!input.life.trainingRhythm)throw Error('Incomplete Coach input')
 const start=coachMonday(today)
 const board=input.boards.find(b=>b.start===start)
 if(!board||!input.boards.every(b=>Array.isArray(b.activities)&&Array.isArray(b.manual)))throw Error('Incomplete week evidence')
 const plan=buildSevenDayCoach({...input,today})
 const budget=plan.weeklyBudgets?.find(w=>w.start===start)
 const snapshot=makePlanSnapshot({budget,days:plan.days,plans:input.plans.entries,options:input.options.options,choices:input.options.choices,today,goalName:plan.goalProfile?.name??null})
 if(!snapshot||snapshot.weekStart!==start)throw Error('No current-week plan')
 return snapshot
}
export async function runCoachArchive({today,load,save,dryRun=true}){
 const input=await load(today)
 const snapshot=archiveFromCoach(today,input)
 if(dryRun)return {weekStart:snapshot.weekStart,entries:snapshot.entries.length,partial:snapshot.partial,stored:false}
 const revision=await save(snapshot)
 if(!revision?.id||revision.week_start!==snapshot.weekStart)throw Error('Archive write not confirmed')
 return {weekStart:snapshot.weekStart,entries:revision.snapshot?.entries?.length??snapshot.entries.length,partial:revision.snapshot?.partial??snapshot.partial,stored:true}
}
