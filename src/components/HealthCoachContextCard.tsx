import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {healthPreferencesRequest} from '../lib/healthPreferencesApi'
import {healthCoachContext} from '../lib/healthCoachContext.mjs'
import type {HealthCoachContext} from '../lib/healthCoachContext.mjs'
export function HealthCoachContextCard({active,today,health,onHealth}:{active:boolean;today:string;health:unknown;onHealth:()=>void}){
 const [context,setContext]=useState<HealthCoachContext|null>(null),[revision,setRevision]=useState(0)
 useEffect(()=>{const changed=()=>{setContext(null);setRevision(n=>n+1)};window.addEventListener('garmin-ai-weight-saved',changed);window.addEventListener('garmin-ai-health-preferences-changed',changed);return()=>{window.removeEventListener('garmin-ai-weight-saved',changed);window.removeEventListener('garmin-ai-health-preferences-changed',changed)}},[])
 useEffect(()=>{setContext(null);if(!active||!Array.isArray(health)||!health.length)return;const c=new AbortController()
 void (async()=>{try{
  const prefs=await healthPreferencesRequest(undefined,c.signal)
  if(prefs.preferences?.adultConfirmed!==true||prefs.date!==today||c.signal.aborted)return
  const session=(await garminSupabase?.auth.getSession())?.data.session
  if(!session||c.signal.aborted)return
  const r=await fetch(garminSupabaseUrl+'/functions/v1/garmin-sync-center',{cache:'no-store',signal:c.signal,headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}})
  if(!r.ok)return
  const d=await r.json()
  if(!c.signal.aborted)setContext(healthCoachContext({today,weights:d.weightEntries,health,adultConfirmed:true}))
 }catch{/* Missing data do not create a warning. */}})()
 return()=>c.abort()
 },[active,today,health,revision])
 if(!active||!context)return null
 return <aside className="co-saved-note" aria-label="Gesundheitszusammenhang"><strong>{context.title}</strong><p>{context.text}</p><small>Zwei getrennte 14-Tage-Zeiträume · Gewichtsmedian {context.weightChange>0?'+':''}{context.weightChange.toLocaleString('de-DE')} kg · {context.weightCounts[0]} / {context.weightCounts[1]} Messungen. Keine automatische Planänderung.</small><p><button type="button" className="secondary" onClick={onHealth}>Gesundheitsverlauf ansehen</button></p></aside>
}
