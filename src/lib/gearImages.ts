import type { Session } from '@supabase/supabase-js'
import { garminPublishableKey, garminSupabaseUrl } from './garminSupabase'

const base = `${garminSupabaseUrl}/functions/v1/garmin-gear-image`
const allowed = new Set(['image/jpeg','image/png','image/webp'])

function headers(session: Session): Record<string,string> {
  return { authorization: `Bearer ${session.access_token}`, apikey: garminPublishableKey }
}

async function checked(response:Response):Promise<void> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw Error('Keine Berechtigung für Schuhbilder.')
    if (response.status === 413 || response.status === 422) throw Error('Das Bild wurde nicht akzeptiert.')
    throw Error('Schuhbilder-Dienst nicht verfügbar (HTTP '+response.status+').')
  }
}

export async function fetchShoeImages(session:Session):Promise<Record<string,string>> {
  const response=await fetch(base,{method:'GET',headers:headers(session),cache:'no-store'})
  await checked(response)
  const json=await response.json() as {images?:Record<string,string>}
  return json.images || {}
}

/**
 * Manual upload only. Convert photo to a small WebP to avoid huge uploads and
 * remove original image metadata before storage. No product image scraping.
 */
export async function prepareShoeImage(file:File):Promise<Blob> {
  if(!allowed.has(file.type)) throw Error('Bitte JPG, PNG oder WebP wählen.')
  if(file.size>10*1024*1024) throw Error('Das Originalbild darf höchstens 10 MB groß sein.')
  const bitmap=await createImageBitmap(file)
  try {
    const scale=Math.min(1,1400/bitmap.width,1000/bitmap.height)
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(bitmap.width*scale))
    canvas.height=Math.max(1,Math.round(bitmap.height*scale))
    const ctx=canvas.getContext('2d')
    if(!ctx) throw Error('Der Browser kann dieses Foto nicht verarbeiten.')
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const convert=(quality:number)=>new Promise<Blob>((resolve,reject)=>{
      canvas.toBlob(result=>result?resolve(result):reject(Error('Bildkonvertierung fehlgeschlagen.')),
        'image/webp',quality)
    })
    let result=await convert(.83)
    if(result.size>2*1024*1024) result=await convert(.62)
    if(result.type!=='image/webp' || result.size>2*1024*1024)
      throw Error('Bild zu groß. Bitte eine kleinere Datei auswählen.')
    return result
  } finally {
    bitmap.close()
  }
}

export async function uploadShoeImage(session:Session,gearId:string,file:File):Promise<void> {
  const blob=await prepareShoeImage(file)
  const response=await fetch(base+'?gearId='+encodeURIComponent(gearId),{
    method:'POST',
    headers:{...headers(session),'content-type':'image/webp'},
    body:blob,
    cache:'no-store'
  })
  await checked(response)
}

export async function removeShoeImage(session:Session,gearId:string):Promise<void> {
  const response=await fetch(base+'?gearId='+encodeURIComponent(gearId),{
    method:'DELETE',
    headers:headers(session),
    cache:'no-store'
  })
  await checked(response)
}
