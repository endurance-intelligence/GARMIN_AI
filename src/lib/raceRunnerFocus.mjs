/**
 * Calm, round-first view for the athlete. Checkpoint distances and time budgets
 * remain available to the crew, but are never exposed by this model.
 * Consumption is not assumed and GPS distance cannot advance the round count.
 */
export function buildRunnerFocus({checkpoints=[],completed=0,gelEvents=null,elapsedMinutes=null}={}){
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
 const gelTiming=due?'due':gel?'upcoming':gels===null?'loading':'none'
 const drinkDue=live&&currentMinute>=20&&currentMinute%20<=8
 return {total,completed:done,remaining:total-done,
  nextIndex:next?.index??null,finished:total>0&&done===total,
  longPause,breakNote,gel,gelTiming,drinkDue,
  timingSource:live?'clock':'approximate',planOnly:true}
}
