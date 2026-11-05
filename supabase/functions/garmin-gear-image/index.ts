/**
 * GARMIN_AI v0.7.3.5 – PRIVATE manual shoe images.
 * The browser uploads a resized WebP directly to this owner-authenticated function.
 * No Garmin credentials, automatic image search, public bucket, or gear-history writes.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const bucket = 'garmin-gear-images'
const projectUrl = Deno.env.get('SUPABASE_URL') || ''
const owner = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL') || '').trim().toLowerCase()
const maxBytes = 2 * 1024 * 1024

function envKey(kind: 'publishable'|'secret') {
  const modern = kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS'
  const legacy = kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const raw: unknown = JSON.parse(Deno.env.get(modern) || '{}')
    if (raw && typeof raw === 'object' && 'default' in raw) {
      const value = (raw as Record<string, unknown>).default
      if (typeof value === 'string' && value) return value
    }
  } catch { /* fall back */ }
  return Deno.env.get(legacy) || ''
}

function cors(origin: string|null): Record<string,string> {
  const valid = !!origin && /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
  return {
    ...(valid ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin'} : {}),
    'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
  }
}
function json(data:unknown,status:number,headers:Record<string,string>) {
  return new Response(JSON.stringify(data),{status,headers})
}
function normalId(value:unknown):string|null {
  if(typeof value !== 'string') return null
  const bare = value.replace(/-/g,'').toLowerCase()
  return /^[0-9a-f]{32}$/.test(bare) ? bare : null
}
function activeShoe(gear:unknown) {
  if (!gear || typeof gear!=='object' || Array.isArray(gear)) return false
  const g=gear as Record<string,unknown>
  return g.status==='active' && typeof g.type==='string' && /shoes?|schuh/i.test(g.type)
}
function webp(bytes:Uint8Array) {
  return bytes.length>=12 &&
    String.fromCharCode(...bytes.slice(0,4))==='RIFF' &&
    String.fromCharCode(...bytes.slice(8,12))==='WEBP'
}
Deno.serve(async(req:Request)=>{
  const headers=cors(req.headers.get('origin'))
  if(req.headers.has('origin') && !headers['Access-Control-Allow-Origin'])
    return json({error:'Origin not allowed'},403,headers)
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers})
  if(!['GET','POST','DELETE'].includes(req.method))
    return json({error:'Method not allowed'},405,headers)
  if(!projectUrl || !owner || !envKey('publishable') || !envKey('secret'))
    return json({error:'Not configured'},503,headers)
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
  if(!match) return json({error:'Login required'},401,headers)
  try {
    const auth=createClient(projectUrl,envKey('publishable'),{
      auth:{persistSession:false,autoRefreshToken:false}
    })
    const {data:{user},error:authError}=await auth.auth.getUser(match[1])
    if(authError || !user) return json({error:'Invalid login'},401,headers)
    if(!user.email_confirmed_at || user.email?.trim().toLowerCase()!==owner)
      return json({error:'Not authorized'},403,headers)

    const admin=createClient(projectUrl,envKey('secret'),{
      auth:{persistSession:false,autoRefreshToken:false}
    })
    const {data:row,error:readError}=await admin.from('garmin_connect_snapshot')
      .select('gear').eq('snapshot_key','primary').maybeSingle()
    if(readError) throw Error('gear-read')
    const gear = Array.isArray(row?.gear) ? row.gear : []
    const eligible = new Map<string,Record<string,unknown>>()
    for (const candidate of gear) {
      if (!activeShoe(candidate)) continue
      const record=candidate as Record<string,unknown>
      const id=normalId(record.id)
      if(id) eligible.set(id,record)
    }
    const storage=admin.storage.from(bucket)

    if(req.method==='GET') {
      const {data:objects,error:listError}=await storage.list('gear',{limit:100})
      if(listError) throw Error('image-list')
      const existing=new Set((objects||[]).map(o=>o.name))
      const images:Record<string,string>={}
      for (const [id,entry] of eligible) {
        const path=id+'.webp'
        if(!existing.has(path)) continue
        const {data:signed,error:signError}=await storage.createSignedUrl('gear/'+path,3600)
        if(signError || !signed?.signedUrl) continue
        images[String(entry.id)]=signed.signedUrl
      }
      return json({images},200,headers)
    }

    const imageId=normalId(new URL(req.url).searchParams.get('gearId'))
    if(!imageId || !eligible.has(imageId))
      return json({error:'Only active running shoes can receive images'},422,headers)
    const path='gear/'+imageId+'.webp'

    if(req.method==='DELETE') {
      const {error:removeError}=await storage.remove([path])
      if(removeError) throw Error('image-remove')
      return json({removed:true},200,headers)
    }

    // Only WebP image bytes are accepted; the browser resizes and converts
    // local images before upload. No arbitrary remote URL or raw SVG is stored.
    if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='image/webp')
      return json({error:'WebP required'},415,headers)
    const declared=Number(req.headers.get('content-length')||0)
    if(declared>maxBytes) return json({error:'Image too large'},413,headers)
    const bytes=new Uint8Array(await req.arrayBuffer())
    if(bytes.length<16 || bytes.length>maxBytes || !webp(bytes))
      return json({error:'Invalid or oversized image'},422,headers)
    const {error:uploadError}=await storage.upload(path,bytes,{
      contentType:'image/webp',upsert:true,cacheControl:'60'
    })
    if(uploadError) throw Error('image-upload')
    return json({saved:true},200,headers)
  } catch {
    // Avoid leaking storage internals or user data to the browser.
    return json({error:'Image service unavailable'},502,headers)
  }
})
