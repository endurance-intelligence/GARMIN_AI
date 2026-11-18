import {useCallback,useEffect,useRef,useState} from 'react'
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
  // Keep already authorized pages mounted while the SAME user's token is refreshed.
  const authorizedUserId=useRef<string|null>(null)
  const lastVerifiedToken=useRef<string|null>(null)
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
    let inFlight:{userId:string;token:string}|null=null
    let receivedInitialSession=false
    const check=(session:Session|null)=>{
      const userId=session?.user?.id||null
      if(!session||!userId){
        // Sign-out invalidates an outstanding access check immediately.
        generation++
        inFlight=null
        authorizedUserId.current=null
        lastVerifiedToken.current=null
        setStatus('signed-out')
        return
      }
      // Both INITIAL_SESSION and getSession can deliver the same credentials.
      if(authorizedUserId.current===userId&&lastVerifiedToken.current===session.access_token)return
      if(inFlight?.userId===userId&&inFlight.token===session.access_token)return
      const current=++generation
      inFlight={userId,token:session.access_token}
      const sameApprovedUser=authorizedUserId.current===userId
      if(!sameApprovedUser){
        // First login or account switch: never reveal content before owner verification.
        authorizedUserId.current=null
        lastVerifiedToken.current=null
        setStatus('checking')
      }
      // TOKEN_REFRESHED / SIGNED_IN with the same owner is checked SILENTLY.
      // On success, React children remain mounted and all drafts survive.
      void verify(session).then(next=>{
        if(!mounted||generation!==current)return
        authorizedUserId.current=next==='authorized'?userId:null
        lastVerifiedToken.current=next==='authorized'?session.access_token:null
        setStatus(next)
      }).finally(()=>{
        if(inFlight?.userId===userId&&inFlight.token===session.access_token)inFlight=null
      })
    }
    const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{
      if(event==='INITIAL_SESSION')receivedInitialSession=true
      check(session)
    })
    void client.auth.getSession().then(({data})=>{
      // Don't let a delayed initial getSession undo a newer auth event.
      if(mounted&&!receivedInitialSession)check(data.session)
    }).catch(()=>{
      if(mounted&&!receivedInitialSession)setStatus('unavailable')
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
