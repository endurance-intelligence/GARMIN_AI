import {readFile,realpath} from 'node:fs/promises'
import {resolve,relative,isAbsolute,sep} from 'node:path'
import {preparePrivateOrcImport,summarizePrivateOrcImport} from '../src/lib/orcPrivateImportPlan.mjs'

// Only offline preflight. Never prints personal content, uploads images or uses secrets.
// Usage: node scripts/check-orc-import.mjs /private/extracted-package
if(process.argv.length!==3){
 console.error('Usage: node scripts/check-orc-import.mjs <extracted-package-directory>')
 process.exitCode=2
}else{
 try{
  const root=await realpath(process.argv[2])
  async function privateRead(path){
   const actual=await realpath(resolve(root,path))
   const rel=relative(root,actual)
   if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Pfad außerhalb des Pakets')
   return readFile(actual)
  }
  const manifest=JSON.parse(await privateRead('manifest.json'))
  const rows=await preparePrivateOrcImport(manifest,privateRead)
  console.log(JSON.stringify(summarizePrivateOrcImport(rows)))
 }catch(error){
  // Errors from fs may include personal paths; never echo them.
  console.error('Private ORC preflight failed; no writes performed.')
  process.exitCode=1
 }
}
