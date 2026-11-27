import {createClient} from 'npm:@supabase/supabase-js@2'
import {readArchiveCoachInput} from './coach-archive-reader.ts'
import {buildSevenDayCoach} from '../../../src/lib/coachSevenDay.mjs'
import {QUALITY_SESSION} from '../../../src/lib/qualityWorkout.mjs'
/** Fresh canonical decision at each write gate, with the exact saved
 * workout temporarily omitted only for re-evaluation. Never writes plans. */
export async function qualityStillAllowed(db:ReturnType<typeof createClient>,userId:string,date:string,excludeId?:string){
 try{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const part=(name:string)=>parts.find(p=>p.type===name)?.value||''
  const today=[part('year'),part('month'),part('day')].join('-')
  if(date<today)return false
  const input=await readArchiveCoachInput(db,userId,today)
  const entries=input.plans.entries.filter(p=>p.id!==excludeId)
  if(entries.some(p=>p.training_date===date&&p.state!=='cancelled'))return false
  const plan=buildSevenDayCoach({...input,today,plans:{...input.plans,entries}})
  const d=plan.days.find(x=>x.date===date)
  return !!d&&d.kind===QUALITY_SESSION.kind&&d.minutes===QUALITY_SESSION.minutes&&d.approvable&&!d.decision&&!d.selectedGroup&&d.qualityIntent==='candidate'&&!d.qualityBlocked&&plan.trainingMethod?.qualityDay===date
 }catch{return false}
}
