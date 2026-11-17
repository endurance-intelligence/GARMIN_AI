import {coachAddDays,coachMonday} from './coachSevenDay.mjs'
import {analyzeWorkoutFeedbackTrend} from './feedbackTrend.mjs'

const DAY=86400000
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(Date.parse(s+'T12:00:00Z'))&&
 new Date(Date.parse(s+'T12:00:00Z')).toISOString().slice(0,10)===s
const between=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/DAY)
const number=(n,lo,hi)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi
const round5=n=>Math.max(0,Math.round(n/5)*5)
const phaseForDays=days=>{
 if(days<0)return 'recovery'
 if(days===0)return 'race'
 if(days<=10)return 'taper'
 if(days<=21)return 'peak'
 if(days<=56)return 'specific'
 if(days<=98)return 'build'
 return 'base'
}
const phaseName={
 base:'Grundlage',build:'Aufbau',specific:'Rennspezifisch',peak:'Letzter Trainingsblock',
 taper:'Tapering',race:'Rennwoche',recovery:'Erholung',paused:'Pause'
}
const brief={
 base:'Regelmäßig locker laufen, Kraft und Beweglichkeit beibehalten.',
 build:'Umfang behutsam aufbauen, mit genug Erholung dazwischen.',
 specific:'Wettkampfähnliche Belastung und Verpflegung kontrolliert üben.',
 peak:'Letzte sinnvolle längere Reize; nicht mehr alles nachholen.',
 taper:'Training reduzieren und frisch an die Startlinie kommen.',
 race:'Dein Hauptziel steht an. Ausruhen, packen und die Anreise organisieren.',
 recovery:'Nach dem Rennen erholen. Wiedereinstieg nach deinem Befinden planen.',
 paused:'Gesundheit und Verfügbarkeit haben Vorrang.'
}
const startOfWeek=day=>coachMonday(day)
export function buildLongTermCoachPlan({today,goal,health,life}){
 if(!validDate(today))throw Error('Ungültiges Coach-Datum')
 const target=goal?.goal||null
 const raceDate=validDate(target?.race_date)?target.race_date:null
 const name=typeof target?.race_name==='string'?target.race_name.trim():''
 const distance=Number(target?.distance_km)
 const ultra=number(distance,42,500)
 const kind=ultra?'Ultra':number(distance,15,41.99)?'Langer Lauf':'Lauf'
 const training=health?.training||null
 const baseKm=number(training?.runKm7,5,180)&&
  !training?.truncated&&training.historyStatus==='complete'?
   Math.round((training.runKm7+
    (number(training.previousRunKm7,5,180)?training.previousRunKm7:training.runKm7))/2):null
 const feedback=analyzeWorkoutFeedbackTrend(life?.context?.post_workout_feedback,today)
 const sick=life?.context?.illness_state==='sick'
 const returning=life?.context?.illness_state==='returning'
 const blocks=Array.isArray(life?.context?.blocked_periods)?life.context.blocked_periods:[]
 const notes=[]
 if(baseKm===null)notes.push('Für konkrete Wochenumfänge brauchen wir eine vollständige Garmin-Trainingshistorie.')
 if(sick)notes.push('Krank-/Beschwerdenmodus: bis zur Genesung kein Trainingsaufbau.')
 if(returning)notes.push('Wiedereinstieg: Belastung nur vorsichtig und nach deinem Feedback steigern.')
 if(feedback.kind==='reduce'||feedback.kind==='shorten')
  notes.push('Dein Feedback aus den letzten 14 Tagen spricht für einen vorsichtigeren Aufbau.')
 if(!raceDate||between(today,raceDate)<-14)return {
  raceName:name||null,raceDate,baselineKm:baseKm,weeks:[],hasGoal:false,
  message:'Bitte zuerst ein aktuelles Hauptziel setzen. Danach entsteht dein individueller Trainingsfahrplan.',
  notes,period:'12 Wochen',source:'Garmin + Ziel + deine Rückmeldungen'}
 const monday=startOfWeek(today)
 const weeks=[]
 const raceOffset=between(today,raceDate)
 for(let i=0;i<12;i++){
  const start=coachAddDays(monday,i*7)
  const end=coachAddDays(start,6)
  const toRace=between(start,raceDate)
  const fromRace=between(raceDate,start)
  const raceWeek=raceDate>=start&&raceDate<=end
  // Two protected recovery weeks after a near-term race. No invented next goal.
  if(fromRace>14)break
  let phase=raceWeek?'race':end<raceDate?phaseForDays(between(end,raceDate)):'recovery'
  if(raceWeek)phase='race'
  let focus=brief[phase]||brief.base
  let key=phase==='specific'?'Versorgung und Tempo für '+(name||'dein Rennen')+' testen':
   phase==='build'?'Konstanz und ruhigen Umfang aufbauen':
   phase==='peak'?'Qualität vor Quantität':
   phase==='base'?'Lockere Ausdauer und Stabi':
   phase==='race'?'Start frisch, nicht erschöpft':
   phase==='taper'?'Entlasten statt Kilometer sammeln':
   'Erholen und Körpergefühl überprüfen'
  if(ultra&&phase==='specific')
   focus='Zeit auf den Beinen, Lauf-/Gehstrategie und Verpflegung kontrolliert testen.'
  if(ultra&&phase==='peak')focus='Keine neuen Extremumfänge. Bestehende lange Einheiten gut erholen.'
  const unavailable=blocks.some(b=>validDate(b.start)&&validDate(b.end)&&b.start<=end&&b.end>=start)
  const hold=sick||unavailable||(returning&&i<2)||((feedback.kind==='reduce')&&i<2)
  let targetKm=null,longRunMinutes=null
  if(baseKm!==null&&!hold&&!['race','recovery'].includes(phase)){
   // A rolling 3+1-week cycle with deliberate deload. These are indicative bands,
   // not exact prescriptions and never a guaranteed safe increase.
   const group=Math.floor(i/4),slot=i%4
   const multiplier=slot===3?(0.80+group*.04):
    Math.min(1.24,1+group*.055+slot*.035)
   const phaseFactor=phase==='taper'?0.60:phase==='peak'?0.91:1
   const base=baseKm*multiplier*phaseFactor
   targetKm={
    low:Math.max(0,Math.round(base*.87)),
    high:Math.max(0,Math.round(base*1.05))
   }
   if(phase!=='taper'){
    // Long-run time depends on the current reliable running base, never on race distance.
    const longBase=baseKm>=40?75:baseKm>=25?65:45
    longRunMinutes=round5(Math.min(110,longBase+Math.min(i,8)*4))
    if(slot===3)longRunMinutes=round5(longRunMinutes*.76)
    if(phase==='peak')longRunMinutes=Math.min(longRunMinutes,90)
   }else longRunMinutes=30
  }
  if(slotIsRecovery(i)&&!['race','recovery','taper'].includes(phase)){
   key='Entlastungswoche · leichter als die Wochen davor'
   focus='Weniger Umfang und Zeit für Regeneration – kein Rückschritt.'
  }
  if(unavailable){phase='paused';focus=brief.paused;key='Eingetragene Pause / nicht verfügbar'}
  if(sick){phase='paused';focus=brief.paused;key='Gesundheit vor Training'}
  if(returning&&i<2){phase='paused';focus='Wiedereinstieg langsam angehen; erst nach Feedback steigern.';key='Wiedereinstieg'}
  if(feedback.kind==='reduce'&&i<2&&!sick&&!unavailable&&!returning){
   phase='paused';focus='Mehrere belastende Einheiten gemeldet. Kein neuer Umfangsvorschlag.';key='Feedback zuerst prüfen'
  }
  weeks.push({index:i+1,start,end,phase,phaseLabel:phaseName[phase],
   focus,key,targetKm,longRunMinutes,kind,
   isCurrent:i===0,isRaceWeek:raceWeek,
   status:hold?'caution':raceWeek?'race':'draft'})
  if(raceWeek)notes.push('Rennwoche: kein Kilometerziel aus dem normalen Training ableiten.')
 }
 if(raceOffset>=0&&raceOffset<=14)notes.push(
  'Nach dem Rennen hat Erholung Vorrang. Ein neuer Aufbau entsteht erst mit dem nächsten Ziel.')
 return {
  raceName:name||null,raceDate,baselineKm:baseKm,weeks,hasGoal:true,
  message:'Grober Fahrplan für dein Ziel. Die konkreten nächsten sieben Tage entscheidet der Coach mit dir.',
  notes:[...new Set(notes)],period:'Bis zu 12 Wochen',
  source:'Garmin + Hauptziel + deine Rückmeldungen'
 }
}
function slotIsRecovery(index){return index%4===3}
