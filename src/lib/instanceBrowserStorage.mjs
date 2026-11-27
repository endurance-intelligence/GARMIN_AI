/** Per-project application cache. Supabase Auth keeps its own project-specific
 * token storage. This is not an origin/security boundary. */
export function createScopedStorage(getStorage,prefix){
 if(typeof prefix!=='string'||!/^garmin-ai-instance:[a-z0-9]{20}:$/.test(prefix))throw Error('Invalid browser cache namespace')
 const keys=()=>{
  const storage=getStorage(),out=[]
  for(let i=0;i<storage.length;i++){
   const key=storage.key(i)
   if(typeof key==='string'&&key.startsWith(prefix))out.push(key.slice(prefix.length))
  }
  return out
 }
 return Object.freeze({
  getItem(key){return getStorage().getItem(prefix+String(key))},
  setItem(key,value){getStorage().setItem(prefix+String(key),String(value))},
  removeItem(key){getStorage().removeItem(prefix+String(key))},
  get length(){return keys().length},
  key(index){return keys()[Number(index)]??null},
  clear(){for(const key of keys())getStorage().removeItem(prefix+key)}
 })
}
export function browserInstanceStorage(kind,prefix){
 if(kind!=='localStorage'&&kind!=='sessionStorage')throw Error('Invalid storage kind')
 return createScopedStorage(()=>globalThis[kind],prefix)
}
