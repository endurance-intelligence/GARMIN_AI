import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/race-event-research.css'
import '../styles/race-event-dossier.css'

type EventSummary={
 event_title:string;race_date:string;
 details?:{city?:string|null;courseType?:string|null;finishCity?:string|null;startLatitude?:number|null;startLongitude?:number|null;venue?:string|null;venueAddress?:string|null}
}
type Goal={raceDate:string;raceName:string;raceLocation:string}
export function RaceEventDossier({active,refreshKey=0,onEventCityChange,onCourseChange,children}:{
 active:boolean;refreshKey?:number;
 onEventCityChange?:(city:string|null)=>void;
 onCourseChange?:(course:{courseType:string|null;finishCity:string|null;startLatitude?:number|null;startLongitude?:number|null;startName?:string|null}|null)=>void;
 children:ReactNode
}){
 const [saved,setSaved]=useState<EventSummary|null>(null)
 const [goal,setGoal]=useState<Goal|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let live=true
  const controller=new AbortController()
  setError('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-race-research',{
    method:'GET',cache:'no-store',signal:controller.signal,
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   })
   const data=await response.json().catch(()=>({})) as {
    goal?:Goal;saved?:EventSummary[];error?:string
   }
   if(!response.ok)throw Error(data.error||'Eventdaten derzeit nicht erreichbar.')
   if(!live)return
   const current=(data.saved||[]).find(x=>x.race_date===data.goal?.raceDate)||null
   setSaved(current);setGoal(data.goal||null)
   onEventCityChange?.(typeof current?.details?.city==='string'?current.details.city:null)
   onCourseChange?.(current?{
    courseType:current.details?.courseType||null,
    finishCity:current.details?.finishCity||null,
    startLatitude:current.details?.startLatitude??null,startLongitude:current.details?.startLongitude??null,
    startName:current.details?.venueAddress||current.details?.venue||null
   }:null)
  })().catch(e=>{if(live&&e?.name!=='AbortError')
   setError(e instanceof Error?e.message:'Eventdaten derzeit nicht erreichbar.')})
  return ()=>{live=false;controller.abort()}
 },[active,refreshKey])
 if(!active)return null
 const title=saved?.event_title||goal?.raceName||'Dein nächstes Rennen'
 const date=saved?.race_date||goal?.raceDate
 return <section className="red-root" aria-label="Rennwetter und Strecke des kommenden Events">
  <header className="red-header">
   <span className="red-kicker">RACE PREP / DEIN EVENT</span>
   <h2>{title}{date?' · '+date.split('-').reverse().join('.'):''}</h2>
   <p>Rennwetter, Streckenverlauf und Höhenprofil für die kommende Veranstaltung.
    Eventdaten und Archiv verwaltest du unter <strong>Goals</strong>.</p>
  </header>
  {error&&<p className="red-note" role="status">
   {error} Die Wetter- und Streckenbereiche laden die verfügbaren Daten separat.
  </p>}
  {children}
 </section>
}
