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
 const days=Array.from({length:7},(_,i)=>coachAddDays(today,i))
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
 const caution=!!input.symptoms||signals.length>=2||volumeRise
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
 const isUnavailable=day=>blocks.find(b=>day>=b.start&&day<=b.end)
 const goal=input.goal?.goal||null
 const raceDate=goal?.race_date||null
 const raceOffset=raceDate?Math.round((Date.parse(raceDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/ONE_DAY):null
 const activities=(input.boards||[]).flatMap(x=>Array.isArray(x?.activities)?x.activities:[])
 const manual=(input.boards||[]).flatMap(x=>Array.isArray(x?.manual)?x.manual:[])
 const options=Array.isArray(input.options?.options)?input.options.options:[]
 const choices=Array.isArray(input.options?.choices)?input.options.choices:[]
 const plans=Array.isArray(input.plans?.entries)?input.plans.entries.filter(x=>x.state!=='cancelled'):[]
 const flags=[
  training?'Garmin: '+quant(training.runKm7,' km Laufumfang in 7 Tagen')+'; Vorwoche '+quant(training.previousRunKm7,' km'):'Trainingsumfang nicht verfügbar',
  latest?'Erholung: letzter Messwert '+latest+(age>2?' (veraltet)':''):'Erholungsdaten fehlen',
  latest&&hrv?.median!=null?'HRV '+quant(hrv.value,' ms')+'; Median '+quant(hrv.median,' ms')+' (14 Tage davor)':'HRV: kein ausreichender Vergleich',
  latest&&pulse?.median!=null?'Ruhepuls '+quant(pulse.value,' bpm')+'; Median '+quant(pulse.median,' bpm'):'Ruhepuls: kein ausreichender Vergleich',
  latest&&sleep?.median!=null?'Schlaf '+quant(sleep.value===null?null:sleep.value/3600,' h')+
   '; Median '+quant(sleep.median/3600,' h'):'Schlaf: kein ausreichender Vergleich',
  raceDate?'Wettkampfziel '+goal.race_name+' am '+raceDate:'Kein Wettkampfziel verfügbar'
 ]
 const make=(day,kind,title,minutes,reason,sport='running')=>
  ({date:day,kind,title,minutes,reason,sport,
   approvable:['easy','long','mobility','return_easy'].includes(kind)})
 let comebackCandidateUsed=false
 const items=days.map((day,i)=>{
  const untilRace=raceDate?Math.round((Date.parse(raceDate+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/ONE_DAY):null
  const existing=plans.find(p=>p.training_date===day)
  const done=activities.some(a=>a.start_time_local?.slice(0,10)===day)||
   manual.some(a=>a.session_date===day)
  if(ill||input.symptoms)
   return make(day,'illness','Trainingspause · krank / Beschwerden',null,
    'Selbst gemeldete Beschwerden: kein Training vorgeschlagen.'+
    (existing?' Vorhandenen Kalendertermin bitte selbst prüfen.':'')+
    (done?' Bereits absolvierte Aktivität wird nicht rückwirkend verändert.':''))
  const block=isUnavailable(day)
  if(block)
   return make(day,'blocked',block.reason==='vacation'?'Urlaub · kein Training':'Nicht verfügbar',null,
    'Von dir geblockter Tag. Keine Nachholeinheit geplant.'+
    (existing?' Achtung: Bereits geplanter Termin bleibt bestehen – im Kalender prüfen.':''))
  if(existing)return make(day,'existing',existing.title,null,'Bereits in GARMIN_AI geplant. Keine zweite Einheit erzeugen.',existing.sport||'running')
  if(done)return make(day,'completed','Bereits trainiert',null,'Absolvierte Garmin-/Stabi-Aktivität; keine zusätzliche Planung.')
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
  if(untilRace===0)return make(day,'race',goal.race_name,null,'Wettkampftag. Kein zusätzliches Training.')
  if(untilRace!==null&&untilRace<0&&untilRace>=-3)
   return make(day,'recovery','Erholung nach dem Rennen',null,'Nach einem Wettkampf keine automatische Belastungssteigerung.')
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
  if(option&&choice==='selected')return make(day,'chosen',option.title,null,
   'Von dir ausgewählter Verein-/Gruppentermin. Keine zusätzliche Einheit.')
  if(untilRace!==null&&untilRace<=2&&untilRace>=1)
   return make(day,'recovery',untilRace===1?'Ruhetag vor dem Rennen':'Erholung / optional 15–20 Min. bewegen',
    null,'Direkt vor dem Wettkampf keine zusätzliche Trainingsbelastung.')
  if(option&&choice!=='skipped'){
   return make(day,'option',option.title+' (optional)',null,
    (untilRace!==null&&untilRace<=10?
     'Tapering: keine harte Zusatzbelastung. Falls Teilnahme, Umfang und Intensität bewusst reduzieren.':
     'Regelmäßige Trainingsoption, Teilnahme nicht festgelegt.')+
    ' Über die Wochenoptionen auswählen; kein automatischer Kalendereintrag.')
  }
  if(!dataReady)
   return make(day,'recovery','Keine belastbare Planung',null,
    'Garmin-Trainingsdaten fehlen oder sind unvollständig. Bitte zunächst synchronisieren.')
  if(caution)
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
 })
 return {today,days:items,signals,flags,
  attention:ill||returning||postIllness||!!input.symptoms||caution||observationLimited,
  attentionText:ill||input.symptoms?'Krank-Modus aktiv: Trainingsvorschläge sind gesperrt, bis du deine Genesung meldest.':
   returning?'Wiedereinstieg aktiv: erste Läufe und deine Folgetag-Rückmeldungen haben Vorrang. Keine automatische Freigabe.':
   postIllness?'Nach dem Wiedereinstieg Belastung weiter schrittweise aufbauen; keine Nachholeinheiten.':
   caution?'Belastungs-/Erholungssignale sprechen für Zurückhaltung; keine Diagnostik.':
   observationLimited?'Datenlage ist eingeschränkt. Nur konservative Vorschläge.':
   'Vorschläge sind eine Planungshilfe, keine medizinische Freigabe.',
  basedOnActual:true,source:'Garmin & bestehender Kalender',raceDate,returning,ill,postIllness,concern,acknowledgedRuns:acknowledged.length}
}
