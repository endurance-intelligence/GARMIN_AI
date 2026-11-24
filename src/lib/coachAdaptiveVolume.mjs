/**
 * Conservative weekly workload progression.
 *
 * Garmin measurements underpin the trend; the weekly coach may only revise one
 * NEW, open long-run suggestion. No unilateral calendar writes or auto-approval.
 * The previous weeks' mileage does not estimate LT1 time or fitness.
 */
const DAY=86400000
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const daysBetween=(a,b)=>(Date.parse(a+'T12:00:00Z')-
 Date.parse(b+'T12:00:00Z'))/DAY
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const km=n=>finite(n)?n.toLocaleString('de-DE',{maximumFractionDigits:1})+' km':'unbekannt'
const median=values=>{
 const s=[...values].sort((a,b)=>a-b)
 return s.length?s.length%2?s[Math.floor(s.length/2)]:
  (s[s.length/2-1]+s[s.length/2])/2:null
}
const base=(status,title,reason,extra={})=>({
 status,title,reason,changeMinutes:0,baselineKm:null,latestKm:null,
 weeksUsed:0,appliedDate:null,source:'Garmin · abgeschlossene Wochen',
 ...extra
})
/** volume 4 completed ISO weeks; never treat an absent or partial week as 0. */
export function analyzeAdaptiveVolume({
 today,history,goal=null,ill=false,returning=false,postIllness=false,
 symptoms=false,caution=false,feedbackCaution=false,trendReducing=false,
 trendShortening=false,observationLimited=false,recentImpactEffect=null
}={}){
 const missing=base('insufficient','Umfang: noch keine Anpassung',
  'Mindestens drei aufeinanderfolgende abgeschlossene Garmin-Wochen mit vollständigen Laufdistanzen nötig.')
 if(!date(today)||!Array.isArray(history?.weeks))return missing
 const raceDate=goal?.race_date
 const daysToRace=date(raceDate)?daysBetween(raceDate,today):null
 const protectedRace=daysToRace!==null&&daysToRace>=-14&&daysToRace<=21
 if(protectedRace)return base('protected','Wettkampfphase hat Vorrang',
  daysToRace>=0?'Noch '+daysToRace+' Tage bis '+String(goal?.race_name||'zum Rennen')+
   ': keine Steigerung aus vergangenen Trainingswochen.':
   'Nach dem Wettkampf hat Erholung Vorrang. Keine Umfangssteigerung.',{
   racePhase:true})
 if(history.lowIntensityCautionKinds?.length)
  return base('protected','Lockere Belastung zuerst stabilisieren',
   'Wiederholt hohe subjektive Belastung bei geplanten lockeren oder langen Läufen. Keine neue Umfangssteigerung aus dem Vierwochenverlauf.')
 if(ill||returning||postIllness||symptoms||caution||feedbackCaution||
  trendReducing||trendShortening||recentImpactEffect==='shortened'||
  history.qualityCaution)
  return base('protected','Erholung vor Umfang',
   'Aktuelle Erholung, Garmin-Bewertungen oder jüngstes Trainingsfeedback haben Vorrang. Keine neue Umfangssteuerung.')
 const weeks=history.weeks.slice(0,4)
 const measured=weeks.filter((w,i)=>i<3&&w?.available&&
  finite(w.distanceKm)&&w.distanceKm>=0&&Number.isInteger(w.runs))
 if(measured.length!==3)return missing
 const latest=weeks[0].distanceKm
 const previous=[weeks[1].distanceKm,weeks[2].distanceKm]
 const baseline=median(previous)
 if(baseline===null||baseline<15)
  return base('insufficient','Noch keine belastbare Umfangsbasis',
   'Für eine mehrwöchige Ableitung ist der dokumentierte Laufumfang bisher zu gering oder ungleichmäßig.',{
    weeksUsed:3,baselineKm:baseline,latestKm:latest})
 const context={weeksUsed:3,baselineKm:Math.round(baseline*10)/10,
  latestKm:latest}
 // Large deviations are reasons not to add training; don't "catch up" lost volume.
 if(latest>baseline*1.3&&latest-baseline>=8)
  return base('reduce','Umfangssprung erkannt',
   'Letzte Garmin-Woche '+km(latest)+' gegenüber '+km(baseline)+
   ' im Median der zwei Vorwochen. Keinen weiteren langen Lauf draufpacken; '+
   'allenfalls den nächsten offenen langen Vorschlag kürzen.',{
    ...context,changeMinutes:-15})
 if(latest<baseline*.65&&baseline-latest>=8)
  return base('reduce','Umfang zuletzt deutlich niedriger',
   'Letzte Garmin-Woche '+km(latest)+' gegenüber '+km(baseline)+
   ' im Median der Vorwochen. Nicht versuchen, ausgefallene Kilometer nachzuholen; '+
   'den nächsten offenen langen Vorschlag vorsichtiger halten.',{
    ...context,changeMinutes:-15})
 // Before any progression, require four measured, relatively stable weeks, plus
 // evidence of a tolerated >=60min run in each of the two latest weeks.
 const allFour=weeks.length===4&&weeks.every(w=>w?.available&&
  finite(w.distanceKm)&&w.distanceKm>=25&&Number.isInteger(w.runs)&&w.runs>=2)
 const recentTwo=allFour&&weeks.slice(0,2).every(w=>
  Number.isFinite(w.longestRunMinutes)&&w.longestRunMinutes>=60)
 const stable=allFour&&weeks.every(w=>Math.abs(w.distanceKm-
  median(weeks.map(x=>x.distanceKm)))<=Math.max(8,median(weeks.map(x=>x.distanceKm))*.25))
 const ratingEvidence=history.totalRated>=4&&!history.qualityCaution
 const recentSteady=latest>=baseline*.85&&latest<=baseline*1.15
 const verified=allFour&&recentTwo&&stable&&ratingEvidence&&recentSteady&&
  !observationLimited
 if(verified)
  return base('progress','Stabiler Trainingsverlauf',
   'Vier Garmin-Wochen mit ähnlichem Laufumfang, zwei dokumentierte Läufe von '+
   'je mindestens 60 Minuten und mehrere Garmin-Bewertungen. Ein offener langer '+
   'Lauf darf als vorsichtiger Vorschlag um höchstens fünf Minuten wachsen; '+
   'nur locker unter LT1 und nur nach deiner Freigabe.',{
    ...context,weeksUsed:4,changeMinutes:5})
 return base('maintain','Umfang zunächst beibehalten',
  'Keine zusätzliche Steigerung aus der Vierwochenhistorie. Gründe können schwankende '+
  'Umfänge, fehlende längere Läufe, wenige Garmin-Bewertungen oder unvollständige '+
  'Erholungsdaten sein. Locker und konstant bleibt die Grundlage.',context)
}
const plus=(day,delta)=>new Date(Date.parse(day+'T12:00:00Z')+delta*DAY)
 .toISOString().slice(0,10)
