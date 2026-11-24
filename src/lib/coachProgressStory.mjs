/**
 * Progress story: a read-only projection of EXISTING goal and four-week
 * evidence. No duplicate Garmin parsing, historical queries or fitness score.
 * Only completed ISO weeks count. Missing history stays unknown.
 */
import {analyzeGoalProgress} from './goalProgress.mjs'
import {analyzeCoachFourWeeks} from './coachFourWeeks.mjs'

const round=n=>Math.round(n*10)/10
const finite=n=>typeof n==='number'&&Number.isFinite(n)
export function buildCoachProgressStory({today,snapshot}={}){
 if(!snapshot||typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today)||
  !Array.isArray(snapshot.boards)||!Array.isArray(snapshot.plans?.entries))return null
 let goalReview
 try{goalReview=analyzeGoalProgress({
  today,goal:snapshot.goal,boards:snapshot.boards,health:snapshot.health
 })}catch{return null}
 const history=analyzeCoachFourWeeks({
  today,boards:snapshot.boards,plans:snapshot.plans,life:snapshot.life
 })
 const weeks=goalReview.weeks.map(w=>({
  start:w.start,end:w.end,km:finite(w.km)?w.km:null,
  available:w.available,runDays:w.runDays
 }))
 const knownWeeks=weeks.filter(w=>w.available&&w.km!==null).length
 // The existing goal-progress analyzer validates Garmin's history completeness
 // and all four activity lists before exposing aggregate counts and totals.
 const complete=goalReview.totalKm!==null&&
  goalReview.activeWeeks!==null&&goalReview.runDays!==null&&
  weeks.length===4&&knownWeeks===4
 const activeWeeks=complete?goalReview.activeWeeks:null
 const totalKm=complete?goalReview.totalKm:null
 const runDays=complete?goalReview.runDays:null
 const longest=goalReview.longest&&finite(goalReview.longest.minutes)?
  {minutes:goalReview.longest.minutes,distanceKm:goalReview.longest.distanceKm,
   date:goalReview.longest.date}:null
 let previousTwoKm=null,recentTwoKm=null,percentChange=null,trend='unknown'
 const ultraAfterRace=goalReview.afterRace&&
  goalReview.distanceKm!==null&&goalReview.distanceKm>=42.195&&
  goalReview.raceDate>=goalReview.window.start&&
  goalReview.raceDate<=goalReview.window.end
 if(complete&&!ultraAfterRace){
  previousTwoKm=round(weeks[0].km+weeks[1].km)
  recentTwoKm=round(weeks[2].km+weeks[3].km)
  // When the first two weeks contain almost no running, percentages are
  // mathematically misleading. Report a factual observed sum instead.
  if(previousTwoKm>=20){
   percentChange=Math.round((recentTwoKm/previousTwoKm-1)*100)
   trend=percentChange>15?'higher':percentChange< -15?'lower':'similar'
  }else trend='low-baseline'
 }else if(ultraAfterRace)trend='race-outlier'
 const trendText=!complete?
  'Noch kein vollständiger Vierwochenvergleich. Fehlende Wochen oder Entfernungen werden nicht als null Kilometer gezählt.':
  ultraAfterRace?
   'Ein Ultra-Wettkampf liegt im Vergleichszeitraum. Der Umfang wird deshalb nicht als normale Fitnessentwicklung interpretiert.':
  trend==='low-baseline'?
   'In den ersten beiden Wochen lagen weniger als 20 Laufkilometer. Ein Prozenttrend wäre irreführend.':
  'Frühere zwei Wochen: '+previousTwoKm.toLocaleString('de-DE',{maximumFractionDigits:1})+
   ' km · jüngere zwei Wochen: '+
   recentTwoKm.toLocaleString('de-DE',{maximumFractionDigits:1})+
   ' km. '+(trend==='higher'?'Der dokumentierte Umfang ist gestiegen.':
   trend==='lower'?'Der dokumentierte Umfang ist gesunken.':
   'Der dokumentierte Umfang liegt auf einem ähnlichen Niveau.')+
   ' Das ist keine Aussage über Tempo oder Fitness.'
 const rpeComplete=history.completeWeeks===4&&history.totalRated!==null&&
  history.totalRuns!==null
 const ratedRuns=rpeComplete?history.totalRated:null
 const totalRuns=rpeComplete?history.totalRuns:null
 const loadNote=history.qualityCaution?
  'Garmin-RPE/Gefühl zeigen in mehreren Wochen hohe Anstrengung. Der Coach sollte keine zusätzliche Intensität allein wegen eines Umfangstrends empfehlen.':
  ratedRuns===null?
   'Die RPE-Bilanz ist unvollständig. Fehlende Garmin-Bewertungen gelten nicht als locker oder positiv.':
   ratedRuns===0?
    'Keine verwertbaren Garmin-RPE- oder Gefühlsbewertungen in den vier abgeschlossenen Wochen.':
    ratedRuns<totalRuns?
     'Nur '+ratedRuns+' von '+totalRuns+' Läufen wurden in Garmin bewertet. Das nicht bewertete Training bleibt unbekannt.':
     'Alle '+totalRuns+' aufgezeichneten Läufe haben eine verwertbare Garmin-Bewertung.'
 const next=goalReview.afterRace?
  'Nach dem Wettkampf steht Erholung vor Leistungssteigerung. Die Tagesempfehlung des Coach hat Vorrang.':
  history.qualityCaution?
   'Mehrere harte Wochen prüfen und zusätzliche Intensität vermeiden. Die bestehende Coach-Empfehlung hat Vorrang.':
  !complete?
   'Garmin-Historie vervollständigen; Leistungsentwicklung erst aus ausreichend vergleichbaren Daten beurteilen.':
   'Für einen fairen Leistungsnachweis Tempo bei ähnlicher HF oder GPS-verifizierte Wiederholungsstrecken vergleichen.'
 return {
  status:complete?'complete':'limited',
  window:goalReview.window,
  weeks,knownWeeks,activeWeeks,totalKm,runDays,longest,
  trend,trendText,previousTwoKm,recentTwoKm,percentChange,
  ratedRuns,totalRuns,loadCaution:history.qualityCaution,loadNote,
  next,
  // Do not synthesize a statement that the athlete is faster.
  performanceStatus:'requires-comparable-runs',
  performanceNote:'Schneller bei ähnlicher Herzfrequenz? Das lässt sich nicht aus Wochenkilometern ableiten. Hierfür dienen die bestehenden FIT- und GPS-verifizierten Vergleiche über 8/12 Wochen.',
  caveat:'Vier abgeschlossene ISO-Wochen · beobachtete Garmin-Läufe, keine Plantermine. Fehlende Daten bleiben unbekannt. Mehr Kilometer sind kein nachgewiesener Fitnessfortschritt. Keine automatische Trainingsänderung.'
 }
}
