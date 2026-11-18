/**
 * A removed Intervals event can be acknowledged only if a successful
 * same-day GET returns neither the saved event ID nor our external_id.
 * Never use this for non-404 errors.
 */
export function confirmedAbsentOnDate(events,plan){
 if(!Array.isArray(events)||!plan||typeof plan.id!=='string'||
  !Number.isSafeInteger(Number(plan.intervals_event_id))||Number(plan.intervals_event_id)<1)
  return false
 return !events.some(event=>event&&typeof event==='object'&&
  (Number(event.id)===Number(plan.intervals_event_id)||
   event.external_id==='garmin-ai:'+plan.id))
}
