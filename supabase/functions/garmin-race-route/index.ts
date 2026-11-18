/** Read or explicitly save a GPX-derived race route, per edition.
 * The active saved event's routeUrl is the authoritative link.
 * No remote GPX fetch, no write to Garmin, no cross-user access.
 */
import {createClient} from 'npm:@supabase/supabase-js@2'
const project='https://eurgupsebxypjqvyizci.supabase.co'
const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
const key=(kind:'public'|'secret')=>{
 try{const x=JSON.parse(Deno.env.get(kind==='public'?'SUPABASE_PUBLISHABLE_KEYS':'SUPABASE_SECRET_KEYS')||'{}')
  if(typeof x.default==='string'&&x.default)return x.default}catch{}
 return Deno.env.get(kind==='public'?'SUPABASE_ANON_KEY':'SUPABASE_SERVICE_ROLE_KEY')||''
}
function headers(origin:string|null){
 const allowed=!!origin&&(origin==='https://endurance-intelligence.github.io'||
  /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin))
 return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private,no-store',
 'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 ...(allowed?{'Access-Control-Allow-Origin':origin!,'Vary':'Origin'}:{})}
}
const reply=(status:number,body:unknown,h:Record<string,string>)=>
 new Response(JSON.stringify(body),{status,headers:h})
const rad=(d:number)=>d*Math.PI/180
function distance(a:number[],b:number[]){
 const dl=rad(b[0]-a[0]),dn=rad(b[1]-a[1])
 const q=Math.sin(dl/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dn/2)**2
 return 12742000*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)))
}
function validate(raw:unknown){
 if(!Array.isArray(raw)||raw.length<3||raw.length>1800)
  throw Error('Die GPX-Strecke muss zwischen 3 und 1800 Stützpunkte enthalten.')
 let total=0,up=0,down=0,previous:number[]|null=null
 const coordinates:number[][]=[]
 for(const item of raw){
  if(!Array.isArray(item)||item.length<2||item.length>3)throw Error('Ungültiger GPS-Punkt.')
  const p=item.map(Number)
  if(p.some(v=>!Number.isFinite(v))||Math.abs(p[0])>90||Math.abs(p[1])>180||
   p.length===3&&(p[2]<-500||p[2]>9000))throw Error('Ungültige GPX-Koordinaten.')
  if(previous){
   const d=distance(previous,p)
   if(d>20000)throw Error('Großer GPS-Sprung. Bitte Strecke prüfen.')
   total+=d
   if(previous.length===3&&p.length===3){
    const dz=p[2]-previous[2]
    if(dz>0)up+=dz
    else down-=dz
   }
  }
  coordinates.push(p);previous=p
 }
 if(total<100||total>1000000)throw Error('GPS-Streckenlänge ist nicht plausibel.')
 return {coordinates,distance_m:Math.round(total*10)/10,
  ascent_m:Math.round(up*10)/10,descent_m:Math.round(down*10)/10}
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),h=headers(origin)
 if(origin&&!h['Access-Control-Allow-Origin'])return reply(403,{error:'Origin not allowed'},h)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h})
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'},h)
 if(Deno.env.get('SUPABASE_URL')!==project||!owner||!key('public')||!key('secret'))
  return reply(503,{error:'Streckenservice nicht verfügbar'},h)
 const token=/^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')
 if(!token)return reply(401,{error:'Bitte anmelden'},h)
 try{
  const auth=createClient(project,key('public'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:{user},error}=await auth.auth.getUser(token[1])
  if(error||!user)return reply(401,{error:'Ungültige Sitzung'},h)
  if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
   return reply(403,{error:'Nicht autorisiert'},h)
  const db=createClient(project,key('secret'),{auth:{persistSession:false,autoRefreshToken:false}})
  const {data:goal}=await db.from('garmin_coach_goals').select('race_date,race_start_time')
   .eq('user_id',user.id).maybeSingle()
  if(!goal)return reply(409,{error:'Bitte erst ein Hauptziel speichern.'},h)
  const {data:event,error:eventError}=await db.from('garmin_race_event_research')
   .select('event_url,details').eq('user_id',user.id).eq('race_date',goal.race_date)
   .order('reviewed_at',{ascending:false}).limit(1).maybeSingle()
  if(eventError)return reply(503,{error:'Streckenzuordnung nicht verfügbar'},h)
  const routeUrl=typeof event?.details?.routeUrl==='string'?event.details.routeUrl:null
  if(!routeUrl)return reply(200,{route:null,reason:'no_saved_route_link',raceDate:goal.race_date,raceStartTime:goal.race_start_time},h)
  if(req.method==='GET'){
   const {data,error}=await db.from('garmin_race_tracks')
    .select('race_date,route_url,coordinates,distance_m,ascent_m,descent_m,saved_at')
    .eq('user_id',user.id).eq('route_url',routeUrl)
    .order('race_date',{ascending:false}).limit(50)
   if(error)return reply(503,{error:'Streckenpunkte nicht verfügbar'},h)
   const rows=data||[]
   const chosen=rows.find(x=>x.race_date===goal.race_date)||rows[0]||null
   return reply(200,{route:chosen,reusedFrom:chosen&&chosen.race_date!==goal.race_date?chosen.race_date:null,
    eventUrl:event.event_url,routeUrl,raceDate:goal.race_date,raceStartTime:goal.race_start_time},h)
  }
  const raw=await req.text()
  if(raw.length>220000)return reply(413,{error:'GPX-Geometrie zu groß'},h)
  let input:Record<string,unknown>
  try{input=JSON.parse(raw)}catch{return reply(422,{error:'Ungültiges Format'},h)}
  if(input.action!=='save'||input.confirm!==true||input.raceDate!==goal.race_date||
   input.routeUrl!==routeUrl)
   return reply(409,{error:'Wettkampftermin oder Streckenlink geändert – bitte neu laden.'},h)
  let track
  try{track=validate(input.coordinates)}
  catch(e){return reply(422,{error:e instanceof Error?e.message:'Ungültige GPX-Strecke'},h)}
  const {data,error:saveError}=await db.from('garmin_race_tracks').upsert({
   user_id:user.id,race_date:goal.race_date,route_url:routeUrl,
   ...track,saved_at:new Date().toISOString()
  },{onConflict:'user_id,race_date,route_url'})
   .select('race_date,route_url,coordinates,distance_m,ascent_m,descent_m,saved_at').single()
  if(saveError||!data)return reply(503,{error:'GPX konnte nicht gespeichert werden.'},h)
  return reply(200,{saved:true,route:data,garminChanged:false,intervalsChanged:false},h)
 }catch{return reply(503,{error:'Streckenservice nicht verfügbar'},h)}
})
