/** GARMIN_AI: Intervals.icu is supplemental evidence, never the primary Garmin record. */
export const scalar=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v)
const isoDay=s=>typeof s==='string'?s.slice(0,10):''
const inRange=(n,min,max)=>n!==null&&n>=min&&n<=max
const rounded=n=>Math.round(n*10)/10
export function runningSportSettings(athlete){
 const all=Array.isArray(athlete?.sportSettings)?athlete.sportSettings:Array.isArray(athlete?.sport_settings)?athlete.sport_settings:[]
 const sports=all.filter(x=>Array.isArray(x?.types)&&x.types.some(t=>/^(run|trailrun|virtualrun|treadmillrun)$/i.test(t)))
 const selected=sports.find(x=>x.types.some(t=>/^run$/i.test(t)))||sports[0]
 if(!selected)return null
 const boundaries=arr=>Array.isArray(arr)?arr.map(scalar).filter(x=>x!==null&&x>0&&x<5000).slice(0,12):[]
 const hr=boundaries(selected.hr_zones),pace=boundaries(selected.pace_zones)
 return {source:'Intervals.icu · konfigurierte Laufzonen',hrZones:hr,paceZones:pace,
  hrNames:Array.isArray(selected.hr_zone_names)?selected.hr_zone_names.slice(0,12).filter(x=>typeof x==='string'):[],
  paceNames:Array.isArray(selected.pace_zone_names)?selected.pace_zone_names.slice(0,12).filter(x=>typeof x==='string'):[],
  lthr:scalar(selected.lthr),maxHr:scalar(selected.max_hr),thresholdPace:scalar(selected.threshold_pace)}
}
export function wellnessTrend(rows,start,end){
 const applicable=(Array.isArray(rows)?rows:[]).filter(x=>typeof x?.id==='string'&&x.id>=start&&x.id<=end)
  .sort((a,b)=>a.id.localeCompare(b.id))
 const valid=applicable.filter(x=>inRange(scalar(x.ctl),0,1000)&&inRange(scalar(x.atl),0,1500))
 if(!valid.length)return null
 const first=valid[0],last=valid.at(-1)
 const ctl=rounded(Number(last.ctl)),atl=rounded(Number(last.atl))
 const prevCtl=rounded(Number(first.ctl)),prevAtl=rounded(Number(first.atl))
 return {asOf:last.id,days:valid.length,ctl,atl,form:rounded(ctl-atl),
  ctlChange:rounded(ctl-prevCtl),atlChange:rounded(atl-prevAtl),
  firstDate:first.id,daysBetween:Math.round((Date.parse(last.id)-Date.parse(first.id))/86400000)}
}
const localMinute=s=>{
 const m=String(s||'').match(/^(\d{4}-\d\d-\d\d)[T ](\d\d):(\d\d)/)
 if(!m)return null
 const t=Date.parse(m[1]+'T'+m[2]+':'+m[3]+':00Z')
 return Number.isFinite(t)?t/60000:null
}
/** Fail closed for overlapping/ambiguous workouts: no double counting, no wrong load. */
export function matchOneGarminActivity(garmin,remote){
 if(!garmin||!Array.isArray(remote))return null
 const start=localMinute(garmin.start_time_local),distance=scalar(garmin.distance_m)
 if(start===null||distance===null||distance<500)return null
 const matches=remote.filter(x=>{
  const kind=String(x?.type||'')
  if(!/run/i.test(kind))return false
  const t=localMinute(x.start_date_local),d=scalar(x.distance)
  if(t===null||d===null)return false
  return Math.abs(start-t)<=5&&Math.abs(distance-d)<=Math.max(250,distance*.05)
 })
 return matches.length===1?matches[0]:null
}
export function activityEvidence(match,detail){
 if(!match)return null
 const raw=detail&&typeof detail==='object'?detail:match
 const load=scalar(raw.icu_training_load??match.icu_training_load)
 const intensity=scalar(raw.icu_intensity??match.icu_intensity)
 const decoupling=scalar(raw.decoupling??match.decoupling)
 const timeZones=Array.isArray(raw.icu_hr_zone_times)?raw.icu_hr_zone_times.map(scalar).slice(0,10):[]
 const safeLoad=inRange(load,0,1500)?rounded(load):null
 return {matched:true,load:safeLoad,intensity:inRange(intensity,0,5)?rounded(intensity):null,
  decoupling:inRange(decoupling,-80,80)?rounded(decoupling):null,
  hrZoneSeconds:timeZones.length&&timeZones.every(v=>v!==null&&v>=0)?timeZones:[],
  source:'Intervals.icu · eindeutig zu Garmin zugeordnet'}
}
export function coachIntervalsNote(result,mode){
 if(!result?.connected)return null
 if(mode==='training'){
  const activity=result.activity
  if(!activity)return 'Für diesen Lauf keine eindeutigen Intervals.icu-Zusatzdaten – Garmin-Bewertung bleibt maßgeblich.'
  return activity.load!==null?`Intervals.icu: Belastungswert ${activity.load} (separat berechnet, nicht doppelt gezählt).`:
   'Intervals.icu-Aktivität zugeordnet; kein belastbarer Load-Wert verfügbar.'
 }
 const t=result.trend
 if(!t)return 'Intervals.icu: Für diese Woche kein vollständiger Fitness-/Fatigue-Verlauf verfügbar.'
 return `Intervals.icu (${t.asOf}): Fitness/CTL ${t.ctl}, Fatigue/ATL ${t.atl}, Form ${t.form>=0?'+':''}${t.form}. `+
  `CTL-Veränderung ${t.ctlChange>=0?'+':''}${t.ctlChange} über ${t.daysBetween} Tage – Trend, keine alleinige Trainingsfreigabe.`
}