/**
 * Historic 8/12 completed ISO weeks, using the same owner-authorized weekly
 * Garmin boards and proven four-week deduplication/decision semantics.
 * No fitness scores, guessed HR zones, missing-week zeros or calendar writes.
 */
import {analyzeCoachFourWeeks} from './coachFourWeeks.mjs'
import {normalizeGarminRpe} from './garminPerception.mjs'

const DAY=86400000
const RUN=new Set(['running','track_running','treadmill_running','ultra_run','trail_running'])
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const shift=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*DAY).toISOString().slice(0,10)
const monday=s=>shift(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7))
const finite=n=>typeof n==='number'&&Number.isFinite(n)
const median=a=>{
 const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2)
 return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):null
}
const round=n=>Math.round(n*10)/10
export function longTermWeekStarts(today,count=12){
 if(!validDate(today)||![8,12].includes(count))return []
 const anchor=monday(today)
 return Array.from({length:count},(_,i)=>shift(anchor,-7*(i+1)))
}
const selectedRpe=(boards,start,end)=>{
 const byId=new Map()
 for(const board of boards||[]){
  for(const a of Array.isArray(board?.activities)?board.activities:[]){
   if(!a||!RUN.has(String(a.sport_type||'')))continue
   const d=String(a.start_time_local||'').slice(0,10)
   if(!validDate(d)||d<start||d>end)continue
   const id=a.activity_id
   if(!['string','number'].includes(typeof id)||!String(id))continue
   const rpe=normalizeGarminRpe(a.rpe_raw)
   const prev=byId.get(String(id))
   // If duplicates differ, prefer the actual entry containing athlete RPE.
   if(!prev||(prev.rpe===null&&rpe!==null))byId.set(String(id),{rpe})
  }
 }
 const values=[...byId.values()].map(x=>x.rpe).filter(x=>x!==null)
 return {low:values.filter(x=>x<=4).length,
  moderate:values.filter(x=>x>=5&&x<=7).length,
  high:values.filter(x=>x>=8).length,
  count:values.length,missing:Math.max(0,byId.size-values.length)}
}
const statusMessage=(trend,hasEvidence,flags)=>{
 if(!hasEvidence)return {
  title:'Noch nicht genügend belastbare Wochen',
  advice:'Fehlende oder unvollständige Garmin-Wochen sind unbekannt, nicht null. Keine Empfehlung zur Steigerung.'}
 if(flags.length)return {
  title:'Belastungsverlauf bewusst vorsichtig lesen',
  advice:'Die Garmin-Historie enthält deutliche Umfangsänderungen oder mehrere harte Rückmeldungen. '+
   'Regeneration prüfen, keine versäumten Kilometer nachholen und keine neue Intensität erzwingen.'}
 if(trend==='stable')return {
  title:'Konstanter Laufumfang in der Historie',
  advice:'Ein relativ gleichmäßiger Umfang ist eine Grundlage, aber noch keine Trainingsfreigabe. '+
   'Der 7-Tage-Coach entscheidet nach aktuellem Befinden, Wettkampfphase und Freigabe.'}
 if(trend==='up')return {
  title:'Umfang über die Wochen gestiegen',
  advice:'Der dokumentierte Laufumfang ist höher als im vorherigen Vierwochenblock. '+
   'Nicht aus dieser Zahl allein weiter steigern: aktuelle Regeneration und Garmin-RPE prüfen.'}
 if(trend==='down')return {
  title:'Umfang zuletzt niedriger',
  advice:'Der Umfang liegt unter dem vorherigen Vierwochenblock. Keine Kilometer nachholen; '+
   'bei stabilem Wohlbefinden den Wiedereinstieg im 7-Tage-Coach prüfen.'}
 return {
  title:'Schwankender oder nicht eindeutig gerichteter Verlauf',
  advice:'Kein belastbarer Trend für zusätzliche Belastung. Bestehende Routine und '+
   'Garmin-Rückmeldungen haben Vorrang.'}
}
export function analyzeCoachLongTerm({today,boards=[],plans={entries:[]},life={},weeks=8,
 raceDate=null}={}){
 const unavailable={status:'unavailable',weeksRequested:weeks,completeWeeks:0,
  measuredWeeks:0,weeks:[],blocks:[],currentMedianKm:null,previousMedianKm:null,
  oldestMedianKm:null,changePct:null,trend:'unknown',reviewedRpe:0,rpe:{
   low:0,moderate:0,high:0,count:0,missing:0},
  longRunsMeasured:0,hardWeeks:0,flags:[],raceProtected:false,
  title:'Langfristiger Garmin-Verlauf nicht verfügbar',
  advice:'Bitte Datengrundlage prüfen. Keine automatische Planänderung.',
  source:'Garmin · abgeschlossene ISO-Wochen; nur vorhandene Messwerte',
  readOnly:true}
 if(!validDate(today)||![8,12].includes(weeks)||!Array.isArray(boards)||
  !Array.isArray(plans?.entries))return unavailable
 const starts=longTermWeekStarts(today,weeks)
 const reviews=Array.from({length:weeks/4},(_,i)=>analyzeCoachFourWeeks({
  today:shift(today,-28*i),boards,plans,life
 }))
 const all=reviews.flatMap(r=>r.weeks).slice(0,weeks)
 if(all.length!==weeks)return unavailable
 const data=all.map(w=>{
  const rpe=w.available?selectedRpe(boards,w.start,w.end):null
  return {...w,rpe}
 })
 const completeWeeks=data.filter(w=>w.available).length
 const measuredWeeks=data.filter(w=>w.available&&finite(w.distanceKm)&&w.distanceKm>=0).length
 const blocks=Array.from({length:weeks/4},(_,i)=>{
  const part=data.slice(4*i,4*(i+1))
  const measured=part.filter(w=>w.available&&finite(w.distanceKm)&&
   w.distanceKm>=0&&Number.isInteger(w.runs))
  return {label:i===0?'Letzte 4 Wochen':i===1?'Davor 4 Wochen':'Älteste 4 Wochen',
   measured:measured.length,complete:part.filter(w=>w.available).length,
   medianKm:measured.length>=3?round(median(measured.map(w=>w.distanceKm))):null,
   totalKm:measured.length===4?round(measured.reduce((n,w)=>n+w.distanceKm,0)):null}
 })
 const [current,prior,oldest]=blocks
 const enough=blocks[0]?.measured===4&&blocks[1]?.measured===4&&
  current.medianKm!==null&&prior.medianKm!==null&&prior.medianKm>=10
 const pct=enough?Math.round((current.medianKm/prior.medianKm-1)*100):null
 const trend=pct===null?'unknown':pct>15?'up':pct< -15?'down':'stable'
 const validRpe=data.filter(w=>w.available&&w.rpe)
 const rpe=validRpe.reduce((s,w)=>({
  low:s.low+w.rpe.low,moderate:s.moderate+w.rpe.moderate,
  high:s.high+w.rpe.high,count:s.count+w.rpe.count,
  missing:s.missing+w.rpe.missing
 }),{low:0,moderate:0,high:0,count:0,missing:0})
 const hardWeeks=data.filter(w=>w.available&&w.hard!==null&&w.hard>0).length
 const flags=[]
 const measuredNewest=data.slice(0,4).filter(w=>w.available&&finite(w.distanceKm)&&
  w.distanceKm>=0&&w.runs>=1)
 if(enough&&pct>30)flags.push('Deutlicher Umfangsanstieg gegenüber den vorherigen vier Wochen')
 if(enough&&pct< -30)flags.push('Deutlicher Umfangsrückgang; keine ausgefallenen Kilometer nachholen')
 if(measuredNewest.length>=3&&rpe.count>=4&&data.slice(0,4).filter(w=>w.hard>0).length>=2)
  flags.push('Mehrere jüngere Wochen mit sehr hartem Garmin-RPE oder schwachem Gefühl')
 const longRunsMeasured=data.filter(w=>w.available&&finite(w.longestRunMinutes)&&
  w.longestRunMinutes>=60).length
 const protectedRace=validDate(raceDate)&&
  Math.round((Date.parse(raceDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/DAY)>=-14&&
  Math.round((Date.parse(raceDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/DAY)<=21
 const msg=statusMessage(trend,enough,flags)
 const missing=completeWeeks<weeks||measuredWeeks<weeks
 return {...unavailable,status:missing?'partial':enough?'ready':'limited',
  weeksRequested:weeks,completeWeeks,measuredWeeks,weeks:data,blocks,
  currentMedianKm:current?.medianKm??null,previousMedianKm:prior?.medianKm??null,
  oldestMedianKm:oldest?.medianKm??null,changePct:pct,trend,
  reviewedRpe:rpe.count,rpe,longRunsMeasured,hardWeeks,flags,
  raceProtected:protectedRace,
  title:protectedRace?'Wettkampfphase: Langzeitdaten nur zur Einordnung':msg.title,
  advice:protectedRace?
   'Die Langzeitanalyse bleibt rein informativ. Wettkampfvorbereitung und anschließende Erholung '+
   'haben Vorrang; keine zusätzliche Belastung aus einer Langzeitquote.':msg.advice}
}
