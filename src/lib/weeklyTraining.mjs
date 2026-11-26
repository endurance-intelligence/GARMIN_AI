/** ISO-week mileage accounting. Only actual runs count as completed km.
 * Forecasts are conditional estimates, never a prescription or a catch-up target. */
import {normalizeGarminRpe} from './garminPerception.mjs'
const RUN=new Set(['running','track_running','treadmill_running','ultra_run','trail_running','virtual_running'])
const finite=x=>typeof x==='number'&&Number.isFinite(x)
const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(Date.parse(s+'T12:00:00Z')).toISOString().slice(0,10)===s
const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
export const weekStart=d=>add(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))
const dayOf=a=>String(a?.start_time_local||'').slice(0,10)
const round=n=>Math.round(n*10)/10
const down=n=>Math.floor(n*10+1e-8)/10
const median=xs=>{const s=[...xs].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):null}
function actualRuns(boards,today){
 const map=new Map()
 for(const b of boards||[])for(const a of b?.activities||[]){
  if(!RUN.has(a?.sport_type)||!valid(dayOf(a))||dayOf(a)>today||a.activity_id==null||!String(a.activity_id))continue
  const id=String(a.activity_id),old=map.get(id)
  if(!old||(!finite(old.distance_m)&&finite(a.distance_m)))map.set(id,a)
 }
 return [...map.values()]
}
/** Sustainable reference excludes explicitly recorded race weeks and requires
 * three measured completed ISO weeks; no conversion from other sports. */
