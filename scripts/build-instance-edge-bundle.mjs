/** Prepare an owner-only Edge bundle from this checkout for an explicitly
 * selected secondary Supabase project. No deployment or credential lookup. */
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve,relative,dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'
import {PRIMARY_URL,secondaryProjectRef} from './validate-public-config.mjs'
const ROOT=fileURLToPath(new URL('../',import.meta.url))
const PRIMARY_REF=new URL(PRIMARY_URL).hostname.split('.')[0]
export const ownerEndpoints=Object.freeze([
 'garmin-app-access','garmin-weekly-options','garmin-coach-context','garmin-training-history',
 'garmin-equipment-profile','garmin-cross-training','garmin-coach-goal','garmin-race-goals',
 'garmin-race-route','garmin-week-board','garmin-threshold-calibration','garmin-connect-snapshot',
 'garmin-coach-archive','garmin-training-plan','garmin-intervals','garmin-intervals-insights',
 'garmin-workout-archive','garmin-gear-image','garmin-coach-review','garmin-connect-bootstrap',
 'garmin-connect-cloud-check','garmin-race-research','garmin-sync-center','garmin-weight-intervals',
 'read-garmin-aerobic','read-garmin-easy-efficiency','read-garmin-health','read-garmin-hr-time',
 'read-garmin-reference-routes','read-garmin-session'
])
export function prepareInstanceEdgeBundle(name,url,{read=path=>readFileSync(join(ROOT,path),'utf8')}={}){
 if(!ownerEndpoints.includes(name)||!secondaryProjectRef(url))throw Error('Not an approved secondary owner endpoint/project')
 const entry='supabase/functions/'+name+'/index.ts',seen=new Map()
 function allowed(path){
  return (path.startsWith('src/lib/')||path.startsWith('supabase/functions/_shared/')||path.startsWith('supabase/functions/'+name+'/'))&&/\.(?:ts|mjs|js|json)$/.test(path)&&!path.includes('..')&&!path.includes('/.')
 }
 function add(path){
  if(seen.has(path))return
  if(!allowed(path))throw Error('Unexpected bundle dependency: '+path)
  const source=read(path)
  const content=source.replaceAll(PRIMARY_URL,url)
  if(content.includes(PRIMARY_REF)||/sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(content))throw Error('Unsafe literal in '+path)
  if(path===entry&&(!source.includes('auth.getUser(')||!source.includes('email_confirmed_at')||!source.includes('GARMIN_HEALTH_OWNER_EMAIL')||!source.includes('SUPABASE_URL')))throw Error('Owner/config guard requires review: '+name)
  seen.set(path,{name:path,content})
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true)
  function dep(spec){
   if(spec.startsWith('.')){
    const target=relative(ROOT,resolve(ROOT,dirname(path),spec)).replaceAll('\\','/')
    add(target)
   }
  }
  function visit(n){
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))dep(n.moduleSpecifier.text)
   if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword){
    if(!n.arguments[0]||!ts.isStringLiteral(n.arguments[0]))throw Error('Dynamic bundle dependency in '+path)
    dep(n.arguments[0].text)
   }
   ts.forEachChild(n,visit)
  }
  visit(ast)
 }
 add(entry)
 return {name,entrypoint_path:entry,verify_jwt:false,files:[...seen.values()].sort((a,b)=>a.name.localeCompare(b.name))}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [, ,name,url,out]=process.argv
 if(!out)throw Error('Usage: node scripts/build-instance-edge-bundle.mjs NAME SECONDARY_PROJECT_URL OUTPUT_JSON')
 const bundle=prepareInstanceEdgeBundle(name,url)
 writeFileSync(resolve(out),JSON.stringify(bundle),{flag:'wx'})
 console.log('Owner-only secondary bundle prepared:',bundle.files.length,'source files; no deployment performed.')
}
