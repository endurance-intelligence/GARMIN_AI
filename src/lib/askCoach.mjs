import {coachRecoveryAdvice} from './coachRecoveryAdvice.mjs'
import {buildCoachDailyBrief} from './coachDailyBrief.mjs'
import {buildCoachProgressStory} from './coachProgressStory.mjs'
import {analyzeGoalProgress} from './goalProgress.mjs'
import {buildCoachMemory} from './coachMemory.mjs'
import {normalizeGarminRpe,garminFeelingLabel} from './garminPerception.mjs'
import {coachAddDays,coachMonday} from './coachSevenDay.mjs'

export const COACH_QUESTIONS=[
 {id:'today',label:'Warum diese Einheit heute?'},
 {id:'weather',label:'Wie wird das Wetter beim Lauf?'},
 {id:'lastRun',label:'Wie war mein letzter Lauf?'},
 {id:'volume',label:'Wie viele Kilometer bin ich diese Woche gelaufen?'},
 {id:'load',label:'Wie ist meine aktuelle Trainingsbelastung?'},
 {id:'method',label:'Was bedeutet polarisiertes Training?'},
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
 if(/wetter|regen|böen|temperatur|wind|wetterfenster|wetterslot/.test(q))return 'weather'
 if(/polarisier|80[ /:-]20|trainingsmethode/.test(q))return 'method'
 if(/trainingsbelastung|wochenbelastung|trainingsumfang steigern|mehr umfang/.test(q))return 'load'
 if(/kilometer|\bkm\b|laufumfang|wochenumfang/.test(q)&&/woche|letzten 7 tage|letzten sieben tage|umfang/.test(q))return 'volume'
 if(/letzte[rmns]?\s+(lauf|läufe|läufen|training|einheit)|letztes mal|vergleich.*lauf|\bpace\b|durchschnittspuls|durchschnittliche herzfrequenz|wie schnell|wie weit.*gelaufen/.test(q))return 'lastRun'
 if(/gelernt|gedächtnis|historie|rpe|feeling|entscheidung|feedback|verträg/.test(q))return 'memory'
 if(/ziel|wettkampf|rennen|auf kurs|marathon|halbmarathon/.test(q))return 'goal'
 if(/woche|nächste tage|7 tage|wochenplan/.test(q))return 'week'
 if(/besser|schneller|fortschritt|entwicklung|laufökonomie|fitness/.test(q))return 'progress'
 if(/erhol|regener|müde|müdigkeit|hrv|ruhepuls|schlaf|belastung/.test(q))return 'recovery'
 if(/heute|einheit|locker|training|laufen|trainieren/.test(q))return 'today'
 return null
}

const RUN=new Set(['running','track_running','treadmill_running','ultra_run','trail_running'])
const dateOf=a=>String(a?.start_time_local||'').slice(0,10)
function recordedRuns(snapshot,today){
 const rows=new Map()
 for(const board of Array.isArray(snapshot?.boards)?snapshot.boards:[]){
  for(const a of Array.isArray(board?.activities)?board.activities:[]){
   if(!RUN.has(a?.sport_type)||a.activity_id==null||!String(a.activity_id)||!/^\d{4}-\d{2}-\d{2}$/.test(dateOf(a))||dateOf(a)>today)continue
   const id=String(a.activity_id),old=rows.get(id)
   if(!old||[a.distance_m,a.duration_s,a.average_heart_rate].filter(number).length>[old.distance_m,old.duration_s,old.average_heart_rate].filter(number).length)rows.set(id,a)
  }
 }
 return [...rows.values()].sort((a,b)=>String(b.start_time_local).localeCompare(String(a.start_time_local)))
}
const pace=a=>number(a.duration_s)&&a.duration_s>0&&number(a.distance_m)&&a.distance_m>0?Math.round(a.duration_s/(a.distance_m/1000)):null
const paceLabel=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+' min/km'
const runLine=a=>[dateOf(a),number(a.distance_m)&&a.distance_m>0?format(a.distance_m/1000)+' km':null,number(a.duration_s)&&a.duration_s>0?format(a.duration_s/60)+' Min.':null,pace(a)!==null?paceLabel(pace(a))+' (Ø aus Dauer/Distanz)':null,number(a.average_heart_rate)&&a.average_heart_rate>0?'Ø '+Math.round(a.average_heart_rate)+' bpm':null].filter(Boolean).join(' · ')

