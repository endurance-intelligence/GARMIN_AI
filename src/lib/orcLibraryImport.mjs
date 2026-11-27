import {validateTrainerWorkout} from '../../supabase/functions/_shared/workout-archive-schema.mjs'

// Data-only import boundary. No network or persistence, no automatic approval.
// Same title or same exercise structure is NOT a duplicate.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sha=/^[a-f0-9]{64}$/
const path=/^images\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/i
const bounded=(v,n)=>typeof v==='string'&&v.length<=n
export function validateOrcImportManifest(input){
 if(!plain(input)||input.schemaVersion!==1||!Array.isArray(input.entries)||
  input.entries.length<1||input.entries.length>100||input.count!==input.entries.length)
  throw Error('Ungültiges Trainingspaket')
 const ids=new Set(),images=new Set(),numbers=new Set()
 return input.entries.map(entry=>{
  if(!plain(entry)||!uuid.test(String(entry.id))||!sha.test(String(entry.sourceImageSha256))||
   typeof entry.sourceImage!=='string'||!path.test(entry.sourceImage)||
   entry.sourceKind!=='orc_reference'||!Number.isSafeInteger(entry.number)||
   entry.number<1||entry.number>input.count||typeof entry.reviewRequired!=='boolean'||
   !bounded(entry.category,100)||!bounded(entry.sourceNotes,2000)||
   !plain(entry.individualRule)||ids.has(entry.id)||images.has(entry.sourceImage)||numbers.has(entry.number))
   throw Error('Ungültige oder mehrfach referenzierte Vorlage')
  const workout=validateTrainerWorkout(entry.workout)
  if(!workout)throw Error('Ungültige Trainingsstruktur: '+entry.number)
  ids.add(entry.id);images.add(entry.sourceImage);numbers.add(entry.number)
  return {...entry,workout,individualRule:structuredClone(entry.individualRule)}
 })
}
export async function verifyOrcOriginalImage(entry,bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>8_000_000||
  !sha.test(String(entry?.sourceImageSha256)))return false
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes)
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')===entry.sourceImageSha256
}
