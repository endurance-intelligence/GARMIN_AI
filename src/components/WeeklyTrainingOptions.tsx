/**
 * The Coach's real, owner-private recurring week options.
 * Training suggestions are NOT reservations or workouts: only the athlete
 * can mark "Dabei", "Auslassen", or leave undecided.
 * Weather is calculated for the exact event hour and reference town.
 */
import {useEffect,useMemo,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {getWeather,hourAt,weatherLabel} from '../lib/weatherIntelligence'
import type {Forecast,WeatherPlace} from '../lib/weatherIntelligence'
import '../styles/weekly-training-options.css'
import {completedWeeklyOption} from '../lib/weeklyOptionCompletion'
import type {EvidenceActivity} from '../lib/weeklyOptionCompletion'

type TrainingOption={
 code:string;weekday:number;start_time:string;timezone:string;
 title:string;sport:'running'|'football';location_label:string;
 location_lat:number;location_lon:number;context_note:string;
 enabled:boolean;optional:boolean
}
type Choice='selected'|'skipped'|'open'
type SavedChoice={option_code:string;training_date:string;choice:Choice}
type OptionsResponse={options:TrainingOption[];choices:SavedChoice[]}
const endpoint=garminSupabaseUrl+'/functions/v1/garmin-weekly-options'
function addDay(iso:string,offset:number){
 return new Date(Date.parse(iso+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10)
}
export function berlinToday(){
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date())
 const val=(type:string)=>parts.find(x=>x.type===type)?.value||''
 return val('year')+'-'+val('month')+'-'+val('day')
}
export function mondayOf(iso:string){
 const day=new Date(iso+'T12:00:00Z').getUTCDay()
 return addDay(iso,-((day+6)%7))
}
function optionPlace(row:TrainingOption):WeatherPlace{
 return {name:row.location_label,latitude:row.location_lat,longitude:row.location_lon,country:'Deutschland'}
}
async function requestOptions(body?:Record<string,unknown>):Promise<Record<string,unknown>>{
 if(!garminSupabase)throw Error('Bitte zuerst anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte zuerst anmelden.')
 const result=await fetch(endpoint,{method:body?'POST':'GET',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,
   apikey:garminPublishableKey,...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 })
 const json=await result.json().catch(()=>({})) as Record<string,unknown>
 if(!result.ok)throw Error(typeof json.error==='string'?json.error:'Wochenplanung HTTP '+result.status)
 return json
}
const dayLabels=['','Mo','Di','Mi','Do','Fr','Sa','So']
const fullDate=(s:string)=>s.slice(8,10)+'.'+s.slice(5,7)+'.'
const metric=(n:number)=>Number.isFinite(n)?Math.round(n).toLocaleString('de-DE'):'–'
export function WeeklyTrainingOptions({active,weekStart,compact=false}:{
 active:boolean;weekStart:string;compact?:boolean
}){
 const [items,setItems]=useState<TrainingOption[]>([])
 const [choices,setChoices]=useState<SavedChoice[]>([])
 const [actual,setActual]=useState<EvidenceActivity[]>([])
 const [forecast,setForecast]=useState<Record<string,Forecast>>({})
 const [loading,setLoading]=useState(false)
 const [busy,setBusy]=useState<string|null>(null)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const today=berlinToday()
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setLoading(true);setError('')
  void requestOptions().then(result=>{
   if(!mounted)return
   const data=result as unknown as OptionsResponse
   setItems(data.options||[])
   setChoices(data.choices||[])
  }).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'Wochentermine nicht abrufbar')})
   .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active])
 useEffect(()=>{
  if(!active)return
  let mounted=true
  void (async()=>{
   if(!garminSupabase)return
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)return
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-week-board?start='+encodeURIComponent(weekStart),{
    cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}})
   if(!response.ok)return
   const result=await response.json() as {activities?:EvidenceActivity[]}
   if(mounted)setActual(Array.isArray(result.activities)?result.activities:[])
  })().catch(()=>{if(mounted)setActual([])})
  return ()=>{mounted=false}
 },[active,weekStart])
 useEffect(()=>{
  if(!active||!items.length)return
  let mounted=true
  const places=Array.from(new Map(items.map(item=>[
   item.location_lat+':'+item.location_lon,optionPlace(item)
  ])).entries())
  void Promise.all(places.map(async([key,place])=>{
   try{return [key,await getWeather(place)] as const}
   catch{return [key,null] as const}
  })).then(results=>{
   if(!mounted)return
   setForecast(Object.fromEntries(results.filter((x):x is readonly [string,Forecast]=>x[1]!==null)))
  })
  return ()=>{mounted=false}
 },[active,items])
 const rows=useMemo(()=>items.map(option=>{
  const date=addDay(weekStart,option.weekday-1)
  const choice=choices.find(x=>x.option_code===option.code&&x.training_date===date)?.choice||'open'
  const report=forecast[option.location_lat+':'+option.location_lon]
  const hour=report?hourAt(report,date,Number(option.start_time.slice(0,2))):null
  const completed=completedWeeklyOption(option,date,actual)!==null
  return {option,date,choice,hour,completed}
 }),[items,weekStart,choices,forecast,actual])
 async function setChoice(option:TrainingOption,date:string,choice:Choice){
  if(busy||date<today)return
  setBusy(option.code);setError('');setNotice('')
  try{
   const response=await requestOptions({action:'set_choice',code:option.code,date,choice})
   if(response.saved!==true)throw Error('Auswahl nicht gespeichert')
   setChoices(old=>{
    const other=old.filter(x=>x.option_code!==option.code||x.training_date!==date)
    return choice==='open'?other:[...other,{option_code:option.code,training_date:date,choice}]
   })
   setNotice(option.title+' · '+fullDate(date)+': '+(choice==='selected'?'Dabei':choice==='skipped'?'Auslassen':'Wieder offen')+
    '. Keine automatische Übertragung an Garmin.')
  }catch(e){setError(e instanceof Error?e.message:'Auswahl fehlgeschlagen')}
  finally{setBusy(null)}
 }
 if(!active)return null
 return <section className={'wo-root'+(compact?' wo-compact':'')} aria-label="Regelmäßige Trainingsoptionen">
  <header className="wo-head">
   <div><span className="wo-kicker">COACH / DEINE WOCHENOPTIONEN</span>
    <h3>{compact?'Diese Woche möglich':'Deine festen Trainingsangebote'}</h3>
    <p>Feste Uhrzeit und Ort, aber keine Pflichttermine. Du entscheidest jede Woche neu.</p></div>
   <span className="wo-pill">4 Optionen</span>
  </header>
  {loading&&!items.length&&<p className="wo-info">Trainingsmöglichkeiten werden geladen …</p>}
  <div className="wo-grid">
   {rows.filter(row=>row.date>=today).map(({option,date,choice,hour,completed})=>{
    const old=date<today
    const weather=hour?
     weatherLabel(hour.code)+' · '+metric(hour.temperature)+' °C · Regen '+metric(hour.rainProbability)+
      ' % · Böen '+metric(hour.gust)+' km/h':
     'Für '+fullDate(date)+' '+option.start_time.slice(0,5)+' Uhr noch keine Stundenprognose'
    const weatherRisk=!!hour&&(hour.code>=95||hour.gust>=55||hour.precipitation>=3)
    return <article className={'wo-entry'+(choice==='selected'?' wo-selected':choice==='skipped'?' wo-skipped':'')} key={option.code}>
     <div className="wo-entry-main">
      <div className="wo-day"><strong>{dayLabels[option.weekday]}</strong><small>{fullDate(date)}</small></div>
      <div className="wo-body">
       <strong>{option.title}</strong>
       <span>{option.start_time.slice(0,5)} Uhr · {option.location_label}</span>
       <small className={'wo-weather'+(weatherRisk?' wo-risk':'')}>
        {hour?'⛅ ':''}{weather}{weatherRisk?' · Wetterrisiko prüfen':''}
       </small>
      </div>
     </div>
     <div className="wo-action">
      <span className="wo-state">
       {completed?'✓ Absolviert (Garmin)':old?'Vergangen':choice==='selected'?'✓ Dabei':choice==='skipped'?'Ausgelassen':'Noch offen'}
      </span>
      {!old&&!completed&&<div className="wo-buttons" aria-label={option.title+' Teilnahme'}>
       <button type="button" aria-pressed={choice==='selected'} disabled={busy!==null}
        className={choice==='selected'?'picked':''} onClick={()=>void setChoice(option,date,'selected')}>Dabei</button>
       <button type="button" aria-pressed={choice==='skipped'} disabled={busy!==null}
        className={choice==='skipped'?'picked':''} onClick={()=>void setChoice(option,date,'skipped')}>Auslassen</button>
       {choice!=='open'&&<button type="button" disabled={busy!==null}
        onClick={()=>void setChoice(option,date,'open')}>Offen</button>}
      </div>}
     </div>
    </article>
   })}
  </div>
  {error&&<p className="wo-error" role="alert">{error}</p>}
  {notice&&<p className="wo-notice" role="status">{notice}</p>}
  {!loading&&items.length===0&&!error&&<p className="wo-info">Noch keine wiederkehrenden Trainingsangebote vorhanden.</p>}
  <p className="wo-foot">Wetter: Open-Meteo zur tatsächlichen Startzeit am Ort ·
   Daten nur innerhalb des Vorhersagezeitraums. Fußball, Bahnintervalle und Laufgruppe sind
   Belastungsoptionen – keine automatischen Trainingsvorgaben. Der Coach berücksichtigt
   deine Auswahl zusammen mit Erholung, aktueller Belastung und Wettkampfplanung.</p>
 </section>
}
