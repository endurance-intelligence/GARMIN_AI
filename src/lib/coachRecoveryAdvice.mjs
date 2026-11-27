import {interpretRecovery,calendarDayOffset,recoveryMedian} from './recoveryComparison.ts'
import {recoveryWeekTrend} from './recoveryWeekTrend.mjs'
import {analyzeLongTermRecovery} from './longTermRecovery.mjs'

const finite=v=>typeof v==='number'&&Number.isFinite(v)
const dateOK=d=>typeof d==='string'&&!!calendarDayOffset(d,0)
const fmt=n=>Math.round(n).toLocaleString('de-DE')
const direction=(v,base)=>finite(v)&&finite(base)?v-base:null
const valid=(v,min,max)=>finite(v)&&v>=min&&v<=max
const lookup=(rows,date)=>rows.find(r=>r.metric_date===date)
const flagsFor=r=>{
 const [sleep,hrv,pulse]=r?.metrics||[]
 return [
  !!sleep&&finite(sleep.difference)&&sleep.difference<=-3600,
  !!hrv&&finite(hrv.difference)&&finite(hrv.median)&&hrv.median>0&&hrv.difference/hrv.median<=-.15,
  !!pulse&&finite(pulse.difference)&&pulse.difference>=5
 ]
}
function extra(rows,today,key){
 // Daytime stress and daily maximum battery can be incomplete today.
 // Only the most recent completed calendar day is comparable.
 const date=calendarDayOffset(today,-1),value=lookup(rows,date)?.[key]
 const first=calendarDayOffset(date,-14)
 const prior=rows.filter(r=>r.metric_date>=first&&r.metric_date<date).map(r=>r[key]).filter(v=>valid(v,0,100))
 if(!valid(value,0,100)||prior.length<7)return null
 const base=recoveryMedian(prior),delta=direction(value,base)
 return {value,base,delta,date}
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
 const stress=extra(rows,today,'stress_avg'),battery=extra(rows,today,'body_battery_max')
 const elevatedStress=!!stress&&stress.delta>=10,lowBattery=!!battery&&battery.delta<=-15
 const three=[0,-1,-2].map(n=>interpretRecovery(rows,calendarDayOffset(today,n)))
 const persistent=[0,1,2].some(i=>three.filter(r=>flagsFor(r)[i]).length>=2)
 const trend=latest?recoveryWeekTrend(rows,latest.metric_date):null
 const weekHrv=!!trend?.hrv&&trend.hrv.previous>0&&trend.hrv.current<=trend.hrv.previous*.85
 const weekPulse=!!trend?.rhr&&trend.rhr.current>=trend.rhr.previous+5
 const weekSleep=!!trend?.sleep&&trend.sleep.current<=trend.sleep.previous-3600
 const priorKm=training?.previousRunKm7,nowKm=training?.runKm7
 const rising=training?.historyStatus==='complete'&&!training.truncated&&finite(priorKm)&&priorKm>=10&&finite(nowKm)&&nowKm>priorKm*1.4
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
 if(rising)reasons.push('Der jüngste Sieben-Tage-Laufumfang ist gegenüber den sieben Tagen davor deutlich gestiegen.')
 if(poorFeedback||hardFeedback)reasons.push('Deine jüngsten Garmin-Bewertungen zeigen hohe Anstrengung oder schwaches Gefühl.')
 if(raceCaution||exhausted)reasons.push('Die aktuelle Wettkampf-/Erholungsphase erfordert zusätzliche Rücksicht.')
 const evidence=reasons.join(' ')
 const bodyCheck='Dein aktuelles Körpergefühl kann ich nicht messen. Bei Schmerzen, Schwindel, ungewöhnlicher Atemnot oder deutlichem Krankheitsgefühl nicht trainieren und Beschwerden bei Bedarf medizinisch abklären.'
 const planText=day?'Aktueller Coach-Plan: '+day.title+'.':'Der gemeinsame Tagesplan ist aktuell nicht vollständig verfügbar.'
 const result=(level,title,advice,tip)=>({level,title,advice,tip:tip+(longTerm.severeLow?' Ein anhaltender, unerklärlicher HRV-Einbruch sollte ärztlich abgeklärt werden. Bei akuten schweren Beschwerden medizinische Hilfe holen.':''),evidence,planText,bodyCheck,comparable,latestDay:latest?.metric_date||null})
 if(sick)return result('pause','Beschwerden haben Vorrang.','Heute keine Belastung. Auch unauffällige Garmin-Werte ändern daran nichts.','Den Beschwerdestatus und den geplanten Wiedereinstieg im Coach prüfen.')
 if(blocked||day?.kind==='blocked'||day?.decision==='declined')return result('pause','Deine Entscheidung hat Vorrang.','Halte den freien Tag ein, unabhängig von der Messlage.','Keine Einheit nachholen.')
 if(completed||day?.kind==='completed')return result('rest','Heute schon trainiert.','Keine zusätzliche Laufeinheit aus dem Morgencheck ableiten.','Trinken, essen, erholen und die Belastungsreaktion beobachten.')
 if(longTerm.severeLow)return result('caution','Anhaltend ungewöhnlich niedrige HRV.','Auch wenn der kurzfristige Vergleich inzwischen unauffällig aussieht, bleibt der Rückgang gegenüber deiner früheren Messphase bestehen.','Keine intensive oder lange Einheit erzwingen. Erholung und Ursache prüfen; bereits geplante Belastung vor dem Start überprüfen.')
 if(!fresh||comparable<2||!currentPlan||!day)return result('limited','Noch keine sichere Gesamteinordnung.',!fresh?'Heute fehlen aktuelle, vergleichbare Morgenwerte. Ältere Messungen sind keine Aussage zur heutigen Erholung.':comparable<2?'Noch zu wenige persönliche Vergleichswerte.':'Der vollständige Coach-Kontext fehlt.','Keine zusätzliche oder harte Einheit aus dieser Ansicht ableiten. Daten aktualisieren und Körpergefühl berücksichtigen.')
 const mainCount=Number(lowSleep||shortSleep)+Number(lowHrv)+Number(highPulse)
 const combined=mainCount>=2||(mainCount>=1&&(persistent||weekHrv||weekPulse||weekSleep||((elevatedStress||lowBattery)&&!lowHrv)||rising||hardFeedback))
 const strong=combined||longTerm.persistentLow||poorFeedback||raceCaution||exhausted||day.selectedGroup?.advice==='skip'
 const protectedDay=['recovery','mobility','illness','blocked','return_easy','rest'].includes(day.kind)||day.qualityBlocked||day.selectedGroup?.advice==='easy'||returning
 if(['recovery','rest','mobility'].includes(day.kind)||day.selectedGroup?.advice==='skip')return result('rest','Erholung hat heute Vorrang.',day.reason||'Der Coach sieht heute eine ruhigere Belastung vor.','Keine zusätzliche Laufeinheit. Eine lockere Bewegung nur, wenn sie zum Tagesplan passt und du dich gut fühlst.')
 if(strong)return result('caution','Heute lieber auf die Bremse treten.','Mehrere Hinweise sprechen gegen zusätzliche Intensität. '+(returning?'Der vorsichtige Wiedereinstieg bleibt maßgeblich.':'Prüfe, ob du die geplante Einheit verschiebst oder mit dem Coach entschärfst.'),'Keine Intervalle oder lange Einheit erzwingen. Nur falls der Tagesplan es zulässt und du dich wirklich gut und beschwerdefrei fühlst: sehr locker beginnen, bei ungewöhnlicher Anstrengung oder auffälligem Puls abbrechen.')
 if(mainCount||persistent||weekHrv||weekPulse||weekSleep||elevatedStress||lowBattery||hardFeedback||rising||protectedDay)return result('caution','Deine Tagesform entscheidet.','Die Signale sind nicht durchgehend unauffällig. '+(returning?'Bleibe beim vorsichtigen Wiedereinstieg.':'Trainiere nur, wenn du dich wirklich gut und beschwerdefrei fühlst; bei Müdigkeit lieber verkürzen oder pausieren.'),'Nicht gegen die Müdigkeit anlaufen. Prüfe beim lockeren Einlaufen, ob sich Atmung, Puls und Anstrengung normal anfühlen. Keine zusätzliche Intensität.')
 return result('balanced','Keine deutlichen Warnsignale in den verfügbaren Daten.','Deine vergleichbaren Morgenwerte zeigen keine klare ungünstige Kombination. Das ist keine automatische Trainingsfreigabe.','Orientiere dich am bestehenden Tagesplan. Wenn du dich nicht fit fühlst, darfst du jederzeit reduzieren oder pausieren.')
}
