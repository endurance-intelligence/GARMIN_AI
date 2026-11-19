/**
 * User-confirmed measured running thresholds. No estimate derived from Garmin
 * device zones, HRmax, pace, age or RPE. Uses real FIT duration histogram.
 *
 * An entered field-test threshold is a user-reported estimate, not laboratory
 * confirmation. The three bands show recorded HR time, not session-based TID.
 */
import {longTermWeekStarts} from './coachLongTerm.mjs'

const number=n=>typeof n==='number'&&Number.isFinite(n)
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const add=(s,n)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
const oneDecimal=n=>Math.round(n*10)/10
const pct=(a,b)=>b>0?oneDecimal(100*a/b):null
const statusTexts=[
 'Letzte 4 abgeschlossene Wochen','Die vier Wochen davor','Älteste vier Wochen']
export function validateThresholdCalibration(row,today){
 if(!row||!date(today)||!date(row.tested_on)||
  row.tested_on>today||row.tested_on<'1990-01-01'||
  !Number.isInteger(row.lt1_bpm)||!Number.isInteger(row.lt2_bpm)||
  row.lt1_bpm<70||row.lt1_bpm>195||
  row.lt2_bpm<95||row.lt2_bpm>220||
  row.lt2_bpm-row.lt1_bpm<8||
  !['lab_lactate','lab_ventilatory','field_test'].includes(row.test_type))
  return {valid:false,reason:'Die eingetragenen LT1-/LT2-Werte oder die Testquelle sind nicht plausibel.'}
 const ageDays=Math.round((Date.parse(today+'T12:00:00Z')-
  Date.parse(row.tested_on+'T12:00:00Z'))/86400000)
 return {valid:true,reason:null,ageDays,isOld:ageDays>540,
  isLab:row.test_type!=='field_test'}
}
function weekValid(row,start){
 if(!row||row.start!==start||row.readOnly!==true||
  !Number.isInteger(row.totalActivities)||row.totalActivities<0||
  !Number.isInteger(row.measuredActivities)||row.measuredActivities<0||
  !Number.isInteger(row.skippedActivities)||row.skippedActivities<0||
  row.totalActivities!==row.measuredActivities+row.skippedActivities||
  !number(row.validSeconds)||row.validSeconds<0||
  !number(row.measuredExpectedSeconds)||row.measuredExpectedSeconds<0||
  !row.histogram||typeof row.histogram!=='object'||Array.isArray(row.histogram))return false
 let actual=0
 for(const [k,seconds] of Object.entries(row.histogram)){
  const bpm=Number(k)
  if(!Number.isInteger(bpm)||bpm<35||bpm>220||
   !number(seconds)||seconds<0)return false
  actual+=seconds
 }
 return Math.abs(actual-row.validSeconds)<=Math.max(.1,row.validSeconds*.001)&&
  row.validSeconds<=row.measuredExpectedSeconds*1.08
}
function emptyBlock(index,starts,reason){
 return {index,label:statusTexts[index],start:starts[3]||null,
  end:starts[0]||null,receivedWeeks:0,measuredWeeks:0,
  activities:0,measuredActivities:0,measuredSeconds:0,
  recordingCoverage:null,activityCoverage:null,ready:false,
  seconds:null,shares:null,reason}
}
export function analyzeThresholdIntensity({today,weeks=8,weekRows=[],calibration=null}={}){
 const starts=longTermWeekStarts(today,weeks)
 const test=validateThresholdCalibration(calibration,today)
 const base={status:'no-calibration',basis:'FIT-Zeit in selbst eingetragenen LT1/LT2-Schwellen',
  weeksRequested:weeks,blocks:[],comparable:false,changes:null,
  thresholdSource:calibration?.test_type||null,
  isLab:Boolean(test.valid&&test.isLab),
  testedOn:test.valid?calibration.tested_on:null,
  stale:Boolean(test.valid&&test.isOld),lt1:test.valid?calibration.lt1_bpm:null,
  lt2:test.valid?calibration.lt2_bpm:null,
  readOnly:true,
  warning:'Nur bestätigte Testwerte verwenden. Die erfasste Herzfrequenz kann bei kurzen Belastungen der tatsächlichen Intensität zeitlich hinterherlaufen.'}
 if(!test.valid||!starts.length||!Array.isArray(weekRows))
  return {...base,status:!calibration?'no-calibration':'invalid-calibration'}
 if(test.isOld)return {...base,status:'outdated',
  warning:'Deine Schwellenmessung ist älter als 18 Monate. Für einen neuen physiologischen Zeitvergleich bitte einen aktuelleren Test eintragen.'}
 const byStart=new Map()
 for(const row of weekRows){
  if(typeof row?.start!=='string'||!starts.includes(row.start)||byStart.has(row.start)||
   !weekValid(row,row.start))continue
  byStart.set(row.start,row)
 }
 const blocks=Array.from({length:weeks/4},(_,index)=>{
  const expected=starts.slice(index*4,(index+1)*4)
  const raw=expected.map(s=>byStart.get(s)).filter(Boolean)
  const result=emptyBlock(index,expected,'Nicht genügend gültige FIT-HF-Zeit.')
  const activityCount=raw.reduce((n,w)=>n+w.totalActivities,0)
  const measured=raw.reduce((n,w)=>n+w.measuredActivities,0)
  const validSeconds=raw.reduce((n,w)=>n+w.validSeconds,0)
  const expectedSeconds=raw.reduce((n,w)=>n+w.measuredExpectedSeconds,0)
  const validWeeks=raw.filter(w=>w.measuredActivities>0&&w.validSeconds>0).length
  const activityCoverage=pct(measured,activityCount)
  const recordingCoverage=pct(validSeconds,expectedSeconds)
  const reason=expected.some(s=>s<calibration.tested_on)?
   'Diese vier Wochen liegen mindestens teilweise vor dem angegebenen Schwellentest. Keine rückwirkende Einstufung.':
   raw.length<4?'Mindestens eine Garmin-Woche ist unvollständig oder fehlt.':
   validWeeks<3?'Weniger als drei Wochen haben ausreichend FIT-HF-Zeit.':
   measured<4?'Zu wenige auswertbare Garmin-Läufe.':
   activityCoverage===null||activityCoverage<75?'Zu viele Läufe ohne gültige HF-Zeit.':
   recordingCoverage===null||recordingCoverage<75?'HF-Zeitabdeckung unter 75 %.':
   validSeconds<7200?'Weniger als zwei Stunden gültige FIT-HF-Zeit.':null
  let low=0,mid=0,high=0
  for(const row of raw){
   for(const [rawBpm,secs] of Object.entries(row.histogram)){
    const bpm=Number(rawBpm)
    if(bpm<calibration.lt1_bpm)low+=secs
    else if(bpm<calibration.lt2_bpm)mid+=secs
    else high+=secs
   }
  }
  return {...result,receivedWeeks:raw.length,measuredWeeks:validWeeks,
   activities:activityCount,measuredActivities:measured,
   measuredSeconds:validSeconds,recordingCoverage,activityCoverage,
   ready:reason===null,reason,
   seconds:[low,mid,high],
   shares:validSeconds>0?[pct(low,validSeconds),pct(mid,validSeconds),
    pct(high,validSeconds)]:null}
 })
 const [current,prior]=blocks,comparable=Boolean(current?.ready&&prior?.ready)
 const changes=comparable?{
  low:oneDecimal(current.shares[0]-prior.shares[0]),
  middle:oneDecimal(current.shares[1]-prior.shares[1]),
  high:oneDecimal(current.shares[2]-prior.shares[2])
 }:null
 return {...base,status:comparable?'ready':'incomplete',
  blocks,comparable,changes}
}
