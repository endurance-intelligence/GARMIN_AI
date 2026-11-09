import {useCallback,useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseReady,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {GarminAuthSettings} from './GarminAuthSettings'
import '../styles/online-access.css'

type Status='checking'|'signed-out'|'authorized'|'denied'|'unavailable'|'unconfigured'

/**
 * The static Pages bundle is publicly downloadable. Real data is NOT.
 * Require a signed-in, server-verified owner before mounting any feature.
 * Each private API still verifies the owner separately (UI gate is not RLS).
 */
export function OnlineAccessGate({children}:{children:ReactNode}){
  const [status,setStatus]=useState<Status>('checking')
  const [revision,setRevision]=useState(0)
  const verify=useCallback(async(session:Session|null):Promise<Status>=>{
    if(!session)return 'signed-out'
    if(!garminSupabaseReady)return 'unconfigured'
    try{
      const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-app-access',{
        method:'GET',cache:'no-store',
        headers:{
          'authorization':'Bearer '+session.access_token,
          apikey:garminPublishableKey
        },
        signal:AbortSignal.timeout(15000)
      })
      if(response.status===401)return 'signed-out'
      if(response.status===403)return 'denied'
      if(!response.ok)return 'unavailable'
      const body=await response.json() as {authorized?:boolean}
      return body.authorized===true?'authorized':'denied'
    }catch {
      return 'unavailable'
    }
  },[])

  useEffect(()=>{
    if(!import.meta.env.PROD)return
    if(!garminSupabase){return}
    const client=garminSupabase
    let mounted=true
    let generation=0
    const check=(session:Session|null)=>{
      const current=++generation
      setStatus('checking')
      void verify(session).then(next=>{
        if(mounted&&generation===current)setStatus(next)
      })
    }
    // INITIAL_SESSION may arrive while the getSession promise is outstanding.
    const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
      check(session)
    })
    void client.auth.getSession().then(({data})=>check(data.session)).catch(()=>{
      if(mounted)setStatus('unavailable')
    })
    return ()=>{
      mounted=false;generation++;subscription.unsubscribe()
    }
  },[verify,revision])

  if(!import.meta.env.PROD)return <>{children}</>
  if(!garminSupabaseReady)return <div className="online-gate" role="alert">
    <strong>GARMIN_AI ist noch nicht eingerichtet.</strong>
    <p>Die öffentliche Supabase-Verbindung fehlt in diesem Hosting-Build. Es werden keine privaten Daten angezeigt.</p>
  </div>
  if(status==='authorized')return <>{children}</>
  return <div className="online-gate-layout">
    <main className="online-gate" aria-label="Privater GARMIN_AI-Zugang">
      <span className="online-gate-eyebrow">GARMIN_AI · PRIVATE WORKSPACE</span>
      <h1>Deine Daten.<br/>Dein Training.</h1>
      {status==='checking'&&<p role="status">Deine Anmeldung wird sicher überprüft …</p>}
      {status==='signed-out'&&<>
        <p>Für den Zugriff auf deine Garmin-Daten melde dich mit deinem bestehenden Supabase-Konto an.</p>
        <GarminAuthSettings/>
      </>}
      {status==='denied'&&<>
        <p role="alert">Dieses Konto ist nicht für den privaten GARMIN_AI-Bereich freigegeben.</p>
        <GarminAuthSettings/>
      </>}
      {status==='unavailable'&&<>
        <p role="alert">Die Berechtigungsprüfung ist momentan nicht erreichbar. Aus Sicherheitsgründen werden keine Garmin-Daten angezeigt.</p>
        <button type="button" onClick={()=>setRevision(x=>x+1)}>Erneut prüfen</button>
      </>}
    </main>
  </div>
}
