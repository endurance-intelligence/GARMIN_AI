/** Read-only Coach overview from synced activities + stored weekly choices.
 * A skipped football option does not mean no sport took place on that date.
 */
const num=x=>typeof x==='number'&&Number.isFinite(x)&&x>0?x:0
export function summarizeDayActivity(board,date){
 const activities=(Array.isArray(board?.activities)?board.activities:[])
  .filter(a=>String(a.start_time_local||'').slice(0,10)===date&&num(a.duration_s)>0)
  .sort((a,b)=>String(a.start_time_local).localeCompare(String(b.start_time_local)))
 const manual=(Array.isArray(board?.manual)?board.manual:[])
  .filter(a=>a.session_date===date&&num(a.duration_minutes)>0)
 const existing=new Set(activities.map(a=>String(a.sport_type||'').toLowerCase()))
 const unique=manual.filter(a=>!existing.has(String(a.kind||'').toLowerCase()))
 const items=[...activities.map(a=>({
  title:String(a.activity_name||a.sport_type||'Aktivität').trim()||'Aktivität',
  minutes:Math.round(num(a.duration_s)/60),source:'Garmin'
 })),...unique.map(a=>({
  title:String(a.title||a.kind||'Stabi / Mobility').trim(),
  minutes:Math.round(num(a.duration_minutes)),source:'Manuell'
 }))]
 const total=items.reduce((n,a)=>n+a.minutes,0)
 return {count:items.length,minutes:total,items,
  title:items.length===1?items[0].title:items.length>1?items.map(a=>a.title).slice(0,2).join(' + '):null}
}
export function dayCoachHeadline(choice,day){
 if(day?.count>0){
  const label=day.count===1?day.title:day.title+(day.count>2?' + '+(day.count-2)+' weitere':'')
  return {title:'Heute erledigt: '+label,
   status:'TRAINING ERLEDIGT',
   note:day.minutes+' Min. tatsächlich absolvierte Aktivitäten'+
    (choice?.skipped?'. '+(choice.skippedTitle||'Gruppentraining')+' bewusst ausgelassen.':'')+
    (choice?.plan?' Weitere Kalenderplanung vorhanden.':'')}
 }
 if(choice?.skipped)return {title:'Heute trainingsfrei · bewusst ausgelassen',
  status:'BEWUSST AUSGELASSEN',note:'Auslassen gespeichert · '+(choice.skippedTitle||'Termin')+
   '. Nicht automatisch nachholen.'}
 return null
}
