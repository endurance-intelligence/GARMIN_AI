/** One-click event research for an already saved race objective.
 * Owner only. All extraction is provisional until athlete explicitly confirms.
 * No LLM speculation and NO Garmin/Intervals writes.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
import {safeWebsiteUrl,parseEventPages,rankEventPages} from '../_shared/race-event-extract.mjs'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const isDev=(s:string)=>/^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(s)
function key(k:'public'|'secret'){
 try{const json=JSON.parse(Deno.env.get(k==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}');
 if(typeof json.default==='string'&&json.default)return json.default}catch{}
 return Deno.env.get(k==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
function headers(origin:string|null){
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||isDev(origin))
 return {'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
 'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
function reply(status:number,body:unknown,h:Record<string,string>){
 return new Response(JSON.stringify(body),{status,headers:h})
}
const dateValid=(d:unknown):d is string=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 !Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d
function cleanString(v:unknown,max:number):string|null{
 if(v===null||v===undefined||v==='')return null
 if(typeof v!=='string'||v.length>max)throw Error('Invalid event field')
 return v.trim().slice(0,max)||null
}
const numberValue=(v:unknown,min:number,max:number)=>{
 if(v===null||v===undefined||v==='')return null
 if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid numeric event field')
 return v
}
function reviewed(data:unknown){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Missing research')
 const value=data as Record<string,unknown>,fields:Record<string,unknown>={}
 for(const name of ['eventName','venue','venueAddress','city','routeNotes'] as const)
  fields[name]=cleanString(value[name],name==='routeNotes'?240:190)
 for(const name of ['routeUrl','gpxUrl'] as const)
  fields[name]=value[name]?safeWebsiteUrl(String(value[name])):null
 fields.eventDate=value.eventDate===null?null:
  (dateValid(value.eventDate)?value.eventDate:(()=>{throw Error('Invalid event date')})())
 for(const name of ['startTime','endTime'] as const){
  const v=value[name];fields[name]=v===null?null:
   typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?v:
   (()=>{throw Error('Invalid event time')})()
 }
 fields.officialLoopKm=numberValue(value.officialLoopKm,0.1,200)
 fields.maximumDistanceKm=numberValue(value.maximumDistanceKm,0.1,500)
 return fields
}
async function htmlPage(target:string){
 // Never allow fetch to auto-follow to internal/cloud-metadata addresses.
 let current=safeWebsiteUrl(target)
 for(let i=0;i<3;i++){
  const control=new AbortController(),timer=setTimeout(()=>control.abort(),6500)
  let res:Response
  try{
   res=await fetch(current,{redirect:'manual',cache:'no-store',
    signal:control.signal,headers:{Accept:'text/html,application/xhtml+xml;q=0.9'}})
  }finally{clearTimeout(timer)}
  if([301,302,303,307,308].includes(res.status)){
   const location=res.headers.get('location')
   if(!location)throw Error('Redirect ohne Ziel')
   current=safeWebsiteUrl(new URL(location,current).href)
   continue
  }
  if(!res.ok)throw Error('Website HTTP '+res.status)
  if(!/text\/html|application\/xhtml/i.test(res.headers.get('content-type')||''))
   throw Error('Seite enthält kein lesbares HTML')
  const advertised=Number(res.headers.get('content-length')||0)
  if(advertised>380000)throw Error('Webseite ist zu groß')
  const reader=res.body?.getReader()
  if(!reader)throw Error('Seite konnte nicht gelesen werden')
  const chunks:Uint8Array[]=[]
  let total=0
  try{
   while(true){
    const {done,value}=await reader.read()
    if(done)break
    total+=value.length
    if(total>380000)throw Error('Website ist zu groß')
    chunks.push(value)
   }
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(total),offsets={offset:0}
  for(const chunk of chunks){bytes.set(chunk,offsets.offset);offsets.offset+=chunk.length}
  return {url:current,html:new TextDecoder().decode(bytes)}
 }
 throw Error('Zu viele Weiterleitungen')
}
const isoToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(req.method!=='GET'&&req.method!=='POST')return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Private race research unavailable'},h)
 const match=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!match)return reply(401,{error:'Sign in required'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error:authError}=await auth.auth.getUser(match[1])
  if(authError||!user)return reply(401,{error:'Invalid user session'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return reply(403,{error:'Not authorized'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:goal,error:goalError}=await db.from('garmin_coach_goals')
   .select('race_name,race_date').eq('user_id',user.id).maybeSingle()
  if(goalError)return reply(503,{error:'Race goal unavailable'},h)
  if(!goal)return reply(409,{error:'Bitte zuerst dein Wettkampfziel in Race Prep speichern.'},h)
  if(req.method==='GET'){
   const {data, error}=await db.from('garmin_race_event_research')
    .select('id,race_date,event_url,event_title,details,evidence,reviewed_at,checked_at')
    .eq('user_id',user.id).eq('race_date',goal.race_date).order('reviewed_at',{ascending:false}).limit(5)
   if(error)return reply(503,{error:'Gespeicherte Recherchen nicht verfügbar'},h)
   return reply(200,{goal:{raceName:goal.race_name,raceDate:goal.race_date},
    saved:data||[],autoSaved:false},h)
  }
  const raw=await req.text()
  if(raw.length>22000)return reply(413,{error:'Anfrage zu groß'},h)
  let input:Record<string,unknown>
  try{
   const data=JSON.parse(raw)
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid')
   input=data
  }catch{return reply(422,{error:'Ungültige Eingabe'},h)}
  if(input.raceDate!==goal.race_date)
   return reply(409,{error:'Wettkampfziel hat sich geändert. Bitte Race Prep aktualisieren.'},h)
  if(input.action==='scan'){
   let url:string
   try{url=safeWebsiteUrl(String(input.url||''))}catch(e){
    return reply(422,{error:e instanceof Error?e.message:'Webseite ungültig'},h)
   }
   try{
    const root=await htmlPage(url)
    const other=rankEventPages(root.url,root.html)
    const pages=[root]
    // No more than three internal subpages; failures are reported but cannot
    // cause a false claim that the whole site was read.
    const warnings:string[]=[]
    for(const page of other.slice(0,3)){
     try{pages.push(await htmlPage(page.url))}
     catch{warnings.push('Unterseite nicht lesbar: '+page.url)}
    }
    const result=parseEventPages(pages,{raceDateHint:goal.race_date,raceNameHint:goal.race_name})
    if(result.details.eventDate&&result.details.eventDate!==goal.race_date)
     warnings.push('Gefundener Termin weicht vom aktiven Ziel ab. Bitte prüfen.')
    return reply(200,{sourceUrl:root.url,...result,warnings,
     complete:result.missing.length===0,needsReview:true,saved:false,
     routeMetadataStatus:result.details.routeUrl?'route_link_found_not_gpx_verified':'not_found'},h)
   }catch(e){return reply(422,{error:'Webseite konnte nicht vollständig geprüft werden: '+
      (e instanceof Error?e.message:'Abruf fehlgeschlagen')},h)}
  }
  if(input.action==='save'){
   if(input.confirm!==true)return reply(422,{error:'Angaben müssen vor dem Speichern bestätigt werden.'},h)
   try{
    const eventUrl=safeWebsiteUrl(String(input.sourceUrl||''))
    const details=reviewed(input.details)
    if(details.eventDate&&details.eventDate!==goal.race_date)
     return reply(409,{error:'Veranstaltungsdatum stimmt nicht mit deinem aktiven Ziel überein.'},h)
    const evidence=Array.isArray(input.sources)?input.sources.slice(0,35).map((x:unknown)=>{
     const s=x as Record<string,unknown>
     return {field:cleanString(s.field,60),url:safeWebsiteUrl(String(s.url||'')),
      evidence:cleanString(s.evidence,180)}
    }):[]
    const title=String(details.eventName||goal.race_name).slice(0,150)
    const row={user_id:user.id,race_date:goal.race_date,event_url:eventUrl,
     event_title:title,details,evidence,checked_at:new Date().toISOString(),
     reviewed_at:new Date().toISOString()}
    const {data,error}=await db.from('garmin_race_event_research').upsert(row,{
     onConflict:'user_id,race_date,event_url'
    }).select('id,race_date,event_url,event_title,details,evidence,reviewed_at,checked_at').single()
    if(error||!data)return reply(503,{error:'Recherche konnte nicht gespeichert werden.'},h)
    return reply(200,{saved:true,record:data,
     trainingGoalChanged:false,garminChanged:false,intervalsChanged:false},h)
   }catch(e){return reply(422,{error:e instanceof Error?e.message:'Daten ungültig'},h)}
  }
  return reply(422,{error:'Unbekannte Aktion'},h)
 }catch{return reply(503,{error:'Private race research unavailable'},h)}
})
