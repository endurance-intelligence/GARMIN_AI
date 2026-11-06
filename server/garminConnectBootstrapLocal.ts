/**
 * v0.7.6.1 – privileged localhost-only bridge.
 * The browser submits its existing Supabase owner JWT and a consent flag,
 * but NEVER reads Garmin OAuth tokens. This Node adapter reads the tokens
 * from the already configured local FileTokenStore and sends them directly
 * over HTTPS to the owner-only Edge bootstrap function.
 *
 * Only registration via vite.config.ts in local development mode.
 */
import type {Plugin} from 'vite'
import {GarminClient,Garmin,FileTokenStore} from 'garminconnect-js'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {isGarminCloudSession} from '../supabase/functions/_shared/garmin-connect-tokens.mjs'

function send(res:import('node:http').ServerResponse,status:number,payload:unknown) {
  res.statusCode=status
  res.setHeader('content-type','application/json; charset=utf-8')
  res.setHeader('cache-control','private, no-store')
  res.setHeader('x-content-type-options','nosniff')
  res.end(JSON.stringify(payload))
}
const projectUrl='https://eurgupsebxypjqvyizci.supabase.co'

export function garminConnectBootstrapLocal():Plugin {
  return {
    name:'garmin-connect-vault-bootstrap-local',
    apply:'serve',
    configureServer(server){
      // Bound to local Vite; this endpoint must NOT run on a public host.
      const configured=(server.config.env.VITE_GARMIN_SUPABASE_URL||'').replace(/\/$/,'')
      const apiKey=server.config.env.VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY||''
      let transferring=false
      server.middlewares.use('/api/garmin-connect-bootstrap',async(req,res)=>{
        const host=req.headers.host||''
        const origin=req.headers.origin||''
        const remote=req.socket.remoteAddress||''
        const localHost=/^(localhost|127\.0\.0\.1):5173$/.test(host)
        const localClient=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)
        if(!localHost || !localClient || origin!=='http://'+host)
          return send(res,403,{error:'Nur lokal aus GARMIN_AI erlaubt.'})
        if(req.method!=='POST')return send(res,405,{error:'Nur POST erlaubt.'})
        if(configured!==projectUrl||!apiKey)
          return send(res,503,{error:'Supabase-Projektverknüpfung fehlt.'})
        const ownerJwt=/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')
        if(!ownerJwt)return send(res,401,{error:'Bitte in GARMIN_AI anmelden.'})
        if(transferring)return send(res,409,{error:'Übertragung läuft bereits.'})
        // Do not accept OAuth data or filenames from the browser.
        const consent=req.headers['x-garmin-cloud-consent']
        if(consent!=='ja')
          return send(res,422,{error:'Ausdrückliche Freigabe erforderlich.'})
        transferring=true
        try {
          // Validate owner before even loading local Garmin tokens.
          const ownerCheck=await fetch(projectUrl+'/functions/v1/garmin-sync-center',{
            method:'GET',headers:{
              Authorization:'Bearer '+ownerJwt[1],
              apikey:apiKey
            },signal:AbortSignal.timeout(20000),cache:'no-store'
          })
          if(!ownerCheck.ok)
            return send(res,403,{error:'Supabase-Besitzeranmeldung nicht bestätigt.'})

          const localRoot=join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'GARMIN_AI')
          const client=new GarminClient({
            tokenStore:new FileTokenStore(join(localRoot,'garmin-connect-tokens')),
            timeoutMs:12000,retries:0
          })
          if(!await client.loadTokens())
            return send(res,409,{error:'Lokale Garmin-Connect-Sitzung fehlt. Bitte lokal anmelden.'})
          const garmin=new Garmin(client)
          // Validates that the session is usable, and refreshes tokens locally if needed.
          await garmin.getUserProfile()
          const tokens=client.getTokens()
          if(!isGarminCloudSession(tokens))
            return send(res,422,{error:'Ungültige oder abgelaufene lokale Garmin-Sitzung.'})

          const upload=await fetch(projectUrl+'/functions/v1/garmin-connect-bootstrap',{
            method:'POST',
            headers:{
              Authorization:'Bearer '+ownerJwt[1],
              apikey:apiKey,
              'content-type':'application/json'
            },
            body:JSON.stringify({consent:true,expectedVersion:0,tokens}),
            signal:AbortSignal.timeout(30000),
            cache:'no-store'
          })
          if(upload.status===409)
            return send(res,409,{error:'Cloud-Sitzung ist bereits eingerichtet. Keine Überschreibung.'})
          if(!upload.ok)
            return send(res,502,{
              error:'Vault-Übertragung nicht bestätigt. Erst Status prüfen, nicht blind wiederholen.'
            })
          const result=await upload.json() as {saved?:boolean}
          if(result.saved!==true)
            return send(res,502,{error:'Vault-Speicherung konnte nicht bestätigt werden.'})
          return send(res,200,{
            saved:true,location:'Supabase Vault',cloudReadVerified:false,
            message:'Sitzung sicher gespeichert. Cloud-Live-Test steht noch aus.'
          })
        }catch {
          // Do not return raw exception strings: Garmin and Supabase SDK
          // errors can include authorization metadata or transport headers.
          return send(res,502,{
            error:'Lokaler Garmin-Test oder Vault-Übertragung fehlgeschlagen. Bitte Status prüfen.'
          })
        }finally {
          transferring=false
        }
      })
    }
  }
}
