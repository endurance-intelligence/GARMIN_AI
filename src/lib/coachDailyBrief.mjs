/**
 * Read-only daily executive brief of the EXACT Coach plan already used by
 * CoachSevenDay and Calendar. No new fitness/readiness score, recommendations
 * or simulated Garmin measurements.
 */
const DAY=86400000
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+'T12:00:00Z'))&&
 new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x
const age=(from,to)=>validDate(from)&&validDate(to)?
 Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/DAY):null
const tidy=(s,max=450)=>typeof s==='string'?s.replace(/[\u0000-\u001F\u007F]/g,' ')
 .replace(/\s+/g,' ').trim().slice(0,max):''

const messages={
 illness:['TRAININGSPAUSE','Beschwerden haben Vorrang.',
  'Pause beibehalten und bei Bedarf deinen Beschwerdestatus aktualisieren.'],
 blocked:['NICHT VERFÜGBAR','Deine Verfügbarkeit hat Vorrang.',
  'Kein Training nachholen. Prüfe deinen Kalender nur bei Bedarf.'],
 recovery:['REGENERATION','Erholung ist heute der Trainingsplan.',
  'Erholung einhalten. Keine zusätzliche Laufeinheit einplanen.'],
 return_easy:['WIEDEREINSTIEG','Behutsam wieder aufbauen.',
  'Coach-Vorschlag prüfen; nur bei Beschwerdefreiheit und nach deiner Freigabe.'],
 easy:['LOCKER TRAINIEREN','Heute bewusst locker.',
  'Coach-Vorschlag und die begründete Belastung prüfen.'],
 long:['GRUNDLAGEN-AUSDAUER','Ausdauer mit Maß aufbauen.',
  'Langen Lauf und aktuelle Erholung prüfen; nur bewusst übernehmen.'],
 option:['FREIWILLIGER TERMIN','Du entscheidest über den Gruppentermin.',
  'Terminauswahl und Tagesempfehlung prüfen.'],
 chosen:['GRUPPENTERMIN','Dein Gruppentermin steht.',
  'Teilnahme und Belastung bewusst prüfen; keine zusätzliche Einheit.'],
 existing:['IM KALENDER','Die Einheit ist bereits geplant.',
  'Bestehenden Termin im Kalender prüfen; nichts wird überschrieben.'],
 completed:['ERLEDIGT','Du hast dich heute bereits bewegt.',
  'Keine zweite Einheit nachholen; auf Erholung achten.'],
 race:['WETTKAMPFTAG','Heute zählt der Wettkampf.',
  'Keine zusätzliche Trainingseinheit planen.'],
 mobility:['STABI & MOBILITY','Heute zählt Stabilität.',
  'Vorschlag und Tagesform prüfen; keine zusätzliche harte Einheit.']
}
export function buildCoachDailyBrief({plan,health,today}={}){
 if(!validDate(today)||!plan||!Array.isArray(plan.days))return null
 const day=plan.days.find(x=>x?.date===today)
 if(!day||typeof day.title!=='string'||typeof day.reason!=='string')
  return null
 const kind=typeof day.kind==='string'?day.kind:'unknown'
 const [label,guidance,next]=messages[kind]||[
  'DEIN TRAININGSTAG','Dein Coach hat den Tag eingeordnet.',
  'Begründung und Tagesplan im Coach prüfen.'
 ]
 const race=plan.autoRaceRecovery
 const raceDays=Number.isInteger(race?.daysSince)?race.daysSince:null
 const raceActive=raceDays!==null&&raceDays>=0&&raceDays<=21&&
  ['matched','awaiting-sync','ambiguous'].includes(race?.status)
 const raceKm=race?.status==='matched'&&Number.isFinite(race?.actualKm)?
  Math.round(race.actualKm*10)/10:null
 const raceInfo=raceActive?{
  name:tidy(race.raceName||'Wettkampf',100),
  daysSince:raceDays,
  actualKm:raceKm,
  linkConfirmed:race?.matchStatus==='confirmed',
  dataMissing:race?.status!=='matched'
 }:null
 const healthRows=Array.isArray(health?.metrics)?health.metrics:[]
 const latestHealth=healthRows.map(x=>x?.metric_date)
  .filter(x=>validDate(x)&&x<=today).sort().at(-1)||null
 const lastMetricAge=latestHealth?age(latestHealth,today):null
 const missingHealth=lastMetricAge===null
 const staleHealth=lastMetricAge!==null&&lastMetricAge>2
 let dataNote=''
 if(missingHealth)dataNote='Garmin-Erholungswerte sind momentan nicht verfügbar. Keine Trainingsfreigabe aus fehlenden Daten.'
 else if(staleHealth)dataNote='Letzte Garmin-Erholungswerte vom '+latestHealth+
  ' (älter als zwei Tage). Keine vermeintlich aktuelle Erholungsbewertung.'
 const extraCaution=kind==='existing'&&raceActive&&raceDays<=9?
  'Achtung: Trotz Regenerationsphase steht bereits ein Termin im Kalender. Bitte vor Belastung selbst prüfen.':null
 const nextText=extraCaution||next
 const motive=kind==='recovery'||kind==='illness'||kind==='blocked'?
  'Ein bewusst ruhiger Tag gehört zu deinem Fortschritt.':
  kind==='completed'?'Konstanz entsteht durch die richtigen Einheiten – nicht durch ständiges Mehr.':
  'Besser werden heißt, passend zu trainieren – nicht jeden Tag härter.'
 return {
  date:today,kind,label,
  title:tidy(day.title,150),
  guidance,reason:tidy(day.reason,650),
  next:nextText,
  minutes:Number.isFinite(day.minutes)&&day.minutes>0?Math.round(day.minutes):null,
  race:raceInfo,
  dataNote,
  latestHealth,
  source:'Bestehender 7-Tage-Coach · Garmin, Kalender, Rennziele und freiwillige Rückmeldungen',
  actionLabel:kind==='existing'?'Coach und Kalender prüfen':'Ausführliche Coach-Entscheidung',
  motive,
  // The athlete's pain/symptom status cannot be inferred from Garmin metrics.
  symptomNote:raceActive?
   'Beschwerden werden nicht aus Garmin-Werten erkannt. Melde sie selbst über „Beschwerden / Pause“.':null
 }
}
