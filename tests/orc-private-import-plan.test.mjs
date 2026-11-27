import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {preparePrivateOrcImport,summarizePrivateOrcImport} from '../src/lib/orcPrivateImportPlan.mjs'
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0])
const digest=createHash('sha256').update(bytes).digest('hex')
const segment={distanceMeters:null,durationSeconds:null,notes:'',endMode:'lap'}
const entry=n=>({id:'00000000-0000-5000-8000-'+String(n).padStart(12,'0'),number:n,
 sourceImage:'images/p-'+n+'.png',sourceImageSha256:digest,sourceKind:'orc_reference',
 category:'Schwelle',sourceNotes:'Originalnotiz',reviewRequired:n%2===0,
 individualRule:{anchor:'threshold',offsetSecondsPerKm:-5},
 workout:{version:1,title:'Schwelle',trainer:'ORC',sourceLabel:'Vorlage',
 warmup:segment,cooldown:segment,groups:[{name:'Wolf',notes:'',steps:[
 {kind:'run',distanceMeters:400,durationSeconds:null,paceSecondsPerKm:255,notes:'',endMode:'lap'},
 {kind:'recovery',distanceMeters:200,durationSeconds:null,paceSecondsPerKm:null,notes:'',endMode:'lap'}]}]}})
const manifest=entries=>({schemaVersion:1,count:entries.length,entries})
test('preflight retains all distinct records and private metadata; never approves staging',async()=>{
 const rows=await preparePrivateOrcImport(manifest(Array.from({length:27},(_,i)=>entry(i+1))),async()=>bytes)
 assert.deepEqual(summarizePrivateOrcImport(rows),{templates:27,groups:27,steps:54,reviewRequired:13,originalImages:27})
 assert.equal(new Set(rows.map(x=>x.archiveRow.id)).size,27)
 assert.equal(new Set(rows.map(x=>x.image.path)).size,27)
 assert.equal(rows[1].metadata.review_required,true)
 assert.equal(rows[0].metadata.publication_state,'staged')
 assert.equal(rows[0].archiveRow.workout.groups[0].steps[1].paceSecondsPerKm,null)
 assert.equal(rows[0].archiveRow.id,rows[0].metadata.template_id)
 assert.equal(rows[0].image.contentType,'image/png')
})
test('any invalid or unavailable original fails the whole preflight',async()=>{
 const pack=manifest([entry(1),entry(2)])
 await assert.rejects(preparePrivateOrcImport(pack,async p=>p.endsWith('2.png')?new Uint8Array([1]):bytes))
 const bad=entry(1);bad.sourceImage='images/p-1.jpeg'
 await assert.rejects(preparePrivateOrcImport(manifest([bad]),async()=>bytes))
 await assert.rejects(preparePrivateOrcImport(pack,async()=>{throw Error('unavailable')}))
})
