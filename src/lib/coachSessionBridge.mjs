/** Read-only bridge: the Coach overview and Session Analyst share assessPlanActual.
 * Never infer workout completion from calendar date alone or missing Garmin data.
 * Garmin activity IDs are only used for explicit navigation to a private read API.
 */
import {assessPlanActual} from './planActual.mjs'
import {normalizeGarminRpe,garminFeelingLabel} from './garminPerception.mjs'

const SPORTS=new Set(['running','track_running','treadmill_running','ultra_run','trail_running'])
const ISO=/^\d{4}-\d{2}-\d{2}$/
const validDay=s=>typeof s==='string'&&ISO.test(s)&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
const validNumber=n=>typeof n==='number'&&Number.isFinite(n)
const dateOf=s=>typeof s==='string'?s.slice(0,10):''
const title=a=>typeof a.activity_name==='string'&&a.activity_name.trim()?
 a.activity_name.trim().slice(0,120):'Garmin-Lauf'

export function buildCoachSessionBridge({boards,plans,today,limit=4}={}){
 if(!validDay(today)||!Array.isArray(boards)||!Array.isArray(plans)||
  boards.some(b=>!b||!Array.isArray(b.activities)))
  return {status:'unavailable',items:[],totalRuns:null,matchedCount:null}
 const byId=new Map()
 for(const board of boards){
  for(const a of board.activities){
   if(!a||!(typeof a.activity_id==='string'||typeof a.activity_id==='number'))continue
   const id=String(a.activity_id).trim()
   const date=a.start_time_local
   const day=dateOf(date)
   if(!id||!validDay(day)||day>today||!SPORTS.has(String(a.sport_type).toLowerCase())||
    typeof date!=='string'||!/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.test(date))continue
   const prev=byId.get(id)
   const richness=(x)=>Number(validNumber(x.duration_s))+Number(validNumber(x.distance_m))+
    Number(validNumber(x.average_heart_rate))+Number(normalizeGarminRpe(x.rpe_raw)!==null)
   if(!prev||richness(a)>richness(prev))byId.set(id,a)
  }
 }
 const source=[...byId.values()].sort((a,b)=>
  String(b.start_time_local).localeCompare(String(a.start_time_local))||
  String(b.activity_id).localeCompare(String(a.activity_id)))
 const activities=source.map(a=>({
  id:String(a.activity_id),name:title(a),date:String(a.start_time_local),
  sport:String(a.sport_type)==='trail_running'?'running':String(a.sport_type),
  durationS:validNumber(a.duration_s)?a.duration_s:null,
  distanceM:validNumber(a.distance_m)?a.distance_m:null,
  avgHr:validNumber(a.average_heart_rate)?a.average_heart_rate:null
 }))
 const prepared=source.map((row,i)=>{
  const activity=activities[i]
  const match=assessPlanActual(activity,activities,plans)
  return {id:activity.id,title:activity.name,date:activity.date,
   durationMinutes:activity.durationS===null?null:Math.round(activity.durationS/60),
   distanceKm:activity.distanceM===null?null:Math.round(activity.distanceM/100)/10,
   avgHr:activity.avgHr,rpe:normalizeGarminRpe(row.rpe_raw),
   feeling:garminFeelingLabel(row.feeling_raw),match}
 })
 const size=Number.isInteger(limit)?Math.max(1,Math.min(limit,10)):4
 const items=prepared.slice(0,size)
 return {status:source.length?'ready':'empty',items,totalRuns:source.length,
  matchedCount:prepared.filter(x=>x.match.status==='matched').length}
}
