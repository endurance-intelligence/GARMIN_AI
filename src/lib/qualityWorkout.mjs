/** One conservative standalone quality template. Never estimate threshold pace.
 * The same specification is used by the planner, preview and server serializer. */
import {normalizeGarminRpe} from './garminPerception.mjs'
import {savedQualityIntent} from './trainingIntent.mjs'
export const QUALITY_SESSION=Object.freeze({kind:'intervals',minutes:36,warmup:12,repeats:4,effort:2,recovery:2,cooldown:10,title:'Qualität · 4 × 2 Min. kontrollierte Intervalle'})
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const monday=d=>shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7))
const run=a=>/run|jog|trail|treadmill/i.test(String(a.sport_type||''))
const openEasy=d=>d?.kind==='easy'&&d.sport==='running'&&d.approvable&&!d.decision&&!d.selectedGroup&&d.intensityIntent==='low'
/** Replace an open easy slot, not a club commitment or a long run. A club
 * quality candidate gets precedence. Require a stable four-week assessment,
 * quantified weekly basis, three OTHER easy exposures, no recent hard load. */
export function proposeStandaloneQuality(days,{today,boards=[],plans=[],roadmap=[],budget,polarized,protectedPhase=false,volumeStatus}={}){
 if(!Array.isArray(days)||!today||protectedPhase||volumeStatus!=='progress'||polarized?.status!=='easy-first'||polarized.qualityDay)return {days,date:null}
 const start=monday(today),end=shift(start,6),week=roadmap.find(w=>w.start===start)
 if(!week||week.qualityOptions!==1||!budget?.target||!budget.paceSeconds||budget.actualKm===null||budget.forecastKm===null||budget.forecastKm>budget.target.high)return {days,date:null}
 if(plans.some(p=>p.training_date>=start&&p.training_date<=end&&savedQualityIntent(p)))return {days,date:null}
 const recent=boards.flatMap(b=>b.activities||[]).filter(a=>String(a.start_time_local||'').slice(0,10)>=shift(today,-6)&&String(a.start_time_local||'').slice(0,10)<=today)
 const easyActual=new Set(recent.filter(a=>run(a)&&a.duration_s>=1200&&normalizeGarminRpe(a.rpe_raw)!==null&&normalizeGarminRpe(a.rpe_raw)<=4).map(a=>String(a.start_time_local).slice(0,10)))
 if(recent.some(a=>/football|soccer/i.test(a.sport_type)||normalizeGarminRpe(a.rpe_raw)>=7))return {days,date:null}
 if(days.some(d=>d.date>=today&&d.date<=end&&(d.selectedGroup&&/track|intervall|bahn|fußball|football/i.test(d.selectedGroup.title)||d.intensityIntent==='hard-option')))return {days,date:null}
 const d=days.find(d=>openEasy(d)&&d.date>=today&&d.date<=end&&d.minutes>=QUALITY_SESSION.minutes&&
  new Set([...easyActual,...days.filter(x=>x.date!==d.date&&x.date>=today&&x.date<=end&&openEasy(x)).map(x=>x.date)]).size>=3&&
  !days.some(x=>Math.abs(Date.parse(x.date+'T12:00:00Z')-Date.parse(d.date+'T12:00:00Z'))===86400000&&
   (['long','race','existing'].includes(x.kind)||x.selectedGroup||x.kind==='option'&&/track|intervall|bahn|football|fußball/i.test(x.title))))
 if(!d)return {days,date:null}
 return {date:d.date,days:days.map(x=>x===d?{...d,kind:QUALITY_SESSION.kind,title:QUALITY_SESSION.title,minutes:QUALITY_SESSION.minutes,intensityIntent:'hard-option',
 reason:'Stabile dokumentierte Laufbasis und ausreichend lockere Einheiten. Statt des offenen lockeren Laufs: 12 Min. einlaufen, 4 × 2 Min. zügig und kontrolliert, dazwischen 3 × 2 Min. locker traben, 10 Min. auslaufen. Kein Sprint und keine Ausbelastung. Nur symptomfrei und gut erholt; bei ungewöhnlicher Belastung abbrechen. Kein zusätzlicher Lauf und keine automatische Freigabe.'}:x)}
}
