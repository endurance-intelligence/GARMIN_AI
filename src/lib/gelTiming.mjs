/**
 * Deterministic planning aid. Uses only products the athlete explicitly marked as owned.
 * Gel carbohydrates are a subset of total fueling; drinks/food must be counted separately.
 * Never consumes inventory or changes Garmin workouts.
 */
const finite=(v)=>typeof v==='number'&&Number.isFinite(v)
const safe=(v,min,max)=>finite(v)&&v>=min&&v<=max
export function clockAt(startTime,elapsedMinutes){
 if(typeof startTime!=='string'||!/^\d{2}:\d{2}/.test(startTime))return null
 const h=Number(startTime.slice(0,2)),m=Number(startTime.slice(3,5))
 if(h>23||m>59)return null
 const total=h*60+m+Math.round(elapsedMinutes)
 return String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0')
}
export function buildGelPlan({durationMinutes,targetCarbsGPerHour,drinkCarbsGPerHour=0,
 inventory=[],allowCaffeine=false,startTime=null,aidEvents=[],
 caffeineStartMinute=0,caffeineMaxMg=400}={}){
 if(!safe(durationMinutes,30,2880)||!safe(targetCarbsGPerHour,20,150)
  ||!safe(drinkCarbsGPerHour,0,150)||!Array.isArray(inventory)||
  !Array.isArray(aidEvents)||!safe(caffeineStartMinute,0,1440)||
  !safe(caffeineMaxMg,0,400))
  return {status:'invalid',events:[],used:[],reserve:[]}
 const gelTargetPerHour=Math.max(0,targetCarbsGPerHour-drinkCarbsGPerHour)
 const safeAid=aidEvents.filter(e=>e&&safe(e.minute,0,durationMinutes)&&
  safe(e.carbsG,0,300)&&e.planOnly===true).sort((a,b)=>a.minute-b.minute)
 const aidTotal=Math.round(safeAid.reduce((sum,e)=>sum+e.carbsG,0)*10)/10
 const ownDrinkTotal=drinkCarbsGPerHour*durationMinutes/60
 const raceGoal=targetCarbsGPerHour*durationMinutes/60
 const goalGelCarbs=Math.max(0,gelTargetPerHour*durationMinutes/60-aidTotal)
 const stock=inventory.filter(x=>x&&typeof x.id==='string'&&safe(Number(x.quantity),0,500))
  .map(x=>({...x,remaining:Math.floor(Number(x.quantity)),carbsG:Number(x.carbsG),
   caffeineMg:x.caffeineMg===null||x.caffeineMg===undefined?null:Number(x.caffeineMg),
   priority:Number(x.priority)}))
 const reserve=stock.filter(x=>x.priority===3&&x.remaining>0).map(x=>({
  id:x.id,name:x.name,brand:x.brand,quantity:x.remaining
 }))
 const offered=stock.filter(x=>x.priority>=1&&x.priority<=2&&x.remaining>0&&
  safe(x.carbsG,5,100)&&!x.isBulk&&
  (x.caffeineMg===0||(allowCaffeine&&safe(x.caffeineMg,0,400))))
 const events=[]
 let total=0,caffeineTotal=0
 const used=new Map()
 for(let minute=20;minute<=durationMinutes-10&&gelTargetPerHour>0;minute+=20){
  // Upcoming confirmed aid in the next 15 min counts toward the current
  // fueling interval. No assumption that it has already been consumed.
  const coveredAid=safeAid.filter(e=>e.minute<=minute+15)
    .reduce((sum,e)=>sum+e.carbsG,0)
  const desired=Math.min(goalGelCarbs,Math.max(0,gelTargetPerHour*minute/60-coveredAid))
  const deficit=desired-total
  if(deficit<10)continue
  const choices=offered.filter(x=>x.remaining>0&&
    (x.caffeineMg||0)+caffeineTotal<=Math.min(400,caffeineMaxMg)&&
    ((x.caffeineMg||0)===0||minute>=caffeineStartMinute)&&
    !(String(x.name).toLowerCase().includes('nootropics')&&
      events.some(e=>String(e.name).toLowerCase().includes('nootropics'))))
  if(!choices.length)break
  const scored=choices.map(x=>({
   x,score:Math.abs(desired-(total+x.carbsG))+(x.priority===2?8:0)+
    (x.caffeineMg>0?(allowCaffeine&&minute>=caffeineStartMinute&&
      caffeineTotal===0?-14:6):0)
  })).sort((a,b)=>a.score-b.score||a.x.priority-b.x.priority||
   a.x.carbsG-b.x.carbsG||a.x.id.localeCompare(b.x.id))
  const best=scored[0]
  if(!best)break
  const skipScore=Math.abs(desired-total)
  if(best.score>skipScore+2)continue
  const x=best.x
  x.remaining-=1
  total+=x.carbsG
  caffeineTotal+=(x.caffeineMg||0)
  used.set(x.id,(used.get(x.id)||0)+1)
  events.push({minute,clock:clockAt(startTime,minute),id:x.id,name:x.name,
   brand:x.brand,flavor:x.flavor||'',carbsG:x.carbsG,caffeineMg:x.caffeineMg||0,
   cumulativeCarbsG:Math.round(total*10)/10})
 }
 const plannedCarbsG=Math.round(total*10)/10
 const requested=Math.round(goalGelCarbs*10)/10
 const uncovered=Math.max(0,Math.round((requested-total)*10)/10)
 const totalPlannedCarbsG=Math.round((total+aidTotal+ownDrinkTotal)*10)/10
 return {status:'ready',events,used:[...used].map(([id,quantity])=>({id,quantity})),
  reserve,gelTargetPerHour,drinkCarbsGPerHour,requestedGelCarbsG:requested,
  plannedCarbsG,plannedKcal:Math.round(plannedCarbsG*4),
  aidCarbsG:aidTotal,ownDrinkCarbsG:Math.round(ownDrinkTotal*10)/10,
  totalPlannedCarbsG,totalTargetCarbsG:Math.round(raceGoal*10)/10,
  uncoveredG:uncovered,caffeineMg:caffeineTotal,
  coveragePercent:requested>0?Math.min(100,Math.round(total/requested*100)):100,
  planOnly:true}
}
