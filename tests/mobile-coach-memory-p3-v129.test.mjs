import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildCoachMemory,boundedCoachReason} from '../src/lib/coachMemory.mjs'
import {buildCoachStructuredSnapshot} from '../supabase/functions/_shared/coach-structured-workout.mjs'
import {buildIntervalsWorkout} from '../supabase/functions/_shared/intervals-workout.mjs'
const today='2026-11-24'
const make=(id,d,state='confirmed',reason='Testgrund')=>({
 id,training_date:d,title:'Coach',state,sport:'running',archive_snapshot:buildCoachStructuredSnapshot({
  title:'Coach',kind:'easy',minutes:40,startTime:'19:00',coachReason:reason})})
const run=(id,d)=>({activity_id:id,sport_type:'running',start_time_local:d+' 19:05:00',
 duration_s:2400,distance_m:6000,rpe_raw:40,feeling_raw:75})
const fixture=()=>({plans:{historyFrom:'2026-10-10',entries:[
 make('a','2026-11-16'),make('b','2026-11-17','draft'),make('c','2026-10-26','confirmed',undefined),
 make('d','2026-11-18','cancelled'),make('e','2026-11-19','confirmed','')]},
 boards:[{start:'2026-11-16',activities:[run('x','2026-11-16'),run('y','2026-11-17'),run('z','2026-11-18')]}],
 life:{context:{day_decisions:[{date:'2026-11-18',choice:'declined'},{date:'2026-11-17',choice:'accepted'}]}}})
test('stored rationale, explicit plan state and real Garmin outcome remain separate',()=>{
 const m=buildCoachMemory({today,snapshot:fixture()})
 const a=m.entries.find(x=>x.id==='a')
 assert.equal(a.reason,'Testgrund');assert.equal(a.plannedMinutes,40)
 assert.deepEqual(a.actual,{minutes:40,distanceKm:6,rpe:4,feeling:'Gut'})
 assert.equal(m.entries.find(x=>x.id==='b').outcome,'draft')
 assert.equal(m.entries.find(x=>x.id==='d').outcome,'cancelled')
 assert.equal(m.entries.find(x=>x.id==='c').outcome,'unavailable')
 assert.equal(m.entries.find(x=>x.id==='e').reason,null)
 assert.equal(m.entries.find(x=>x.id==='e').outcome,'unlinked')
 assert.equal(m.totalDecisions,2)
})
test('ambiguous or duplicate Garmin sessions do not falsely prove execution',()=>{
 const f=fixture()
 f.boards[0].activities.push(run('second','2026-11-16'))
 const a=buildCoachMemory({today,snapshot:f}).entries.find(x=>x.id==='a')
 assert.equal(a.actual,null);assert.equal(a.outcome,'unlinked')
})
test('all loaded runs considered, not just the ten most recent',()=>{
 const f=fixture()
 f.boards[0].activities.push(...Array.from({length:11},(_,i)=>run('extra'+i,'2026-11-22')))
 assert.equal(buildCoachMemory({today,snapshot:f}).entries.find(x=>x.id==='a').outcome,'matched')
})
test('bounded private reason persists without changing exported workout or old client contract',()=>{
 const input={title:'Coach',kind:'easy',minutes:40,startTime:'19:00'}
 const old=buildCoachStructuredSnapshot(input)
 const reason=boundedCoachReason('🧠 "Test" '.repeat(200))
 assert.ok(reason.endsWith('…'))
 assert.ok(new TextEncoder().encode(JSON.stringify(reason)).length<=600)
 const fresh=buildCoachStructuredSnapshot({...input,coachReason:reason})
 assert.equal(fresh.coachReason,reason)
 assert.equal(old.coachReason,undefined)
 assert.deepEqual(buildIntervalsWorkout(old,'Coach'),buildIntervalsWorkout(fresh,'Coach'))
 assert.equal(buildCoachStructuredSnapshot({...input,coachReason:'x'.repeat(401)}).coachReason,undefined)
})
test('both Coach and calendar proposal paths persist the rationale',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/components/CoachSevenDay.tsx'),/coachReason:boundedCoachReason\(day.reason\)/)
 assert.equal((read('src/pages/CalendarPage.tsx').match(/coachReason:boundedCoachReason\(day.reason\)/g)||[]).length,2)
 assert.match(read('src/components/CoachSevenDay.tsx'),/<CoachMemoryCard/)
 assert.equal(buildCoachMemory({today,snapshot:null}).status,'unavailable')
})
