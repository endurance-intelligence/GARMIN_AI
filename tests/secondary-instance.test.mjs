import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isPublicConfig,PRIMARY_URL,instanceStoragePrefix} from '../scripts/validate-public-config.mjs'
import {createScopedStorage} from '../src/lib/instanceBrowserStorage.mjs'
import {scopeBrowserStorage} from '../scripts/secondary-browser-storage.mjs'
import {prepareInstanceEdgeBundle,ownerEndpoints} from '../scripts/build-instance-edge-bundle.mjs'
const url='https://abcdefghijklmnopqrst.supabase.co',prefix=instanceStoragePrefix(url,'secondary')
const key=['sb','publishable','fixture'.repeat(4)].join('_')
test('secondary target is explicit, distinct and publishable only',()=>{
 assert.equal(isPublicConfig(PRIMARY_URL,key),true)
 assert.equal(isPublicConfig(url,key),false)
 assert.equal(isPublicConfig(url,key,'secondary'),true)
 assert.equal(isPublicConfig(PRIMARY_URL,key,'secondary'),false)
 assert.equal(isPublicConfig(url,key,'typo'),false)
 assert.equal(isPublicConfig(url,['sb','secret','fixture'.repeat(4)].join('_'),'secondary'),false)
 for(const u of [url+'/',url+'/other',url+'.evil.invalid','http://abcdefghijklmnopqrst.supabase.co'])assert.equal(isPublicConfig(u,key,'secondary'),false)
})
test('secondary cache never reads, overwrites or clears the primary keys',()=>{
 const map=new Map([['test','primary'],['sb-primary-auth-token','primary-session']])
 const storage={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}
 const scoped=createScopedStorage(()=>storage,prefix)
 assert.equal(scoped.getItem('test'),null)
 scoped.setItem('test','secondary')
 assert.equal(scoped.getItem('test'),'secondary')
 assert.equal(storage.getItem('test'),'primary')
 assert.equal(scoped.length,1)
 assert.equal(scoped.key(0),'test')
 scoped.clear()
 assert.equal(map.size,2)
 assert.equal(storage.getItem('sb-primary-auth-token'),'primary-session')
})
test('secondary compilation scopes local and session storage without changing global Storage',()=>{
 const code=scopeBrowserStorage("localStorage.getItem('a'); window.sessionStorage.setItem('b','c'); globalThis['localStorage'].removeItem('d')",'fixture.ts',prefix)
 assert.match(code,/__garminScopedLocal\.getItem/)
 assert.match(code,/__garminScopedSession\.setItem/)
 assert.match(code,/__garminScopedLocal\.removeItem/)
 assert.throws(()=>scopeBrowserStorage("window.indexedDB.open('x')",'fixture.ts',prefix),/review required/)
 assert.throws(()=>scopeBrowserStorage("window.addEventListener('storage',()=>{})",'fixture.ts',prefix),/review required/)
})
test('all application sources pass secondary browser-storage review',()=>{
 const root=fileURLToPath(new URL('../src/',import.meta.url))
 function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name)
  if(entry.isDirectory())walk(path)
  else if(/\.(tsx?|mjs|js|jsx)$/.test(path)&&!path.endsWith('instanceBrowserStorage.mjs'))scopeBrowserStorage(readFileSync(path,'utf8'),path,prefix)
 }}
 walk(root)
})
test('all approved owner Edge bundles can be produced from this checkout without primary references',()=>{
 for(const name of ownerEndpoints){
  const b=prepareInstanceEdgeBundle(name,url)
  assert.equal(b.verify_jwt,false)
  assert.ok(b.files.some(f=>f.name===b.entrypoint_path))
  assert.ok(b.files.every(f=>!f.content.includes(PRIMARY_URL)))
 }
 assert.throws(()=>prepareInstanceEdgeBundle('garmin-cloud-worker',url),/Not an approved/)
 assert.throws(()=>prepareInstanceEdgeBundle('garmin-app-access',PRIMARY_URL),/Not an approved/)
})
