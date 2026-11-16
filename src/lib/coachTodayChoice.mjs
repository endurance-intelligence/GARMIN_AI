/** One source of truth for the day card: never turn "Auslassen" into "offen".
 * Weekly options are invitations, not mandatory workouts.
 */
export function coachTodayChoice(options,choices,plans,date,weekday){
 const dayOptions=(Array.isArray(options)?options:[]).filter(x=>x&&x.weekday===weekday&&x.enabled!==false)
 const picks=Array.isArray(choices)?choices:[]
 const choiceFor=o=>picks.find(c=>c.training_date===date&&c.option_code===o.code)?.choice||'open'
 const plan=(Array.isArray(plans)?plans:[]).find(p=>p.training_date===date&&
  !['cancelled','confirmed','completed','skipped'].includes(String(p.state||'')))||null
 const selected=dayOptions.find(o=>choiceFor(o)==='selected')||null
 const open=dayOptions.find(o=>choiceFor(o)==='open')||null
 const skipped=dayOptions.length>0&&dayOptions.every(o=>choiceFor(o)==='skipped')
 const skippedTitle=dayOptions.filter(o=>choiceFor(o)==='skipped').map(o=>String(o.title||'Termin')).join(' · ')
 return {plan,workout:selected,option:open,skipped,skippedTitle,
  hasOptions:dayOptions.length>0,
  state:plan?'planned':selected?'selected':open?'optional':skipped?'skipped':'free'}
}
