/**
 * GARMIN_AI v0.7.3.7 - LOCAL owner-verified Garmin activity shoe editor.
 * This is an explicitly approved write to Garmin Connect, NOT the Personal API.
 * Passwords and Garmin tokens remain in LOCALAPPDATA and are never returned.
 */
import type { Plugin } from 'vite'
import { Garmin, GarminClient, FileTokenStore } from 'garminconnect-js'
import { join } from 'node:path'
import { homedir } from 'node:os'

type Row = Record<string, unknown>
const object = (x:unknown):Row => x && typeof x==='object' && !Array.isArray(x) ? x as Row : {}
const uuid = (x:unknown) => {
  const value=typeof x==='string' ? x.replace(/-/g,'').toLowerCase() : ''
  return /^[a-f0-9]{32}$/.test(value) ? value : null
}
const activityId = (x:unknown) => typeof x==='string' && /^\d{5,20}$/.test(x) ? x : null
const shoe = (g:Row) => typeof g.type==='string' && /shoes?|schuh/i.test(g.type)
const activeShoe = (g:Row) => shoe(g) && g.status==='active'
const displayName = (g:Row) => typeof g.name==='string' ? g.name : 'Laufschuh'
const pairId = (g:Row) => uuid(g.uuid ?? g.gearUUID ?? g.gearUuid ?? g.gearId)
const normalizeRaw = (raw:unknown, catalog:Map<string,Row>):string|null => {
  if(!Array.isArray(raw)) throw Error('Garmin-Ausrüstung konnte nicht zuverlässig gelesen werden.')
  const identified=new Set<string>()
  for(const entry of raw) {
    const r=object(entry)
    const id=pairId(r)
    const current=id ? catalog.get(id) : null
    const type=typeof r.gearTypeName==='string' ? r.gearTypeName : r.gearType
    if(id && (current && shoe(current) || typeof type==='string' && /shoes?|schuh/i.test(type))) identified.add(id)
  }
  if(identified.size>1) throw Error('Garmin hat mehrere Laufschuhe für diese Aktivität. Bitte zuerst in Garmin Connect prüfen.')
  return [...identified][0] ?? null
}
function result(res:import('node:http').ServerResponse,code:number,body:unknown) {
  res.statusCode=code
  res.setHeader('content-type','application/json; charset=utf-8')
  res.setHeader('cache-control','private, no-store')
  res.setHeader('x-content-type-options','nosniff')
  res.end(JSON.stringify(body))
}
function urlBase(value:string) {
  return /^https:\/\/eurgupsebxypjqvyizci\.supabase\.co\/?$/.test(value)
    ? value.replace(/\/$/,'') : null
}
async function ownerSnapshot(base:string,key:string,token:string) {
  const response=await fetch(base+'/functions/v1/garmin-connect-snapshot',{
    method:'GET',headers:{authorization:'Bearer '+token,apikey:key},signal:AbortSignal.timeout(15000),cache:'no-store'
  })
  if(response.status===401||response.status===403) throw Error('Keine Berechtigung für Garmin-Änderungen.')
  if(!response.ok) throw Error('Garmin-Ausrüstung derzeit nicht verfügbar.')
  const data=object(await response.json())
  const snapshot=object(data.snapshot)
  if(!Array.isArray(snapshot.gear) || !Array.isArray(snapshot.activity_gear))
    throw Error('Vollständige Garmin-Ausrüstung noch nicht gespeichert.')
  const catalog=new Map<string,Row>()
  for(const val of snapshot.gear) {
    const g=object(val),id=uuid(g.id)
    if(!id || catalog.has(id)) throw Error('Garmin-Ausrüstung enthält ungültige IDs.')
    catalog.set(id,g)
  }
  return catalog
}
async function ownedRun(base:string,key:string,token:string,id:string) {
  const response=await fetch(base+'/functions/v1/read-garmin-session?id='+id,{
    headers:{authorization:'Bearer '+token,apikey:key},signal:AbortSignal.timeout(20000),cache:'no-store'
  })
  if(!response.ok) throw Error('Lauf ist nicht im privaten Garmin-Aktivitätsbestand verfügbar.')
  const data=object(await response.json()),act=object(data.activity)
  if(String(act.id)!==id || typeof act.sport!=='string' ||
     !['running','track_running','treadmill_running','ultra_run'].includes(act.sport))
    throw Error('Schuhe können hier nur für bestätigte Laufaktivitäten geändert werden.')
}
async function authGarmin() {
  const root=join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'GARMIN_AI')
  const client=new GarminClient({tokenStore:new FileTokenStore(join(root,'garmin-connect-tokens'))})
  if(!await client.loadTokens()) throw Error('Garmin Connect ist lokal nicht angemeldet.')
  return new Garmin(client)
}
async function readBody(req:import('node:http').IncomingMessage):Promise<Row> {
  const type=req.headers['content-type']||''
  if(typeof type!=='string' || !type.toLowerCase().startsWith('application/json')) throw Error('JSON benötigt.')
  if(Number(req.headers['content-length']||0)>1500) throw Error('Anfrage zu groß.')
  let raw=''
  for await(const part of req) {
    raw+=String(part)
    if(raw.length>1500) throw Error('Anfrage zu groß.')
  }
  try{return object(JSON.parse(raw) as unknown)}
  catch {throw Error('Ungültige JSON-Anfrage.')}
}

