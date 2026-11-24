import test from 'node:test'
import assert from 'node:assert/strict'
import {analyzeCoachFourWeeks} from '../src/lib/coachFourWeeks.mjs'

const today='2026-11-24'
const starts=['2026-11-16','2026-11-09','2026-11-02','2026-10-26']
const run=(day,id,rpe,feeling)=>({activity_id:id,sport_type:'running',start_time_local:day+' 19:10:00',duration_s:2400,distance_m:6000,rpe_raw:rpe,feeling_raw:feeling})
const plan=(day,id,kind)=>({id,training_date:day,title:'Coach',sport:'running',state:'confirmed',archive_snapshot:{sourceKind:'coach',coachKind:kind,startTime:'19:00',warmup:{durationSeconds:300},group:{steps:[{endMode:'time',durationSeconds:1800}]},cooldown:{durationSeconds:300}}})
function fixture(kind='easy',ratings=[90,90,40,40]){
 const boards=starts.map((start,i)=>({start,activities:[run(start,'a'+i,ratings[i],ratings[i]===null?null:75)]}))
 const entries=starts.map((start,i)=>plan(start,'p'+i,kind))
 return {today,boards,plans:{entries,historyFrom:'2026-10-01'}}
}
test('repeated strain in planned easy runs is a review signal, not a fitness verdict',()=>{
 const x=analyzeCoachFourWeeks(fixture()).workoutTolerance[0]
 assert.deepEqual(x,{kind:'easy',label:'Lockerer Lauf',matched:4,rated:4,hard:2,weeks:4,hardWeeks:2,assessment:'review-low-intensity'})
})
test('hard intervals are distinguished from planned easy efforts',()=>{
 const x=analyzeCoachFourWeeks(fixture('intervals')).workoutTolerance[0]
 assert.equal(x.assessment,'repeated-strain')
})
test('missing feedback is never favorable evidence',()=>{
 const x=analyzeCoachFourWeeks(fixture('long',[90,90,null,null])).workoutTolerance[0]
 assert.equal(x.rated,2)
 assert.equal(x.matched,4)
 assert.equal(x.assessment,'limited')
})
test('ambiguous runs, duplicate imports and uncovered plan history are not extra evidence',()=>{
 const f=fixture()
 f.boards[0].activities.push({...f.boards[0].activities[0],activity_id:'other'})
 f.boards[1].activities.push({...f.boards[1].activities[0]})
 f.plans.historyFrom='2026-11-01'
 const x=analyzeCoachFourWeeks(f).workoutTolerance[0]
 assert.equal(x.matched,2)
 assert.equal(x.hardWeeks,1)
 assert.equal(x.assessment,'limited')
})
test('unlinked activities and unknown coach kinds are not classified',()=>{
 const f=fixture('unknown')
 assert.deepEqual(analyzeCoachFourWeeks(f).workoutTolerance,[])
 f.plans.entries=[]
 assert.deepEqual(analyzeCoachFourWeeks(f).workoutTolerance,[])
 assert.deepEqual(analyzeCoachFourWeeks({today}).workoutTolerance,[])
})
