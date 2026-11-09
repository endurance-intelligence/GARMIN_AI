/**
 * GARMIN_AI v0.9.0 – pure, fail-closed Garmin weight reconciliation.
 *
 * NO network, database or Garmin writes in this module.
 * Garmin sends kilograms to addWeighIn(), but GET dayview mass is GRAMS.
 * A successful POST is never, by itself, transfer confirmation.
 */
const DATE=/^\d{4}-\d{2}-\d{2}$/

export function validWeightOutboxEntry(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))return null
  const date=input.weigh_date
  const kg=Number(input.weight_kg)
  if(typeof date!=='string'||!DATE.test(date))return null
  const day=new Date(date+'T12:00:00.000Z')
  if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)return null
  if(!Number.isFinite(kg)||kg<30||kg>300||Math.abs(Math.round(kg*10)-kg*10)>1e-7)return null
  // Single-user outbox exposes only one measurement per date.
  return Object.freeze({date,kg})
}

function validatedDay(targetDate,response) {
  if(response===null||!response||typeof response!=='object'||
     !Array.isArray(response.dateWeightList))return null
  if(response.dateWeightList.length>25)return null
  const entries=[]
  for(const item of response.dateWeightList) {
    if(!item||typeof item!=='object'||
       item.calendarDate!==targetDate||
       !Number.isFinite(item.weight)||item.weight<30000||item.weight>300000)
      return null
    entries.push({kg:item.weight/1000})
  }
  return entries
}

export function assessGarminWeightDay(entry,dayview) {
  const normalized=validWeightOutboxEntry({
    weigh_date:entry?.date,weight_kg:entry?.kg
  })
  if(!normalized)return {status:'needs_review',code:'invalid_local_entry'}
  const entries=validatedDay(normalized.date,dayview)
  if(!entries)return {status:'needs_review',code:'invalid_garmin_day'}
  if(entries.length===0)return {status:'safe_to_write',code:'empty_day_verified'}
  // Multiple readings on one date may be intentional (scale, family, repeats).
  // Never silently choose one or create a duplicate.
  if(entries.length!==1)return {status:'needs_review',code:'multiple_remote_entries'}
  if(Math.abs(entries[0].kg*1000-normalized.kg*1000)<=0.01)
    return {status:'already_present',code:'matching_remote_weight'}
  return {status:'needs_review',code:'different_remote_weight'}
}

export function verifyGarminWeightWrite(entry,dayview) {
  const inspected=assessGarminWeightDay(entry,dayview)
  if(inspected.status==='already_present')
    return {status:'confirmed',code:'verified_read_back'}
  return {status:'needs_review',code:
    inspected.status==='safe_to_write'?'write_not_visible':inspected.code}
}

// A user-entered date must not accidentally become the workflow's run date.
// UTC noon remains on the selected Berlin calendar day all year (13:00 or 14:00).
export function weightWriteInstant(date){
  const entry=validWeightOutboxEntry({weigh_date:date,weight_kg:75})
  if(!entry)return null
  return new Date(date+'T12:00:00.000Z')
}
