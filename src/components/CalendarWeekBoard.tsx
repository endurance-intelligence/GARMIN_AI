/** Seven-day calendar: what happened and what is scheduled.
 * Detailed recovery metrics belong on the Coach page, not in each date cell.
 */
import {useEffect,useMemo,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/calendar-week-board.css'
import {completedWeeklyOption} from '../lib/weeklyOptionCompletion'
import {FixedTrainingWeather} from './FixedTrainingWeather'
import type {CoachDay} from '../lib/coachSevenDay.mjs'
import {normalizeGarminRpe} from '../lib/garminPerception.mjs'

type Activity={activity_id:string;activity_name:string|null;start_time_local:string;
 sport_type:string;distance_m:number|null;duration_s:number|null;
 average_heart_rate:number|null;rpe_raw:number|null}
type Daily={metric_date:string;hrv_ms:number|null;resting_heart_rate:number|null;
 sleep_seconds:number|null;stress_avg:number|null;body_battery_max:number|null}
type Manual={id:string;session_date:string;kind:string;duration_minutes:number;rowing_distance_m:number|null;rpe:number|null}
type WeekResponse={start:string;endExclusive:string;activities:Activity[];health:Daily[];manual:Manual[]}
type Opportunity={code:string;weekday:number;start_time:string;title:string;location_label:string;location_lat:number;location_lon:number}
type Choice={option_code:string;training_date:string;choice:string}
export type BoardPlan={id:string;training_date:string;title:string;state:string;session_type:string}
type Props={active:boolean;start:string;selected:string;today:string;
 onSelect:(day:string)=>void;plans:BoardPlan[];coachDays?:CoachDay[];refreshKey?:number}
const plusDay=(date:string,n:number)=>
 new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)
function weekNumber(date:string){
 const d=new Date(date+'T12:00:00Z')
 d.setUTCHours(0,0,0,0)
 d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7))
 const first=new Date(Date.UTC(d.getUTCFullYear(),0,1))
 return 1+Math.floor(((d.getTime()-first.getTime())/86400000)/7)
}
const fmt=(n:number,decimals=0)=>n.toLocaleString('de-DE',{
 minimumFractionDigits:decimals,maximumFractionDigits:decimals})
const minutes=(s:number|null)=>typeof s==='number'&&Number.isFinite(s)&&s>0?Math.round(s/60):0
const sportKind=(s:string)=>/run|jog|trail|treadmill/.test(s.toLowerCase())?'run':
 /soccer|football/.test(s.toLowerCase())?'football':
 /strength|mobility|yoga|pilates/.test(s.toLowerCase())?'strength':
 /rowing/.test(s.toLowerCase())?'rowing':'other'
