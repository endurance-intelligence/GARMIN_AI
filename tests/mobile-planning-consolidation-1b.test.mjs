import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {archiveFromCoach,runCoachArchive} from '../src/lib/coachArchiveJob.mjs'
import {buildSevenDayCoach,coachMonday,coachAddDays} from '../src/lib/coachSevenDay.mjs'
import {makePlanSnapshot} from '../src/lib/trainingHistory.mjs'
import {archiveBundle} from '../scripts/build-coach-archive-bundle.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-26',start=coachMonday(today)
function fixture(){
 return {
  health:{metrics:Array.from({length:18},(_,i)=>({metric_date:coachAddDays(today,i-17),hrv_ms:50,resting_heart_rate:42,sleep_seconds:27000})),training:{runKm7:30,previousRunKm7:40,historyStatus:'complete',truncated:false}},
  boards:[start,coachAddDays(start,7),...Array.from({length:4},(_,i)=>coachAddDays(start,-7*(i+1)))].map(start=>({start,activities:[],manual:[],health:[]})),
  plans:{entries:[]},options:{options:[],choices:[]},
  goal:{goal:{race_date:'2027-04-25',race_name:'Ultra',distance_km:60}},racePortfolio:{others:[]},
  life:{context:{illness_state:'well',blocked_periods:[],run_reviews:[],day_decisions:[]},runs:[],trainingRhythm:{rowing:{days:[4],minutes:30},strength:{days:[5],minutes:30}}}
 }
}
test('worker uses identical rules and serialization as the interactive Coach',()=>{
 const data=fixture(),p=buildSevenDayCoach({...data,today})
 const expected=makePlanSnapshot({budget:p.weeklyBudgets.find(w=>w.current),days:p.days,plans:data.plans.entries,options:data.options.options,choices:data.options.choices,today,goalName:p.goalProfile?.name??null})
 assert.deepEqual(archiveFromCoach(today,data),expected)
})
test('preview cannot write and archive confirms the correct week',async()=>{
 let writes=0
 const load=async()=>fixture(),save=async(snapshot)=>{writes++;return {id:'fixture',week_start:snapshot.weekStart,snapshot}}
 const preview=await runCoachArchive({today,load,save})
 assert.equal(preview.stored,false);assert.equal(writes,0)
 const actual=await runCoachArchive({today,load,save,dryRun:false})
 assert.equal(actual.stored,true);assert.equal(actual.weekStart,start);assert.equal(writes,1)
 await assert.rejects(()=>runCoachArchive({today,load,save:async()=>({id:'fixture',week_start:'2026-11-16'}),dryRun:false}),/not confirmed/)
})
test('missing rhythm and incomplete evidence never produce misleading archives',async()=>{
 for(const mutate of [d=>delete d.life.trainingRhythm,d=>delete d.health.training,d=>d.health.training.truncated=true,d=>d.boards=[],d=>delete d.options.choices]){
  const d=fixture();mutate(d)
  let writes=0
  await assert.rejects(()=>runCoachArchive({today,load:async()=>d,save:async()=>{writes++},dryRun:false}),/Incomplete/)
  assert.equal(writes,0)
 }
})
test('bundle contains exact Coach code rather than a separately maintained planner',()=>{
 const bundle=archiveBundle()
 assert.ok(bundle.length>15)
 const core=bundle.find(f=>f.name==='core/coachSevenDay.mjs')
 assert.equal(core.content,read('src/lib/coachSevenDay.mjs'))
 assert.match(bundle.find(f=>f.name==='index.ts').content,/\.\/core\/coachArchiveJob.mjs/)
 assert.match(bundle.find(f=>f.name==='_shared/coach-archive-reader.ts').content,/\.\.\/core\/coachSevenDay.mjs/)
})
test('private worker validates existing cron credential before reading owner data, never approves',()=>{
 const edge=read('supabase/functions/garmin-coach-archive/index.ts'),reader=read('supabase/functions/_shared/coach-archive-reader.ts')
 assert.match(edge,/garmin_verify_cron_token/)
 assert.ok(edge.indexOf('if(allowed!==true)')<edge.indexOf('const userId=await findOwner'))
 assert.match(edge,/u.email_confirmed_at/)
 assert.match(edge,/garmin_archive_week_revision/)
 assert.doesNotMatch(edge,/\.upsert\(|\.insert\(|\.update\(|\.delete\(|generateLink|signInWith/)
 assert.doesNotMatch(reader,/\.upsert\(|\.insert\(|\.update\(|\.delete\(/)
 assert.match(reader,/Central training rhythm not initialized/)
 // Until the consolidated read API is adopted, prevent the volume helper from drifting.
 const health=read('supabase/functions/read-garmin-health/index.ts')
 const helper=read('supabase/functions/_shared/coach-health-read.ts')
 assert.equal(helper.slice(helper.indexOf('export function utcDay(')).replace('export function utcDay(','function utcDay(').replace('export async function readTraining(','async function readTraining('),health.slice(health.indexOf('function utcDay('),health.indexOf('Deno.serve(')))
})
