import {interpretRecovery,calendarDayOffset} from './recoveryComparison.ts'
import {recoveryWeekTrend} from './recoveryWeekTrend.mjs'
import {analyzeLongTermRecovery} from './longTermRecovery.mjs'
import {completedDaySignal,sleepDetailEvidence} from './recoverySleep.mjs'

const finite=v=>typeof v==='number'&&Number.isFinite(v)
const dateOK=d=>typeof d==='string'&&!!calendarDayOffset(d,0)
const fmt=n=>Math.round(n).toLocaleString('de-DE')
const valid=(v,min,max)=>finite(v)&&v>=min&&v<=max
const flagsFor=r=>{
 const [sleep,hrv,pulse]=r?.metrics||[]
 return [
  !!sleep&&finite(sleep.difference)&&sleep.difference<=-3600,
  !!hrv&&finite(hrv.difference)&&finite(hrv.median)&&hrv.median>0&&hrv.difference/hrv.median<=-.15,
  !!pulse&&finite(pulse.difference)&&pulse.difference>=5
 ]
}
export function coachRecoveryAdvice({today,history=[],plan=null,context=null,training=null,completed=false}={}){
 const rows=[...new Map((Array.isArray(history)?history:[]).filter(r=>dateOK(r?.metric_date)&&r.metric_date<=today).map(r=>[r.metric_date,r])).values()].sort((a,b)=>a.metric_date.localeCompare(b.metric_date))
 const latest=rows.filter(r=>valid(r.sleep_seconds,3*3600,16*3600)||valid(r.hrv_ms,10,250)||valid(r.resting_heart_rate,25,110)).at(-1)
 const report=latest?interpretRecovery(rows,latest.metric_date):null
 const [sleep,hrv,pulse]=report?.metrics||[]
 const comparable=report?.metrics.filter(r=>finite(r.difference)).length||0
 const fresh=latest?.metric_date===today
 const [lowSleep,lowHrv,highPulse]=flagsFor(report)
 const shortSleep=finite(sleep?.latest)&&sleep.latest<6*3600
 const stress=completedDaySignal(rows,today,'stress_avg'),battery=completedDaySignal(rows,today,'body_battery_max')
 const sleepQuality=sleepDetailEvidence(rows,today)
 const elevatedStress=finite(stress?.delta)&&stress.delta>=10,lowBattery=finite(battery?.delta)&&battery.delta<=-15
 const three=[0,-1,-2].map(n=>interpretRecovery(rows,calendarDayOffset(today,n)))
 const persistent=[0,1,2].some(i=>three.filter(r=>flagsFor(r)[i]).length>=2)
 const trend=latest?recoveryWeekTrend(rows,latest.metric_date):null
 const weekHrv=!!trend?.hrv&&trend.hrv.previous>0&&trend.hrv.current<=trend.hrv.previous*.85
 const weekPulse=!!trend?.rhr&&trend.rhr.current>=trend.rhr.previous+5
 const weekSleep=!!trend?.sleep&&trend.sleep.current<=trend.sleep.previous-3600
 const priorKm=training?.previousRunKm7,nowKm=training?.runKm7
 const fullTraining=training?.historyStatus==='complete'&&!training.truncated
 const rising=fullTraining&&finite(priorKm)&&priorKm>=10&&finite(nowKm)&&nowKm>priorKm*1.4
 const risingMinutes=fullTraining&&finite(training.previousMinutes7)&&training.previousMinutes7>=60&&finite(training.minutes7)&&training.minutes7>training.previousMinutes7*1.4
 const currentPlan=plan?.today===today?plan:null
 const day=currentPlan?.days?.find(d=>d.date===today)
 const feedback=currentPlan?.garminPerception
 const recentFeedback=!!feedback?.latest?.date&&feedback.latest.date>=calendarDayOffset(today,-2)&&feedback.latest.date<=today
 const poorFeedback=recentFeedback&&feedback.needsRecovery===true
 const hardFeedback=recentFeedback&&feedback.qualityCaution===true
 const race=currentPlan?.autoRaceRecovery
 const raceCaution=!!race&&race.recoveryCaution===true
 const exhausted=finite(currentPlan?.reportedExhaustion)&&currentPlan.reportedExhaustion>=7
 const blocked=!!context?.blocked_periods?.some(b=>b.start<=today&&b.end>=today)
 const sick=context?.illness_state==='sick'||currentPlan?.ill||day?.kind==='illness'
 const returning=context?.illness_state==='returning'||currentPlan?.returning||day?.kind==='return_easy'
 const longTerm=analyzeLongTermRecovery(rows,today)
 const reasons=[]
 if(longTerm.summary)reasons.push(longTerm.summary)
 if(sleepQuality.text)reasons.push(sleepQuality.text)
 if(lowSleep)reasons.push(fmt(Math.abs(sleep.difference)/60)+' Minuten weniger Schlaf als üblich.')
 if(shortSleep&&!lowSleep)reasons.push('Heute weniger als sechs Stunden Schlaf gemessen.')
 if(lowHrv)reasons.push('HRV deutlich unter deinem üblichen Bereich.')
 if(highPulse)reasons.push('Ruhepuls merklich über deinem üblichen Bereich.')
 else if(finite(pulse?.difference)&&pulse.difference>=3)reasons.push('Ruhepuls leicht erhöht (+'+fmt(pulse.difference)+' bpm), allein noch kein starkes Warnsignal.')
 if(finite(hrv?.difference)&&hrv.difference>0)reasons.push('HRV höher als üblich; ein positiver Einzelwert gleicht die übrigen Signale nicht automatisch aus.')
 if(persistent)reasons.push('Mindestens ein auffälliges Signal wiederholt sich in den letzten drei Tagen.')
 if(weekHrv||weekPulse||weekSleep)reasons.push('Auch der Vergleich der beiden letzten Sieben-Tage-Zeiträume zeigt eine ungünstige Entwicklung.')
 if(elevatedStress)reasons.push('Gestern lag dein Tagesstress über deinem üblichen Wert.')
 if(lowBattery)reasons.push('Gestern lag deine maximale Body Battery unter deinem üblichen Wert.')
 if(risingMinutes)reasons.push('Deine gesamte Trainingszeit der letzten sieben Tage liegt deutlich über der Vorwoche.')
 if(rising)reasons.push('Der jüngste Sieben-Tage-Laufumfang ist gegenüber den sieben Tagen davor deutlich gestiegen.')
 if(poorFeedback||hardFeedback)reasons.push('Deine jüngsten Garmin-Bewertungen zeigen hohe Anstrengung oder schwaches Gefühl.')
 if(raceCaution||exhausted)reasons.push('Die aktuelle Wettkampf-/Erholungsphase erfordert zusätzliche Rücksicht.')
 const evidence=reasons.join(' ')
 // Speak in short, grounded sentences. Never forward internal planner prose.
 const plain=[]
 if(fresh){
  if(lowSleep)plain.push('Du hast '+fmt(Math.abs(sleep.difference)/60)+' Minuten weniger geschlafen als sonst.')
  else if(shortSleep)plain.push('Du hast weniger als sechs Stunden geschlafen.')
  else if(sleepQuality.disrupted)plain.push('Deine Schlafwerte sind schwächer als sonst.')
  if(lowHrv)plain.push('Deine HRV liegt deutlich unter deinem Normalwert.')
  if(highPulse)plain.push('Dein Ruhepuls ist deutlich höher als sonst.')
 }
 if(longTerm.persistentLow)plain.push('Deine HRV ist schon seit mehreren Tagen niedriger als sonst.')
 if(poorFeedback||hardFeedback)plain.push('Deine letzten Einheiten haben dich gefordert.')
 if(rising||risingMinutes)plain.push('Du hast zuletzt deutlich mehr trainiert.')
 if(exhausted)plain.push('Du hast angegeben, dass du noch ziemlich erschöpft bist.')
 if(elevatedStress||lowBattery)plain.push(elevatedStress?'Gestern hattest du mehr Stress als sonst.':'Gestern waren deine Energiereserven niedriger als sonst.')
 if(!plain.length&&(persistent||weekHrv||weekPulse||weekSleep))plain.push('Deine Werte waren in den letzten Tagen wiederholt auffällig.')
 const raceRest=Number.isInteger(race?.daysSince)&&race.daysSince>=0&&race.daysSince<=21&&['matched','ambiguous','awaiting-sync'].includes(race.status)&&day?.kind==='recovery'&&/wettkampf|renn/i.test(day.title||'')
 const why=(fallback,limit=2)=>plain.slice(0,limit).join(' ')||fallback
 const canSayOtherValuesOkay=fresh&&finite(hrv?.difference)&&finite(pulse?.difference)&&!lowHrv&&!highPulse&&Math.abs(pulse.difference)<5&&!longTerm.persistentLow&&hrv.median>0&&Math.abs(hrv.difference/hrv.median)<.25
 const otherValues=canSayOtherValuesOkay&&(lowSleep||shortSleep)&&plain.length===1?' HRV und Ruhepuls sind im kurzfristigen Vergleich unauffällig.':''
 const bodyCheck='Dein aktuelles Körpergefühl kann ich nicht messen. Bei Schmerzen, Schwindel, ungewöhnlicher Atemnot oder deutlichem Krankheitsgefühl nicht trainieren und Beschwerden bei Bedarf medizinisch abklären.'
 const planText=day?'Aktueller Coach-Plan: '+day.title+'.':'Der gemeinsame Tagesplan ist aktuell nicht vollständig verfügbar.'
 const result=(level,title,advice,tip)=>({level,title,advice,tip:tip+(longTerm.severeLow?' Ein anhaltender, unerklärlicher HRV-Einbruch sollte ärztlich abgeklärt werden. Bei akuten schweren Beschwerden medizinische Hilfe holen.':''),evidence,planText,bodyCheck,comparable,latestDay:latest?.metric_date||null})
 if(sick)return result('pause','Heute geht Gesundheit vor.','Du hast Beschwerden gemeldet. Auch gute Werte sind dann kein Grund, Sport zu machen.','Ruh dich aus. Trainiere erst wieder, wenn der Wiedereinstieg passt.')
 if(blocked||day?.kind==='blocked'||day?.decision==='declined')return result('pause','Heute bleibt frei.','Du hast dir heute bewusst freigehalten. Das respektiere ich.','Genieß den freien Tag. Nichts nachholen.')
 if(completed||day?.kind==='completed')return result('rest','Für heute genug getan.',why('Dein Training ist bereits erledigt.',1),'Trinken, essen, erholen. Keine Extra-Einheit.')
 if(longTerm.severeLow)return result('caution','Anhaltend ungewöhnlich niedrige HRV.','Deine HRV ist seit vielen Tagen deutlich niedriger als früher. Das würde ich nicht einfach als normal abhaken.','Keine harte oder lange Einheit. Lass die Ursache abklären.')
 if(!fresh||comparable<2||!currentPlan||!day)return result('limited','Mir fehlen noch Daten.',!fresh?'Für heute habe ich noch keine aktuellen Morgenwerte.':comparable<2?'Ich kenne deinen Normalbereich noch nicht gut genug.':'Ich kenne deinen heutigen Trainingsplan gerade nicht.','Nichts erzwingen. Erst die Daten prüfen und auf dein Gefühl hören.')
 const mainCount=Number(lowSleep||shortSleep||sleepQuality.disrupted)+Number(lowHrv)+Number(highPulse)
 const combined=mainCount>=2||(mainCount>=1&&(persistent||weekHrv||weekPulse||weekSleep||((elevatedStress||lowBattery)&&!lowHrv)||rising||risingMinutes||hardFeedback))
 const strong=combined||longTerm.persistentLow||poorFeedback||raceCaution||exhausted||day.selectedGroup?.advice==='skip'
 const protectedDay=['recovery','mobility','illness','blocked','return_easy','rest'].includes(day.kind)||day.qualityBlocked||day.selectedGroup?.advice==='easy'||returning
 if(['recovery','rest','mobility'].includes(day.kind)||day.selectedGroup?.advice==='skip'){
  const explanation=raceRest?'Du bist noch in der Erholung nach dem Wettkampf. '+why('Gib deinem Körper die Zeit, die er braucht.',1):why('Heute steht Erholung auf dem Plan.')+otherValues
  return result('rest','Heute nicht auf Biegen und Brechen.',explanation,'Kein Zusatztraining. Nur locker bewegen, wenn es zum Plan passt und du dich gut fühlst.')
 }
 if(strong)return result('caution','Heute lieber auf die Bremse treten.',why(returning?'Du bist noch im Wiedereinstieg.':raceCaution?'Nach dem Wettkampf brauchst du noch Erholung.':'Heute spricht einiges für weniger Belastung.'),'Keine Intervalle oder lange Einheit erzwingen. Wenn der Plan es zulässt und du dich wirklich gut und beschwerdefrei fühlst, nur locker. Bei ungewöhnlicher Anstrengung abbrechen.')
 if(mainCount||persistent||weekHrv||weekPulse||weekSleep||elevatedStress||lowBattery||hardFeedback||rising||risingMinutes||protectedDay)return result('caution','Heute nicht auf Biegen und Brechen.',why(returning?'Du bist noch im Wiedereinstieg.':'Heute würde ich nichts erzwingen.',1)+otherValues+' Trainiere nur, wenn du dich wirklich gut und beschwerdefrei fühlst.','Locker einlaufen. Fühlt es sich ungewöhnlich schwer an, verkürzen oder abbrechen. Keine zusätzliche Intensität.')
 return result('balanced','Sieht heute ordentlich aus.','Deine verfügbaren Werte zeigen keine deutlichen Warnsignale. Wie du dich fühlst, zählt trotzdem.','Bleib beim Tagesplan. Wenn du dich nicht fit fühlst, mach weniger oder Pause.')
}
