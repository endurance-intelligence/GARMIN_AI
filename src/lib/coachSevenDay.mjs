import {latestWorkoutFeedback,evaluateWorkoutFeedback} from './postWorkoutFeedback.mjs'
import {analyzeWorkoutFeedbackTrend} from './feedbackTrend.mjs'
import {summarizeLastCompletedWeek} from './completedWeekReview.mjs'
import {applyPolarizedGuidance} from './polarizedTraining.mjs'
import {analyzeGarminPerception} from './garminPerception.mjs'
/** GARMIN_AI Coach Intelligence v1.0 — conservative, explainable seven-day preview.
 * No synthetic training readiness, direct Garmin write or automatic approval.
 */
const ONE_DAY=86400000
export function coachAddDays(day,delta){
 const millis=Date.parse(day+'T12:00:00Z')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(millis)||
  new Date(millis).toISOString().slice(0,10)!==day)throw Error('Ungültiges Tagesdatum')
 return new Date(millis+delta*ONE_DAY).toISOString().slice(0,10)
}
export function coachMonday(day){
 const d=new Date(day+'T12:00:00Z').getUTCDay()
 return coachAddDays(day,-((d+6)%7))
}
const weekday=day=>((new Date(day+'T12:00:00Z').getUTCDay()+6)%7)+1
const valid=n=>typeof n==='number'&&Number.isFinite(n)
const median=values=>{
 if(!values.length)return null
 const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2)
 return s.length%2?s[m]:(s[m-1]+s[m])/2
}
const quant=(value,label)=>valid(value)?Number(value).toLocaleString('de-DE',{maximumFractionDigits:1})+label:'keine Angabe'
const checkSignal=(metrics,metric,min,max,latestDay)=>{
 const beginning=coachAddDays(latestDay,-14)
 const baseline=metrics.filter(x=>x.metric_date>=beginning&&x.metric_date<latestDay)
  .map(x=>x[metric]).filter(x=>valid(x)&&x>=min&&x<=max)
 const current=metrics.find(x=>x.metric_date===latestDay)?.[metric]
 return {value:valid(current)&&current>=min&&current<=max?current:null,
  median:baseline.length>=7?median(baseline):null,observations:baseline.length}
}
export function buildSevenDayCoach(input){
 const today=input.today
 // Coach preview defaults to the next seven days. Calendar may explicitly
 // request another visible ISO week without changing today's health baseline.
 const windowStart=input.startDate||today
 if(typeof windowStart!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(windowStart))
  throw Error('Ungültiger Coach-Zeitraum')
 const days=Array.from({length:7},(_,i)=>coachAddDays(windowStart,i))
 const health=input.health||{},training=health.training||null
 const metrics=Array.isArray(health.metrics)?health.metrics.filter(x=>x.metric_date<=today):[]
 const latest=metrics.filter(x=>valid(x.hrv_ms)||valid(x.resting_heart_rate)||valid(x.sleep_seconds))
  .sort((a,b)=>b.metric_date.localeCompare(a.metric_date))[0]?.metric_date||null
 const age=latest?Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(latest+'T12:00:00Z'))/ONE_DAY):null
 const hrv=latest?checkSignal(metrics,'hrv_ms',10,250,latest):null
 const pulse=latest?checkSignal(metrics,'resting_heart_rate',25,110,latest):null
 const sleep=latest?checkSignal(metrics,'sleep_seconds',3*3600,16*3600,latest):null
 const signals=[]
 if(hrv?.value!=null&&hrv?.median!=null&&hrv.value<hrv.median*.8)
  signals.push('HRV mehr als 20 % unter dem jüngsten 14-Tage-Median')
 if(pulse?.value!=null&&pulse?.median!=null&&pulse.value>=pulse.median+7)
  signals.push('Ruhepuls mindestens 7 Schläge über dem jüngsten Median')
 if(sleep?.value!=null&&sleep?.median!=null&&sleep.value<=sleep.median-3600)
  signals.push('Schlafdauer mindestens 60 Minuten unter dem jüngsten Median')
 const previous=training?.previousRunKm7,nowKm=training?.runKm7
 const volumeRise=valid(previous)&&previous>=10&&valid(nowKm)&&nowKm>previous*1.4
 if(volumeRise)signals.push('Laufumfang gegenüber der Vorwoche deutlich erhöht')
 const dataReady=!!training&&!training.truncated&&metrics.length>0
 const recentHealth=age!==null&&age<=2
 const observationLimited=!recentHealth||!dataReady||
  training.historyStatus!=='complete'||![hrv,pulse,sleep].some(x=>x?.median!=null)
 const life=input.life?.context||{illness_state:'well',blocked_periods:[],run_reviews:[]}
 const returning=life.illness_state==='returning'
 const ill=life.illness_state==='sick'
 // Even after user confirmation, build volume back gradually rather than
 // offering a long run immediately after two tolerated short sessions.
 const returnAge=life.return_started_on?
  Math.round((Date.parse(today+'T12:00:00Z')-
   Date.parse(life.return_started_on+'T12:00:00Z'))/ONE_DAY):null
 const postIllness=life.illness_state==='well'&&returnAge!==null&&returnAge>=0&&returnAge<14
 const runs=Array.isArray(input.life?.runs)?input.life.runs:[]
 const reviews=Array.isArray(life.run_reviews)?life.run_reviews:[]
 const concern=returning&&reviews.some(x=>x.assessment==='concern')
 const acknowledged=runs.filter(x=>reviews.some(y=>
  y.activityId===x.activity_id&&y.assessment==='ok'))
 const hasUnreviewed=runs.some(x=>!reviews.some(y=>y.activityId===x.activity_id))
 const blocks=Array.isArray(life.blocked_periods)?life.blocked_periods:[]
 const dayDecisions=Array.isArray(life.day_decisions)?life.day_decisions:[]
 const checks=Array.isArray(life.race_recovery_checks)?life.race_recovery_checks:[]
 // Garmin already records RPE / feeling after a workout: never demand a second check.
 const garminPerception=analyzeGarminPerception(input.boards,today)
 const feedbackTrend=analyzeWorkoutFeedbackTrend(life.post_workout_feedback,today)
 const trendReducing=feedbackTrend.kind==='reduce'
 const trendShortening=feedbackTrend.kind==='shorten'
 const workoutFeedback=latestWorkoutFeedback(life.post_workout_feedback,today)
 const workoutAssessment=workoutFeedback?evaluateWorkoutFeedback(workoutFeedback):null
 const feedbackCaution=workoutAssessment?.avoidHard===true||garminPerception.qualityCaution
 const caution=!!input.symptoms||signals.length>=2||volumeRise
 const feedbackNextDay=(day)=>workoutFeedback&&day>=today&&
  day>workoutFeedback.activityDate&&day<=coachAddDays(workoutFeedback.activityDate,2)
 const garminNextDay=(day)=>garminPerception.qualityCaution&&
  garminPerception.latest&&day>=today&&
  day<=coachAddDays(garminPerception.latest.date,2)
 const lastRaceCheck=[...checks].filter(x=>typeof x.raceDate==='string'&&x.raceDate<=today)
  .sort((a,b)=>String(b.raceDate).localeCompare(String(a.raceDate))||
    String(b.reportedOn).localeCompare(String(a.reportedOn)))[0]||null
 const isUnavailable=day=>blocks.find(b=>day>=b.start&&day<=b.end)
 const goal=input.goal?.goal||null
 const raceDate=typeof goal?.race_date==='string'&&
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(goal.race_date)?goal.race_date:null
 const raceOffset=raceDate?Math.round((Date.parse(raceDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/ONE_DAY):null
 // A previously recorded finish stays relevant even after the next goal is selected.
 const recoveryRaceDate=raceDate&&raceDate<=today?raceDate:
  lastRaceCheck?.raceDate||raceDate
 const raceCheck=[...checks].filter(x=>x.raceDate===recoveryRaceDate&&x.reportedOn<=today)
  .sort((a,b)=>String(b.reportedOn).localeCompare(String(a.reportedOn)))[0]||null
 const checkAge=raceCheck?Math.round((Date.parse(today+'T12:00:00Z')-
  Date.parse(raceCheck.reportedOn+'T12:00:00Z'))/ONE_DAY):null
 const checkedRecently=checkAge!==null&&checkAge>=0&&checkAge<=2
 const reportedExhaustion=raceCheck?Math.max(Number(raceCheck.fatigue),Number(raceCheck.soreness)):null
 const ultraRecovery=raceDate===recoveryRaceDate&&Number(goal?.distance_km)>=42
 const activities=(input.boards||[]).flatMap(x=>Array.isArray(x?.activities)?x.activities:[])
 const manual=(input.boards||[]).flatMap(x=>Array.isArray(x?.manual)?x.manual:[])
 const options=Array.isArray(input.options?.options)?input.options.options:[]
 const choices=Array.isArray(input.options?.choices)?input.options.choices:[]
 const plans=Array.isArray(input.plans?.entries)?input.plans.entries.filter(x=>x.state!=='cancelled'):[]
 const completedWeek=summarizeLastCompletedWeek({today,boards:input.boards,plans:input.plans})
 const allowWeekAdjustment=completedWeek.adjustment==='shorten'&&!ill&&!returning&&!postIllness&&
  !caution&&!input.symptoms&&!feedbackCaution&&!trendReducing&&!trendShortening&&
  (raceOffset===null||raceOffset>10)
 const last7=activities.filter(a=>String(a.start_time_local||'').slice(0,10)>=coachAddDays(today,-6)&&
   String(a.start_time_local||'').slice(0,10)<=today)
 const soccer7=last7.filter(a=>/soccer|football/i.test(String(a.sport_type||''))).length
 const mobility7=last7.filter(a=>/mobility|strength|pilates|weight/i.test(String(a.sport_type||''))).length
 const crossNote='Ergänzend in 7 Tagen: '+soccer7+' × Fußball, '+mobility7+
  ' × Kraft/Mobility. Ohne Umrechnung in Laufkilometer.'
 const flags=[
  training?'Garmin: '+quant(training.runKm7,' km Laufumfang in 7 Tagen')+'; Vorwoche '+quant(training.previousRunKm7,' km'):'Trainingsumfang nicht verfügbar',
  latest?'Erholung: letzter Messwert '+latest+(age>2?' (veraltet)':''):'Erholungsdaten fehlen',
  latest&&hrv?.median!=null?'HRV '+quant(hrv.value,' ms')+'; Median '+quant(hrv.median,' ms')+' (14 Tage davor)':'HRV: kein ausreichender Vergleich',
  latest&&pulse?.median!=null?'Ruhepuls '+quant(pulse.value,' bpm')+'; Median '+quant(pulse.median,' bpm'):'Ruhepuls: kein ausreichender Vergleich',
  latest&&sleep?.median!=null?'Schlaf '+quant(sleep.value===null?null:sleep.value/3600,' h')+
   '; Median '+quant(sleep.median/3600,' h'):'Schlaf: kein ausreichender Vergleich',
  raceDate?'Wettkampfziel '+goal.race_name+' am '+raceDate:'Kein Wettkampfziel verfügbar',
  crossNote
 ]
 if(completedWeek.status==='ready')flags.push(
  'Letzte abgeschlossene Trainingswoche ('+completedWeek.start+' bis '+completedWeek.end+'): '+
  completedWeek.summary+' '+completedWeek.next)
 if(garminPerception.count14>0||garminPerception.feelingCount14>0)
  flags.push('Garmin-Selbsteinschätzung (automatisch): '+
   garminPerception.summary+' '+garminPerception.advice)
 if(feedbackTrend.count14>=3)flags.push(
  'Persönlicher Belastungsverlauf: '+feedbackTrend.count14+
  ' Rückmeldungen in 14 Tagen ('+feedbackTrend.count28+' in 28 Tagen). '+
  feedbackTrend.title+'. '+feedbackTrend.suggestion)
 if(workoutFeedback&&workoutAssessment)flags.push(
  'Letzte persönliche Rückmeldung ('+workoutFeedback.activityDate+'): '+
  'Anstrengung '+workoutFeedback.rpe+'/10 · Beine '+workoutFeedback.legs+
  ' · '+workoutAssessment.title)
 if(raceCheck)flags.push('Renn-Erholung: eigener Check-in vom '+raceCheck.reportedOn+
  ' · Erschöpfung '+raceCheck.fatigue+'/10 · Beine '+raceCheck.soreness+'/10'+
  (raceCheck.warning?' · Warnzeichen gemeldet':''))
 const make=(day,kind,title,minutes,reason,sport='running')=>
  ({date:day,kind,title,minutes,reason,sport,
   approvable:['easy','long','mobility','return_easy'].includes(kind)})
 let comebackCandidateUsed=false
 const items=days.map((day,i)=>{
  const dayFeedbackCaution=(feedbackCaution&&feedbackNextDay(day))||garminNextDay(day)
  const untilRace=raceDate?Math.round((Date.parse(raceDate+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/ONE_DAY):null
  const existing=plans.find(p=>p.training_date===day)
  const done=activities.some(a=>a.start_time_local?.slice(0,10)===day)||
   manual.some(a=>a.session_date===day)
  if(ill||input.symptoms)
   return make(day,'illness','Trainingspause · krank / Beschwerden',null,
    'Selbst gemeldete Beschwerden: kein Training vorgeschlagen.'+
    (existing?' Vorhandenen Kalendertermin bitte selbst prüfen.':'')+
    (done?' Bereits absolvierte Aktivität wird nicht rückwirkend verändert.':''))
  // An explicitly recorded race is always visible, even when a club option
  // (e.g. Saturday track) is also stored. Health warnings are higher priority.
  if(untilRace===0){
   const hours=typeof goal?.race_start_time==='string'?
    goal.race_start_time.slice(0,5):null
   const km=Number(goal?.distance_km)
   const distance=Number.isFinite(km)&&km>0?km.toLocaleString('de-DE')+' km':null
   const place=typeof goal?.race_location==='string'?goal.race_location.trim():''
   return make(day,'race',goal.race_name+(distance?' · '+distance:''),null,
    'WETTKAMPFTAG'+(hours?' · Start '+hours+' Uhr':'')+(place?' · '+place:'')+
    '. Keine ORC-Einheit und kein zusätzliches Training. '+
    (existing?'Achtung: gespeicherten Trainingstermin am Renntag prüfen.':'')+
    (isUnavailable(day)?' Achtung: eigener Sperrtag überschneidet sich mit dem Rennen.':''))
  }
  const block=isUnavailable(day)
  if(block)
   return make(day,'blocked',block.reason==='vacation'?'Urlaub · kein Training':'Nicht verfügbar',null,
    'Von dir geblockter Tag. Keine Nachholeinheit geplant.'+
    (existing?' Achtung: Bereits geplanter Termin bleibt bestehen – im Kalender prüfen.':''))
  if(existing)return make(day,'existing',existing.title,null,
   feedbackNextDay(day)&&feedbackCaution?
    'Dein letztes Trainingsfeedback empfiehlt mehr Erholung. Den bestehenden Termin im Kalender prüfen; keine automatische Änderung.':
    'Bereits in GARMIN_AI geplant. Keine zweite Einheit erzeugen.',existing.sport||'running')
  if(done)return make(day,'completed','Bereits trainiert',null,'Absolvierte Garmin-/Stabi-Aktivität; keine zusätzliche Planung.')
  if(feedbackNextDay(day)&&workoutAssessment?.preferRest){
   if(workoutFeedback.symptoms==='clear')return make(day,'illness',
    'Beschwerden nach der Einheit · Pause',null,
    'Du hast deutliche Beschwerden gemeldet. Keine weitere Belastung empfehlen; bei anhaltenden oder ungewöhnlichen Symptomen medizinisch abklären.')
   return make(day,'recovery','Erholung nach harter Einheit',null,
    'Dein Feedback: '+workoutFeedback.rpe+'/10 Anstrengung, Beine '+
    workoutFeedback.legs+'. '+workoutAssessment.message+' Keine Nachholeinheit.')
  }
  if(returning){
   if(concern)return make(day,'illness','Wiedereinstieg unterbrechen',null,
    'Nach einem Wiedereinstiegslauf wurden Beschwerden gemeldet. Nicht weitertrainieren; medizinisch klären.')
   if(!dataReady)return make(day,'recovery','Wiedereinstieg pausiert',null,
    'Trainingsdaten unvollständig. Bitte erst Garmin synchronisieren.')
   if(hasUnreviewed)return make(day,'recovery','Ersten Lauf am Folgetag prüfen',null,
    'Wiedereinstiegslauf noch nicht bewertet. Verträglichkeit und Beschwerden nach 24 Stunden prüfen.')
   if(acknowledged.length>=2)return make(day,'recovery','Wiedereinstieg gemeinsam abschließen',null,
    'Die ersten zwei Läufe wurden ohne Beschwerden bestätigt. Normales Training nur nach eigener Entscheidung wieder freigeben.')
   if(!comebackCandidateUsed){
    const last=runs.length?runs[runs.length-1].start_time_local?.slice(0,10):null
    if(last&&day<=coachAddDays(last,1))return make(day,'recovery','Ruhe nach Wiedereinstieg',null,
     'Nach dem letzten Lauf einen ruhigen Folgetag einhalten.')
    comebackCandidateUsed=true
    return make(day,'return_easy',runs.length?
     'Sehr locker · 20–30 Min.':'Kurzer Wiedereinstieg · 10–20 Min.',runs.length?25:15,
     'Nur falls symptomfrei und keine medizinischen Warnzeichen. Sprechtest, keine Intervalle; bei Beschwerden sofort stoppen. Am Folgetag selbst bewerten.')
   }
   return make(day,'recovery','Rückmeldung abwarten',null,
    'Vor weiterer Belastungssteigerung den nächsten realen Garmin-Lauf und die Verträglichkeit prüfen.')
  }
  const daysPostRace=recoveryRaceDate?
   Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(recoveryRaceDate+'T12:00:00Z'))/ONE_DAY):null
  if(daysPostRace!==null&&daysPostRace>0&&daysPostRace<=14){
   if(!raceCheck||!checkedRecently)
    return make(day,'recovery','Regeneration nach dem Wettkampf',null,
     day>today?
      'Nach dem Wettkampf ist Erholung vorgesehen. Das Renn-Barometer wird erst nach dem Zieleinlauf ausgefüllt. Keine zusätzliche Einheit.':
      'Regeneration nach dem Wettkampf. Bitte Erschöpfung und Muskelgefühl im Renn-Barometer eintragen bzw. aktualisieren. Bis dahin keine neuen Laufvorschläge.')
   if(raceCheck.warning)
    return make(day,'illness','Warnzeichen · Belastung abklären',null,
     'Du hast Warnzeichen gemeldet. Kein Laufvorschlag. Bei Brustschmerzen, Atemnot, '+
     'Schwindel oder starken Beschwerden medizinisch abklären.')
   if(!Number.isFinite(reportedExhaustion)||reportedExhaustion>=7)
    return make(day,'recovery','Stark erschöpft · Erholung priorisieren',null,
     'Eigene Belastungseinschätzung: '+reportedExhaustion+'/10. '+
     'Heute Ruhe und höchstens sehr leichte Alltagsbewegung. Morgen neu einschätzen.')
   if(reportedExhaustion>=4)
    return make(day,'recovery','Noch belastet · nur leichte Bewegung',null,
     'Eigene Belastungseinschätzung: '+reportedExhaustion+'/10. '+
     'Spaziergang oder sanfte Mobility statt Trainingskilometern; morgen erneut prüfen.')
   if(daysPostRace<=2||(ultraRecovery&&daysPostRace<=5))
    return make(day,'recovery','Nach dem Rennen · ruhig regenerieren',null,
     'Subjektiv schon frischer ('+reportedExhaustion+'/10), aber '+daysPostRace+
     ' Tage nach '+(ultraRecovery?'einem langen Ultra':'dem Rennen')+
     ' noch keine Laufeinheit automatisch freigeben.')
   if(!dataReady||caution||dayFeedbackCaution)
    return make(day,'recovery','Erholung & Garmin-Daten prüfen',null,
     'Barometer '+reportedExhaustion+'/10, aber Garmin-Verlauf oder Erholungssignale '+
     'reichen noch nicht für einen Laufvorschlag.')
   const minutes=ultraRecovery?20:25
   return make(day,'easy','Behutsam zurück · '+minutes+' Min. locker',minutes,
    'Barometer '+reportedExhaustion+'/10, '+daysPostRace+' Tage nach dem Rennen. '+
    'Nur symptomfrei im Sprechtempo, keine Intervalle und kein Nachholen. Am Folgetag bewerten.')
  }
  const option=options.find(o=>o.enabled&&o.weekday===weekday(day))
  const choice=option?choices.find(c=>c.training_date===day&&c.option_code===option.code)?.choice:null
  if(postIllness){
   if(option&&choice==='selected')return make(day,'option',option.title+' · nach Krankheit prüfen',null,
    'Bereits ausgewählter Termin: noch keine harte Belastung. Teilnahme und Intensität bewusst selbst prüfen.')
   return [2,4,7].includes(weekday(day))&&dataReady?
    make(day,'easy','Locker bleiben · 20–35 Min.',30,
     'Die ersten Wiedereinstiegsläufe wurden bestätigt, aber voller Umfang und Tempo werden nicht direkt wiederhergestellt.'):
    make(day,'recovery','Erholung / Mobility',null,
     'Zwei verträgliche Läufe bedeuten noch keine automatische Rückkehr zur früheren Trainingsbelastung.')
  }
  // A short easy run is still a TRAINING recommendation; do not propose it
  // when Garmin evidence is incomplete or meaningful recovery flags exist.
  if(untilRace!==null&&untilRace>0&&untilRace<=10&&(!dataReady||caution||dayFeedbackCaution))
   return make(day,'recovery','Frische vor dem Rennen priorisieren',null,
    !dataReady?'Garmin-Daten unvollständig. Keine Laufeinheit freigeben, erst Daten prüfen.':
    'Aktuelle Erholungssignale / Umfang sprechen gegen zusätzliche Belastung. '+
    'Ruhen und Beschwerden prüfen; keine automatische Trainingsfreigabe.')
  // Race-first coach: a generic weekly option MUST NOT displace the
  // recommendation for a real goal. The final five days are deliberately
  // very low-volume ahead of a long ultra (no football or hard track set).
  // These are concrete recommendations, not a medical or Garmin clearance.
  if(untilRace!==null&&untilRace>0&&untilRace<=10){
   const event='vor '+goal.race_name
   if(untilRace===5)
    return make(day,'recovery','Fußball auslassen · Erholung',null,
     'Coach-Entscheidung: kein Fußball '+event+
     '. Sprints, Zweikämpfe und zusätzliche Ermüdung jetzt vermeiden. Optional sanfte Mobilität oder Spaziergang.')
   if(untilRace===4)
    return make(day,'easy','30 Min. locker statt Intervallen',30,
     'Coach-Entscheidung: keine harten ORC-Intervalle vier Tage vor dem Ultra. '+
     '30 Minuten ruhiger Lauf im Sprechtempo; kein Nachholen versäumter Belastung.')
   if(untilRace===3)
    return make(day,'easy','25 Min. sehr locker statt vollem ORC Run',25,
     'Coach-Entscheidung: Gruppenlauf höchstens stark verkürzt und sehr locker. '+
     '25 Minuten genügen; keine Tempoeinheit, keine zusätzliche Belastung.')
   if(untilRace===2)
    return make(day,'recovery','Ruhetag',null,
     'Zwei Tage bis zum Rennen: kein Training nachholen. Bewegung nur bei Bedarf und ohne Ermüdung.')
   if(untilRace===1)
    return make(day,'recovery','Ruhetag / Anfahrt',null,
     'Morgen ist '+goal.race_name+'. Ausruhen, Ausrüstung, Verpflegung und Anreise organisieren. Kein ORC-Training.')
   if(untilRace>=6&&untilRace<=10){
    if(weekday(day)===6)
     return make(day,'easy','30 Min. locker statt ORC Track',30,
      'Wettkampfvorbereitung: kein hartes Bahntraining. 30 Minuten sehr locker; frisch bleiben.')
    if(weekday(day)===7)
     return make(day,'easy','30 Min. locker im Taper',30,
      'Umfang verringern, locker laufen, ausreichend Erholung. Kein langer Lauf mehr.')
    return make(day,'recovery','Erholung / lockere Mobilität',null,
     'Taper vor '+goal.race_name+': Training reduzieren, Frische priorisieren.')
   }
  }
  if(option&&choice==='selected')return make(day,'chosen',option.title,null,
   'Von dir ausgewählter Verein-/Gruppentermin. Keine zusätzliche Einheit.')
  if(option&&choice!=='skipped'){
   return make(day,'option',option.title+' (optional)',null,
    'Regelmäßige Trainingsoption, Teilnahme nicht festgelegt. Über die Wochenoptionen auswählen; kein automatischer Kalendereintrag.')
  }
  if(!dataReady)
   return make(day,'recovery','Keine belastbare Planung',null,
    'Garmin-Trainingsdaten fehlen oder sind unvollständig. Bitte zunächst synchronisieren.')
  if(caution||dayFeedbackCaution)
   return i%2===0?make(day,'recovery','Erholung / lockere Bewegung',null,
    signals.length?signals.join(' · '):'Aktuelle Symptome oder Belastung erfordern Zurückhaltung.'):
    make(day,'easy','Lockerer Lauf · 20–30 Min.',25,
    'Konservativer Vorschlag wegen der aktuellen Belastungs-/Erholungsdaten.')
  if(untilRace!==null&&untilRace<=10&&untilRace>=0){
   return [2,4,7].includes(weekday(day))&&untilRace>=3?
    make(day,'easy','Kurzer lockerer Lauf · 20–35 Min.',30,
     'Tapering: Trainingsumfang reduzieren, Intensität vermeiden; nach Wohlbefinden entscheiden.'):
    make(day,'recovery','Erholung / Mobility',null,
     'Tapering: keine versäumten Kilometer nachholen.')
  }
  if(observationLimited){
   return [2,4,7].includes(weekday(day))?
    make(day,'easy','Lockerer Lauf · 25–40 Min.',35,
     'Datenlage eingeschränkt: nur ruhiger, gut kontrollierbarer Lauf; Sprechtest statt starrem Pace-Ziel.'):
    make(day,'recovery','Erholung / Mobility',null,'Keine hohe Intensität ohne belastbare Verlaufssignale.')
  }
  if(weekday(day)===7&&valid(nowKm)&&nowKm>=25)
   return make(day,'long','Langer lockerer Lauf · 60–75 Min.',65,
    'Ausdauerreiz bei stabilem Verlauf; nur wenn du dich gut fühlst, keine Nachholung versäumter Kilometer.')
  if([2,4,7].includes(weekday(day)))
   return make(day,'easy','Lockerer Lauf · 35–50 Min.',40,
    'Aerober Grundlagenreiz; Sprechtest und Herzfrequenz wichtiger als Pace.')
  if(weekday(day)===5)return make(day,'mobility','Stabi / Mobility · 20 Min.',20,
   'Leichte Kräftigung und Beweglichkeit; keine zusätzliche harte Einheit.','strength')
  return make(day,'recovery','Erholung / freier Tag',null,
   'Abstand zwischen Belastungen erhalten, optionale Vereinstrainings bleiben freiwillig.')
 }).map(item=>{
  // The coach decision is metadata, never a replacement for the original
  // training/rest/travel recommendation shown in both Coach and Calendar.
  const choice=dayDecisions.find(x=>x.date===item.date)?.choice
  if(!['accepted','declined'].includes(choice)||
    ['race','illness','blocked','existing','completed'].includes(item.kind))return item
  return {...item,decision:choice,approvable:false}
 }).map(item=>{
  // Only future suggestions change. Never overwrite calendar, race, illness or decisions.
  if(item.decision||!['easy','long','return_easy'].includes(item.kind)||
    item.date<today||item.date>coachAddDays(today,6))return item
  if(trendReducing)return {...item,kind:'recovery',title:'Nach Feedback: Erholung priorisieren',
   minutes:null,approvable:false,
   reason:'Deine letzten '+feedbackTrend.count14+' Rückmeldungen: '+
    feedbackTrend.summary+' '+feedbackTrend.suggestion+
    ' Kein vorhandener Kalendereintrag wird geändert.'}
  if(trendShortening){
   const shorter=item.kind==='long'?Math.min(item.minutes||45,45):
    Math.min(item.minutes||25,25)
   return {...item,kind:'easy',title:'Weniger Umfang · '+shorter+' Min. locker',
    minutes:shorter,approvable:true,
    reason:'Nach deinen letzten '+feedbackTrend.count14+
     ' Rückmeldungen empfiehlt der Coach einen kürzeren, lockeren Lauf. '+
     'Statt '+item.minutes+' Minuten jetzt '+shorter+' Minuten. '+
     'Nur ein Vorschlag – Freigabe bleibt bei dir.'}
  }
  return item
 }).map((item,_,all)=>{
  // One evidence-based adjustment at most, to a still-open suggestion only.
  // Race taper, illness, recovery, saved plans and athlete choices take priority.
  if(!allowWeekAdjustment||item.decision||!item.approvable||
   !['easy','long'].includes(item.kind)||item.date<today||
   item.date>coachAddDays(today,6))return item
  const eligible=all.find(d=>d.date>=today&&d.date<=coachAddDays(today,6)&&
   d.approvable&&!d.decision&&['easy','long'].includes(d.kind))
  if(eligible!==item)return item
  const revised=Math.max(15,Math.round((item.minutes*.8)/5)*5)
  if(revised>=item.minutes)return item
  return {...item,kind:'easy',minutes:revised,
   title:'Wochenrückblick · '+revised+' Min. locker',
   reason:'Plan-Ist-Abgleich der letzten abgeschlossenen Woche: '+
    completedWeek.overlongCount+' zeitlich plausibel zugeordnete Coach-Läufe '+
    'dauerten deutlich länger als geplant. Deshalb diesen noch offenen Lauf von '+
    item.minutes+' auf '+revised+' Minuten verkürzen. Nur Vorschlag; '+
    'kein bestehender Kalendertermin und keine Garmin-Daten wurden geändert.'}
 })
 const polarized=applyPolarizedGuidance(items,{
  today,raceDate,ill,returning,postIllness,caution,
  feedbackCaution,trendReducing,observationLimited,
  qualityLocked:garminPerception.qualityCaution,
  boards:input.boards,feedback:life.post_workout_feedback
 })
 flags.push('Trainingsmethode: polarisiert (ca. vier locker / eine hart; '+
  'mittlere Intensität möglichst wenig). '+polarized.message)
 return {today,days:polarized.days,signals,flags,
  trainingMethod:{id:'polarized',qualityDay:polarized.qualityDay,
   status:polarized.status,plannedEasy:polarized.easyCount,
   message:polarized.message},
  attention:ill||returning||postIllness||!!input.symptoms||caution||feedbackCaution||trendReducing||trendShortening||allowWeekAdjustment||observationLimited,
  attentionText:ill||input.symptoms?'Krank-Modus aktiv: Trainingsvorschläge sind gesperrt, bis du deine Genesung meldest.':
   returning?'Wiedereinstieg aktiv: erste Läufe und deine Folgetag-Rückmeldungen haben Vorrang. Keine automatische Freigabe.':
   postIllness?'Nach dem Wiedereinstieg Belastung weiter schrittweise aufbauen; keine Nachholeinheiten.':
   feedbackCaution?(garminPerception.qualityCaution?
    'Garmin-Bewertungen zeigen zuletzt hohe Belastung oder schwaches Gefühl. '+
    'Weitere Intensität erst nach Erholung, keine zusätzliche Eingabe notwendig.':
    'Deine bisherige Rückmeldung spricht für mehr Ruhe. Die nächsten Tage werden vorsichtiger geplant.'):
   trendReducing||trendShortening?'Dein Feedback aus mehreren Einheiten spricht für weniger Belastung. Vorschläge angepasst, nicht im Kalender geändert.':
   allowWeekAdjustment?'Dein Plan-Ist-Abgleich der letzten Woche spricht für einen kürzeren lockeren Lauf. Bitte selbst prüfen und freigeben.':
   caution?'Belastungs-/Erholungssignale sprechen für Zurückhaltung; keine Diagnostik.':
   observationLimited?'Datenlage ist eingeschränkt. Nur konservative Vorschläge.':
   'Vorschläge sind eine Planungshilfe, keine medizinische Freigabe.',
  basedOnActual:true,source:'Garmin & bestehender Kalender',raceDate,returning,ill,postIllness,concern,acknowledgedRuns:acknowledged.length,
  recoveryRaceDate,checkedRecently,reportedExhaustion,
  latestWorkoutFeedback:workoutFeedback?.activityId||null,
  garminPerception,
  completedWeek,
  feedbackTrend:{level:feedbackTrend.level,kind:feedbackTrend.kind,
   count14:feedbackTrend.count14,count28:feedbackTrend.count28}}
}
