/**
 * Match a real Garmin activity to ONE known recurring training opportunity.
 * Never infer attendance from a planned calendar entry, an "Dabei" choice,
 * or merely any run earlier the same day.
 * Garmin timestamps are stored as local wall-clock times (Europe/Berlin).
 */
export type EvidenceActivity={start_time_local:string;sport_type:string;duration_s:number|null}
export type WeeklySlot={code:string;weekday:number;start_time:string;sport?:string}
function dayOf(timestamp:string){return timestamp.slice(0,10)}
function clockMinutes(value:string):number|null{
 const match=/^(\d\d):(\d\d)/.exec(value)
 if(!match)return null
 const h=Number(match[1]),m=Number(match[2])
 return h<24&&m<60?h*60+m:null
}
function activityMinutes(activity:EvidenceActivity){return Number(activity.duration_s||0)/60}
export function completedWeeklyOption(
 option:WeeklySlot,date:string,activities:EvidenceActivity[]
):EvidenceActivity|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(activities))return null
 const weekday=new Date(date+'T12:00:00Z').getUTCDay()
 if((weekday||7)!==option.weekday)return null
 const planned=clockMinutes(option.start_time)
 if(planned===null)return null
 const candidates=activities.filter(activity=>{
  if(dayOf(activity.start_time_local)!==date||activityMinutes(activity)<20)return false
  const sport=activity.sport_type.toLowerCase()
  const isFootball=option.code==='football-mon'
  if(isFootball?sport!=='soccer'&&sport!=='football':
    !/running|run|treadmill|trail_running/.test(sport))return false
  const actual=clockMinutes(activity.start_time_local.slice(11).trim())
  // Time evidence required; no claim based on a same-day morning run.
  if(actual===null)return false
  return Math.abs(actual-planned)<=105
 })
 return candidates[0]??null
}
