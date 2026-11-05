import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizedGearImageId,isActiveRunningShoe,looksLikeWebP} from '../supabase/functions/_shared/garmin-gear-image.mjs'

const gearId='01234567-89ab-cdef-0123-456789abcdef'
test('one canonical ID per Garmin gear, regardless of hyphens or case',()=>{
  assert.equal(normalizedGearImageId(gearId),'0123456789abcdef0123456789abcdef')
  assert.equal(normalizedGearImageId(gearId.toUpperCase()),'0123456789abcdef0123456789abcdef')
})
test('invalid IDs cannot be used as storage paths',()=>{
  for(const item of ['../../secrets','shoe1','a'.repeat(81), '', null, undefined]){
    assert.equal(normalizedGearImageId(item),null)
  }
})
test('only active shoes may have image upload rights',()=>{
  assert.equal(isActiveRunningShoe({status:'active',type:'Shoes'}),true)
  assert.equal(isActiveRunningShoe({status:'active',type:'Laufschuhe'}),true)
  for(const candidate of [
    {status:'retired',type:'Shoes'},
    {status:'unknown',type:'Shoes'},
    {status:'active',type:'Bike'},
    {status:'active',type:'Other'},
    {status:null,type:'Shoes'},
    {status:'active',type:null},
    null,
  ]) assert.equal(isActiveRunningShoe(candidate),false)
})
test('valid WebP magic bytes are recognized',()=>{
  const header=Uint8Array.from([
    82,73,70,70,28,0,0,0,87,69,66,80,86,80,56,32
  ])
  assert.equal(looksLikeWebP(header),true)
})
test('disguised SVG/PNG and empty files are rejected',()=>{
  assert.equal(looksLikeWebP(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),false)
  assert.equal(looksLikeWebP(new Uint8Array([137,80,78,71])),false)
  assert.equal(looksLikeWebP(new Uint8Array()),false)
})