/** Only present one-tap questions with evidence for the requested answer. */
export function availableCoachQuestions({today,snapshot,plan,weather}={}){
 if(!snapshot||plan?.today!==today||!Array.isArray(plan.days))return []
 const rows=recordedRuns(snapshot,today)
 const training=snapshot.health?.training
 const complete=training?.historyStatus==='complete'&&!training.truncated
 const recovery=coachRecoveryAdvice({today,history:Array.isArray(snapshot.health?.longRecoveryMetrics)?snapshot.health.longRecoveryMetrics:snapshot.health?.metrics,plan,context:snapshot.life?.context,training})
 const hasVolume=snapshot.boards?.some(b=>b.start===coachMonday(today)&&Array.isArray(b.activities)&&b.activities.length<250)&&complete&&rows.filter(a=>dateOf(a)>=coachMonday(today)).every(a=>number(a.distance_m)&&a.distance_m>=0)
 const progress=buildCoachProgressStory({today,snapshot})
 const memory=buildCoachMemory({today,snapshot})
 const permitted={today:plan.days.some(d=>d.date===today),weather:weather?.date===today&&typeof weather.text==='string'&&!!weather.text.trim(),
 lastRun:rows.some(a=>number(a.distance_m)&&a.distance_m>0&&number(a.duration_s)&&a.duration_s>0),
 volume:hasVolume,load:complete&&number(training.runKm7)&&number(training.previousRunKm7),
 method:true,recovery:recovery.latestDay===today&&recovery.comparable>=2,
 progress:progress?.status==='complete'&&progress.activeWeeks>0,
 goal:!!snapshot.goal?.goal?.race_name&&!!snapshot.goal?.goal?.race_date&&complete,
 week:plan.days.some(d=>d.date>=today),memory:memory.entries.some(x=>x.outcome==='matched')||!!plan.fourWeekReview?.workoutTolerance?.some(t=>t.rated>=3)}
 return COACH_QUESTIONS.filter(q=>permitted[q.id])
}

