import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeRaw,replaceGarminActivityShoe} from '../server/garminActivityShoeLocal.ts'

const blue='0123456789abcdef0123456789abcdef'
const black='abcdef0123456789abcdef0123456789'
const bike='12345678abcdefabcdefabcdefabcdef'
const catalog=new Map([
  [blue,{id:blue,name:'Altra FWD VIA · Blue / White',status:'active',type:'Shoes'}],
  [black,{id:black,name:'Altra FWD VIA · Black',status:'active',type:'Shoes'}],
  [bike,{id:bike,name:'Scott',status:'active',type:'Bike'}],
])

test('Garmin default assignment is read from activity, not assumed',()=>{
 assert.equal(normalizeRaw([{uuid:blue}],catalog),blue)
 assert.equal(normalizeRaw([{uuid:bike}],catalog),null)
 assert.equal(normalizeRaw([],catalog),null)
})
test('multiple assigned shoes fail closed',()=>{
 assert.throws(()=>normalizeRaw([{uuid:blue},{uuid:black}],catalog),/mehrere Laufschuhe/)
})
test('unknown Garmin shoe without id is never treated as empty assignment',()=>{
 assert.throws(()=>normalizeRaw([{gearTypeName:'Shoes'}],catalog),/ohne eindeutige ID/)
})
function fake(initial=[blue]){
 const linked=new Set(initial)
 return {
  linked,
  async getActivityGear(){return [...linked].map(uuid=>({uuid}))},
  async addGearToActivity(id){linked.add(id)},
  async removeGearFromActivity(id){linked.delete(id)}
 }
}
test('explicit replacement removes old default shoe and retains unrelated gear',async()=>{
 const garmin=fake([blue,bike])
 await replaceGarminActivityShoe(garmin,'24725092836',blue,black,catalog)
 assert.deepEqual([...garmin.linked].sort(),[black,bike].sort())
})
test('clearing an activity shoe leaves other gear intact',async()=>{
 const garmin=fake([blue,bike])
 await replaceGarminActivityShoe(garmin,'24725092836',blue,null,catalog)
 assert.deepEqual([...garmin.linked],[bike])
})
test('failed Garmin unlink removes newly added shoe again',async()=>{
 const garmin=fake()
 garmin.removeGearFromActivity=async(id)=>{
  if(id===blue) throw Error('upstream timeout')
  garmin.linked.delete(id)
 }
 await assert.rejects(replaceGarminActivityShoe(garmin,'24725092836',blue,black,catalog),/nicht sicher bestätigt/)
 assert.deepEqual([...garmin.linked],[blue])
})
test('failed verification attempts to restore original assignment',async()=>{
 const garmin=fake()
 const realRead=garmin.getActivityGear.bind(garmin)
 let calls=0
 garmin.getActivityGear=async()=>{calls++;return calls===1?[{uuid:bike}]:realRead()}
 await assert.rejects(replaceGarminActivityShoe(garmin,'24725092836',blue,black,catalog),/nicht sicher bestätigt/)
 assert.deepEqual([...garmin.linked],[blue])
})
