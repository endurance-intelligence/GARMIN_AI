import {createClient} from 'npm:@supabase/supabase-js@2'
import {readArchiveCoachInput} from './coach-archive-reader.ts'
import {buildSevenDayCoach} from '../../../src/lib/coachSevenDay.mjs'
import {buildArchiveQualitySnapshot} from '../../../src/lib/clubQuality.mjs'
import {QUALITY_SESSION} from '../../../src/lib/qualityWorkout.mjs'
/** Fresh canonical decision at each write gate, with the exact saved
 * workout temporarily omitted only for re-evaluation. Never writes plans. */
export async function currentQualityCandidate(db:ReturnType<typeof createClient>,userId:string,date:string,excludeId?:string){
 try{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const part=(name:string)=>parts.find(p=>p.type===name)?.value||''
  const today=[part('year'),part('month'),part('day')].join('-')
  if(date<today)return null
  const input=await readArchiveCoachInput(db,userId,today)
  const entries=input.plans.entries.filter(p=>p.id!==excludeId)
  if(entries.some(p=>p.training_date===date&&p.state!=='cancelled'))return null
  const plan=buildSevenDayCoach({...input,today,plans:{...input.plans,entries}})
  const d=plan.days.find(x=>x.date===date)
  return d&&d.kind===QUALITY_SESSION.kind&&(d.qualityArchive||d.minutes===QUALITY_SESSION.minutes)&&d.approvable&&!d.decision&&!d.selectedGroup&&d.qualityIntent==='candidate'&&!d.qualityBlocked&&plan.trainingMethod?.qualityDay===date?d:null
 }catch{return null}
}

/** JSONB may reorder object keys. Compare exact immutable steps, not strings
 * supplied by the browser, before approval and publication. */
const stable=(v:any):string=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v)
export async function qualityStillAllowed(db:ReturnType<typeof createClient>,userId:string,date:string,excludeId?:string,expected?:any){
 const d=await currentQualityCandidate(db,userId,date,excludeId)
 if(!d)return false
 if(!d.qualityArchive)return !expected||expected.qualitySource!=='archive'
 if(!expected||expected.qualitySource!=='archive')return false
 const canonical=buildArchiveQualitySnapshot(d.qualityArchive,expected.startTime)
 return !!canonical&&stable(canonical)===stable(expected)
}
