import test from 'node:test'
import assert from 'node:assert/strict'
import {canonicalGearId,readActivityGear,selectActivityTargets,mergeActivityGear,
 runningSport} from '../supabase/functions/_shared/garmin-gear-incremental.mjs'
const gear=[
 {id:'11111111-1111-4111-8111-111111111111',name:'Altra FWD'},
 {id:'22222222-2222-4222-8222-222222222222',name:'Altra Wild'},
 {id:'33333333-3333-4333-8333-333333333333',name:'Bike'}]
const base=[
 {activityId:'12345678901',gearId:gear[0].id},
 {activityId:'12345678902',gearId:gear[1].id}]
const d=(id,date,sport='running')=>({activity_id:id,start_time_local:date+'T08:03:00',sport_type:sport})
test('canonical gear identities match hyphenated Garmin activity output',()=>{
 assert.equal(canonicalGearId('11111111111141118111111111111111'),canonicalGearId(gear[0].id))
 assert.equal(canonicalGearId('foo'),null)
 assert.equal(runningSport('running'),true)
 assert.equal(runningSport('track_running'),true)
 assert.equal(runningSport('soccer'),false)
})
test('2026-11-07 and 2026-11-12 running are selected despite stale 6 November association snapshot',()=>{
 const activities=[d('25053088856','2026-11-12'),d('25040222222','2026-11-09','soccer'),
 d('24999000001','2026-11-07'),d('12345678901','2026-11-01'),d('12345678902','2026-11-10')]
 const targets=selectActivityTargets(activities,base,'2026-11-12')
 assert.deepEqual(targets.map(t=>t.activityId),['25053088856','12345678902','24999000001'])
 assert.ok(!targets.some(t=>t.activityId==='25040222222'))
})
test('Garmin activity gear list maps known shoe without inventing a default',()=>{
 assert.deepEqual(readActivityGear([{uuid:'11111111111141118111111111111111'}],gear),[gear[0].id])
 assert.deepEqual(readActivityGear([],gear),[])
 assert.throws(()=>readActivityGear(null,gear))
 assert.throws(()=>readActivityGear([{uuid:'99999999999949998999999999999999'}],gear),/catalog/)
 assert.throws(()=>readActivityGear([{}],gear),/identifier/)
})
test('safe increment adds verified new activity, removes recent changed link and preserves all old history',()=>{
 const report=[
 {activityId:'25053088856',gearIds:[gear[0].id]},
 {activityId:'24999000001',gearIds:[gear[1].id]},
 {activityId:'12345678902',gearIds:[gear[0].id]}]
 const merged=mergeActivityGear(base,gear,report)
 assert.equal(merged.added,3)
 assert.equal(merged.removed,1)
 assert.equal(merged.links.length,4)
 assert.ok(merged.links.some(x=>x.activityId==='12345678901'&&x.gearId===gear[0].id))
 assert.ok(!merged.links.some(x=>x.activityId==='12345678902'&&x.gearId===gear[1].id))
 const repeated=mergeActivityGear(merged.links,gear,report)
 assert.equal(repeated.added,0)
 assert.equal(repeated.removed,0)
 assert.deepEqual(repeated.links,merged.links)
})
test('no guessed shoes for unassigned Garmin run, and soccer is never a candidate',()=>{
 const result=mergeActivityGear(base,gear,[{activityId:'25053088856',gearIds:[]}])
 assert.deepEqual(result.links,base)
 assert.equal(result.added,0)
 assert.deepEqual(selectActivityTargets([d('25040222222','2026-11-09','soccer')],base,'2026-11-12'),[])
})
test('no duplicates, catalog drift or malformed snapshot can corrupt historic associations',()=>{
 assert.throws(()=>mergeActivityGear(base,gear,[
 {activityId:'25053088856',gearIds:[gear[0].id]},
 {activityId:'25053088856',gearIds:[]}]),/duplicate activity/)
 assert.throws(()=>mergeActivityGear(base,gear,[{
 activityId:'25053088856',gearIds:['99999999999949998999999999999999']}]),/Unknown gear/)
 assert.throws(()=>mergeActivityGear([...base,base[0]],gear,[{
 activityId:'25053088856',gearIds:[]}]),/Duplicate old/)
 assert.throws(()=>mergeActivityGear(base,gear,[]),/Invalid incremental/)
})
