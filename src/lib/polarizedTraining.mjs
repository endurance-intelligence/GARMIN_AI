/**
 * GARMIN_AI training methodology: polarised (Seiler / FitCraft).
 * Use a three-zone model, NOT Garmin's arbitrary five-zone numbers.
 * Low = under LT1 / full-sentence talk test; middle = LT1-LT2; hard = above LT2.
 * These are planning guardrails, not an empirical time-in-zone measurement.
 *
 * Source: https://getfitcraft.com/science/polarized-training-research
 * Secondary: https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2015.00295/full
 */
export const POLARIZED_METHOD={
 id:'polarized',name:'Polarisiertes Training',
 easy:'Unterhalb der ersten Schwelle (LT1): Sprechtempo, ganze Sätze möglich.',
 middle:'Zwischen LT1 und LT2: nur gezielt, nicht als täglicher Dauerlauf.',
 hard:'Oberhalb der zweiten Schwelle (LT2): gezielte harte Intervalle.',
 weeklyRatio:'Ungefähr vier lockere Einheiten je harter Einheit; keine starre Quote.',
 citation:'https://getfitcraft.com/science/polarized-training-research'
}
const dateMs=iso=>Date.parse(String(iso).slice(0,10)+'T12:00:00Z')
const age=(today,day)=>Math.round((dateMs(today)-dateMs(day))/86400000)
const isTrack=day=>/track|intervall|bahnlauf|bahntraining/i.test(String(day.title||''))
const isEasy=day=>['easy','long','return_easy'].includes(day.kind)
const isScheduled=day=>['existing','completed','chosen'].includes(day.kind)
const notCommitted=day=>day&&!day.decision&&!isScheduled(day)&&
 !['race','illness','blocked'].includes(day.kind)
const hasFeedbackWarning=(entries,today)=>Array.isArray(entries)&&entries.some(f=>
 f&&typeof f.activityDate==='string'&&age(today,f.activityDate)>=0&&
 age(today,f.activityDate)<=3&&
 (f.symptoms==='clear'||f.rpe>=8||f.legs==='destroyed'))
const recentSoccer=(boards,today)=>Array.isArray(boards)&&boards.some(board=>
 Array.isArray(board.activities)&&board.activities.some(a=>
  /soccer|football/i.test(String(a.sport_type||''))&&
  age(today,a.start_time_local)>=0&&age(today,a.start_time_local)<=6))
/**
 * Annotates *only* suggested training/club options. Never creates, approves,
 * intensifies or rewrites completed/accepted/calendar sessions.
 */
export function applyPolarizedGuidance(days,ctx={}){
 const today=ctx.today
 if(!Array.isArray(days)||!today)return {days,method:POLARIZED_METHOD,qualityDay:null,
  status:'unavailable',easyCount:0,message:'Keine verlässliche Planung verfügbar.'}
 const raceOffset=typeof ctx.raceDate==='string'?Math.round(
  (dateMs(ctx.raceDate)-dateMs(today))/86400000):null
 const protectedPhase=Boolean(ctx.ill||ctx.returning||ctx.postIllness||
  ctx.caution||ctx.feedbackCaution||ctx.trendReducing||
  ctx.observationLimited||ctx.qualityLocked||
  (raceOffset!==null&&raceOffset>=-14&&raceOffset<=10))
 const hardLoad=recentSoccer(ctx.boards,today)||
  hasFeedbackWarning(ctx.feedback,today)
 const future=days.filter(d=>d.date>=today&&d.date<=shift(today,6))
 const easyCount=future.filter(d=>isEasy(d)&&notCommitted(d)).length
 const chosenTrack=future.find(d=>d.kind==='chosen'&&isTrack(d))
 const qualityCandidates=future.filter(d=>d.kind==='option'&&isTrack(d)&&notCommitted(d))
 // A future selected ORC Track already occupies the possible quality slot,
 // even if the athlete later elects to do that session easy.
 const qualityDay=chosenTrack?chosenTrack.date:
  (!protectedPhase&&!hardLoad&&easyCount>=3?qualityCandidates[0]?.date||null:null)
 const updated=days.map(day=>{
  if(!notCommitted(day)||day.date<today||day.date>shift(today,6))return day
  if(isEasy(day)){
   const extra=day.kind==='long'?
    'Polarisiert: auch der lange Lauf bleibt locker unter LT1 – Sprechtempo.':
    'Polarisiert: locker unter LT1, du kannst ganze Sätze sprechen.'
   return {...day,intensityIntent:'low',reason:day.reason+' '+extra}
  }
  if(day.kind==='option'&&isTrack(day)){
   if(day.date===qualityDay){
    return {...day,intensityIntent:'hard-option',
     reason:day.reason+' Polarisiert: höchstens eine bewusst gewählte harte Einheit '+
      'in dieser Woche; Intervalle oberhalb LT2 statt dauerhaft zügigem Mitteltempo. '+
      'Nur wenn du dich erholt fühlst und die übrigen Läufe wirklich locker bleiben. '+
      'Die tatsächliche ORC-Gruppe und Intervalle müssen vorher geprüft werden.'}
   }
   return {...day,intensityIntent:'low-option',
    reason:day.reason+' Polarisiert: keine zweite harte Bahneinheit. '+
     'Nur locker mitlaufen oder auslassen, wenn Erholung oder Qualitätseinheit bereits '+
     'Belastung erzeugt haben.'}
  }
  if(day.kind==='option'&&/orc run|gruppenlauf/i.test(String(day.title||'')))
   return {...day,intensityIntent:'low-option',
    reason:day.reason+' Polarisiert: als lockeren Sprechtempo-Lauf planen, '+
     'nicht als dauerhaft mittelschnelles Tempo.'}
  return day
 })
 const status=protectedPhase?'protected':hardLoad?'recover':
  chosenTrack?'already-chosen':qualityDay?'optional-hard':'easy-first'
 const message=protectedPhase?
  'Rennphase oder Erholung hat Vorrang. Keine harte Einheit nur wegen der 80/20-Regel.':
  hardLoad?'Nach Fußball oder hoher Belastung keine zusätzliche harte Einheit vorschlagen.':
  chosenTrack?'Du hast einen Bahntag ausgewählt. Keine zweite harte Einheit ergänzen.':
  qualityDay?'Ein möglicher Bahntag für eine harte Einheit; erst nach deiner Auswahl.':
  'Vor allem locker trainieren. Ohne genügend lockere Einheiten keine harte Quote erzwingen.'
 return {days:updated,method:POLARIZED_METHOD,qualityDay,status,easyCount,message}
}
function shift(today,delta){return new Date(dateMs(today)+delta*86400000)
 .toISOString().slice(0,10)}
