import {pathToFileURL} from 'node:url'
export const PRIMARY_URL='https://eurgupsebxypjqvyizci.supabase.co'
export function secondaryProjectRef(url){
 if(typeof url!=='string'||url===PRIMARY_URL)return null
 return /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(url)?.[1]||null
}
export function instanceStoragePrefix(url,instance='primary'){
 if(instance==='primary')return ''
 if(instance!=='secondary')throw Error('Unknown deployment instance')
 const ref=secondaryProjectRef(url)
 if(!ref)throw Error('Invalid secondary project')
 return 'garmin-ai-instance:'+ref+':'
}
export function isPublicConfig(url,key,instance='primary'){
 return (instance==='primary'?url===PRIMARY_URL:instance==='secondary'&&!!secondaryProjectRef(url)) &&
   typeof key==='string' && key===key.trim() && /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!isPublicConfig(process.env.VITE_GARMIN_SUPABASE_URL,process.env.VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY,process.env.VITE_GARMIN_INSTANCE||'primary')){
  console.error('Refusing production build: expected the configured project and a publishable key.')
  process.exitCode=1
 }
}
