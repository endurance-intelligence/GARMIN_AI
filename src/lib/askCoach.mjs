import {buildCoachDailyBrief} from './coachDailyBrief.mjs'
import {buildCoachProgressStory} from './coachProgressStory.mjs'
import {analyzeGoalProgress} from './goalProgress.mjs'
import {buildCoachMemory} from './coachMemory.mjs'

export const COACH_QUESTIONS=[
 {id:'today',label:'Warum diese Einheit heute?'},
 {id:'recovery',label:'Wie sieht meine Erholung aus?'},
 {id:'progress',label:'Werde ich besser?'},
 {id:'goal',label:'Bin ich auf Kurs für mein Ziel?'},
 {id:'week',label:'Was steht diese Woche an?'},
 {id:'memory',label:'Was hat der Coach aus meinen Läufen gelernt?'}
]
const number=n=>typeof n==='number'&&Number.isFinite(n)
const format=n=>n.toLocaleString('de-DE',{maximumFractionDigits:1})
const answer=(title,body,source,action=null)=>({title,body:body.filter(Boolean),source,action})
export function resolveCoachQuestion(raw){
 const q=String(raw||'').toLowerCase().trim()
 if(!q)return null
 if(/brustschmerz|atemnot|ohnmacht|schwindel|schmerz|beschwerde|krank|fieber/.test(q))return 'symptoms'
 if(/gelernt|gedächtnis|historie|rpe|feeling|entscheidung|feedback|verträg/.test(q))return 'memory'
 if(/ziel|wettkampf|rennen|auf kurs|marathon|halbmarathon/.test(q))return 'goal'
 if(/woche|nächste tage|7 tage|wochenplan/.test(q))return 'week'
 if(/besser|schneller|fortschritt|entwicklung|laufökonomie|fitness/.test(q))return 'progress'
 if(/erhol|regener|müde|müdigkeit|hrv|ruhepuls|schlaf|belastung/.test(q))return 'recovery'
 if(/heute|einheit|locker|training|laufen|trainieren/.test(q))return 'today'
 return null
}
export function answerCoachQuestion({topic,today,snapshot,plan}={}){
 if(topic==='symptoms')return answer('Beschwerden haben Vorrang.',[
  'Der Coach kann Beschwerden nicht aus Garmin-Daten diagnostizieren. Bei akuten schweren Beschwerden wie Brustschmerz, starker Atemnot oder Ohnmacht medizinische Hilfe holen.',
  'Nutze bei Bedarf den Beschwerde-/Pause-Modus. Eine Trainingsfreigabe kann dieser Dialog nicht erteilen.'
 ],'Allgemeiner Sicherheitshinweis','symptoms')
 if(!snapshot||!plan||plan.today!==today||!Array.isArray(plan.days))
  return answer('Aktuelle Coach-Daten fehlen.',[
   'Ohne den aktuellen gemeinsamen Snapshot ist keine persönliche Aussage möglich.'
  ],'Daten nicht verfügbar')
 const brief=buildCoachDailyBrief({today,plan,health:snapshot.health})
 if(topic==='today')return brief?answer(brief.title,[
  brief.reason,brief.next,brief.dataNote,brief.symptomNote
 ],brief.source,'decision'):answer('Tagesempfehlung fehlt.',[],'Coach')
 if(topic==='recovery')return answer('Deine Erholung im Kontext.',[
  brief?.dataNote,plan.attentionText,
  ...(Array.isArray(plan.signals)&&plan.signals.length?plan.signals.slice(0,4):[
   'Keine zusätzlichen Warnsignale aus den ausgewerteten Messwerten gemeldet. Das allein beweist keine vollständige Erholung.']),
  brief?.symptomNote
 ],'Bestehende Coach-Erholungslogik und Garmin-Messwerte','decision')
 if(topic==='progress'){
  const progress=buildCoachProgressStory({today,snapshot})
  if(!progress)return answer('Noch kein belastbarer Fortschrittsvergleich.',[],'Garmin-Historie','progress')
  return answer('Deine Entwicklung in den letzten vier abgeschlossenen Wochen.',[
   progress.totalKm===null?'Laufumfang nicht vollständig belegbar.':
    format(progress.totalKm)+' km · '+progress.activeWeeks+' von 4 Wochen mit Läufen.',
   progress.trendText,progress.performanceNote,progress.next
  ],'Bestehender Vierwochenvergleich · Garmin','progress')
 }
 if(topic==='goal'){
  const goal=analyzeGoalProgress({today,goal:snapshot.goal,boards:snapshot.boards,health:snapshot.health})
  if(!goal.raceName)return answer('Noch kein aktives Wettkampfziel.',[
   'Lege ein Ziel in Goals an, damit der Coach deine Vorbereitung einordnen kann.'
  ],'Goals','goals')
  return answer(goal.raceName,[
   goal.raceDate?'Zieldatum: '+goal.raceDate:'',
   number(goal.distanceKm)?'Geplante Distanz: '+format(goal.distanceKm)+' km.':'',
   goal.afterRace?'Das Zieldatum liegt in der Vergangenheit. Rückblick statt neuer Prognose.':'Eine Zielzeit-Prognose lässt sich aus diesen Daten nicht sicher ableiten.',
   ...goal.pillars.map(p=>p.title+': '+p.summary),goal.next
  ],'Bestehende Goal-Progress-Analyse','goals')
 }
 if(topic==='week')return answer('Deine nächsten sieben Tage.',[
  ...plan.days.filter(d=>d.date>=today).map(d=>d.date+' · '+d.title+(d.decision?' · '+(d.decision==='accepted'?'angenommen':'abgelehnt'):'')+' – '+d.reason),
  'Vorschläge sind keine automatische Kalenderfreigabe.'
 ],'Gemeinsame Coach- und Kalenderplanung','decision')
 if(topic==='memory'){
  const review=plan.fourWeekReview
  const history=buildCoachMemory({today,snapshot})
  const types=Array.isArray(review?.workoutTolerance)?review.workoutTolerance:[]
  const recent=history.entries.find(x=>x.outcome==='matched')
  return answer('Was wir aus deinem Training wissen.',[
   review?.explanation,review?.suggestion,
   ...types.map(t=>t.label+': '+t.hard+' von '+t.rated+' bewerteten, zugeordneten Läufen sehr hart oder schwaches Gefühl. '+(t.rated<3?'Zu wenige Bewertungen für eine Tendenz.':'')),
   recent?'Letzter zugeordneter Plan: '+recent.date+' · '+recent.title+'. '+(recent.actual?.rpe!=null?'Garmin-RPE '+recent.actual.rpe+'/10. ':'')+(recent.reason?'Gespeicherte Begründung: '+recent.reason:'Ursprüngliche Begründung nicht gespeichert.'):'Noch kein eindeutig zugeordnetes Ergebnis in der geladenen Historie.',
   'Die Zuordnung beweist weder identische Intensität noch die Wirksamkeit der Empfehlung.'
  ],'Vierwochenreview, Coach-Gedächtnis und Garmin','decision')
 }
 return answer('Diese Frage kann ich noch nicht zuverlässig beantworten.',[
  'Wähle eine der Fragen zu Tagestraining, Erholung, Entwicklung, Ziel, Wochenplanung oder bisherigen Entscheidungen. Freie Fragen werden aktuell nur nach diesen Themen eingeordnet.'
 ],'Begrenzter regelbasierter Coach')
}