/** Apply once, never touch approved, completed, chosen, race or recovery days. */
export function applyAdaptiveVolume(days,assessment,{today}={}){
 if(!Array.isArray(days)||!date(today)||!['progress','reduce'].includes(
  assessment?.status))return {days,appliedDate:null,effect:'none'}
 const upper=plus(today,6)
 let appliedDate=null, effect='none'
 const modified=days.map(day=>{
  if(appliedDate||!day||day.kind!=='long'||day.sport!=='running'||
   !day.approvable||day.decision||day.date<today||day.date>upper||
   !Number.isInteger(day.minutes)||day.minutes<45)return day
  const next=assessment.status==='progress'?Math.min(day.minutes+5,75):
   Math.max(45,day.minutes-15)
  if(next===day.minutes)return day
  appliedDate=day.date
  effect=assessment.status==='progress'?'progress':'reduced'
  const desc=assessment.status==='progress'?'Vorsichtiger Aufbau':'Umfang bewusst kürzen'
  return {...day,kind:next<60?'easy':'long',minutes:next,
   title:desc+' · '+next+' Min. locker',
   reason:day.reason+' Vierwochen-Coach: '+assessment.reason+
    ' Bisher '+day.minutes+' Minuten, neuer Vorschlag '+next+
    ' Minuten. Kein Kalendereintrag und keine Garmin-Einheit geändert. '+
    'Nur nach deiner Freigabe.'}
 })
 return {days:modified,appliedDate,effect}
}
