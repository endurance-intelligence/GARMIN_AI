import {useCallback,useEffect,useState} from 'react'
import {garminPublishableKey,garminSupabase,garminSupabaseUrl} from './garminSupabase'
import type {HrProfileResult} from './garminHrProfile'

async function requestProfile(method:'GET'|'POST',force=false):Promise<HrProfileResult> {
  if (!garminSupabase) throw new Error('Supabase nicht konfiguriert')
  const {data:{session}}=await garminSupabase.auth.getSession()
  if (!session) throw new Error('Bitte zuerst unter Einstellungen anmelden.')
  const response=await fetch(`${garminSupabaseUrl}/functions/v1/sync-garmin-hr-profile${force?'?force=1':''}`,{
    method,cache:'no-store',headers:{authorization:`Bearer ${session.access_token}`,apikey:garminPublishableKey},
  })
  if (!response.ok) throw new Error(`Profilzugriff fehlgeschlagen (HTTP ${response.status})`)
  return await response.json() as HrProfileResult
}

export function useGarminHrProfile(active:boolean) {
  const [data,setData]=useState<HrProfileResult|null>(null)
  const [loading,setLoading]=useState(false)
  const [syncing,setSyncing]=useState(false)
  const [error,setError]=useState('')
  const read=useCallback(async()=>{ const next=await requestProfile('GET');setData(next);return next },[])
  const sync=useCallback(async(force=false)=>{
    setSyncing(true);setError('')
    try {
      const next=await requestProfile('POST',force)
      setData(next)
      if(next.error&&!next.lastError) setError(next.error)
      return next
    }catch(e){setError(e instanceof Error?e.message:'Garmin-Profil derzeit nicht verfügbar');return null}
    finally{setSyncing(false)}
  },[])
  useEffect(()=>{
    if(!active || !garminSupabase) return
    let mounted=true
    setLoading(true)
    void (async()=>{
      try{
        const result=await requestProfile('GET')
        if(!mounted)return
        setData(result)
        // On open, fetch new Garmin values if the previous check is old. Server enforces a 6-hour interval.
        if(!result.lastAttemptAt || Date.now()-Date.parse(result.lastAttemptAt)>6*3600_000) {
          const fresh=await requestProfile('POST')
          if(mounted)setData(fresh)
        }
      }catch(e){if(mounted)setError(e instanceof Error?e.message:'HF-Profil derzeit nicht verfügbar')}
      finally{if(mounted)setLoading(false)}
    })()
    return()=>{mounted=false}
  },[active])
  return {data,loading,syncing,error,sync,read}
}
