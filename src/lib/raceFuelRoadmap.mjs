/**
 * GARMIN_AI race fuel road map — read-only plan, never actual consumption.
 * One row per explicitly entered race checkpoint; never invent aid stations
 * or count unconfirmed on-course food, drink or caffeine.
 *
 * This is guidance on when to favor small snacks or use a scheduled longer
 * stop for tolerated solids, not a physiological prescription.
 */
import {buildRunnerFocus} from './raceRunnerFocus.mjs'

const finite=x=>typeof x==='number'&&Number.isFinite(x)
const one=x=>Math.round(x*10)/10

export function buildRaceFuelRoadmap({
 checkpoints=[],gelEvents=null,aidEvents=null
}={}){
 if(!Array.isArray(checkpoints)||!checkpoints.length||
    checkpoints.length>100||checkpoints.some((r,i)=>
     !Number.isInteger(r?.index)||r.index!==i+1||
     !finite(r.arrivalMinutes)||!finite(r.departureMinutes)||
     r.arrivalMinutes<0||r.departureMinutes<r.arrivalMinutes))
  return {status:'missing',rounds:[],planOnly:true}

 const rounds=checkpoints.map((c,i)=>{
  const focus=buildRunnerFocus({checkpoints,completed:i,
   gelEvents,aidEvents,elapsedMinutes:null})
  const meal=focus.meal
  const phase=c.arrivalMinutes<240?'early':c.arrivalMinutes<600?'middle':'late'
  const breakType=c.finish?'finish':
   Number(c.longBreakMinutes)>0?'long':'short'
  const phaseName=phase==='early'?'Frühe Phase':
   phase==='middle'?'Mittlere Phase':'Späte Phase'
  const pauseName=breakType==='finish'?'Ziel':
   breakType==='long'?'Lange Pause':'Kurze Pause'
  const coachHint=breakType==='finish'?
    'Zielrunde: Verpflegung danach nach Bedarf, keine zusätzliche Station angenommen.':
   breakType==='long'?
    phase==='late'?
     'Lange Pause: Schuhe/Kleidung prüfen, nur leichte verträgliche Portion, nichts erzwingen.':
     'Lange Pause: Schuhe/Kleidung prüfen und etwas mehr feste Nahrung (z. B. Nudeln), falls erprobt und angeboten.':
   phase==='late'?
    'Kleine, gut verträgliche Portion wählen; nichts Neues ausprobieren.':
    'Kleiner Snack oder Getränk; geplante Gels bleiben im Plan.'
  const gelCaffeine=Array.isArray(gelEvents)&&meal?.plannedGelCount?
   gelEvents.filter(g=>{
    const from=i===0?0:checkpoints[i-1].departureMinutes
    const to=c.finish?c.arrivalMinutes+1:c.departureMinutes
    return g&&finite(g.minute)&&g.minute>=from&&g.minute<to&&
      finite(g.caffeineMg)&&g.caffeineMg>0
   }).reduce((sum,g)=>sum+g.caffeineMg,0):0
  const gelCarbsG=meal?.plannedGelCarbsG||0
  const foodCarbsG=meal?.plannedFoodCarbsG||0
  const drinkCarbsG=meal?.plannedDrinkCarbsG||0
  const knownCarbsG=one(gelCarbsG+foodCarbsG+drinkCarbsG)
  const sourceStatus=gelEvents===null&&aidEvents===null?'loading':
    meal?.foodConfirmed||meal?.drinkConfirmed||meal?.gelScheduled?'partial':'unconfirmed'
  return {
   round:c.index,finish:Boolean(c.finish),phase,phaseName,
   breakType,pauseName,coachHint,arrivalMinutes:c.arrivalMinutes,
   pauseMinutes:Number(c.pauseMinutes)||0,
   primary:meal?.primary||null,primaryKind:meal?.primaryKind||null,
   alternative:meal?.alternative||null,
   foodConfirmed:Boolean(meal?.foodConfirmed),
   foodIsAdditional:Boolean(meal?.foodIsAdditional),
   gelNames:meal?.gelScheduled?
    [meal.primary,...meal.additionalGelNames]:[],
   gelCount:meal?.plannedGelCount||0,
   gelCarbsG:one(gelCarbsG),foodCarbsG:one(foodCarbsG),
   drinkCarbsG:one(drinkCarbsG),knownCarbsG,
   caffeineMg:gelCaffeine,drink:meal?.drink||null,
   sourceStatus,planOnly:true
  }
 })
 return {
  status:'ready',rounds,
  totals:{
   rounds:rounds.length,
   longStops:rounds.filter(r=>r.breakType==='long').length,
   gelCount:rounds.reduce((sum,r)=>sum+r.gelCount,0),
   gelCarbsG:one(rounds.reduce((sum,r)=>sum+r.gelCarbsG,0)),
   foodCarbsG:one(rounds.reduce((sum,r)=>sum+r.foodCarbsG,0)),
   drinkCarbsG:one(rounds.reduce((sum,r)=>sum+r.drinkCarbsG,0)),
   caffeineMg:one(rounds.reduce((sum,r)=>sum+r.caffeineMg,0))
  },
  note:'Nur Planung: Keine Portion als konsumiert verbucht. Speisen nur, wenn verfügbar und verträglich; unbekannte KH zählen nicht.',
  planOnly:true
 }
}
