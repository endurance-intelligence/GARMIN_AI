import {preparePrivateOrcImport} from './orcPrivateImportPlan.mjs'
export const validOrcId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
export function canonicalJson(v){
 if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']'
 if(v!==null&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}'
 return JSON.stringify(v)
}
export async function validateOrcSource(entry,encoded){
 if(!entry||!Number.isSafeInteger(entry.number)||entry.number<1||entry.number>100||!validOrcId(entry.id)||
  typeof encoded!=='string'||encoded.length<4||encoded.length>10_700_000||! /^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||
  JSON.stringify(entry).length>400_000)throw Error('Invalid source')
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))
 const [row]=await preparePrivateOrcImport({schemaVersion:1,count:1,entries:[{...entry,number:1}]},()=>bytes)
 // Keep original raw structured entry verbatim; schema validation is separate.
 return {id:entry.id,title:row.archiveRow.title,source_number:entry.number,review_required:entry.reviewRequired,
  source_sha256:entry.sourceImageSha256,source_entry:entry,image_content_type:row.image.contentType,image_base64:encoded}
}
