/** Build a self-contained Supabase Edge bundle from the actual source tree.
 * Never keep a second copy of the Coach rules in Git. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {resolve,dirname,relative,join} from 'node:path'
import {fileURLToPath} from 'node:url'
const ROOT=fileURLToPath(new URL('../',import.meta.url))
const ENTRY='supabase/functions/garmin-coach-archive/index.ts'
const seen=new Map()
function destination(path){
 if(path===ENTRY)return 'index.ts'
 if(path.startsWith('src/lib/'))return 'core/'+path.slice('src/lib/'.length)
 if(path.startsWith('supabase/functions/_shared/'))return '_shared/'+path.slice('supabase/functions/_shared/'.length)
 throw Error('Unexpected archive bundle dependency: '+path)
}
function add(path){
 if(seen.has(path))return
 const dest=destination(path)
 const source=readFileSync(join(ROOT,path),'utf8')
 seen.set(path,{name:dest,content:''})
 const content=source.replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,spec,b)=>{
  const target=relative(ROOT,resolve(ROOT,dirname(path),spec)).replaceAll('\\','/')
  add(target)
  let next=relative(dirname(dest),destination(target)).replaceAll('\\','/')
  if(!next.startsWith('.'))next='./'+next
  return a+next+b
 })
 seen.set(path,{name:dest,content})
}
export function archiveBundle(){add(ENTRY);return [...seen.values()].sort((a,b)=>a.name.localeCompare(b.name))}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=resolve(process.argv[2]||'.tmp/coach-archive-bundle')
 for(const f of archiveBundle()){const path=join(out,f.name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,f.content)}
 console.log('Coach archive bundle built:',seen.size,'source files')
}
