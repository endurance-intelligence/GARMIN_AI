import {pathToFileURL} from 'node:url'
export function isPublicConfig(url,key){
 return url==='https://eurgupsebxypjqvyizci.supabase.co' &&
   typeof key==='string' && key===key.trim() && /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!isPublicConfig(process.env.VITE_GARMIN_SUPABASE_URL,process.env.VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY)){
  console.error('Refusing production build: expected the configured project and a publishable key.')
  process.exitCode=1
 }
}
