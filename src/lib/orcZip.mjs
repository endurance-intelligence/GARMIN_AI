import {preparePrivateOrcImport} from './orcPrivateImportPlan.mjs'
// Bounded ZIP reader: only the package manifest and named poster files are allowed.
// All original bytes and hashes are checked before any server write.
export async function readOrcZip(blob){
 if(!blob||blob.size<22||blob.size>100_000_000)throw Error('ZIP-Größe ungültig')
 const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer)
 const u16=o=>v.getUint16(o,true),u32=o=>v.getUint32(o,true)
 const decoder=new TextDecoder('utf-8',{fatal:true}),entries=new Map()
 let end=-1
 for(let o=bytes.length-22;o>=Math.max(0,bytes.length-65557);o--){
  if(u32(o)===0x06054b50&&o+22+u16(o+20)===bytes.length){end=o;break}
 }
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))throw Error('ZIP-Verzeichnis ungültig')
 const count=u16(end+10),size=u32(end+12),start=u32(end+16)
 if(count<2||count>101||start+size!==end)throw Error('ZIP-Verzeichnis ungültig')
 let offset=start,total=0
 for(let i=0;i<count;i++){
  if(offset+46>end||u32(offset)!==0x02014b50)throw Error('ZIP-Eintrag ungültig')
  const flags=u16(offset+8),method=u16(offset+10),compressed=u32(offset+20),length=u32(offset+24),n=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),local=u32(offset+42)
  const after=offset+46+n+extra+comment
  if(after>end||!n||n>256||flags&1||![0,8].includes(method)||length<1||length>8_000_000||compressed>8_100_000||u16(offset+34))throw Error('ZIP-Eintrag ungültig')
  const name=decoder.decode(bytes.subarray(offset+46,offset+46+n))
  if(!/^(manifest\.json|images\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/i.test(name)||entries.has(name))throw Error('Unerwarteter ZIP-Pfad')
  if(local+30>start||u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==method)throw Error('ZIP-Dateikopf ungültig')
  const ln=u16(local+26),le=u16(local+28),data=local+30+ln+le
  if(data+compressed>start||decoder.decode(bytes.subarray(local+30,local+30+ln))!==name)throw Error('ZIP-Dateikopf ungültig')
  total+=length
  if(total>100_000_000)throw Error('ZIP-Paket zu groß')
  entries.set(name,{data,compressed,length,method})
  offset=after
 }
 if(offset!==end||!entries.has('manifest.json'))throw Error('Manifest fehlt')
 async function read(name){
  const item=entries.get(name);if(!item)throw Error('Originalbild fehlt')
  const raw=bytes.subarray(item.data,item.data+item.compressed)
  if(item.method===0){if(raw.length!==item.length)throw Error('ZIP-Länge ungültig');return raw.slice()}
  if(typeof DecompressionStream!=='function')throw Error('Dieser Browser unterstützt den ZIP-Import nicht.')
  const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const output=new Uint8Array(item.length);let written=0
  try{while(true){const next=await reader.read();if(next.done)break
   if(written+next.value.length>output.length)throw Error('ZIP-Länge ungültig')
   output.set(next.value,written);written+=next.value.length
  }}finally{await reader.cancel().catch(()=>{})}
  if(written!==output.length)throw Error('ZIP-Länge ungültig')
  return output
 }
 const manifest=JSON.parse(decoder.decode(await read('manifest.json')))
 const rows=await preparePrivateOrcImport(manifest,read)
 if(rows.length+1!==entries.size)throw Error('Nicht zugeordnete Originalbilder')
 return {manifest,rows}
}
export function encodeOrcImage(bytes){
 let binary=''
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
 return btoa(binary)
}
