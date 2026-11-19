import {suggestEventFood} from './raceEventMenu.mjs'
/**
 * Calm, round-first view for the athlete. Checkpoint distances and time budgets
 * remain available to the crew, but are never exposed by this model.
 * Consumption is not assumed and GPS distance cannot advance the round count.
 */
export function buildRunnerFocus({checkpoints=[],completed=0,gelEvents=null,
 aidEvents=null,elapsedMinutes=null,eventMenu=null}={}){
 const rows=Array.isArray(checkpoints)?checkpoints:[]
 const total=rows.length
 const done=Number.isInteger(completed)?Math.max(0,Math.min(total,completed)):0
 const next=rows[done]||null
 const longPause=Boolean(next&&!next.finish&&Number(next.longBreakMinutes)>0)
 const breakNote=next&&next.finish?'Nach dieser Runde bist du im Ziel.':
  longPause?'Nach dieser Runde: längere Pause für Kleidung und Schuhe.':
  next?'Nach dieser Runde: kurze Pause für Trinken und Versorgung.':null
 const plannedMinutes=done>0?Number(rows[done-1]?.arrivalMinutes):0
 const live=Number.isInteger(elapsedMinutes)&&elapsedMinutes>=0&&elapsedMinutes<=2880
 const currentMinute=live?elapsedMinutes:
  Number.isFinite(plannedMinutes)?Math.max(0,plannedMinutes):0
 const gels=Array.isArray(gelEvents)?gelEvents.filter(g=>
  g&&Number.isFinite(g.minute)&&g.minute>=0&&
  typeof g.name==='string'&&typeof g.brand==='string'
 ).sort((a,b)=>a.minute-b.minute):null
 const due=live?gels?.filter(g=>g.minute<=currentMinute&&currentMinute-g.minute<=10).at(-1)||null:null
 const upcoming=gels?.find(g=>g.minute>currentMinute)||null
 const gel=due||upcoming
 const nextAid=Array.isArray(aidEvents)?aidEvents.find(e=>
   next&&e?.round===next.index&&e.planOnly===true)||null:null
 const gelTiming=due?'due':gel?'upcoming':gels===null?'loading':'none'
 const drinkDue=live&&currentMinute>=20&&currentMinute%20<=8
 // Only events in THIS planned lap are eligible for runner recommendations.
 // Including the stop after the lap respects station fueling at checkpoint arrival.
 // We intentionally keep the clock-independent checkpoint plan for the athlete.
 const roundStart=done>0?Number(rows[done-1]?.departureMinutes):0
 const roundEnd=next?Number(next.finish?next.arrivalMinutes:next.departureMinutes):null
 const validRound=Number.isFinite(roundStart)&&Number.isFinite(roundEnd)&&roundEnd>roundStart
 const roundGels=validRound&&gels?
  gels.filter(g=>g.minute>=roundStart&&g.minute<(next.finish?roundEnd+1:roundEnd)):[]
 const nextRoundGel=roundGels.find(g=>live&&g.minute>=currentMinute-10)||
  roundGels[0]||null
 const nextRoundGelIsDue=Boolean(live&&nextRoundGel&&
  nextRoundGel.minute<=currentMinute&&currentMinute-nextRoundGel.minute<=10)
 const roundGelCarbsG=Math.round(roundGels.reduce((sum,g)=>
  sum+(Number.isFinite(g.carbsG)?g.carbsG:0),0)*10)/10
 // Real long stops permit a calm, tolerated solid portion; short stops
 // favor small snacks. These are suggestions only, never an event menu.
 const foodIdeas=['halbes Brötchen','Banane oder etwas Salzgebäck']
 const ideaOffset=Math.max(0,Math.floor(((next?.index??1)-2)/2))
 const latePhase=Number(next?.arrivalMinutes)>=600
 const suggestedFood=longPause?
  (latePhase?'kleine Portion Nudeln, wenn gut verträglich':'kleine Portion Nudeln'):
  foodIdeas[ideaOffset%foodIdeas.length]
 const menuSuggestion=suggestEventFood(eventMenu,{
  round:next?.index||0,longPause,arrivalMinutes:next?.arrivalMinutes
 })
 const foodConfirmed=Boolean(nextAid&&typeof nextAid.foodName==='string'&&
  nextAid.foodName.trim())
 const food=foodConfirmed?nextAid.foodName.trim():
  menuSuggestion?.primary||suggestedFood
 const foodCarbsCounted=Boolean(foodConfirmed&&Number(nextAid?.foodCarbsG)>0)
 const gelName=nextRoundGel?nextRoundGel.brand+' · '+nextRoundGel.name:null
 // Never silently replace a counted gel with food of unknown quantity.
 const primaryKind=gelName?'gel':'food'
 const primary=gelName||food
 const otherFood=menuSuggestion?.alternative||
  (longPause?'halbes Brötchen':foodIdeas[(ideaOffset+1)%foodIdeas.length])
 const alternative=gelName?food:otherFood
 const alternativeKind='food'
 const foodIsAdditional=Boolean(gelName&&foodCarbsCounted)
 const drink=nextAid?.drinkMl>0?
  nextAid.drinkMl+' ml '+nextAid.drinkName:
  menuSuggestion?'Wasser oder MAURTEN Carbdrink – Variante/Portion prüfen':
  'Wasser oder Maurten Drink Mix – Portion vor Ort prüfen'
 const meal={primary,primaryKind,alternative,alternativeKind,
  foodConfirmed,foodCarbsCounted,foodIsAdditional,
  foodAvailableAtEvent:Boolean(menuSuggestion),
  availabilityNote:menuSuggestion?.sideNote||null,
  drink,drinkConfirmed:Boolean(nextAid?.drinkMl>0),
  caffeineMg:gelName?Number(nextRoundGel.caffeineMg)||0:0,
  gelScheduled:Boolean(gelName),gelDue:nextRoundGelIsDue,
  plannedGelCount:roundGels.length,plannedGelCarbsG:roundGelCarbsG,
  additionalGelNames:roundGels.filter(g=>g!==nextRoundGel)
   .map(g=>g.brand+' · '+g.name),
  plannedGelMinute:gelName?nextRoundGel.minute:null,
  // For both sources the number is only a planned allowance, not actual intake.
  plannedFoodCarbsG:foodCarbsCounted?Number(nextAid.foodCarbsG):0,
  plannedDrinkCarbsG:nextAid&&Number.isFinite(nextAid.drinkCarbsG)?
   nextAid.drinkCarbsG:0,
  planOnly:true}
 return {total,completed:done,remaining:total-done,
  nextIndex:next?.index??null,finished:total>0&&done===total,
  longPause,breakNote,gel,gelTiming,drinkDue,nextAid,meal:next?meal:null,
  timingSource:live?'clock':'approximate',planOnly:true}
}
