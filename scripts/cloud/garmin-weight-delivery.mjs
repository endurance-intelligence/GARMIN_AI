/**
 * GARMIN_AI v0.9.0 – injectable, single-day weight transfer orchestrator.
 * It makes NO requests until explicitly called with authenticated adapters.
 * Writes are disabled by default. No retry occurs in this process.
 *
 * DB adapter (service-only RPC): nextPending(), claim(date,kg,revision),
 * confirmExisting(date,kg,revision), finish(date,attemptId,status,code).
 * Garmin adapter (trusted Node only): getDailyWeighIns(date),
 * addWeighIn(kg,"kg",instant).
 */
import {
  validWeightOutboxEntry,assessGarminWeightDay,verifyGarminWeightWrite,
  weightWriteInstant
} from './garmin-weight-reconciliation.mjs'

const errorCode=(e)=>{
  switch(e?.name){
    case 'GarminRateLimitError':return 'rate_limited'
    case 'GarminAuthError':return 'auth_rejected'
    case 'GarminConnectionError':return 'network_uncertain'
    default:return 'write_error'
  }
}
const result=(state,code)=>Object.freeze({state,code})

export async function deliverOneWeight({
  db,garmin,writesEnabled=false
}) {
  if(!db||!garmin)return result('blocked','missing_private_adapters')
  // Explicit opt-in is required at deployment time. Never rely on a UI
  // checkbox or browser-provided flag to enable a trusted cloud write.
  const pending=await db.nextPending()
  if(!pending?.available)return result('idle','no_pending_weight')
  const entry=validWeightOutboxEntry({
    weigh_date:pending.date,weight_kg:pending.kg
  })
  if(!entry||typeof pending.revision!=='string'||!pending.revision)
    return result('blocked','invalid_pending_record')

  let before
  try {
    before=await garmin.getDailyWeighIns(entry.date)
  }catch(e){
    // A read error cannot establish that it is safe to insert.
    return result('blocked',errorCode(e))
  }
  const assessment=assessGarminWeightDay(entry,before)
  if(assessment.status==='needs_review')
    return result('needs_review',assessment.code)

  if(assessment.status==='already_present'){
    // Reconcile an existing identical day WITHOUT creating another record.
    // Only the service-role DB function can update this exact version.
    if(!writesEnabled)return result('preview','already_present')
    const saved=await db.confirmExisting(entry.date,entry.kg,pending.revision)
    return saved?.saved===true?
      result('confirmed','matching_remote_weight'):
      result('blocked','concurrent_change')
  }

  // At this point dayview was positively verified to contain zero entries.
  // DO NOT claim the DB entry or call Garmin in a dry-run.
  if(!writesEnabled)return result('preview','safe_to_write')

  const claim=await db.claim(entry.date,entry.kg,pending.revision)
  if(claim?.claimed!==true||
     typeof claim.attemptId!=='string'||!claim.attemptId)
    return result('blocked','concurrent_change')

  const attempt=claim.attemptId
  let decision={status:'needs_review',code:'network_uncertain'}
  try{
    // Raw number in kilograms: Garmin converts to grams server-side.
    // The chosen date is preserved and never replaced with "now".
    await garmin.addWeighIn(entry.kg,'kg',weightWriteInstant(entry.date))
    // 2xx alone does not count as verified. Read the same date again.
    const after=await garmin.getDailyWeighIns(entry.date)
    decision=verifyGarminWeightWrite(entry,after)
  }catch(e){
    decision={status:'needs_review',code:errorCode(e)}
  }
  const saved=await db.finish(entry.date,attempt,
    decision.status,decision.code)
  if(saved?.saved!==true)
    return result('blocked','outbox_finish_failed')
  return result(decision.status==='confirmed'?'confirmed':'needs_review',decision.code)
}
