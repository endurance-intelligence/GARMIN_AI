/** Compact, real data only. All signals are read from owner-authenticated Edge APIs. */
import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from './Icon'
import {interpretRecovery,formatSleep,differenceLabel,recoveryNarrative} from '../lib/recoveryComparison'
import {RecoverySparkline} from './RecoverySparkline'
import '../styles/coach-glance.css'

type CalendarWorkout={weekday:number;code:string;title:string;start_time:string;location_label:string}
type CoachPlan={training_date:string;title:string;state:string;session_type:string}
type HealthDay={metric_date:string;hrv_ms:number|null;resting_heart_rate:number|null;sleep_seconds:number|null;stress_avg?:number|null;body_battery_max?:number|null}
type WeeklyChoice={option_code:string;training_date:string;choice:string}
type Overview={
  workout:CalendarWorkout|null;option:CalendarWorkout|null;plan:CoachPlan|null;
  blocked:'sick'|'returning'|'vacation'|'unavailable'|null;
  availabilityOk:boolean;health:HealthDay|null;healthHistory:HealthDay[];
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
    get('garmin-weekly-options',token),get('garmin-training-plan',token),
    get('read-garmin-health',token),get('garmin-coach-context',token)
   ])
   if(!mounted)return
   const week=results[0].status==='fulfilled'?results[0].value:null
   const plans=results[1].status==='fulfilled'?results[1].value:null
   const health=results[2].status==='fulfilled'?results[2].value:null
   const life=results[3].status==='fulfilled'?results[3].value:null
   const rows=week?.options as CalendarWorkout[]|undefined
   const choices=week?.choices as WeeklyChoice[]|undefined
   const planRows=plans?.entries as CoachPlan[]|undefined
   const healthRows=health?.metrics as HealthDay[]|undefined
   const weekday=new Date(date+'T12:00:00Z').getUTCDay()||7
   const todayOptions=Array.isArray(rows)?rows.filter(w=>w.weekday===weekday):[]
   const attendance=(w:CalendarWorkout)=>choices?.find(c=>
    c.training_date===date&&c.option_code===w.code)?.choice||'open'
   const todayWorkout=todayOptions.find(w=>attendance(w)==='selected')||null
   const todayOption=todayOptions.find(w=>attendance(w)==='open')||null
   const context=life?.context as {illness_state?:string;
    blocked_periods?:Array<{start:string;end:string;reason:string}>}|undefined
   const dateBlock=context?.blocked_periods?.find(b=>b.start<=date&&b.end>=date)
   const blocked=context?.illness_state==='sick'?'sick':
    context?.illness_state==='returning'?'returning':
    dateBlock?.reason==='vacation'?'vacation':
    dateBlock?.reason==='unavailable'?'unavailable':null
   const todayPlan=Array.isArray(planRows)?
    planRows.find(p=>p.training_date===date&&!['cancelled','confirmed'].includes(p.state))||null:null
   const latestHealth=Array.isArray(healthRows)?
    [...healthRows].filter(h=>h.metric_date<=date).sort((a,b)=>b.metric_date.localeCompare(a.metric_date))[0]||null:null
   setView({workout:todayWorkout,option:todayOption,plan:todayPlan,
    blocked,availabilityOk:!!life,health:latestHealth,
    healthHistory:Array.isArray(healthRows)?healthRows:[],
    calendarOk:!!week&&!!plans,healthOk:!!health})
   setError(results.every(x=>x.status==='rejected'))
  }).catch(()=>{if(mounted)setError(true)})
    .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;abort.abort()}
 },[active,date])
 const blockedLabels:Record<string,string>={
  sick:'Trainingspause · krank / Beschwerden',returning:'Vorsichtiger Wiedereinstieg',
  vacation:'Urlaub · trainingsfrei',unavailable:'Heute keine Zeit für Training'
 }
 const title=view?.blocked?blockedLabels[view.blocked]:
  !view?.calendarOk?'Trainingskalender nicht vollständig erreichbar':
  view.plan?.title||view.workout?.title||
  (view.option?'Optional: '+view.option.title:'Heute noch offen')
 const category=view?.blocked?
  'Dein im Coach gemeldeter Status hat Vorrang. Keine Nachholeinheiten.':
  view?.plan?(view.plan.state==='draft'?'Entwurf im GARMIN_AI-Kalender · noch nicht freigegeben':'GARMIN_AI-Kalender · geplanter Termin'):
  view?.workout?'Zugesagt · '+view.workout.start_time.slice(0,5)+' Uhr · '+view.workout.location_label:
  view?.option?'Offene Wochenoption · noch nicht zugesagt':
  'Kein bestätigter Termin · dein nächster Vorschlag steht im 7-Tage-Plan'
 const health=view?.health
 const comparison=health?interpretRecovery(view?.healthHistory||[],health.metric_date):null
 const [sleep,hrv,rhr]=comparison?.metrics||[]
 return <div className="co-at-a-glance">
  <section className="co-today" aria-label="Training heute">
   <div className="co-section-head">
    <div><span className="co-eyebrow">HEUTE · TRAINING</span>
     <h2>{loading&&!view?'Lade deinen Tag …':title}</h2>
     <p>{category}</p>
     {view&&!view.availabilityOk&&<p className="co-data-note">
       Krankheits- und Urlaubsstatus konnte nicht geprüft werden. Keine Trainingsfreigabe.</p>}
    </div>
    <button type="button" className="co-link" onClick={onCalendar}>Kalender öffnen <Icon name="arrow-up-right"/></button>
   </div>
   {!loading&&view?.availabilityOk&&!view.blocked&&children}
  </section>
  <section className="co-recovery-glance" aria-label="Garmin Erholung mit grafischen Trends">
    <div className="co-recovery-heading">
      <div>
        <span className="co-eyebrow">DEIN MORGENCHECK</span>
        <h2>Schlaf & Erholung</h2>
      </div>
      <span className="co-data-day">{health?'Stand '+shortDay(health.metric_date):'Noch keine Daten'}</span>
    </div>
    <div className="co-recovery-insight">
      <span className="co-recovery-insight-icon"><Icon name="activity"/></span>
      <div>
        <strong>Dein Verlauf auf einen Blick</strong>
        <p>{recoveryNarrative(comparison)}</p>
      </div>
    </div>
    <div className="co-trend-grid" role="list" aria-label="Schlaf, HRV und Ruhepuls mit Verlauf der letzten sieben Tage">
      {([
        {key:'sleep_seconds',name:'Schlaf',value:formatSleep(sleep?.latest??null),row:sleep,icon:'moon',tone:'sleep'},
        {key:'hrv_ms',name:'HRV',value:valText(hrv?.latest,'ms'),row:hrv,icon:'activity',tone:'hrv'},
        {key:'resting_heart_rate',name:'Ruhepuls',value:valText(rhr?.latest,'bpm'),row:rhr,icon:'heart-pulse',tone:'pulse'}
      ] as const).map(entry=><div role="listitem" className={'co-trend-tile co-trend-'+entry.tone}
        key={entry.key}>
        <div className="co-trend-top">
          <div className="co-trend-label"><Icon name={entry.icon}/>{entry.name}</div>
          {entry.row&&entry.row.difference!==null&&
           <span className="co-trend-diff">{differenceLabel(entry.row)}</span>}
        </div>
        <strong className="co-trend-value">{entry.value}</strong>
        {health?
          <RecoverySparkline history={view?.healthHistory||[]}
            metric={entry.key} day={health.metric_date}
            median={entry.row?.median??null} label={entry.name}/>:
          <div className="co-trend-empty">Noch keine Messwerte</div>}
      </div>)}
    </div>
    <div className="co-recovery-context">
      <span><span className="co-mini-marker"/> Linie: 7 Tage · gestrichelt: jüngster Median</span>
      <span>Werte allein sind keine Trainingsfreigabe.</span>
    </div>
    {(!view?.healthOk||!health)&&<p className="co-data-note">Garmin-Gesundheitsdaten sind momentan nicht verfügbar.</p>}
    {error&&<p className="co-data-note" role="alert">Einige Datenquellen sind gerade nicht erreichbar.</p>}
    <details className="co-recovery-details">
      <summary>Was bedeuten diese Werte?</summary>
      <div className="co-recovery-explanation">
        <p><strong>Schlaf:</strong> Dauer, nicht Schlafqualität. <strong>HRV:</strong> individuelle Schwankung
        des Herzrhythmus. <strong>Ruhepuls:</strong> ebenfalls im persönlichen Verlauf betrachten.</p>
        <p>Die gestrichelte Linie zeigt den Median der 14 Tage vor der neuesten Messung –
        nur bei mindestens sieben gültigen Werten. Das ist keine langfristige gesunde Baseline.
        Krankheit, Trainingsbelastung und Befinden müssen für eine Empfehlung zusätzlich einfließen.</p>
        {comparison&&<p className="co-recovery-reference">
          Referenz {shortDay(comparison.referenceStart)}–{shortDay(comparison.referenceEnd)}
          · gültige Werte: Schlaf {sleep?.sampleCount||0}, HRV {hrv?.sampleCount||0},
          Ruhepuls {rhr?.sampleCount||0}.
        </p>}
      </div>
    </details>
  </section>
 </div>
}
