import test from 'node:test'
import assert from 'node:assert/strict'
import {sanitizedReport} from '../server/garminConnectLocal.ts'

function report() {
  return {
    source:'Garmin Connect (unofficial)',readOnly:true,
    checkedAt:'2026-11-05T09:00:00.000Z',activityId:'24725092836',
    gear:{status:'ok',items:[{id:'gear123',name:'Black',model:'Altra FWD VIA',brand:'Altra',type:'shoes',token:'secret'}]},
    schedule:{status:'ok',items:[{date:'2026-11-06',id:'sched1',workoutId:'123',name:'Easy',sport:'running',restDay:false,privateNotes:'sensitive'}]},
    activityGear:{status:'ok',items:[{id:'gear123',name:'Black'}]},
    oauthToken:'never-serialize',
  }
}

test('local snapshot includes gear name/model and one known assignment',()=>{
  const value=sanitizedReport(report())
  assert.equal(value.gear[0].name,'Altra FWD VIA · Black')
  assert.equal(value.activityGear[0].activityId,'24725092836')
  assert.equal(value.activityGear[0].gearId,'gear123')
  assert.equal(value.schedule[0].name,'Easy')
})
test('snapshot strips tokens and unexpected private fields',()=>{
  const serialized=JSON.stringify(sanitizedReport(report()))
  assert.doesNotMatch(serialized,/oauthToken|privateNotes|sensitive|never-serialize|secret/)
})
test('invalid Garmin response refuses synchronization',()=>{
  const value=report();value.gear.status='unavailable'
  assert.throws(()=>sanitizedReport(value),/incomplete/)
})
test('unknown gear links fail instead of inventing a shoe',()=>{
  const value=report();value.activityGear.items=[{id:'not-in-catalog'}]
  assert.throws(()=>sanitizedReport(value),/gear-link/)
})
test('no source credentials can enter via arbitrary fields',()=>{
  const value=report();value.gear.items[0].accessToken='secret-value'
  const result=sanitizedReport(value)
  assert.equal(result.gear[0].accessToken,undefined)
})
