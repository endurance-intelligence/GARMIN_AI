import test from 'node:test';
import assert from 'node:assert/strict';
import { gearRows, normalizeGearStatus, scheduledRows, activityGearRows, ensureNonemptyKnownShape, safeStatus } from '../scripts/garmin-connect-model.mjs';

test('gear retains only approved display fields and drops profile PII', () => {
  assert.deepEqual(gearRows([{ uuid:'shoe123',displayName:'Altra FWD Via 2',brand:'Altra', userProfilePk:123, privateNotes:'secret' }]),
    [{ id:'shoe123', name:'Altra FWD Via 2', brand:'Altra', model:null, type:null, status:'unknown' }]);
});
test('scheduled workout maps a known Garmin GraphQL summary', () => {
  assert.deepEqual(scheduledRows([{ scheduleDate:'2026-11-06',scheduledWorkoutId:51,workoutName:'Easy',workoutType:'running' }]),
    [{ date:'2026-11-06', id:'51', workoutId:null, name:'Easy', sport:'running', restDay:false }]);
});
test('activity gear retains id even when name is missing', () => {
  assert.deepEqual(activityGearRows([{ gearUUID:'abcdef' }]), [{ id:'abcdef', name:null }]);
});
test('empty results are recognized as genuinely empty lists', () => {
  assert.deepEqual(ensureNonemptyKnownShape([],gearRows([]),'gear'), []);
});
test('unknown populated payload is not mistaken for no gear', () => {
  assert.throws(() => ensureNonemptyKnownShape([{ surprise:42 }], gearRows([{ surprise:42 }]), 'gear'), /unrecognized/);
});
test('error report never discloses Garmin error body', () => {
  assert.equal(safeStatus({ status:429, message:'token=secret' }), 'rate-limited');
});

test('Garmin gear status and category are captured from actual Garmin field names', () => {
  const raw = [
    {uuid:'shoe123',customMakeModel:'Altra - Paradigm 7',gearStatusName:'retired',gearTypeName:'Shoes'},
    {uuid:'shoe456',customMakeModel:'Altra FWD VIA',gearStatusName:'ACTIVE',gearTypeName:'Shoes'},
  ];
  const [retired,active]=gearRows(raw);
  assert.equal(retired.status,'retired');
  assert.equal(retired.type,'Shoes');
  assert.equal(active.status,'active');
  assert.equal(active.type,'Shoes');
});
test('unknown upstream states never become active by assumption', () => {
  assert.equal(normalizeGearStatus('unrecognized'),'unknown');
  assert.equal(normalizeGearStatus(null),'unknown');
  assert.equal(normalizeGearStatus(' Retired '),'retired');
});
