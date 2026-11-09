/** One approved Garmin workout date per invocation, at most one remote write.
 * No automatic retries. A questionable post-write result needs human review.
 */
import {validatePending,assessCalendarDay,verifyScheduledWorkout}
 from './garmin-calendar-reconciliation.mjs'
const result=(state,code)=>Object.freeze({state,code})
const codeOf=e=>e?.name==='GarminRateLimitError'?'rate_limited':
  e?.name==='GarminAuthError'?'auth_rejected':
  e?.name==='GarminConnectionError'?'network_uncertain':'write_unavailable'

export async function deliverOneCalendarWorkout({db,garmin,writesEnabled=false,wait=()=>Promise.resolve()}){
 if(!db||!garmin)return result('blocked','missing_private_adapters')
 const pending=await db.nextPending()
 if(!pending?.available)return result('idle','queue_empty')
 const task=validatePending(pending)
 if(!task)return result('blocked','invalid_pending')

 let before
 try { before=await garmin.getScheduledWorkoutSummaries(task.date,task.date) }
 catch(e){ return result('blocked',codeOf(e)) }

 const prior=assessCalendarDay(task,before)
 if(prior.status==='needs_review')return result('needs_review',prior.code)
 if(prior.status==='already_present'){
   if(!writesEnabled)return result('preview','already_present')
   const done=await db.confirmExisting(task,prior.remoteId)
   return done?.saved===true?
      result('confirmed','already_present'):result('blocked','concurrent_change')
 }
 if(!writesEnabled)return result('preview','safe_to_write')

 // Claim the exact approved revision before any Garmin mutation. Never
 // schedule anything when the row changed or another worker claimed it.
 const claimed=await db.claim(task)
 if(claimed?.claimed!==true||typeof claimed.attemptId!=='string')
   return result('blocked','concurrent_change')

 let decision={status:'needs_review',code:'network_uncertain',remoteId:null}
 try{
   // Only supported operation: schedule an existing Garmin workout template.
   await garmin.scheduleWorkout(task.workoutId,task.date)
   // Garmin summaries can lag a write. Wait once, then inspect; NEVER re-write.
   await wait()
   const after=await garmin.getScheduledWorkoutSummaries(task.date,task.date)
   decision=verifyScheduledWorkout(task,after)
 }catch(e){decision={status:'needs_review',code:codeOf(e),remoteId:null}}

 const finished=await db.finish(task,claimed.attemptId,decision)
 if(finished?.saved!==true)return result('blocked','outbox_finish_failed')
 return result(decision.status==='confirmed'?'confirmed':'needs_review',decision.code)
}
