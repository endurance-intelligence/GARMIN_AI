import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIntervalsWorkout,buildIntervalsEvent} from '../supabase/functions/_shared/intervals-workout.mjs';
const base={
 id:'01234567-89ab-4cde-8abc-1234567890ab',training_date:'2026-11-14',
 title:'ORC · Wolf',archive_snapshot:{
 group:{name:'Wolf',steps:[
  {kind:'run',distanceMeters:400,durationSeconds:null,paceSecondsPerKm:250,endMode:'distance'},
  {kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:null,endMode:'lap'},
  {kind:'run',distanceMeters:800,durationSeconds:null,paceSecondsPerKm:260,endMode:'lap'}]},
 warmup:{distanceMeters:null,durationSeconds:null,endMode:'lap'},
 cooldown:{distanceMeters:800,durationSeconds:null,endMode:'distance'}}};
test('structured export honors distance and LAP for each step',()=>{
 const x=buildIntervalsEvent(base);
 assert.equal(x.external_id,'garmin-ai:'+base.id);
 assert.equal(x.category,'WORKOUT');
 assert.equal(x.type,'Run');
 assert.match(x.description,/400mtr 4:00-4:20\/km Pace intensity=interval/);
 assert.match(x.description,/Press lap TRAB 200M 60m/);
 assert.match(x.description,/Press lap LAUF 800ER 60m 4:10-4:30\/km Pace/);
 assert.match(x.description,/800mtr.*intensity=cooldown/);
});
test('does not upload another trainer group',()=>{
 const x=buildIntervalsWorkout(base.archive_snapshot,base.title);
 assert.equal(x.stepCount,5);
 assert.ok(!x.description.includes('Bären'));
});
test('rejects unreviewed or malformed plan',()=>{
 assert.throws(()=>buildIntervalsEvent({...base,archive_snapshot:null}));
 assert.throws(()=>buildIntervalsEvent({...base,id:'../evil'}));
});
test('rejects incompatible completion modes',()=>{
 const clone=structuredClone(base.archive_snapshot);
 clone.group.steps[0].distanceMeters=null;
 assert.throws(()=>buildIntervalsWorkout(clone,'x'));
});
test('old archive steps default to manual LAP',()=>{
 const clone=structuredClone(base.archive_snapshot);
 delete clone.group.steps[0].endMode;
 assert.match(buildIntervalsWorkout(clone,'x').description,/Press lap LAUF 400ER/);
});
test('refuses more than 50 Garmin steps',()=>{
 const clone=structuredClone(base.archive_snapshot);
 clone.group.steps=Array.from({length:49},()=>({...clone.group.steps[0]}));
 assert.throws(()=>buildIntervalsWorkout(clone,'x'),/50 steps/);
});
test('rejects unknown or fabricated pace',()=>{
 const clone=structuredClone(base.archive_snapshot);
 clone.group.steps[0].paceSecondsPerKm=0;
 assert.throws(()=>buildIntervalsWorkout(clone,'x'),/pace/);
});
test('output contains no Garmin-specific private endpoint',()=>{
 const x=buildIntervalsEvent(base);
 assert.doesNotMatch(JSON.stringify(x),/connectapi\.garmin\.com|oauth/i);
});
