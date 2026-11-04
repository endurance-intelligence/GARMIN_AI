import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGear, normalizeSchedule, validCalendarRange } from '../supabase/functions/_shared/garmin-connect-context.mjs'

test('assigned Garmin gear is normalized without exposing extra profile fields', () => {
  const result = normalizeGear([{uuid:'abc12345-1234', displayName:'Altra FWD Via 2', brand:'Altra',
    customMakeModel:'FWD Via 2', userProfileNumber:9876543, privateNotes:'private'}])
  assert.equal(result.items.length, 1)
  assert.deepEqual(result.items[0], { id:'abc12345-1234', name:'Altra FWD Via 2', brand:'Altra',
    model:'FWD Via 2', type:null, status:null })
  assert.equal(JSON.stringify(result).includes('9876543'), false)
})

test('known empty Garmin gear list is different from unknown format', () => {
  assert.deepEqual(normalizeGear({gear: []}), {items:[],mayHaveMore:false})
  assert.throws(() => normalizeGear({foo:'bar'}), /unexpected-shape/)
})

test('calendar entries keep scheduled date and workout ids without inventing steps', () => {
  const result = normalizeSchedule({scheduledWorkouts:[{
    scheduleDate:'2026-11-06', scheduledWorkoutId:45, workoutId:67,
    workoutName:'6x1000 m', workoutType:'running', athleteId:'secret',
  }]})
  assert.deepEqual(result.items, [{date:'2026-11-06',scheduleId:'45',workoutId:'67',workoutUuid:null,
    name:'6x1000 m',sport:'running',isRestDay:false,planName:null}])
})

test('unknown schedule shape is never reported as empty calendar', () => {
  assert.deepEqual(normalizeSchedule([]).items, [])
  assert.throws(() => normalizeSchedule({items:[{unknown:'value'}]}), /unexpected-shape/)
})

test('calendar ranges are valid calendar dates and bounded to 45 days', () => {
  assert.equal(validCalendarRange('2026-11-01','2026-12-10'), true)
  assert.equal(validCalendarRange('2026-11-01','2027-01-01'), false)
  assert.equal(validCalendarRange('2026-02-30','2026-03-01'), false)
  assert.equal(validCalendarRange('2026-12-01','2026-11-01'), false)
})

test('large gear lists report truncation instead of claiming completeness', () => {
  const result = normalizeGear([{uuid:'abc12345',displayName:'Shoe A'},{uuid:'abc12346',displayName:'Shoe B'}], 1)
  assert.equal(result.mayHaveMore, true)
  assert.equal(result.items.length,1)
})