export function answerCoachQuestion({topic,today,snapshot,plan,weather,query,previousQuery}={}){
 if(topic==='symptoms')return answer('Beschwerden haben Vorrang.',[
  'Der Coach kann Beschwerden nicht aus Garmin-Daten diagnostizieren. Bei akuten schweren Beschwerden wie Brustschmerz, starker Atemnot oder Ohnmacht medizinische Hilfe holen.',
  'Nutze bei Bedarf den Beschwerde-/Pause-Modus. Eine Trainingsfreigabe kann dieser Dialog nicht erteilen.'
 ],'Allgemeiner Sicherheitshinweis','symptoms')
 if(!snapshot||!plan||plan.today!==today||!Array.isArray(plan.days))
  return answer('Aktuelle Coach-Daten fehlen.',[
   'Ohne den aktuellen gemeinsamen Snapshot ist keine persönliche Aussage möglich.'
  ],'Daten nicht verfügbar')
 if(topic==='weather'){
  const q=String(query||'').toLowerCase()
  const weekday=new Intl.DateTimeFormat('de-DE',{weekday:'long',timeZone:'UTC'}).format(new Date(today+'T12:00:00Z')).toLowerCase()
  if(/morgen|gestern|wochenende|nächste woche|\b\d{1,2}\.\d{1,2}\./.test(q)||['montag','dienstag','mittwoch','donnerstag','freitag','samstag','sonntag'].some(d=>q.includes(d)&&d!==weekday))
   return answer('Für diesen Tag kann ich hier noch keine Prognose geben.',['Ich beantworte derzeit Trainingswetter für heute. Andere Tage bitte im Kalender prüfen.'],'Trainingswetter')
  return weather?.date===today&&typeof weather.text==='string'?answer('Dein Trainingswetter.',[weather.text,'Die Wetterprognose ändert nicht meine Trainingsempfehlung.'],'Open-Meteo · gemeinsame Trainingsprognose'):answer('Heute keine aktuelle Trainingsprognose verfügbar.',['Prüfe den Trainingsort und die Wetterkarte. An Ruhetagen suche ich kein zusätzliches Lauffenster.'],'Trainingswetter')
 }
 const q=String(query||'').toLowerCase()
 if(topic==='method')return answer('Polarisiertes Training.',[
  'Die meisten Ausdauereinheiten bleiben locker; gezielte intensive Einheiten setzen den Trainingsreiz. 80/20 ist eine Orientierung, keine starre Wochenquote.',
  'Der Coach priorisiert Erholung, Rennphase und tatsächliche Belastung. Verpasste intensive Einheiten werden nicht automatisch nachgeholt.',
  'Für die persönliche Intensitätssteuerung nutze deine vorhandenen Herzfrequenzzonen und dein Belastungsempfinden. Ohne belastbare Schwellenwerte nenne ich keine erfundene Ziel-Herzfrequenz.'
 ],'Hinterlegte GARMIN_AI-Trainingsmethode','decision')
 if(topic==='lastRun'){
  const rows=recordedRuns(snapshot,today)
  const prior=String(previousQuery||'').toLowerCase()
  const compare=/vergleich|davor|vorletzt|vorherig|letzten zwei/.test(q)
  const unsupportedDate=/morgen|übermorgen|letzte woche|\b\d{1,2}\.\d{1,2}\./.test(q)
  if(unsupportedDate)return answer('Welcher Lauf ist gemeint?',['Für beliebige Daten nutze die Analyse. Hier kann ich die letzten geladenen Garmin-Läufe vergleichen.'],'Garmin','progress')
  const yesterday=/gestern/.test(q)||(/^(und|wie|was)\b/.test(q)&&/gestern/.test(prior)&&!/letzte/.test(q))
  const filtered=yesterday?rows.filter(a=>dateOf(a)===coachAddDays(today,-1)):rows
  if(!filtered.length)return answer('Kein passender Garmin-Lauf in den geladenen Daten.',['Fehlende Aufzeichnungen sind kein Beweis für einen Ruhetag.'],'Garmin','progress')
  const a=filtered[0],b=filtered[1],rpe=normalizeGarminRpe(a.rpe_raw),feeling=garminFeelingLabel(a.feeling_raw)
  return answer(yesterday?'Dein letzter aufgezeichneter Lauf von gestern.':compare?'Deine letzten aufgezeichneten Läufe.':'Dein letzter aufgezeichneter Lauf.',[
   runLine(a),rpe!==null?'Deine Anstrengung: '+rpe+'/10.':'Keine Garmin-RPE-Bewertung vorhanden.',feeling?'Dein Gefühl: '+feeling+'.':'',
   compare?(b?runLine(b):'Kein weiterer passender Lauf verfügbar.'):'',
   compare?'Unterschiedliche Strecke, Höhenmeter, Wetter und Trainingsziel können Tempo und Puls beeinflussen. Daraus allein folgt kein Leistungsfortschritt.':'Tempo und Puls allein entscheiden nicht, ob die Einheit ihren Trainingszweck erfüllt hat.'
  ],'Aufgezeichnete Garmin-Aktivitäten · geladener Zeitraum','progress')
 }
 if(topic==='volume'){
  const rolling=/letzten (7|sieben) tage/.test(q)
  const prior=/letzte woche|letzten woche|vorwoche/.test(q)
  const start=rolling?coachAddDays(today,-6):prior?coachAddDays(coachMonday(today),-7):coachMonday(today)
  const end=prior?coachAddDays(start,6):today
  const weeks=new Set([coachMonday(start),coachMonday(end)])
  const covered=[...weeks].every(w=>snapshot.boards?.some(b=>b?.start===w&&Array.isArray(b.activities)))
  const rows=recordedRuns(snapshot,today).filter(a=>dateOf(a)>=start&&dateOf(a)<=end)
  const known=rows.filter(a=>number(a.distance_m)&&a.distance_m>=0)
  return answer('Dein aufgezeichneter Laufumfang.',[
   start+' bis '+end+' · '+rows.length+' geladene Läufe.',
   covered&&known.length===rows.length?format(known.reduce((sum,a)=>sum+a.distance_m,0)/1000)+' km in den geladenen Garmin-Daten.':'Zeitraum oder Entfernungen nicht vollständig verfügbar. Keine Gesamtsumme geschätzt.',
   'Nur absolvierte Garmin-Läufe, keine geplanten Einheiten. Synchronisationslücken bleiben möglich.'
  ],'Garmin-Wochenübersichten','progress')
 }
 if(topic==='load'){
  const v=plan.adaptiveVolume,g=plan.garminPerception
  return answer('Deine Trainingsbelastung.',[
   plan.attentionText,g?.summary,g?.advice,v?.title,v?.reason,
   number(v?.latestKm)?'Letzte ausgewertete Woche: '+format(v.latestKm)+' km.':'',
   number(v?.baselineKm)?'Vergleichsumfang: '+format(v.baselineKm)+' km/Woche.':'',
   !v&&!g?'Keine ausreichenden Belastungsdaten verfügbar.':'',
   'Die aktuelle Tagesempfehlung bleibt maßgeblich. Keine automatische Steigerung.'
  ],'Bestehende Garmin-Belastungs- und Coach-Logik','decision')
 }
 const brief=buildCoachDailyBrief({today,plan,health:snapshot.health})
 if(topic==='today')return brief?answer(brief.title,[
  brief.reason,brief.next,brief.dataNote,brief.symptomNote
 ],brief.source,'decision'):answer('Tagesempfehlung fehlt.',[],'Coach')
 if(topic==='recovery'){
  const r=coachRecoveryAdvice({today,history:Array.isArray(snapshot.health?.longRecoveryMetrics)?snapshot.health.longRecoveryMetrics:snapshot.health?.metrics,plan,context:snapshot.life?.context,training:snapshot.health?.training})
  return answer(r.title,[r.advice,r.evidence,r.tip,r.planText,r.bodyCheck],'Gemeinsamer Coach-Kontext · Garmin-Erholungswerte, Verlauf und Belastung','decision')
 }
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
  const goal=analyzeGoalProgress({today,goal:snapshot.goal,boards:snapshot.boards,health:snapshot.health,racePortfolio:snapshot.racePortfolio})
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
  ...plan.days.filter(d=>d.date>=today).map(d=>d.date+' · '+(d.selectedGroup?d.selectedGroup.title+' · Teilnahme bestätigt':d.title)+(d.decision?' · '+(d.decision==='accepted'?'angenommen':'abgelehnt'):'')+' – '+d.reason),
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
  'Frag mich beispielsweise nach deinem letzten Lauf, Wochenkilometern, Pace, Herzfrequenz, Trainingsbelastung, Erholung oder Wetter. Allgemeine Wissensfragen und freie Internetrecherche kann ich ohne Sprachmodell nicht zuverlässig beantworten.'
 ],'Begrenzter regelbasierter Coach')
}
