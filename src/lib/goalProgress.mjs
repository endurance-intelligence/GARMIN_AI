/**
 * P2 · Goal-specific evidence review.
 * Every number comes from actual Garmin activity-list rows for four fully
 * completed ISO weeks. No proprietary load/readiness score, no made-up
 * intensity-zone percentages, no fitness/race-completion prediction.
 */
import {coachMonday,coachAddDays} from './coachSevenDay.mjs'
import {recentGoalRecovery} from './recentGoalRecovery.mjs'

const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const km=m=>Math.round(m/100)/10
const runSport=s=>typeof s==='string'&&/(run|jog)/i.test(s)
const minutes=s=>Math.round(s/60)
const daySpan=(a,b)=>(Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000
const fmt=(n)=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:1})
const label=(start)=>start.slice(8,10)+'.'+start.slice(5,7)+'.'
const unavailable='Aus diesen Garmin-Daten noch nicht belegbar.'

export function analyzeGoalProgress({today,goal,boards,health,racePortfolio}={}){
 if(!isDate(today))throw Error('Ungültiges Fortschrittsdatum')
 const target=goal?.goal||null
 const raceName=typeof target?.race_name==='string'?target.race_name.trim():''
 const raceDate=isDate(target?.race_date)?target.race_date:null
 const distance=finite(target?.distance_km)&&target.distance_km>0?target.distance_km:null
 const ultra=distance!==null&&distance>=42.195
 const longEvent=distance!==null&&distance>=21.1
 const kind=ultra?'Ultra':longEvent?'Langdistanz':'Lauf'
 const startOfCurrent=coachMonday(today)
 const starts=Array.from({length:4},(_,i)=>coachAddDays(startOfCurrent,-7*(4-i)))
 const selected=(Array.isArray(boards)?boards:[]).filter(b=>b&&typeof b.start==='string')
 const byWeek=new Map(selected.map(b=>[b.start,b]))
 const training=health?.training||null
 const historyReady=training?.historyStatus==='complete'&&!training?.truncated
 const weeks=starts.map(start=>{
  const board=byWeek.get(start)
  const available=!!board&&Array.isArray(board.activities)&&Array.isArray(board.manual)&&
   board.activities.length<250
  if(!available)return {start,end:coachAddDays(start,6),label:label(start),
   available:false,runCount:null,runDays:null,km:null,minutes:null}
  const end=coachAddDays(start,6)
  const unique=new Map()
  for(const activity of board.activities){
   if(!runSport(activity?.sport_type)||!activity?.start_time_local)continue
   const date=String(activity.start_time_local).slice(0,10)
   if(!isDate(date)||date<start||date>end)continue
   const id=activity.activity_id
   if(typeof id!=='string'&&typeof id!=='number')continue
   unique.set(String(id),activity)
  }
  const runs=[...unique.values()]
  const allDistances=runs.every(a=>finite(a.distance_m)&&a.distance_m>=0&&
   (a.distance_m>0||a.duration_s===0))
  const allDurations=runs.every(a=>finite(a.duration_s)&&a.duration_s>0)
  return {start,end,label:label(start),available:true,runCount:runs.length,
   runDays:new Set(runs.map(x=>String(x.start_time_local).slice(0,10))).size,
   km:allDistances?km(runs.reduce((sum,a)=>sum+a.distance_m,0)):null,
   minutes:allDurations?minutes(runs.reduce((sum,a)=>sum+a.duration_s,0)):null}
 })
 const exact=weeks.every(w=>w.available)&&historyReady
 const knownWeeks=weeks.filter(w=>w.available)
 const activeWeeks=knownWeeks.filter(w=>w.runCount>0).length
 const count=knownWeeks.reduce((sum,w)=>sum+(w.runCount||0),0)
 const runDays=knownWeeks.reduce((sum,w)=>sum+(w.runDays||0),0)
 const comparableKm=weeks.every(w=>w.km!==null)&&historyReady
 const totalKm=comparableKm?Math.round(weeks.reduce((sum,w)=>sum+w.km,0)*10)/10:null
 const kmPerWeek=comparableKm?Math.round(totalKm/4*10)/10:null
 const recentTwo=comparableKm?Math.round((weeks[2].km+weeks[3].km)*10)/10:null
 const earlyTwo=comparableKm?Math.round((weeks[0].km+weeks[1].km)*10)/10:null
 const rising=comparableKm&&earlyTwo>=20&&recentTwo>earlyTwo*1.4

 // Longest elapsed Garmin run within these four weeks, not race prediction.
 let longest=null
 const seenIds=new Set()
 for(const week of knownWeeks){
  const board=byWeek.get(week.start)
  for(const a of board.activities){
   if(!runSport(a?.sport_type)||!a?.start_time_local||
    !finite(a.duration_s)||a.duration_s<=0)continue
   const date=String(a.start_time_local).slice(0,10)
   if(date<week.start||date>week.end)continue
   const id=String(a.activity_id||'')
   if(!id||seenIds.has(id))continue
   seenIds.add(id)
   const candidate={date,activityId:id,minutes:minutes(a.duration_s),
    distanceKm:finite(a.distance_m)&&a.distance_m>0?km(a.distance_m):null}
   if(!longest||candidate.minutes>longest.minutes)longest=candidate
  }
 }
 const evidenceLabel=exact?'Vier abgeschlossene Garmin-Wochen':
  'Datenlage eingeschränkt · nur belegte Einheiten'
 const volumeMessage=totalKm!==null?
  fmt(totalKm)+' km Laufumfang in vier abgeschlossenen Wochen, im Mittel '+fmt(kmPerWeek)+' km/Woche.':
  'Der vollständige Laufumfang ist derzeit nicht zuverlässig belegbar.'
 const consistencyMessage=exact?
  activeWeeks+' von 4 Wochen mit Garmin-Läufen, insgesamt '+runDays+' Lauftage.':
  knownWeeks.length+' von 4 Wochen abrufbar. '+runDays+
   ' Lauftage in diesen Wochen dokumentiert; noch keine vollständige Bilanz.'
 const longestMessage=longest?
  'Längster dokumentierter Lauf: '+longest.minutes+' Minuten'+
   (longest.distanceKm!==null?' / '+fmt(longest.distanceKm)+' km':'')+
   ' am '+longest.date.slice(8,10)+'.'+longest.date.slice(5,7)+'.':
  'In den vorhandenen Garmin-Wochen ist keine verlässliche Laufdauer erfasst.'
 const trendMessage=!comparableKm?unavailable:
  rising?'Letzte zwei Wochen mit deutlich mehr Laufkilometern als die ersten beiden. '+
    'Zusätzliche Steigerungen zunächst vorsichtig prüfen.':
   'Erste zwei Wochen: '+fmt(earlyTwo)+' km; letzte zwei Wochen: '+fmt(recentTwo)+
   ' km. Kein eindeutiges Warnsignal allein aus diesem Vergleich.'
 const specificity=ultra?
  'Lauf-/Gehstrategie und Kohlenhydrat-/Trinktraining lassen sich aus '+
   'der Garmin-Aktivitätsliste nicht nachweisen. Ein Rennplan ist noch kein Übungsnachweis.':
  longEvent?
   'Höhenmeter, Streckenprofil und wettkampfspezifische Intensität sind in '+
   'dieser Übersicht nicht ausreichend belegt.':
   'Ob schnelle Wiederholungen und lockere Anteile wirklich unter LT1 bzw. über LT2 '+
   'lagen, lässt sich aus der Aktivitätsliste nicht belegen.'
 const daysToRace=raceDate?daySpan(today,raceDate):null
 const raceSoon=daysToRace!==null&&daysToRace>=0&&daysToRace<=10
 const afterRace=daysToRace!==null&&daysToRace<0
 const recentRecovery=recentGoalRecovery({today,racePortfolio})
 const next=recentRecovery&&!afterRace?recentRecovery.message:afterRace?
  'Das Rennen liegt zurück. Erholung und deinen persönlichen Renn-Check zuerst prüfen.':
  raceSoon?
   'Rennwoche: frisch bleiben, keine fehlenden langen Läufe oder Kilometer nachholen.':
  !exact?
   'Zuerst Garmin-Synchronisierung und fehlende Trainingswochen prüfen. Keine Trainingslücke hineininterpretieren.':
  rising?
   'Den jüngsten Umfang nicht direkt weiter steigern. Erholung und nächste Entlastungswoche prüfen.':
  ultra?
   'Zeit auf den Beinen und Verpflegung im Training gezielt dokumentieren – überwiegend locker trainieren.':
  longEvent?
   'Nächste lockere und längere Einheiten am Ziel ausrichten; mittlere Intensität nicht unnötig häufen.':
   'Lockere Einheiten priorisieren und die Qualitätseinheit gezielt wählen – nicht in jeder Einheit schneller laufen.'
 const pillars=[
  {id:'consistency',title:'Regelmäßigkeit',summary:consistencyMessage,
   detail:'Tatsächliche Garmin-Lauftage; keine angenommenen absolvierten Plan-Einheiten.',
   evidence:exact?'documented':'limited'},
  {id:'longrun',title:ultra?'Zeit auf den Beinen':'Längster Lauf',
   summary:longestMessage,
   detail:ultra?'Ein langer Lauf muss nicht die volle Wettkampfdistanz abbilden.':
    'Keine Aussage über Renntempo oder Leistungsfähigkeit aus einer Einzellänge.',
   evidence:longest?'documented':'limited'},
  {id:'load',title:'Umfang & Entwicklung',
   summary:volumeMessage+' '+trendMessage,
   detail:'Vier vollständige Kalenderwochen – kein Fitness-, Ermüdungs- oder Readiness-Score.',
   evidence:comparableKm?'documented':'limited'},
  {id:'specific',title:ultra?'Ultra-Praxis':longEvent?'Rennspezifik':'Intensitätsverteilung',
   summary:specificity,
   detail:ultra?'Verpflegung und Pausen kannst du in Race Prep planen; '+
    'die Umsetzung im Training wird damit nicht automatisch bestätigt.':
    'Ohne verlässliche Schwellen- und Trainingsdetaildaten keine künstliche Polarisiert-Quote.',
   evidence:'unverified'}
 ]
 return {
  status:!raceDate||!raceName?'missing-goal':exact?'ready':'partial',
  raceName:raceName||null,raceDate,distanceKm:distance,kind,
  window:{start:starts[0],end:coachAddDays(startOfCurrent,-1)},
  weeks,source:'Garmin-Aktivitätsliste / vier abgeschlossene Kalenderwochen',
  evidenceLabel,activeWeeks:exact?activeWeeks:null,
  runCount:exact?count:null,runDays:exact?runDays:null,
  totalKm,kmPerWeek,longest,
  pillars,next,raceSoon,afterRace,
  note:'Das ist ein Nachweis dessen, was Garmin aufgezeichnet hat – '+
   'keine Wettkampfbereitschaft, medizinische Freigabe oder prozentuale Fitness.'
 }
}