export function garminActivityShoeLocal():Plugin {
  return {name:'garmin-activity-shoe-local-owner-only',apply:'serve',configureServer(server){
    const base=urlBase(server.config.env.VITE_GARMIN_SUPABASE_URL||'')
    const key=server.config.env.VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY||''
    let writing=false
    server.middlewares.use('/api/garmin-activity-shoe',async(req,res)=>{
      const hostname=req.headers.host||'',origin=req.headers.origin||''
      const remote=req.socket.remoteAddress||''
      const trustedHost=/^(localhost|127\.0\.0\.1):517[3-9]$/.test(hostname)
      const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)
      if(!trustedHost || !loopback || (origin && origin!=='http://'+hostname))
        return result(res,403,{error:'Nur lokal erlaubt.'})
      if(req.method!=='GET' && req.method!=='POST')
        return result(res,405,{error:'Methode nicht erlaubt.'})
      // Mutations require same-origin browser requests and owner Bearer authentication.
      if(req.method==='POST' && origin!=='http://'+hostname)
        return result(res,403,{error:'Schreibzugriff nur aus GARMIN_AI erlaubt.'})
      const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')
      if(!bearer || !base || !key)
        return result(res,401,{error:'Anmeldung bei GARMIN_AI erforderlich.'})
      const id=activityId(new URL(req.url||'/', 'http://localhost').searchParams.get('activityId'))
      if(!id)return result(res,400,{error:'Aktivitäts-ID ungültig.'})
      let locked=false
      try {
        const catalog=await ownerSnapshot(base,key,bearer[1])
        await ownedRun(base,key,bearer[1],id)
        if(req.method==='POST') {
          if(writing)return result(res,409,{error:'Eine Garmin-Änderung läuft bereits.'})
          writing=true;locked=true
        }
        const garmin=await authGarmin()
        const current=normalizeRaw(await garmin.getActivityGear(id),catalog)
        const options=[...catalog.entries()].filter(([,g])=>activeShoe(g))
          .map(([gearId,g])=>({id:gearId,name:displayName(g)}))
          .sort((a,b)=>a.name.localeCompare(b.name,'de',{sensitivity:'base'}))
        if(req.method==='GET') return result(res,200,{
          source:'Garmin Connect',activityId:id,currentGearId:current,
          currentName:current?(catalog.has(current)?displayName(catalog.get(current)!):'Unbekannter Schuh'):null,
          options,
        })
        const body=await readBody(req)
        const expected=body.expectedGearId===null?null:uuid(body.expectedGearId)
        const next=body.newGearId===null?null:uuid(body.newGearId)
        if((body.expectedGearId!==null&&!expected)||(body.newGearId!==null&&!next)||
           (next && !options.some(o=>o.id===next)))
          return result(res,422,{error:'Ungültige Schuhauswahl.'})
        if(current!==expected)
          return result(res,409,{error:'Garmin hat inzwischen eine andere Schuhzuordnung. Bitte aktualisieren.'})
        if(current===next)return result(res,200,{saved:true,unchanged:true,currentGearId:current})
        // Explicit user approval was collected by the client before this POST.
        // Add first, then unlink old shoe; on failure attempt to roll back newly added gear.
        let newlyAdded=false,oldRemoved=false
        try {
          if(next) {
            await garmin.addGearToActivity(next,id)
            newlyAdded=true
          }
          if(current) {
            await garmin.removeGearFromActivity(current,id)
            oldRemoved=true
          }
          const verified=normalizeRaw(await garmin.getActivityGear(id),catalog)
          if(verified!==next) throw Error('Garmin-Kontrollabfrage stimmt nicht mit der Änderung überein.')
        } catch {
          // Best-effort rollback. The user must still re-read Garmin after any
          // failed two-step write, because Garmin operations are not atomic.
          if(oldRemoved && current) {
            try { await garmin.addGearToActivity(current,id) } catch { /* uncertain */ }
          }
          if(newlyAdded && next) {
            try { await garmin.removeGearFromActivity(next,id) } catch { /* uncertain */ }
          }
          return result(res,502,{error:'Garmin-Änderung nicht sicher bestätigt. Bitte die Zuordnung erneut laden und in Garmin prüfen.'})
        }
        const syncResponse=await fetch(base+'/functions/v1/garmin-connect-snapshot',{
          method:'POST',
          headers:{authorization:'Bearer '+bearer[1],apikey:key,'content-type':'application/json'},
          body:JSON.stringify({mode:'activity-shoe',activityId:id,newGearId:next}),
          signal:AbortSignal.timeout(15000)
        })
        if(!syncResponse.ok) return result(res,207,{
          saved:false,garminUpdated:true,currentGearId:next,
          error:'In Garmin geändert, aber GARMIN_AI konnte die lokale Statistik nicht aktualisieren. Bitte Schuhzuordnungen synchronisieren.'
        })
        return result(res,200,{saved:true,garminUpdated:true,currentGearId:next})
      } catch(error) {
        return result(res,502,{error:error instanceof Error?error.message:'Garmin Connect nicht erreichbar.'})
      } finally {
        if(locked) writing=false
      }
    })
  }}
}
