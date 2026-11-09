/** Compact, real data only. All signals are read from owner-authenticated Edge APIs. */
import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from './Icon'
import {interpretRecovery,formatSleep,differenceLabel} from '../lib/recoveryComparison'
import '../styles/coach-glance.css'

type CalendarWorkout={date:string;name:string|null;restDay:boolean;sport:string|null}
type CoachPlan={training_date:string;title:string;state:string;session_type:string}
type HealthDay={metric_date:string;hrv_ms:number|null;resting_heart_rate:number|null;sleep_seconds:number|null;stress_avg?:number|null;body_battery_max?:number|null}
type Overview={
  workout:CalendarWorkout|null;plan:CoachPlan|null;health:HealthDay|null;healthHistory:HealthDay[];
  calendarOk:boolean;healthOk:boolean
}
function today(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const val=(kind:string)=>parts.find(part=>part.type===kind)?.value||''
 return val('year')+'-'+val('month')+'-'+val('day')
}
function valText(v:number|null|undefined,unit:string){
 return typeof v==='number'&&Number.isFinite(v)?Math.round(v)+' '+unit:'–'
}
function shortDay(iso:string){
 const [y,m,d]=iso.split('-')
 return d+'.'+m+'.'+y
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
    healthHistory:Array.isArray(healthRows)?healthRows:[],
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
 const comparison=health?interpretRecovery(view?.healthHistory||[],health.metric_date):null
 const [sleep,hrv,rhr]=comparison?.metrics||[]
 const recent=[...(view?.healthHistory||[])].filter(row=>row.metric_date<=date)
   .sort((a,b)=>b.metric_date.localeCompare(a.metric_date)).slice(0,7)
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
  <section className="co-recovery-glance" aria-label="Dein Garmin-Morgencheck">
    <div className="co-recovery-heading">
      <div>
        <span className="co-eyebrow">GARMIN · MORGENCHECK</span>
        <h2>Schlaf & Erholung</h2>
      </div>
      <span className="co-data-day">{health?'Stand '+shortDay(health.metric_date):'Keine Daten'}</span>
    </div>
    <p className="co-recovery-headline">
      {comparison?.headline||'Für eine Einordnung fehlen noch Garmin-Daten.'}
    </p>
    <div className="co-readings" role="list" aria-label="Messwerte und Veränderung gegenüber dem jüngsten Median">
      <div role="listitem" className="co-reading">
        <span>Schlaf</span>
        <strong>{formatSleep(sleep?.latest??null)}</strong>
        <small>{sleep?.difference!==null&&sleep?.difference!==undefined?
          differenceLabel(sleep):'Vergleich ausstehend'}</small>
      </div>
      <div role="listitem" className="co-reading">
        <span>HRV</span>
        <strong>{valText(hrv?.latest,'ms')}</strong>
        <small>{hrv?.difference!==null&&hrv?.difference!==undefined?
          differenceLabel(hrv):'Vergleich ausstehend'}</small>
      </div>
      <div role="listitem" className="co-reading">
        <span>Ruhepuls</span>
        <strong>{valText(rhr?.latest,'bpm')}</strong>
        <small>{rhr?.difference!==null&&rhr?.difference!==undefined?
          differenceLabel(rhr):'Vergleich ausstehend'}</small>
      </div>
    </div>
    <div className="co-interpretation-foot">
      Vergleich: Median der vorherigen 14 Kalendertage, soweit mindestens 7 Werte vorliegen.
      <span> Keine Trainingsfreigabe.</span>
    </div>
    {(!view?.healthOk||!health)&&<p className="co-data-note">Keine aktuellen Garmin-Gesundheitsdaten verfügbar.</p>}
    {error&&<p className="co-data-note" role="alert">Einige Datenquellen sind gerade nicht erreichbar.</p>}
    <details className="co-recovery-details">
      <summary>Messwerte verstehen & Verlauf ansehen</summary>
      <div className="co-recovery-explanation">
        <p><strong>Das sagen die Zahlen:</strong> Schlaf zeigt die Dauer, nicht die Qualität.
        HRV und Ruhepuls sind individuell und schwanken. Die Unterschiede oben
        beschreiben den jüngsten Verlauf, aber weder Belastbarkeit noch Krankheit.</p>
        <p>Der Vergleichszeitraum ist keine langfristig gesunde Baseline. Erkältung,
        Training und fehlende Messungen können ihn beeinflussen.</p>
        {comparison&&<p>Referenz: {shortDay(comparison.referenceStart)}–{shortDay(comparison.referenceEnd)}
         · Vergleichswerte: Schlaf {sleep?.sampleCount||0},
         HRV {hrv?.sampleCount||0}, Ruhepuls {rhr?.sampleCount||0} Tage.</p>}
      </div>
      {recent.length>0&&<div className="co-recovery-history">
        <h3>Letzte Messungen</h3>
        <table>
          <thead><tr><th>Datum</th><th>Schlaf</th><th>HRV</th><th>Ruhepuls</th></tr></thead>
          <tbody>{recent.map(row=><tr key={row.metric_date}>
            <td>{row.metric_date.slice(8,10)+'.'+row.metric_date.slice(5,7)+'.'}</td>
            <td>{formatSleep(row.sleep_seconds)}</td>
            <td>{valText(row.hrv_ms,'ms')}</td>
            <td>{valText(row.resting_heart_rate,'bpm')}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </details>
  </section>
 </div>
}