async function read(endpoint:string){
 if(!garminSupabase)throw Error('Garmin-Anmeldung fehlt.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte anmelden.')
 const response=await fetch(garminSupabaseUrl+'/functions/v1/'+endpoint,{
  cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}})
 if(!response.ok)throw Error('Kalenderdaten derzeit nicht erreichbar ('+response.status+')')
 return await response.json() as Record<string,unknown>
}
export function CalendarWeekBoard({active,start,selected,today,onSelect,plans,coachDays=[],refreshKey=0}:Props){
 const [data,setData]=useState<WeekResponse|null>(null)
 const [options,setOptions]=useState<Opportunity[]>([])
 const [choices,setChoices]=useState<Choice[]>([])
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(false)
 useEffect(()=>{
  if(!active)return
  let mounted=true
  setLoading(true);setError('');setData(null);setOptions([]);setChoices([])
  void Promise.allSettled([
   read('garmin-week-board?start='+encodeURIComponent(start)),
   read('garmin-weekly-options')
  ]).then(results=>{
   if(!mounted)return
   if(results[0].status==='fulfilled')setData(results[0].value as unknown as WeekResponse)
   else{setData(null);setError('Garmin-Aktivitäten und Tageswerte für diese Woche nicht erreichbar.')}
   if(results[1].status==='fulfilled'){
    const value=results[1].value
    setOptions(Array.isArray(value.options)?value.options as Opportunity[]:[])
    setChoices(Array.isArray(value.choices)?value.choices as Choice[]:[])
   }
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false}
 },[active,start,refreshKey])
 // Never show another week's activity totals during loading.
 const visibleData=data?.start===start?data:null
 const days=useMemo(()=>Array.from({length:7},(_,i)=>plusDay(start,i)),[start])
 const stats=useMemo(()=>{
  const activeRows=(visibleData?.activities||[]).filter(a=>minutes(a.duration_s)>0)
  const duration=activeRows.reduce((a,b)=>a+minutes(b.duration_s),0)
   +(visibleData?.manual||[]).reduce((a,b)=>a+(b.duration_minutes||0),0)
  const runningDistance=activeRows.filter(a=>sportKind(a.sport_type)==='run')
   .reduce((a,b)=>a+(Number(b.distance_m)||0),0)/1000
  return {duration,runningDistance,count:activeRows.length+(visibleData?.manual||[]).length}
 },[visibleData])
 const shortDay=(day:string)=>new Intl.DateTimeFormat('de-DE',{weekday:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))
 const dayLabel=(day:string)=>day.slice(8,10)+'.'+day.slice(5,7)+'.'
 const calendarDays=days.map((day,index)=>{
  const acts=(visibleData?.activities||[]).filter(x=>x.start_time_local?.slice(0,10)===day)
    .filter(x=>sportKind(x.sport_type)!=='rowing')
  const manual=(visibleData?.manual||[]).filter(x=>x.session_date===day&&x.kind!=='rowing')
  const local=plans.filter(p=>p.training_date===day&&p.state!=='cancelled')
  const candidate=coachDays.find(x=>x.date===day)
  // The recorded race takes precedence over the regular Saturday club slot.
  const slot=options.filter(x=>x.weekday===index+1&&day>=today&&
    candidate?.kind!=='race'&&!completedWeeklyOption(x,day,acts))
  // Even a conflicting local plan must never hide the real race goal.
  const coach=day>=today&&candidate&&
   (candidate.kind==='race'||(!local.length&&!acts.length&&!manual.length&&
    !['existing','completed','chosen','option'].includes(candidate.kind)&&
    !(candidate.decision==='declined'&&['easy','long','mobility','return_easy'].includes(candidate.kind))))?candidate:null
  return {day,index,acts,manual,local,slot,coach}
 })
 return <section className="hwb-root" aria-label="Wochenübersicht mit echten Garmin-Aktivitäten und Gesundheitsdaten">
  <div className="hwb-title">
   <div><span className="hwb-eyebrow">WOCHEN-RHYTHMUS / LIVE GARMIN</span>
    <h3>Deine Woche auf einen Blick.</h3></div>
   <span className="hwb-period">KW {weekNumber(start)} · {dayLabel(start)} – {dayLabel(days[6])}</span>
  </div>
  <div className="hwb-layout">
   <aside className="hwb-summary" aria-label="Wochenbilanz">
    <span className="hwb-eyebrow">KW {weekNumber(start)} / BILANZ</span>
    <strong>{loading?'Lade …':!visibleData?'–':fmt(Math.floor(stats.duration/60))+'h '+String(stats.duration%60).padStart(2,'0')+'m'}</strong>
    <p>Trainingszeit · tatsächliche Einheiten</p>
    <div className="hwb-summary-metrics">
     <div><span>Laufen</span><b>{visibleData?fmt(stats.runningDistance,1)+' km':'–'}</b></div>
     <div><span>Einheiten</span><b>{visibleData?stats.count:'–'}</b></div>
     <div><span>Datenlage</span><b>{visibleData?'Garmin':loading?'Lädt …':'Nicht verfügbar'}</b></div>
    </div>
    <small>Erfasste Aktivitäten inkl. Ergänzungstraining. Keine künstlichen Belastungs-/Fitness-Scores.</small>
   </aside>
   <div className="hwb-scroll" role="region" aria-label="Sieben Wochentage, horizontal scrollbar" tabIndex={0}>
    <div className="hwb-days">
     {calendarDays.map(({day,acts,manual,local,slot,coach})=>
      <section key={day} className={'hwb-day'+(day===selected?' is-selected':'')+(day===today?' is-today':'')}
       aria-label={shortDay(day)+' '+dayLabel(day)}>
       <button type="button" className="hwb-day-header"
        aria-pressed={day===selected} onClick={()=>onSelect(day)}>
        <span>{shortDay(day)} <b>{dayLabel(day)}</b></span>
        <span className="hwb-day-hint">{day===today?'Heute':day===selected?'Ausgewählt':''}</span>
       </button>
       <div className="hwb-day-cards">
        {acts.map(activity=>{
         const type=sportKind(activity.sport_type)
         const km=type==='run'&&Number(activity.distance_m)>0?
          fmt(Number(activity.distance_m)/1000,1)+' km':''
         const time=minutes(activity.duration_s)
         return <button type="button" className={'hwb-card is-actual type-'+type}
           onClick={()=>onSelect(day)} key={'a-'+activity.activity_id}>
           <span className="hwb-card-label">● GEMACHT / GARMIN</span>
           <strong>{activity.activity_name||activity.sport_type}</strong>
           <span>{[time?time+' Min.':'',km].filter(Boolean).join(' · ')}</span>
           {typeof activity.average_heart_rate==='number'&&
            <small>Ø HF {Math.round(activity.average_heart_rate)} bpm</small>}
           {normalizeGarminRpe(activity.rpe_raw)!==null&&<small>RPE {normalizeGarminRpe(activity.rpe_raw)}/10</small>}
          </button>
        })}
        {manual.map(m=><button type="button" className="hwb-card is-manual"
         onClick={()=>onSelect(day)} key={'m-'+m.id}>
          <span className="hwb-card-label">● ERFASST</span>
          <strong>{m.kind==='strength'?'Stabi & Mobility':'Mobility'}</strong>
          <span>{m.duration_minutes} Minuten</span>
         </button>)}
        {local.map(plan=><button type="button" className="hwb-card is-planned"
          key={'p-'+plan.id} onClick={()=>onSelect(day)}>
         <span className="hwb-card-label">◌ GARMIN_AI / {plan.state==='draft'?'ENTWURF':'GEPLANT'}</span>
         <strong>{plan.title}</strong>
         <small>Details und Freigabe am ausgewählten Tag</small>
        </button>)}
        {coach&&<button type="button" onClick={()=>onSelect(day)} key={'coach-'+day}
         className={'hwb-card is-coach'+(coach.kind==='race'?' is-race':coach.approvable?' is-coach-offer':' is-coach-info')}>
         <span className="hwb-card-label">{coach.kind==='race'?
          '🏁 RENNTAG / HAUPTZIEL':coach.approvable?
          '✦ COACH / VORSCHLAG':'✦ COACH / ANSAGE'}</span>
         <strong>{coach.title}</strong>
         {coach.minutes!==null&&<span>{coach.minutes} Minuten · noch nicht eingetragen</span>}
         <small>{coach.decision==='accepted'?'Von dir angenommen · noch kein Kalendereintrag':
          coach.decision==='declined'?'Von dir abgelehnt':
          'Deine Empfehlung kannst du im Coach prüfen.'}</small>
        </button>}
        {slot.map(option=>{
         const choice=choices.find(x=>x.training_date===day&&x.option_code===option.code)?.choice||'open'
         const discouraged=coach?.reason.startsWith('Coach-Entscheidung:')||false
         return <button type="button" key={'o-'+option.code}
           onClick={()=>onSelect(day)} className={'hwb-card is-option'+(choice==='skipped'?' is-muted':'')+
            (discouraged?' is-discouraged':'')}>
          <span className="hwb-card-label">◇ OPTION / {discouraged?'COACH RÄT AB':choice==='selected'?'DABEI':choice==='skipped'?'AUSLASSEN':'OFFEN'}</span>
          <strong>{option.title}</strong>
          {discouraged&&<small>Coach-Empfehlung oben hat Vorrang; keine automatische Trainingsfreigabe.</small>}
          <span>{option.start_time.slice(0,5)} Uhr · {option.location_label}</span>
          <FixedTrainingWeather active={active} compact date={day} time={option.start_time}
           location={option.location_label} latitude={option.location_lat} longitude={option.location_lon}/>
         </button>
        })}
        {!acts.length&&!manual.length&&!local.length&&!slot.length&&!coach&&
         <span className="hwb-empty">{loading?"Lade …":!visibleData?"Daten fehlen":"Noch nichts eingetragen"}</span>}
       </div>
      </section>
     )}
    </div>
   </div>
  </div>
  {error&&<p className="hwb-error" role="alert">{error}</p>}
  <p className="hwb-foot">Garmin = tatsächlich absolviert · GARMIN_AI = gespeicherter Plan ·
   Coach-Vorschlag = noch nicht übernommen · Option = freiwilliger Gruppentermin.
   Coach-Hinweise sind keine Kalendereinträge. Über die Tagesdetails erreichst du den Coach.</p>
 </section>
}
