/**
 * Race result: only uniquely matched Garmin activity from the race date.
 * Avoid mislabeling ordinary runs when evidence is ambiguous.
 */
const valid=n=>typeof n==='number'&&Number.isFinite(n)
const raceSport=s=>typeof s==='string'&&/run|trail|ultra|treadmill/i.test(s)
export function assessRaceOutcome({raceDate,raceDistanceKm,plannedMinutes,board,checks}){
 const rows=Array.isArray(board?.activities)?board.activities:[]
 const candidates=rows.filter(a=>{
  if(!a||typeof a.start_time_local!=='string'||a.start_time_local.slice(0,10)!==raceDate||
   !raceSport(a.sport_type)||!valid(a.duration_s)||a.duration_s<=0)return false
  const distance=valid(a.distance_m)?a.distance_m/1000:null
  return distance!==null&&valid(raceDistanceKm)&&raceDistanceKm>0&&
   Math.abs(distance-raceDistanceKm)<=Math.max(2,raceDistanceKm*.08)
 })
 const found=candidates.length===1?candidates[0]:null
 const current=Array.isArray(checks)?checks.filter(c=>c?.raceDate===raceDate&&
  typeof c.reportedOn==='string').sort((a,b)=>b.reportedOn.localeCompare(a.reportedOn))[0]:null
 const time=found?Math.round(found.duration_s/60):null
 const diff=time!==null&&valid(plannedMinutes)?time-Math.round(plannedMinutes):null
 return {matchStatus:found?'unique':candidates.length>1?'ambiguous':'unavailable',
  actualKm:found?Math.round(found.distance_m/100)/10:null,
  actualMinutes:time,planDeltaMinutes:diff,
  raceCheck:current?{reportedOn:current.reportedOn,fatigue:current.fatigue,
   soreness:current.soreness,warning:current.warning===true}:null,
  source:'Garmin activity with matching race date and distance; own recovery check',
  caveat:'Garmin-Dauer kann Pausen anders erfassen als die Planung. Aus einer Aktivität '+
   'lassen sich tatsächlich gegessene Kohlenhydrate und Trinkmenge nicht belegen.'}
}
