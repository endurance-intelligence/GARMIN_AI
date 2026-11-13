import assets from '../lib/exerciseComicAssets.json'
import '../styles/exercise-comics.css'

const IMAGE_BY_ID:Readonly<Record<string,string>>=assets
const base=import.meta.env.BASE_URL.endsWith('/')?import.meta.env.BASE_URL:
 import.meta.env.BASE_URL+'/'
export function exerciseComicUrl(id:string):string|null{
 const asset=IMAGE_BY_ID[id]
 // Explicit whitelist from our own assets, no user-controlled remote URL.
 return asset&&asset.startsWith('/exercise-comics/')?
  base+asset.replace(/^\//,''):null
}
export function ExerciseComic({id,name,priority=false,compact=false}:{
 id:string;name:string;priority?:boolean;compact?:boolean
}){
 const src=exerciseComicUrl(id)
 if(!src)return <div className="ec-missing" role="status">
  Illustration noch nicht verfügbar. Technikhinweise stehen darunter.
 </div>
 return <figure className={'ec-figure'+(compact?' is-compact':'')}>
  <img src={src} alt={'Original-Übungscomic für '+name+
   ': Ausgangsposition links, kontrollierte Bewegung rechts'}
   width={900} height={480} loading={priority?'eager':'lazy'} decoding="async"/>
 </figure>
}
