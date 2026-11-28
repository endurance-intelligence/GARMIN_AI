import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {deflateRawSync} from 'node:zlib'
import {readOrcZip,encodeOrcImage} from '../src/lib/orcZip.mjs'
import {validateOrcSource,canonicalJson} from '../src/lib/orcSource.mjs'
const image=Buffer.from([137,80,78,71,13,10,26,10,1,2,3])
const entry={id:'00000000-0000-4000-8000-000000000001',number:1,sourceImage:'images/test.png',sourceImageSha256:createHash('sha256').update(image).digest('hex'),sourceKind:'orc_reference',category:'Fixture',reviewRequired:true,sourceNotes:'Original',individualRule:{anchor:'work_pace'},workout:{version:1,title:'Fixture',trainer:'',sourceLabel:'',warmup:{distanceMeters:null,durationSeconds:null,notes:''},cooldown:{distanceMeters:null,durationSeconds:null,notes:''},groups:[{name:'Wolf',notes:'',steps:[{kind:'run',distanceMeters:1000,durationSeconds:null,paceSecondsPerKm:275,notes:''}]}]}}
function zip(files){
 const parts=[],central=[];let offset=0
 for(const [name,data] of files){
  const n=Buffer.from(name),raw=Buffer.from(data),packed=deflateRawSync(raw),head=Buffer.alloc(30),dir=Buffer.alloc(46)
  head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(8,8);head.writeUInt32LE(packed.length,18);head.writeUInt32LE(raw.length,22);head.writeUInt16LE(n.length,26)
  dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(8,10);dir.writeUInt32LE(packed.length,20);dir.writeUInt32LE(raw.length,24);dir.writeUInt16LE(n.length,28);dir.writeUInt32LE(offset,42)
  parts.push(head,n,packed);central.push(dir,n);offset+=head.length+n.length+packed.length
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16)
 return new Blob([...parts,cd,end])
}
const manifest=JSON.stringify({schemaVersion:1,count:1,entries:[entry]})
test('real deflated ZIP preflight verifies original and preserves source entry',async()=>{
 const result=await readOrcZip(zip([['manifest.json',manifest],[entry.sourceImage,image]]))
 assert.equal(result.rows.length,1)
 assert.deepEqual(result.manifest.entries[0],entry)
 const row=await validateOrcSource(entry,encodeOrcImage(result.rows[0].image.bytes))
 assert.equal(row.review_required,true)
 assert.deepEqual(row.source_entry,entry)
 assert.deepEqual(Buffer.from(row.image_base64,'base64'),image)
 assert.equal(canonicalJson({b:2,a:1}),canonicalJson({a:1,b:2}))
})
test('reject mismatched hashes, extra files and traversal before saving',async()=>{
 await assert.rejects(readOrcZip(zip([['manifest.json',manifest],[entry.sourceImage,Buffer.from([1,2,3])]])))
 await assert.rejects(readOrcZip(zip([['manifest.json',manifest],[entry.sourceImage,image],['images/extra.png',image]])))
 await assert.rejects(readOrcZip(zip([['manifest.json',manifest],['../test.png',image]])))
 await assert.rejects(validateOrcSource(entry,'AAAA'))
})
test('private import keeps owner gate and never inserts into reviewed archive',()=>{
 const code=readFileSync(new URL('../supabase/functions/garmin-workout-archive/index.ts',import.meta.url),'utf8')
 assert.ok(code.indexOf('auth.auth.getUser')<code.indexOf("body.action==='orc_import'"))
 const block=code.slice(code.indexOf("body.action==='orc_import'"),code.indexOf("body.action==='parse_photo'"))
 assert.match(block,/validateOrcSource/)
 assert.match(block,/from\('garmin_orc_source'\)\.insert\(row\)/)
 assert.doesNotMatch(block,/garmin_training_plan|garmin_workout_archive|\.update\(/)
})

test('planning a reviewed copy never changes original or auto-publishes',()=>{
 const page=readFileSync(new URL('../src/components/WorkoutArchivePanel.tsx',import.meta.url),'utf8')
 assert.match(page,/begin\(\{\.\.\.structuredClone\(workout\),groups:\[structuredClone\(selected\)\]\},'orc_reference',hash\)/)
 assert.match(page,/action:'save',clientRequestId:requestId.current,reviewed:true/)
 assert.match(page,/if\(planAfter&&selected\)\{/)
 assert.match(page,/await plan\(record,selected.name\)/)
 assert.doesNotMatch(page,/action:'publish'|action:'orc_import'/)
})
