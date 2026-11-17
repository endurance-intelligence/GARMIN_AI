/** One source of truth for the day card: never turn "Auslassen" into "offen".
 * Weekly options are invitations, not mandatory workouts.
 */
export function coachTodayChoice(options,choices,plans,date,weekday,activities=[],manual=[]){
 const dayOptions=(Array.isArray(options)?options:[]).filter(x=>x&&x.weekday===weekday&&x.enabled!==false)
 const picks=Array.isArray(choices)?choices:[]
 const choiceFor=o=>picks.find(c=>c.training_date===date&&c.option_code===o.code)?.choice||'open'
 const plan=(Array.isArray(plans)?plans:[]).find(p=>p.training_date===date&&
  !['cancelled','confirmed','completed','skipped'].includes(String(p.state||'')))||null
 const selected=dayOptions.find(o=>choiceFor(o)==='selected')||null
 const open=dayOptions.find(o=>choiceFor(o)==='open')||null
 const skipped=dayOptions.length>0&&dayOptions.every(o=>choiceFor(o)==='skipped')
 const skippedTitle=dayOptions.filter(o=>choiceFor(o)==='skipped').map(o=>String(o.title||'Termin')).join(' · ')
 const done=[...(Array.isArray(activities)?activities:[])].filter(x=>String(x.start_time_local||'').slice(0,10)===date)
 const manualDone=(Array.isArray(manual)?manual:[]).filter(x=>x.session_date===date)
 const classify=x=>/mobility|strength|stabi|kraft|pilates|yoga/i.test(String(x))?'mobility':
  /soccer|football|fußball/i.test(String(x))?'football':
  /rowing|rudern/i.test(String(x))?'rowing':String(x||'').trim().toLowerCase()
 const seen=new Set(done.map(x=>classify(x.sport_type||x.activity_name)))
 const completed=[...done.map(x=>({title:String(x.activity_name||'Garmin-Aktivität'),minutes:Math.round(Number(x.duration_s||0)/60),source:'Garmin'})),
  ...manualDone.filter(x=>!seen.has(classify(x.kind||x.title)))
   .map(x=>({title:String(x.title||x.kind||'Training'),minutes:Math.round(Number(x.duration_minutes||0)),source:'Manuell'}))]
 const doneLabel=completed.length?completed.map(x=>x.title+(x.minutes>0?' · '+x.minutes+' Min.':'')).join(' · '):''
 return {plan,workout:selected,option:open,skipped,skippedTitle,completed,doneLabel,
  hasOptions:dayOptions.length>0,
  state:completed.length?'completed':plan?'planned':selected?'selected':open?'optional':skipped?'skipped':'free'}
}
