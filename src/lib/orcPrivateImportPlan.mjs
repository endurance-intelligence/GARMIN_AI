import {validateOrcImportManifest,verifyOrcOriginalImage} from './orcLibraryImport.mjs'

const types={png:'image/png',jpeg:'image/jpeg',jpg:'image/jpeg',webp:'image/webp'}
const equal=(bytes,offset,signature)=>signature.every((v,i)=>bytes[offset+i]===v)
function imageType(bytes){
 if(equal(bytes,0,[137,80,78,71,13,10,26,10]))return 'image/png'
 if(equal(bytes,0,[255,216,255]))return 'image/jpeg'
 if(equal(bytes,0,[82,73,70,70])&&equal(bytes,8,[87,69,66,80]))return 'image/webp'
 return null
}
/** Preflight all poster bytes before ANY writes. The caller supplies a private
 * read adapter. Stable IDs preserve separate posters even with identical titles.
 * Staged rows are NOT eligible for calendar planning or Coach selection yet. */
export async function preparePrivateOrcImport(manifest,readImage){
 if(typeof readImage!=='function')throw Error('Bildzugriff fehlt')
 const entries=validateOrcImportManifest(manifest)
 const staged=[]
 for(const entry of entries){
  const bytes=await readImage(entry.sourceImage)
  const ext=entry.sourceImage.split('.').pop().toLowerCase()
  const contentType=types[ext]
  if(!(await verifyOrcOriginalImage(entry,bytes))||imageType(bytes)!==contentType)
   throw Error('Originalbild ungültig: '+entry.number)
  const imagePath=entry.id+'/'+entry.sourceImageSha256+'.'+(ext==='jpg'?'jpeg':ext)
  staged.push({
   archiveRow:{id:entry.id,client_request_id:entry.id,title:entry.workout.title,
    coach_name:entry.workout.trainer,source_label:entry.workout.sourceLabel,
    source_kind:entry.sourceKind,source_image_sha256:entry.sourceImageSha256,
    workout:entry.workout},
   metadata:{template_id:entry.id,category:entry.category,source_notes:entry.sourceNotes,
    individual_rule:entry.individualRule,review_required:entry.reviewRequired,
    image_path:imagePath,source_number:entry.number,publication_state:'staged'},
   image:{path:imagePath,contentType,bytes:new Uint8Array(bytes)}
  })
 }
 return staged
}
export function summarizePrivateOrcImport(rows){
 return {templates:rows.length,groups:rows.reduce((n,r)=>n+r.archiveRow.workout.groups.length,0),
  steps:rows.reduce((n,r)=>n+r.archiveRow.workout.groups.reduce((s,g)=>s+g.steps.length,0),0),
  reviewRequired:rows.filter(r=>r.metadata.review_required).length,
  originalImages:rows.length}
}
