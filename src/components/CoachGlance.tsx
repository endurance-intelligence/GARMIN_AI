/** Compact, real data only. All signals are read from owner-authenticated Edge APIs. */
import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from './Icon'
import '../styles/coach-glance.css'

type CalendarWorkout={date:string;name:string|null;restDay:boolean;sport:string|null}
type CoachPlan={training_date:string;title:string;state:string;session_type:string}
type HealthDay={metric_date:string;hrv_ms:number|null;resting_heart_rate:number|null;sleep_seconds:number|null}
type Overview={
  workout:CalendarWorkout|null;plan:CoachPlan|null;health:HealthDay|null;
  calendarOk:boolean;healthOk:boolean
}
function today(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const val=(kind:string)=>parts.find(part=>part.type===kind)?.value||''
 return val('year')+'-'+val('month')+'-'+val('day')
}
function sleepText(value:number|null){
 if(value===null||!Number.isFinite(value))return '–'
 const minutes=Math.round(value/60)
 return Math.floor(minutes/60)+' h '+String(minutes%60).padStart(2,'0')+' m'
}
function valText(v:number|null,unit:string){
 return typeof v==='number'&&Number.isFinite(v)?Math.round(v)+' '+unit:'–'
}
export function CoachGlance({active,onCalendar,children}:{
 active:boolean;onCalendar:()=>void;children:ReactNode
}){
 const [view,setView]=useState<Overview|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState(false)
 const date=today()
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  const abort=new AbortController()
  setLoading(true);setError(false)
  async function get(url:string,token:string){
   const result=await fetch(garminSupabaseUrl+'/functions/v1/'+url,{
    cache:'no-store',signal:abort.signal,
    headers:{authorization:'Bearer '+token,apikey:garminPublishableKey}
   })
   if(!result.ok)throw Error('Private API unavailable')
   return await result.json() as Record<string,unknown>
  }
  void garminSupabase.auth.getSession().then(async({data})=>{
   const token=data.session?.access_token
   if(!token)throw Error('Session required')
   const results=await Promise.allSettled([
    get('garmin-connect-snapshot',token),get('garmin-training-plan',token),
    get('read-garmin-health',token)
   ])
   if(!mounted)return
   const snapshot=results[0].status==='fulfilled'?results[0].value:null
   const plans=results[1].status==='fulfilled'?results[1].value:null
   const health=results[2].status==='fulfilled'?results[2].value:null
   const rows=(snapshot?.snapshot as {schedule?:CalendarWorkout[]}|null)?.schedule
   const planRows=plans?.entries as CoachPlan[]|undefined
   const healthRows=health?.metrics as HealthDay[]|undefined
   const todayWorkout=Array.isArray(rows)?rows.find(w=>w.date===date)||null:null
   const todayPlan=Array.isArray(planRows)?
    planRows.find(p=>p.training_date===date&&!['cancelled','confirmed'].includes(p.state))||null:null
   const latestHealth=Array.isArray(healthRows)?
    [...healthRows].filter(h=>h.metric_date<=date).sort((a,b)=>b.metric_date.localeCompare(a.metric_date))[0]||null:null
   setView({workout:todayWorkout,plan:todayPlan,health:latestHealth,
    calendarOk:!!snapshot||!!plans,healthOk:!!health})
   setError(results.every(x=>x.status==='rejected'))
  }).catch(()=>{if(mounted)setError(true)})
    .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;abort.abort()}
 },[active,date])
 const event=view?.workout||view?.plan
 const title=view?.workout?.name||(view?.workout?.restDay?'Ruhetag':null)||view?.plan?.title||
  'Noch keine Einheit im Kalender'
 const category=view?.workout?'Garmin Connect':view?.plan?'GARMIN_AI-Entwurf':'Keine feste Startzeit'
 const health=view?.health
 return <div className="co-at-a-glance">
  <section className="co-today" aria-label="Training heute">
   <div className="co-section-head">
    <div><span className="co-eyebrow">HEUTE · TRAINING</span>
     <h2>{loading&&!view?'Lade deinen Tag …':title}</h2>
     <p>{event?category+(view?.plan?' · nicht in Garmin':' · keine Uhrzeit bekannt'):
       'Dein Kalender enthält für heute keine bestätigte Einheit.'}</p>
    </div>
    <button type="button" className="co-link" onClick={onCalendar}>Kalender <Icon name="arrow-up-right"/></button>
   </div>
   {children}
  </section>
  <section className="co-recovery-glance" aria-label="Garmin-Erholung auf einen Blick">
   <div className="co-section-head">
    <div><span className="co-eyebrow">ERHOLUNG · GARMIN HEALTH</span><h2>Deine Signale</h2></div>
    {health&&<span className="co-data-day">{health.metric_date.split('-').reverse().join('.')}</span>}
   </div>
   <div className="co-metrics">
    <div><span>Schlaf</span><strong>{sleepText(health?.sleep_seconds??null)}</strong></div>
    <div><span>HRV</span><strong>{valText(health?.hrv_ms??null,'ms')}</strong></div>
    <div><span>Ruhepuls</span><strong>{valText(health?.resting_heart_rate??null,'bpm')}</strong></div>
   </div>
   {(!view?.healthOk||!health)&&<p className="co-data-note">Keine aktuellen Garmin-Gesundheitsdaten verfügbar.</p>}
   {error&&<p className="co-data-note" role="alert">Einige Datenquellen sind gerade nicht erreichbar.</p>}
  </section>
 </div>
}
