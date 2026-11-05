import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGearActivities, validateCompleteHistory } from '../scripts/garmin-gear-history-model.mjs'
import { sanitizedReport } from '../server/garminConnectLocal.ts'

const gearId='0123456789abcdef0123456789abcdef'
function base() {
 return {source:'Garmin Connect (unofficial)',readOnly:true,
  checkedAt:'2026-11-05T09:00:00.000Z',activityId:'24725092836',
  gear:{status:'ok',items:[{id:gearId,name:'Black',model:'Altra FWD VIA',brand:'Altra'}]},
  schedule:{status:'ok',items:[{date:'2026-11-06',id:'workout123',name:'Easy',restDay:false}]},
  activityGear:{status:'ok',items:[{id:gearId,name:'Black'}]} }
}
function history() {
 return {source:'Garmin Connect (unofficial)',readOnly:true,scope:'complete',
   checkedAt:'2026-11-05T09:01:00.000Z',baseReportCheckedAt:base().checkedAt,
   gearChecked:1,gearIds:[gearId],activityGearLinks:[{activityId:'24725092836',gearId}]}
}
test('gear activities contain strictly whitelisted IDs',()=>{
 const raw=[{activityId:24725092836,location:'private',distance:4200},{activityId:'24725092836'}]
 assert.deepEqual(normalizeGearActivities(raw,gearId),[{activityId:'24725092836',gearId}])
})
test('a full page is never called complete',()=>{
 assert.throws(()=>normalizeGearActivities([{activityId:24725092836}],gearId,1),/truncated/)
})
test('invalid activity IDs abort the complete import',()=>{
 assert.throws(()=>normalizeGearActivities([{other:'unknown'}],gearId),/identifier/)
})
test('all gear IDs and known mappings must be checked',()=>{
 const groups=[[{activityId:'24725092836',gearId}]]
 assert.equal(validateCompleteHistory([{id:gearId}],groups,'24725092836',[{id:gearId}]).length,1)
 assert.throws(()=>validateCompleteHistory([{id:gearId}], [[]],'24725092836',[{id:gearId}]),/missing/)
})
test('snapshot report only admits matching, fully checked history',()=>{
 const x=sanitizedReport(base(),history())
 assert.equal(x.completeHistory,true)
 assert.equal(x.activityGear.length,1)
 const partial=sanitizedReport(base())
 assert.equal(partial.completeHistory,false)
 const bad=history();bad.gearChecked=0
 assert.throws(()=>sanitizedReport(base(),bad),/incomplete/)
})
test('no Garmin credentials or extra API fields survive sanitizer',()=>{
 const raw=base(); raw.gear.items[0].oauthToken='SECRET'
 const serialized=JSON.stringify(sanitizedReport(raw,history()))
 assert.doesNotMatch(serialized,/SECRET|oauthToken|location/)
})
