/**
 * Descriptive pace-at-HR comparison: outdoor easy runs on low-gain terrain,
 * two distinct completed weeks per four-week block, same five-bpm band and
 * same broad distance class, measured FIT speed only.
 * This is NOT laboratory running economy, VO2max or proof of adaptation.
 */
import {longTermWeekStarts} from './coachLongTerm.mjs'
const finite=x=>typeof x==='number'&&Number.isFinite(x)
const round=(v,n=1)=>Number(v.toFixed(n))
const median=values=>{
 const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2)
 return a.length?a.length%2?a[i]:(a[i-1]+a[i])/2:null
}
const validWeek=(row,start)=>{
 if(row?.start!==start||row.readOnly!==true||
  !Number.isInteger(row.totalRunning)||row.totalRunning<0||
  !Number.isInteger(row.eligible)||row.eligible<0||
  !Number.isInteger(row.excluded)||row.excluded<0||
  row.eligible+row.excluded!==row.totalRunning||!Array.isArray(row.runs)||
  row.runs.length!==row.eligible)return false
 return row.runs.every(run=>
  typeof run.date==='string'&&run.date>=start&&run.date<
   new Date(Date.parse(start+'T12:00:00Z')+7*86400000).toISOString().slice(0,10)&&
  ['5–8 km','8–12 km','12–16 km'].includes(run.distanceBand)&&
  finite(run.gainMPerKm)&&run.gainMPerKm>=0&&run.gainMPerKm<=12&&
  Number.isInteger(run.rpe)&&run.rpe>=1&&run.rpe<=5&&
  finite(run.validSeconds)&&run.validSeconds>=1500&&
  finite(run.coveragePercent)&&run.coveragePercent>=80&&
  finite(run.speedCv)&&run.speedCv<=.15&&
  Array.isArray(run.bins)&&run.bins.every(b=>Number.isInteger(b.bpmFrom)&&
   b.bpmTo===b.bpmFrom+4&&b.bpmFrom>=40&&b.bpmTo<=214&&
   finite(b.seconds)&&b.seconds>=300&&
   finite(b.speedMps)&&b.speedMps>=1.2&&b.speedMps<=6.5))
}
const empty={status:'incomplete',comparable:false,readOnly:true,
 title:'Noch keine vergleichbaren lockeren Läufe',
 note:'Erst echte Garmin-FIT-Messwerte, ähnliche Streckenprofile und dieselbe Herzfrequenz erlauben einen vorsichtigen Vergleich.',
 reason:'unavailable',weeksLoaded:0,weeksRequested:8,
 recentRuns:0,previousRuns:0,hrBand:null,distanceBand:null,
 earlierPaceSecKm:null,recentPaceSecKm:null,deltaSecKm:null,
 speedChangePercent:null,previousGain:null,recentGain:null,
 earlierRpe:null,recentRpe:null,previousSeconds:null,recentSeconds:null,
 phase:null,goalName:null,selectedWeeks:[],
 source:'Garmin FIT · Geschwindigkeit bei gleicher HF · gleichartige lockere Läufe'}
