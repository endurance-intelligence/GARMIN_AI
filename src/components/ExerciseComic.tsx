import assets from '../lib/exerciseComicAssets.json'
import '../styles/exercise-comics.css'

const IMAGE_BY_ID:Readonly<Record<string,string>>=assets
const base=import.meta.env.BASE_URL.endsWith('/')?import.meta.env.BASE_URL:
 import.meta.env.BASE_URL+'/'
export function exerciseComicUrl(id:string):string|null{
 const asset=IMAGE_BY_ID[id]
 // All images are original, versioned local assets; no external image hosts.
 return asset&&/^\/exercise-comics\/[a-z0-9-]+\.(svg|webp)$/.test(asset)?
  base+asset.slice(1):null
}
export function ExerciseComic({id,name,priority=false,compact=false}:{
 id:string;name:string;priority?:boolean;compact?:boolean
}){
 const src=exerciseComicUrl(id)
 const premium=!!src&&src.endsWith('.webp')
 if(!src)return <div className="ec-missing" role="status">
  Illustration noch nicht verfügbar. Technikhinweise stehen darunter.
 </div>
 return <figure className={'ec-figure'+(compact?' is-compact':'')+
  (premium?' is-premium':' is-vector')}>
  <img src={src}
   alt={'Original-Übungscomic für '+name+
    (premium?': richtige Körperposition und Bewegungshinweise':
     ': Ausgangsposition links, kontrollierte Bewegung rechts')}
   width={premium?840:900} height={premium?1050:480}
   loading={priority?'eager':'lazy'} decoding="async"
   onError={e=>{
    // A network/caching error on a premium image must not blank the live workout.
    if(e.currentTarget.src.endsWith('.webp'))
     e.currentTarget.src=base+'exercise-comics/'+id+'.svg'
   }}/>
 </figure>
}
