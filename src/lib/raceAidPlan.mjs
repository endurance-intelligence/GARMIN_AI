/**
 * Event catering is an explicit user-confirmed race plan, NEVER an assertion of
 * actual intake. Drink mix 160 = 40 g/500 ml; 320 = 80 g/500 ml
 * (manufacturer product data). On-site dilution/serving size must be checked.
 */
import {clockAt} from './gelTiming.mjs'
const valid=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max
const round1=n=>Math.round(n*10)/10
const nutrition={unknown:null,'160':40,'320':80}

export function buildAidPlan({checkpoints=[],settings=null,startTime=null}={}){
 const empty={status:'unconfirmed',events:[],drinkCarbsG:0,foodCarbsG:0,
   totalCarbsG:0,fluidMl:0,stops:0,planOnly:true}
 if(!settings?.aid_confirmed)return empty
 const s=settings
 if(!Array.isArray(checkpoints)||checkpoints.length===0||!
    Number.isInteger(s.aid_every_laps)||s.aid_every_laps<1||s.aid_every_laps>25||
    !['unknown','160','320','custom'].includes(s.aid_drink_mix)||
    !valid(s.aid_drink_ml_per_stop,0,1000)||
    !valid(s.aid_food_carbs_g_per_stop,0,120)||
    typeof s.aid_food_name!=='string'||s.aid_food_name.length>90||
    !valid(s.aid_custom_carbs_g_per_500,0,150))
    return {...empty,status:'invalid'}
 const drinkCarbs500=s.aid_drink_mix==='custom'?s.aid_custom_carbs_g_per_500:
   nutrition[s.aid_drink_mix]
 // An unspecified mix (160 vs 320) cannot be assigned carbohydrates.
 if(s.aid_drink_ml_per_stop>0&&drinkCarbs500===null)
   return {...empty,status:'unknown-concentration'}
 if(s.aid_food_carbs_g_per_stop>0&&!s.aid_food_name.trim())
   return {...empty,status:'unknown-food'}
 // Several confirmed options can be entered comma-separated; show a
 // different one each stop. Never assign a carb number unless entered.
 const foodOptions=s.aid_food_name.split(/[,;]+/).map(x=>x.trim()).filter(Boolean)
 const events=[]
 let drinkCarbsG=0,foodCarbsG=0,fluidMl=0
 for(const c of checkpoints){
  if(c?.finish||!Number.isInteger(c?.index)||
     c.index%s.aid_every_laps!==0||!valid(c.arrivalMinutes,0,2880))continue
  const ml=s.aid_drink_ml_per_stop
  const drink=round1(ml*(drinkCarbs500||0)/500)
  const food=round1(s.aid_food_carbs_g_per_stop)
  const meal=foodOptions.length?foodOptions[Math.floor((c.index-1)/s.aid_every_laps)%foodOptions.length]:''
  if(ml===0&&food===0&&!meal)continue
  const event={minute:c.arrivalMinutes,clock:clockAt(startTime,c.arrivalMinutes),
    round:c.index,drinkMl:ml,drinkCarbsG:drink,
    drinkName:ml?('Maurten Drink Mix '+(s.aid_drink_mix==='custom'?'(geprüfter Wert)':s.aid_drink_mix)):'',
    foodName:meal,
    foodCarbsG:food,carbsG:round1(drink+food),planOnly:true}
  events.push(event)
  drinkCarbsG+=drink;foodCarbsG+=food;fluidMl+=ml
 }
 return {status:'ready',events,
  drinkCarbsG:round1(drinkCarbsG),foodCarbsG:round1(foodCarbsG),
  totalCarbsG:round1(drinkCarbsG+foodCarbsG),fluidMl,
  stops:events.length,planOnly:true}
}