export function trainingWeekBaseline(history,raceDates=[]){
 const rows=(history?.weeks||[]).slice(0,4).filter(w=>w?.available&&finite(w.distanceKm)&&w.distanceKm>=0&&valid(w.start)&&valid(w.end)&&!raceDates.some(d=>valid(d)&&d>=w.start&&d<=w.end))
 if(rows.length<3)return null
 const base=median(rows.map(w=>w.distanceKm))
 if(base===null||base<5)return null
 return round(Math.min(base,rows[0].distanceKm*1.1))
}
function easyPace(runs,today,raceDates){
 const samples=runs.filter(a=>dayOf(a)>=add(today,-28)&&!raceDates.includes(dayOf(a))&&finite(a.distance_m)&&a.distance_m>=2000&&finite(a.duration_s)&&a.duration_s>=900&&a.duration_s<=9000&&normalizeGarminRpe(a.rpe_raw)!==null&&normalizeGarminRpe(a.rpe_raw)<=4)
  .map(a=>a.duration_s*1000/a.distance_m).filter(p=>p>=180&&p<=1200).sort((a,b)=>a-b)
 // Use the slower quartile to avoid optimistic distance forecasts.
 return samples.length>=3?Math.round(samples[Math.ceil(samples.length*.75)-1]):null
}
function plannedKm(plan,pace){
 const a=plan?.archive_snapshot
 if(!a||a.sourceKind!=='coach'||!['easy','long','return_easy'].includes(a.coachKind)||!pace)return null
 const steps=a.group?.steps
 if(!Array.isArray(steps)||!steps.length||!steps.every(s=>s.endMode==='time'&&finite(s.durationSeconds)&&s.durationSeconds>0)||!finite(a.warmup?.durationSeconds)||!finite(a.cooldown?.durationSeconds)||a.warmup.durationSeconds<0||a.cooldown.durationSeconds<0)return null
 const sec=a.warmup.durationSeconds+a.cooldown.durationSeconds+steps.reduce((n,s)=>n+s.durationSeconds,0)
 return sec>=600&&sec<=14400?down(sec/pace):null
}
const eligibleRun=d=>d?.sport==='running'&&['easy','long','return_easy'].includes(d.kind)&&d.approvable&&!d.decision&&!d.selectedGroup&&finite(d.minutes)&&d.minutes>0
export function buildWeeklyBudget({today,start,days=[],boards=[],plans=[],roadmap=[],protectedPhase=false,raceDates=[],rhythm=null}={}){
 if(!valid(today)||!valid(start))return null
 const end=add(start,6),current=weekStart(today)===start
 const week=roadmap.find(w=>w.start===start)
 const target=!protectedPhase&&week?.targetKm&&finite(week.targetKm.low)&&finite(week.targetKm.high)&&week.targetKm.low<=week.targetKm.high?week.targetKm:null
 const source=boards.find(b=>b?.start===start&&Array.isArray(b.activities)&&Array.isArray(b.manual))
 const runs=actualRuns(boards,today),actual=runs.filter(a=>dayOf(a)>=start&&dayOf(a)<=end)
 const knownActual=!!source&&actual.every(a=>finite(a.distance_m)&&a.distance_m>=0)
 const actualKm=knownActual?round(actual.reduce((n,a)=>n+a.distance_m,0)/1000):null
 const exactActual=knownActual?actual.reduce((n,a)=>n+a.distance_m,0)/1000:null
 const pace=easyPace(runs,today,raceDates)
 const occupied=new Set((source?.activities||[]).filter(a=>valid(dayOf(a))&&dayOf(a)<=today).map(dayOf))
 for(const a of source?.manual||[])if(valid(a.session_date)&&a.session_date<=today)occupied.add(a.session_date)
 const future=d=>d>=today&&d>=start&&d<=end&&!occupied.has(d)
 const saved=plans.filter(p=>p?.state!=='cancelled'&&valid(p.training_date)&&future(p.training_date))
 const savedDates=new Set(saved.map(p=>p.training_date))
 const savedRuns=saved.filter(p=>p.sport==='running'&&['draft','pending','confirmed'].includes(p.state))
 const savedParts=savedRuns.map(p=>({date:p.training_date,km:plannedKm(p,pace),state:p.state}))
 // Multiple records on one date cannot safely be added to this one-slot forecast.
 const savedKnown=savedParts.filter(p=>p.km!==null&&savedRuns.filter(s=>s.training_date===p.date).length===1)
 const proposed=days.filter(d=>future(d.date)&&!savedDates.has(d.date)&&eligibleRun(d))
 const proposedParts=proposed.map(d=>({date:d.date,km:pace?down(d.minutes*60/pace):null,minutes:d.minutes}))
 const approvedKm=down(savedKnown.filter(p=>p.state!=='draft').reduce((n,p)=>n+p.km,0))
 const draftKm=down(savedKnown.filter(p=>p.state==='draft').reduce((n,p)=>n+p.km,0))
 const suggestedKm=down(proposedParts.reduce((n,p)=>n+(p.km??0),0))
 const unknownGroup=days.filter(d=>future(d.date)&&!savedDates.has(d.date)&&(d.selectedGroup||['option','chosen'].includes(d.kind))&&/run|track|lauf|bahn|intervall/i.test(d.selectedGroup?.title||d.title||'')).length
 const missingDays=Array.from({length:7},(_,i)=>add(start,i)).filter(d=>future(d)&&!savedDates.has(d)&&!days.some(x=>x.date===d)).length
 const unknown=savedRuns.length-savedKnown.length+proposedParts.filter(p=>p.km===null).length+unknownGroup+missingDays
 const forecast=exactActual===null?null:down(exactActual+approvedKm+draftKm+suggestedKm)
 const manual=source?.manual||[],weekActivities=(source?.activities||[]).filter(a=>dayOf(a)>=start&&dayOf(a)<=end&&dayOf(a)<=today)
 const distinctDays=kind=>new Set([...weekActivities.filter(a=>kind==='rowing'?/rowing/i.test(a.sport_type):/strength|weight|mobility|pilates|yoga/i.test(a.sport_type)).map(dayOf),...manual.filter(a=>a.session_date>=start&&a.session_date<=end&&a.session_date<=today&&(kind==='rowing'?a.kind==='rowing':/strength|mobility/i.test(a.kind))).map(a=>a.session_date)]).size
 const phase=protectedPhase?(week?.phase==='recovery'||week?.phase==='race'||week?.phase==='taper'?week.phase:'paused'):week?.phase||'unknown'
 const labels={paused:'Erholung / Belastung prüfen',recovery:'Regeneration',race:'Rennwoche',taper:'Tapering',unknown:'Planungsbasis fehlt'}
 return {start,end,current,phase,phaseLabel:labels[phase]||week?.phaseLabel||'Planungsbasis fehlt',target,actualKm,approvedKm,draftKm,suggestedKm,forecastKm:forecast,unknown,paceSeconds:pace,proposedParts,
  gapKm:target&&forecast!==null?round(Math.max(0,target.low-forecast)):null,
  longRunMinutes:target?week?.longRunMinutes??null:null,longestActualMinutes:source?Math.round(Math.max(0,...actual.filter(a=>finite(a.duration_s)).map(a=>a.duration_s))/60):null,
  qualityOptions:target?week?.qualityOptions??0:0,
  rowingDays:source?distinctDays('rowing'):null,strengthDays:source?distinctDays('strength'):null,
  rowingTarget:rhythm?.rowing?.days?.length??null,strengthTarget:rhythm?.strength?.days?.length??null,
  focus:target?week?.focus||'Laufspezifischen Umfang bewusst sichern.':'Erholung oder fehlende Planungsdaten haben Vorrang. Kein Kilometerziel erzwingen.'}
}
export function replacementImpact(budget,date){
 const part=budget?.proposedParts.find(p=>p.date===date)
 const removed=part?.km??null
 const after=removed!==null&&budget?.forecastKm!==null?down(Math.max(0,budget.forecastKm-removed)):null
 // Only the current ISO week is actionable with the rolling Coach horizon.
 // Unknown km are never credited; other open suggestions are conditional.
 const allowed=!!budget?.current&&!!budget.target&&budget.actualKm!==null&&removed!==null&&after!==null&&after>=budget.target.low
 return {allowed,removedKm:removed,afterKm:after,reason:allowed?'Der untere Wochenrichtwert bleibt in der bekannten Prognose erreichbar.':'Laufumfang schützen: Der untere Wochenrichtwert ist nach dem Wechsel nicht ausreichend belegt.'}
}
/** Apply rhythm replacements sequentially, preventing two individually plausible
 * changes from jointly removing too much running. Preserve protected/free slots. */
export function protectRhythmReplacements(original,proposed,budgetFor){
 const result=[...original]
 for(let i=0;i<proposed.length;i++){
  const old=original[i],next=proposed[i]
  if(eligibleRun(old)&&!eligibleRun(next)){
   const impact=replacementImpact(budgetFor(result,old.date),old.date)
   if(!impact.allowed){
    result[i]={...old,rhythm:next.rhythm?.map(e=>e.status==='suggested'?{...e,status:'paused',reason:impact.reason}:e),reason:old.reason+' '+impact.reason}
    continue
   }
  }
  result[i]=next
 }
 return result
}
