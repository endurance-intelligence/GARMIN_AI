import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizedGearStatusReport } from '../server/garminConnectLocal.ts'

const current = () => ({
  source:'Garmin Connect (unofficial)',readOnly:true,checkedAt:'2026-11-05T10:00:00.000Z',
  gear:{status:'ok',items:[
    {id:'0123456789abcdef0123456789abcdef',status:'active',type:'Shoes',name:'Current shoes',oauth:'SECRET'},
    {id:'abcdef0123456789abcdef0123456789',status:'retired',type:'Shoes',name:'Retired shoes'},
    {id:'12345678abcdefabcdefabcdefabcdef',status:'unknown',type:null,name:'Old device'},
  ]},
  activityGear:{status:'ok',items:[{id:'0123456789abcdef0123456789abcdef'}]},
  activityId:'24725092836',
  history:{activityGearLinks:[{activityId:'24725092836',gearId:'0123456789abcdef0123456789abcdef'}]},
})
test('status-only payload never carries activity history or Garmin credentials',()=>{
  const x=sanitizedGearStatusReport(current())
  assert.equal(x.mode,'gear-status')
  assert.equal(x.gear.length,3)
  assert.deepEqual(x.gear.map(g=>g.status),['active','retired','unknown'])
  assert.doesNotMatch(JSON.stringify(x),/SECRET|oauth|activityGear|history|24725092836/)
})
test('status-only refresh works even when no historical timestamp matches',()=>{
  const x=current()
  x.history.baseReportCheckedAt='2026-11-04T20:00:00.000Z'
  assert.equal(sanitizedGearStatusReport(x).gear.length,3)
})
test('unknown statuses do not become active',()=>{
  const x=current()
  x.gear.items[0].status='unexpected'
  assert.equal(sanitizedGearStatusReport(x).gear[0].status,'unknown')
})
test('duplicate or corrupted gear IDs abort the status upload',()=>{
  const x=current()
  x.gear.items[1].id=x.gear.items[0].id
  assert.throws(()=>sanitizedGearStatusReport(x),/duplicate/)
})
test('incomplete gear catalog aborts update',()=>{
  const x=current()
  x.gear.status='unavailable'
  assert.throws(()=>sanitizedGearStatusReport(x),/invalid/)
})
test('unknown-only statuses abort update',()=>{
  const x=current()
  x.gear.items.forEach(g=>{g.status='unknown'})
  assert.throws(()=>sanitizedGearStatusReport(x),/no-recognized/)
})
