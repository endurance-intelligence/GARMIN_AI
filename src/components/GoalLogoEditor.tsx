import {useEffect,useRef,useState} from 'react'
import '../styles/goal-logo.css'
const MAX=256*1024
export async function prepareGoalLogo(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Bitte PNG, JPG oder WebP auswählen.')
 if(file.size>10*1024*1024)throw Error('Das Originalbild darf maximal 10 MB groß sein.')
 const bitmap=await createImageBitmap(file)
 try{
  const factor=Math.min(1,640/bitmap.width,640/bitmap.height)
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor))
  const ctx=canvas.getContext('2d')
  if(!ctx)throw Error('Bild kann nicht verarbeitet werden.')
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
  const convert=(q:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Bildkonvertierung fehlgeschlagen.')),'image/webp',q))
  let blob=await convert(.88)
  if(blob.size>MAX)blob=await convert(.65)
  if(blob.size>MAX||blob.type!=='image/webp')throw Error('Bitte ein kleineres Bild auswählen.')
  return await new Promise<string>((resolve,reject)=>{
   const reader=new FileReader()
   reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('Bild nicht lesbar.'))
   reader.onerror=()=>reject(Error('Bild nicht lesbar.'))
   reader.readAsDataURL(blob)
  })
 }finally{bitmap.close()}
}
export function GoalLogoEditor({value,onChange,disabled,onPreparing}:{
 value?:string|null;onChange:(value:string)=>void;disabled:boolean;onPreparing:(busy:boolean)=>void
}){
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const input=useRef<HTMLInputElement>(null)
 const mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;onPreparing(false)}},[onPreparing])
 async function select(file:File|undefined){
  if(!file||busy||disabled)return
  setBusy(true);onPreparing(true);setError('')
  try{const data=await prepareGoalLogo(file);if(mounted.current)onChange(data)}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Bild konnte nicht gelesen werden.')}
  finally{if(mounted.current){setBusy(false);onPreparing(false);if(input.current)input.current.value=''}}
 }
 return <div className="goal-logo-edit">
  <div className="goal-logo-preview">{value?<img src={value} alt="Vorschau des Ziel-Logos"/>:<span aria-hidden="true">⚑</span>}</div>
  <div className="goal-logo-controls">
   <strong>Zielbild / Logo</strong>
   <small>PNG, JPG oder WebP · transparenter Hintergrund bleibt erhalten. Wird mit dem Ziel gespeichert.</small>
   <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled||busy} onChange={e=>void select(e.target.files?.[0])}/>
   <div className="goal-logo-actions">
    <button type="button" disabled={disabled||busy} onClick={()=>input.current?.click()}>{busy?'Bild wird vorbereitet …':value?'Bild ersetzen':'Bild hochladen'}</button>
    {value&&<button type="button" disabled={disabled||busy} onClick={()=>{setError('');onChange('')}}>Bild entfernen</button>}
   </div>
   {error&&<p role="alert" className="goal-logo-error">{error}</p>}
  </div>
 </div>
}
