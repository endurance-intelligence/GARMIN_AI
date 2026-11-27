import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {clubQualityWeek,applyClubQuality,archiveGroupSpec,selectArchiveQuality,proposeClubReplacement,buildArchiveQualitySnapshot,archiveSnapshotMeters} from '../src/lib/clubQuality.mjs'
import {buildIntervalsWorkout,buildIntervalsEvent,validateStoredIntervalsWorkout} from '../supabase/functions/_shared/intervals-workout.mjs'
import {buildWeeklyBudget} from '../src/lib/weeklyTraining.mjs'
import {makePlanSnapshot} from '../src/lib/trainingHistory.mjs'
const today='2026-11-23',start=today
const tue='2026-11-24',sat='2026-11-28'
const options=[{code:'orc-track-tue',weekday:2,sport:'running',enabled:true,title:'ORC Track'},{code:'orc-track-sat',weekday:6,sport:'running',enabled:true,title:'ORC Track'}]
const selected=(code,training_date,choice)=>({option_code:code,training_date,choice})
const choices=(a,b)=>[selected(options[0].code,tue,a),selected(options[1].code,sat,b)].filter(x=>x.choice)
const track=(date,i)=>({date,kind:'chosen',title:'ORC Track',reason:'Teilnahme',sport:'running',approvable:false,selectedGroup:{code:options[i].code,title:'ORC Track',advice:'review',reason:'Teilnahme'}})
const easy=date=>({date,kind:'easy',title:'Lockerer Lauf',minutes:40,reason:'Locker',sport:'running',approvable:true,intensityIntent:'low'})
const roadmap=[{start,phase:'base',targetKm:{low:30,high:45},qualityOptions:2}]
const week=(c,extra={})=>clubQualityWeek({today,start,options,choices:c,days:[],boards:[],plans:[],...extra})
test('two ORC slots are personal quality commitments, not a single artificial cap',()=>{
 for(const [a,b,reserved,missing] of [['selected','selected',2,false],['selected','skipped',1,false],['skipped','selected',1,false],['skipped','skipped',0,true],['skipped',undefined,1,false]]){
  const w=week(choices(a,b));assert.equal(w.reserved,reserved);assert.equal(w.bothSkipped,missing)
 }
 const d=[track(tue,0),track(sat,1)],w=week(choices('selected','selected'),{days:d})
 const p=applyClubQuality(d,{today,weeks:[w],roadmap})
 assert.deepEqual(p.map(x=>x.qualityIntent),['planned','planned'])
 assert.deepEqual(p.map(x=>x.qualityBlocked),[false,false])
 const rest=applyClubQuality(d,{today,weeks:[w],roadmap,protectedPhase:true})
 assert.ok(rest.every(x=>x.qualityBlocked&&x.selectedGroup.advice==='easy'))
 assert.equal(d[0].selectedGroup.advice,'review')
})
test('actual ORC activity counts once; past unknown or still-open choice prevents invented replacement',()=>{
 const activities=[{activity_name:'ORC Track – 5 x 1000',sport_type:'running',start_time_local:tue+'T19:00',distance_m:10600}]
 const w=clubQualityWeek({today:'2026-11-27',start,options,choices:choices('selected','skipped'),boards:[{activities}],plans:[]})
 assert.equal(w.actual,1);assert.equal(w.slots[0].status,'completed');assert.equal(w.bothSkipped,false)
 const unknown=clubQualityWeek({today:'2026-11-27',start,options,choices:choices(undefined,'skipped'),boards:[],plans:[]})
 assert.equal(unknown.slots[0].status,'past-unknown');assert.equal(unknown.bothSkipped,false)
})
const step=(kind,distanceMeters,paceSecondsPerKm=null)=>({kind,distanceMeters,paceSecondsPerKm,endMode:'lap',notes:''})
const group={name:'Fuchs',steps:Array.from({length:5},(_,i)=>[step('run',1000,280),...(i<4?[step('recovery',400)]:[])]).flat()}
const template={id:'12345678-1234-4123-8123-123456789012',title:'Extensive 1000er',workout:{title:'Extensive 1000er',trainer:'ORC',sourceLabel:'Trainer',warmup:step('warmup',2000),cooldown:step('cooldown',2000),groups:[group]}}
const spec=()=>archiveGroupSpec(template,'Fuchs')
const oldDate='2026-11-14'
const actual={activity_id:1,activity_name:'ORC Track – Extensive 1000er',sport_type:'running',start_time_local:oldDate+'T09:00:00',distance_m:10600,duration_s:3600,rpe_raw:60,feeling_raw:75}
const plans=[{id:'past',training_date:oldDate,state:'confirmed',archive_workout_id:template.id,archive_group:'Fuchs',archive_snapshot:{group}}]
const boards=[{start:'2026-11-09',activities:[actual],manual:[]}]
const days=[easy(today),easy('2026-11-25'),easy('2026-11-27')]
const budget={start,target:{low:30,high:45},forecastKm:30,paceSeconds:360,actualKm:0,proposedParts:days.map(d=>({date:d.date,km:6.6,minutes:40}))}
test('exact original distances 5 x 1000, 4 x 400, 2+2 km = 10.6 km; incomplete archive rejected',()=>{
 const s=spec();assert.equal(s.totalMeters,10600);assert.equal(s.effortMeters,5000);assert.equal(s.recoveryMeters,1600);assert.equal(s.efforts,5)
 const bad=structuredClone(template);bad.workout.cooldown.distanceMeters=null
 assert.equal(archiveGroupSpec(bad,'Fuchs'),null)
 assert.equal(template.workout.groups[0].steps[0].endMode,'lap')
})
test('archive uses previously selected tolerated group or exact named single-group historic match, never guesses a group',()=>{
 const input={today,archive:[template],plans,boards,budget,replaceDate:today}
 assert.equal(selectArchiveQuality(input).templateId,template.id)
 assert.equal(selectArchiveQuality({...input,plans:[]}).group,'Fuchs')
 const multi=structuredClone(template);multi.workout.groups.push({...group,name:'Wolf'})
 assert.equal(selectArchiveQuality({...input,archive:[multi],plans:[]}),null)
 assert.equal(selectArchiveQuality({...input,boards:[{activities:[{...actual,rpe_raw:90}]}]}),null)
 assert.equal(selectArchiveQuality({...input,budget:{...budget,target:{low:25,high:32}}}),null)
})
test('both cancelled creates exactly one eligible replacement, archive preferred, safe fallback otherwise',()=>{
 const ctx={today,week:week(choices('skipped','skipped')),boards,plans,archive:[template],roadmap,budget,volumeStatus:'maintain'}
 const out=proposeClubReplacement(days,ctx)
 assert.equal(out.date,today);assert.equal(out.days[0].qualityArchive.totalMeters,10600)
 assert.equal(out.days[0].minutes,null);assert.equal(out.days[1],days[1])
 assert.equal(proposeClubReplacement(days,{...ctx,archive:[]}).days[0].minutes,36)
 assert.equal(proposeClubReplacement(days,{...ctx,protectedPhase:true}).date,null)
 assert.equal(proposeClubReplacement(days,{...ctx,week:week(choices('skipped','selected'))}).date,null)
})
test('distance-controlled derived snapshot preserves exact trainer distances and known paces; serializer round trip',()=>{
 const s=buildArchiveQualitySnapshot(spec(),'18:00')
 assert.equal(archiveSnapshotMeters(s),10600)
 const w=buildIntervalsWorkout(s,s.title)
 assert.equal(w.stepCount,11);assert.equal(w.expectedDistance,10600)
 assert.ok(w.steps.every(x=>x.mode==='distance'))
 const event=buildIntervalsEvent({id:'12345678-1234-4123-8123-123456789012',training_date:today,title:s.title,archive_snapshot:s})
 const stored={...event,moving_time:3600,distance:10600,workout_doc:{steps:w.steps.map(x=>({distance:x.dist,until_lap_press:false,...(x.paceSecondsPerKm===null?{}:{pace:{start:x.paceSecondsPerKm-10,end:x.paceSecondsPerKm+10,units:'secs/km'}})}))}}
 assert.deepEqual(validateStoredIntervalsWorkout(stored,s,event),{ok:true,reason:'parsed'})
 const bad=structuredClone(stored);bad.workout_doc.steps[1].distance=900
 assert.equal(validateStoredIntervalsWorkout(bad,s,event).ok,false)
 const history=makePlanSnapshot({today,budget:{...budget,phaseLabel:'Grundlage'},plans:[{training_date:today,sport:'running',title:s.title,state:'draft',archive_snapshot:s}]})
 assert.equal(history.entries[0].km,10.6);assert.equal(history.entries[0].minutes,null)
})
test('shared canonical server reader and all gates verify exact archive snapshot',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('supabase/functions/_shared/coach-archive-reader.ts'),/from\('garmin_workout_archive'\)/)
 assert.match(read('supabase/functions/_shared/quality-guard.ts'),/stable\(canonical\)===stable\(expected\)/)
 assert.match(read('supabase/functions/garmin-training-plan/index.ts'),/spec.templateId!==input.archiveTemplateId/)
 assert.match(read('supabase/functions/garmin-intervals/index.ts'),/qualityStillAllowed\(db,user.id,plan.training_date,plan.id,plan.archive_snapshot\)/)
})
