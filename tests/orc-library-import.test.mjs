import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {validateOrcImportManifest,verifyOrcOriginalImage} from '../src/lib/orcLibraryImport.mjs'
const image=new Uint8Array([1,2,3,4])
const digest=createHash('sha256').update(image).digest('hex')
const segment={distanceMeters:null,durationSeconds:null,notes:'',endMode:'lap'}
function entry(n){return {id:'00000000-0000-5000-8000-'+String(n).padStart(12,'0'),number:n,
 sourceImage:'images/source-'+n+'.png',sourceImageSha256:digest,sourceKind:'orc_reference',
 category:'Schwelle',sourceNotes:'Original: 3–4 Wiederholungen',reviewRequired:true,
 individualRule:{anchor:'threshold',offsetSecondsPerKm:-5},
 workout:{version:1,title:'Schwelle im Wechsel',trainer:'ORC',sourceLabel:'Trainer-Grafik',
 warmup:segment,cooldown:segment,groups:[{name:'Wolf',notes:'',steps:[
 {kind:'run',distanceMeters:400,durationSeconds:null,paceSecondsPerKm:255,notes:'',endMode:'lap'},
 {kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:null,notes:'locker',endMode:'lap'}]}]}}}
const pack=entries=>({schemaVersion:1,count:entries.length,entries})
test('all 27 distinct poster records survive identical titles and structures',()=>{
 const records=validateOrcImportManifest(pack(Array.from({length:27},(_,i)=>entry(i+1))))
 assert.equal(records.length,27)
 assert.equal(new Set(records.map(x=>x.id)).size,27)
 assert.equal(records[0].workout.groups[0].steps[1].paceSecondsPerKm,null)
 assert.equal(records[0].individualRule.offsetSecondsPerKm,-5)
 assert.equal(records[0].reviewRequired,true)
 assert.equal(records[0].sourceNotes,'Original: 3–4 Wiederholungen')
})
test('reject repeated identifiers, traversal and invalid prescription',()=>{
 assert.throws(()=>validateOrcImportManifest(pack([entry(1),entry(1)])))
 const bad=entry(1);bad.sourceImage='images/../outside.png'
 assert.throws(()=>validateOrcImportManifest(pack([bad])))
 const invalid=entry(1);invalid.workout.groups[0].steps[0].distanceMeters=-1
 assert.throws(()=>validateOrcImportManifest(pack([invalid])))
})
test('original image fingerprint must match exact bytes',async()=>{
 assert.equal(await verifyOrcOriginalImage(entry(1),image),true)
 assert.equal(await verifyOrcOriginalImage(entry(1),new Uint8Array([1,2,3])),false)
})
