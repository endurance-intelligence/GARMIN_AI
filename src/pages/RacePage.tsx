import {useEffect,useRef,useState} from 'react'
import {Icon} from '../components/Icon'
import {RaceEventDossier} from '../components/RaceEventDossier'
import {RaceForecastCompact} from '../components/RaceForecastCompact'
import {RaceRouteViewer} from '../components/RaceRouteViewer'
import {RaceStrategyCard} from '../components/RaceStrategyCard'
import type {Forecast} from '../lib/weatherIntelligence'
import type {Point} from '../lib/gpxRaceRoute.mjs'
import type {Page} from '../navigation'
import '../styles/race-prep-layout.css'

export function RacePage({active,onGo,focusWeatherToken=0}:{
 active:boolean;onGo:(page:Page)=>void;focusWeatherToken?:number
}){
 const lastWeatherFocus=useRef(0)
 useEffect(()=>{
  if(!active||focusWeatherToken===0||focusWeatherToken===lastWeatherFocus.current)return
  lastWeatherFocus.current=focusWeatherToken
  let frame=0
  const focus=()=>{
   const target=document.getElementById('race-detailed-forecast')
   if(target){target.scrollIntoView({behavior:'smooth',block:'start'})
    target.focus({preventScroll:true})}
  }
  frame=requestAnimationFrame(()=>requestAnimationFrame(focus))
  const settle=window.setTimeout(focus,650)
  return ()=>{cancelAnimationFrame(frame);window.clearTimeout(settle)}
 },[active,focusWeatherToken])
 const [raceForecast,setRaceForecast]=useState<Forecast|null>(null)
 const [eventCity,setEventCity]=useState<string|null>(null)
 const [course,setCourse]=useState<{courseType:string|null;finishCity:string|null}|null>(null)
 const [routePoints,setRoutePoints]=useState<Point[]|null>(null)
 return <section className={active?'page active race-prep-page':'page race-prep-page'}
  aria-label="Vorbereitung auf das kommende Event">
  <header className="page-intro race-prep-intro">
   <div><div className="eyebrow">GARMIN_AI / RACE PREP</div>
    <h1>Bereit für den Start.</h1>
    <p>Dein nächstes Event: Rennwetter, Strecke, Verpflegung, Trinkplan, Stopps und Ablauf.</p></div>
   <button type="button" className="race-prep-goals-link" onClick={()=>onGo('goals')}>
    <Icon name="target"/> Ziele verwalten <Icon name="arrow-up-right"/>
   </button>
  </header>
  <RaceStrategyCard active={active}/>
  <RaceEventDossier active={active}
   onEventCityChange={setEventCity} onCourseChange={setCourse}>
   <RaceForecastCompact active={active} eventCity={eventCity}
    course={course} routePoints={routePoints} refreshKey={0}
    onForecast={setRaceForecast}/>
   <RaceRouteViewer active={active} refreshKey={0}
    forecast={raceForecast} onTrack={setRoutePoints}/>
  </RaceEventDossier>
 </section>
}