export function analyzeAerobicEfficiency({today,weeks=8,weekRows=[],
 profile=null,goal=null}={}){
 const starts=longTermWeekStarts(today,weeks)
 const status=typeof goal?.phase==='string'?goal.phase:null
 const goalName=typeof goal?.race_name==='string'?goal.race_name:null
 const basic={...empty,weeksRequested:weeks,goalName,phase:status}
 if(!starts.length||!Array.isArray(weekRows))return basic
 const min=profile?.zone1Min,max=profile?.zones?.[1]
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<35||max>200||max-min<10)
  return {...basic,reason:'zones-missing',note:'Die aktuellen persönlichen Garmin-Zonen Z1/Z2 fehlen. Ohne sie wird keine lockere Referenz-HF ausgewählt.'}
 const unique=new Map()
 for(const row of weekRows){
  const start=row?.start
  if(!starts.includes(start)||unique.has(start)||!validWeek(row,start))continue
  unique.set(start,row)
 }
 const weeksLoaded=unique.size
 if(starts.slice(0,8).some(s=>!unique.has(s)))
  return {...basic,weeksLoaded,reason:'weeks-missing',
   note:'Mindestens eine der acht abgeschlossenen Garmin-Wochen fehlt. Aus Datenlücken wird kein Tempo-Fortschritt abgeleitet.'}
 const blocks=[starts.slice(0,4),starts.slice(4,8)]
 const samples=blocks.map(period=>period.flatMap(start=>(unique.get(start).runs||[]).map(
  run=>({...run,week:start}))))
 const potential=[]
 const buckets=['5–8 km','8–12 km','12–16 km']
 for(const bucket of buckets){
  for(let bpm=Math.floor(min/5)*5;bpm<=max-4;bpm+=5){
   if(bpm<min||bpm+4>max)continue
   const pair=samples.map(rows=>rows.flatMap(run=>
    run.distanceBand===bucket?run.bins.filter(bin=>
     bin.bpmFrom===bpm&&bin.seconds>=600).map(bin=>({
      date:run.date,week:run.week,
      pace:1000/bin.speedMps,seconds:bin.seconds,
      gain:run.gainMPerKm,rpe:run.rpe
     })):[]))
   const [recent,previous]=pair
   if(recent.length<2||previous.length<2||
    new Set(recent.map(x=>x.week)).size<2||
    new Set(previous.map(x=>x.week)).size<2||
    recent.reduce((s,x)=>s+x.seconds,0)<1200||
    previous.reduce((s,x)=>s+x.seconds,0)<1200)continue
   const recentGain=median(recent.map(x=>x.gain))
   const previousGain=median(previous.map(x=>x.gain))
   if(Math.abs(recentGain-previousGain)>4)continue
   const recentRpe=median(recent.map(x=>x.rpe))
   const previousRpe=median(previous.map(x=>x.rpe))
   if(Math.abs(recentRpe-previousRpe)>1)continue
   potential.push({bucket,bpm,recent,previous,recentGain,previousGain,
    recentRpe,previousRpe,weight:Math.min(
     recent.reduce((s,x)=>s+x.seconds,0),
     previous.reduce((s,x)=>s+x.seconds,0))})
  }
 }
 if(!potential.length)return {...basic,status:'incomplete',weeksLoaded,
  reason:'no-paired-runs',note:'Noch nicht genügend vergleichbare lockere Läufe in derselben 5-bpm-Spanne und Distanzklasse. Das ist kein negatives Fitnessergebnis.'}
 potential.sort((a,b)=>b.weight-a.weight||
  b.recent.length-a.recent.length||a.bpm-b.bpm)
 const best=potential[0]
 const earlierPace=median(best.previous.map(x=>x.pace))
 const recentPace=median(best.recent.map(x=>x.pace))
 const delta=recentPace-earlierPace
 const speedPct=(earlierPace/recentPace-1)*100
 return {...basic,status:'measured',comparable:true,title:'Tempo bei vergleichbarer Herzfrequenz',
  reason:null,weeksLoaded,
  recentRuns:best.recent.length,previousRuns:best.previous.length,
  hrBand:[best.bpm,best.bpm+4],distanceBand:best.bucket,
  earlierPaceSecKm:round(earlierPace),recentPaceSecKm:round(recentPace),
  deltaSecKm:round(delta),speedChangePercent:round(speedPct),
  previousGain:round(best.previousGain),recentGain:round(best.recentGain),
  earlierRpe:round(best.previousRpe),recentRpe:round(best.recentRpe),
  previousSeconds:round(best.previous.reduce((s,x)=>s+x.seconds,0)),
  recentSeconds:round(best.recent.reduce((s,x)=>s+x.seconds,0)),
  selectedWeeks:[...new Set([...best.recent,...best.previous].map(x=>x.week))],
  note:'Beschreibt eine Beobachtung bei ähnlichem Puls, niedrigem RPE und ähnlicher Streckensteigung. Wetter, Wind, Streckenuntergrund, HF-Sensor und Tagesform sind nicht kontrolliert; daraus folgt keine gesicherte Veränderung der Laufökonomie.'}
}
