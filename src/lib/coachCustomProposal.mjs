/** Live, deterministic appraisal of athlete-owned proposals against verified Coach plan.
 * Does not impersonate a clinician or invent readiness from raw Garmin data.
 * Deliberately no writes or automatic workout changes.
 */
const dateDistance=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)
const fmt=v=>Number(v).toLocaleString('de-DE')
export function assessCustomProposal({day,plan,kind,minutes,goal}){
 if(!day||!plan||!['run','walk','rowing','mobility'].includes(kind)||
    !Number.isInteger(minutes)||minutes<10||minutes>120)
  return {level:'invalid',title:'Eingabe prüfen',message:'Bitte eine gültige Aktivität mit 10 bis 120 Minuten wählen.',
   canSave:false,requiresAcknowledgment:false}
 const blocked=['illness','blocked','race','existing','completed'].includes(day.kind)
 if(blocked||day.decision){
  return {level:'blocked',title:'An diesem Tag keine neue Einheit eintragen',
   message:'Hier liegen ein Rennen, eine Trainingspause, ein vorhandener Kalendereintrag oder eine bereits getroffene Entscheidung vor. Bitte den Tag zuerst im Kalender bzw. Coach prüfen.',
   canSave:false,requiresAcknowledgment:false}
 }
 if(kind==='run'&&!day.approvable&&day.kind!=='option')
  return {level:'blocked',title:'Laufen heute nicht empfohlen',
   message:'Für diesen Tag gibt der Coach keinen Lauf frei. Ein Spaziergang oder sanfte Mobilität kann separat geprüft werden.',
   canSave:false,requiresAcknowledgment:false}
 const baseline=kind==='run'&&Number.isFinite(day.minutes)&&day.minutes>0?day.minutes:null
 const daysToRace=plan.raceDate?dateDistance(day.date,plan.raceDate):null
 const goalName=typeof goal?.race_name==='string'&&goal.race_name.trim()?goal.race_name.trim():'deinem Wettkampf'
 const taper=daysToRace!==null&&daysToRace>=0&&daysToRace<=10
 const postrace=daysToRace!==null&&daysToRace<0&&daysToRace>=-14
 const compared=baseline!==null?minutes/baseline:null
 const difference=baseline!==null?minutes-baseline:null
 const comparison=baseline!==null?
  fmt(minutes)+' statt '+fmt(baseline)+' Minuten'+
  (difference>0?' – '+fmt(difference)+' Minuten mehr':
   difference<0?' – '+fmt(-difference)+' Minuten weniger':' – gleiche Dauer')+'. ':''
 const context=taper? 'Bis '+goalName+' sind es '+daysToRace+
   ' Tage. Das Training ist bewusst reduziert, damit du frisch startest. ':
  postrace?'Nach '+goalName+' steht die Erholung im Vordergrund. ':
  ''
 if(kind==='run'&&compared!==null&&
  (compared>=1.75||(taper&&minutes>baseline*1.25)))return {
  level:'against',title:'Davon rät der Coach deutlich ab',
  message:comparison+context+
   'Die geplante Laufbelastung liegt deutlich über der Empfehlung. '+ 
   'Auch bei lockerem Tempo verlängert sich die Belastungsdauer. '+
   'Der Coach bleibt bei '+fmt(baseline)+' Minuten; fehlende Kilometer werden nicht nachgeholt.',
  canSave:true,requiresAcknowledgment:true
 }
 if((taper||postrace)&&minutes>=60&&kind!=='mobility')return {
  level:'against',title:'In dieser Phase zu umfangreich',
  message:comparison+context+'Auch eine ruhige Einheit über '+fmt(minutes)+
   ' Minuten kann die Erholung beeinträchtigen. Empfehlung: die Dauer reduzieren oder einen Ruhetag nutzen.',
  canSave:true,requiresAcknowledgment:true
 }
 if(baseline!==null&&minutes>baseline*1.25)return {
  level:'review',title:'Mehr als vom Coach vorgesehen',
  message:comparison+context+'Das ist eine bewusst höhere Belastung als der aktuelle Coach-Vorschlag. '+
   'Prüfe, ob Erholung und Wochenumfang das rechtfertigen; der kürzere Vorschlag bleibt die bevorzugte Option.',
  canSave:true,requiresAcknowledgment:true
 }
 if(kind==='run'&&Array.isArray(plan.signals)&&plan.signals.length>0)return {
  level:'review',title:'Nur mit Blick auf die Erholung',
  message:comparison+'Die Garmin-Auswertung meldet: '+plan.signals.slice(0,2).join(' · ')+
   '. Der Coach empfiehlt weiter kontrollierte, lockere Belastung statt zusätzlichem Umfang.',
  canSave:true,requiresAcknowledgment:true
 }
 if(day.kind==='recovery'&&kind!=='mobility')return {
  level:'review',title:'Erholungstag bleibt die Empfehlung',
  message:context+'Du planst stattdessen '+fmt(minutes)+' Minuten '+
   (kind==='walk'?'Spaziergang':'lockere Bewegung')+
   '. Nur falls das wirklich erholsam bleibt; keine nachzuholende Trainingseinheit.',
  canSave:true,requiresAcknowledgment:true
 }
 return {level:'aligned',title:'Mit dem Vorschlag vereinbar',
  message:comparison+context+
   'Der Umfang liegt innerhalb der geplanten lockeren Belastung. Das ist eine Einordnung aus Trainingsplan und vorhandenen Signalen – keine medizinische Freigabe.',
  canSave:true,requiresAcknowledgment:false}
}
