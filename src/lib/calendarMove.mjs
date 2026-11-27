/** Move only local, future, definitely unpublished plans. No remote delete/recreate. */
export function calendarDay(value){
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value
}
export function canMoveCalendarPlan(plan,today){
 return !!plan&&calendarDay(today)&&calendarDay(plan.training_date)&&plan.training_date>=today&&
  ['draft','pending'].includes(plan.state)&&plan.garmin_workout_id==null&&plan.garmin_remote_id==null&&plan.confirmed_at==null&&
  plan.intervals_event_id==null&&plan.intervals_published_revision==null&&plan.intervals_sync_status==='not_published'
}
export function validCalendarMove(plan,today,target){
 return canMoveCalendarPlan(plan,today)&&calendarDay(target)&&target!==plan.training_date&&target>=today&&
  target<=new Date(Date.parse(today+'T12:00:00Z')+41*86400000).toISOString().slice(0,10)
}
