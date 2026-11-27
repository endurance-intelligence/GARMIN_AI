/** Compact, real data only. All signals are read from owner-authenticated Edge APIs. */
import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from './Icon'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {interpretRecovery,formatSleep,differenceLabel,recoveryNarrative} from '../lib/recoveryComparison'
import {RecoverySparkline} from './RecoverySparkline'
import {coachTodayChoice} from '../lib/coachTodayChoice.mjs'
import {recoveryMetricMeaning} from '../lib/recoveryMeaning.mjs'
import {coachRecoveryAdvice} from '../lib/coachRecoveryAdvice.mjs'
import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import {CoachAvatar} from './CoachAvatar'
import {RecoverySleepDetails} from './RecoverySleepDetails'
import {RecoveryStatusMark} from './RecoveryStatusMark'
import {recoveryStatus,sleepScoreStatus} from '../lib/recoveryStatus.mjs'
import {completedDaySignal} from '../lib/recoverySleep.mjs'
import type {RecoveryDay} from '../lib/recoveryComparison'
import {recoveryWeekTrend} from '../lib/recoveryWeekTrend.mjs'
import '../styles/coach-glance.css'

type CalendarWorkout={weekday:number;code:string;title:string;start_time:string;location_label:string}
type CoachPlan={training_date:string;title:string;state:string;session_type:string}
type HealthDay=RecoveryDay
type WeeklyChoice={option_code:string;training_date:string;choice:string}
type Overview={
  workout:CalendarWorkout|null;option:CalendarWorkout|null;plan:CoachPlan|null;
  blocked:'sick'|'returning'|'vacation'|'unavailable'|null;
  availabilityOk:boolean;health:HealthDay|null;healthHistory:HealthDay[];
  calendarOk:boolean;healthOk:boolean;skipped:boolean;skippedTitle:string;doneLabel:string;completedCount:number
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
export function CoachGlance({active,onCalendar,children,sharedSnapshot,compactToday=false,recoveryOnly=false,dailyPlan=null}:{
 active:boolean;onCalendar:()=>void;children:ReactNode;sharedSnapshot?:CoachSnapshot|null;compactToday?:boolean;recoveryOnly?:boolean;dailyPlan?:SevenDayPlan|null
}){
 const [view,setView]=useState<Overview|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState(false)
 const [refresh,setRefresh]=useState(0)
 const date=today()
 useEffect(()=>{
  const changed=()=>setRefresh(n=>n+1)
  window.addEventListener('garmin-ai-weekly-choice-changed',changed)
  return ()=>window.removeEventListener('garmin-ai-weekly-choice-changed',changed)
 },[])
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
  const applySources=(week:Record<string,unknown>|null,plans:Record<string,unknown>|null,
   health:Record<string,unknown>|null,life:Record<string,unknown>|null,
   boards:Array<Record<string,unknown>>)=>{
    const rows=week?.options as CalendarWorkout[]|undefined
    const choices=week?.choices as WeeklyChoice[]|undefined
    const planRows=plans?.entries as CoachPlan[]|undefined
    const healthRows=health?.metrics as HealthDay[]|undefined
    const weekday=new Date(date+'T12:00:00Z').getUTCDay()||7
    const todayActivities=(boards||[]).flatMap(b=>Array.isArray(b?.activities)?b.activities:[])
    const todayManual=(boards||[]).flatMap(b=>Array.isArray(b?.manual)?b.manual:[])
    const todayChoice=coachTodayChoice(rows||[],choices||[],planRows||[],date,weekday,todayActivities,todayManual)
    const todayWorkout=todayChoice.workout as CalendarWorkout|null
    const todayOption=todayChoice.option as CalendarWorkout|null
    const context=life?.context as {illness_state?:string;
     blocked_periods?:Array<{start:string;end:string;reason:string}>}|undefined
    const dateBlock=context?.blocked_periods?.find(b=>b.start<=date&&b.end>=date)
    const blocked=context?.illness_state==='sick'?'sick':
     context?.illness_state==='returning'?'returning':
     dateBlock?.reason==='vacation'?'vacation':
     dateBlock?.reason==='unavailable'?'unavailable':null
    const todayPlan=todayChoice.plan as CoachPlan|null
    const latestHealth=Array.isArray(healthRows)?
     [...healthRows].filter(h=>h.metric_date<=date).sort((a,b)=>b.metric_date.localeCompare(a.metric_date))[0]||null:null
    setView({workout:todayWorkout,option:todayOption,plan:todayPlan,
     doneLabel:todayChoice.doneLabel,completedCount:todayChoice.completed.length,
     skipped:todayChoice.skipped,skippedTitle:todayChoice.skippedTitle,
     blocked,availabilityOk:!!life,health:latestHealth,
     healthHistory:Array.isArray(healthRows)?healthRows:[],
     calendarOk:!!week&&!!plans,healthOk:!!health})
  }
  if(sharedSnapshot){
   applySources(sharedSnapshot.options,sharedSnapshot.plans,sharedSnapshot.health,
    sharedSnapshot.life,sharedSnapshot.boards)
   setLoading(false)
   return ()=>{mounted=false;abort.abort()}
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
   applySources(week,plans,health,life,[])
   setError(results.every(x=>x.status==='rejected'))
  }).catch(()=>{if(mounted)setError(true)})
    .finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;abort.abort()}
 },[active,date,refresh,sharedSnapshot])
 const blockedLabels:Record<string,string>={
  sick:'Trainingspause · krank / Beschwerden',returning:'Vorsichtiger Wiedereinstieg',
  vacation:'Urlaub · trainingsfrei',unavailable:'Heute keine Zeit für Training'
 }
 const title=view?.completedCount?'Heute erledigt: '+view.doneLabel:
  view?.blocked?blockedLabels[view.blocked]:
  !view?.calendarOk?'Trainingskalender nicht vollständig erreichbar':
  view.plan?.title||view.workout?.title||
  (view.option?'Optional: '+view.option.title:view.skipped?'Heute trainingsfrei · bewusst ausgelassen':'Heute kein Training geplant')
 const category=view?.completedCount?
  (view.skipped?'Außerdem bewusst ausgelassen: '+view.skippedTitle+'.':'Bereits absolvierte Aktivitäten aus Garmin.')+
   (view.plan?' Zusätzlich befindet sich ein Entwurf im Kalender.':''):
  view?.blocked?
  'Dein im Coach gemeldeter Status hat Vorrang. Keine Nachholeinheiten.':
  view?.plan?(view.plan.state==='draft'?'Entwurf im GARMIN_AI-Kalender · noch nicht freigegeben':'GARMIN_AI-Kalender · geplanter Termin'):
  view?.workout?'Zugesagt · '+view.workout.start_time.slice(0,5)+' Uhr · '+view.workout.location_label:
  view?.option?'Offene Wochenoption · noch nicht zugesagt':
  view?.skipped?'Auslassen gespeichert'+(view.skippedTitle?' · '+view.skippedTitle:'')+'. Kein Nachholen vorgesehen.':
  'Kein geplanter oder zugesagter Trainingstermin.'
 const health=view?.health
 const comparison=health?interpretRecovery(view?.healthHistory||[],health.metric_date):null
 const weekTrend=health?recoveryWeekTrend(view?.healthHistory||[],health.metric_date):null
 const [sleep,hrv,rhr]=comparison?.metrics||[]
 const recoveryHistory:HealthDay[]=(Array.isArray(sharedSnapshot?.health.longRecoveryMetrics)?sharedSnapshot.health.longRecoveryMetrics:view?.healthHistory)||[]
 const energy=[{key:'stress_avg' as const,label:'Stress',tone:'stress',icon:'activity'},{key:'body_battery_max' as const,label:'Body Battery · Maximum',tone:'battery',icon:'battery-charging'}].map(x=>({...x,signal:completedDaySignal(recoveryHistory,date,x.key)}))
 const guidance=coachRecoveryAdvice({today:date,history:recoveryHistory,plan:dailyPlan,context:sharedSnapshot?.life?.context??(view?.blocked?{illness_state:view.blocked}:null),training:sharedSnapshot?.health?.training,completed:!!view?.completedCount})
 return <div className="co-at-a-glance">
  {!recoveryOnly&&<details className="co-today co-today-details" open={compactToday?undefined:true} aria-label="Training heute">
   <summary><span><Icon name="calendar-days"/> Tageskalender &amp; Wetter</span><Icon name="chevron-down"/></summary>
   <div className="co-section-head">
    <div><span className="co-eyebrow">HEUTE · TRAINING</span>
     {view&&<span className={'co-decision-chip '+(view.completedCount?'co-decision-active':view.skipped?'co-decision-skipped':view.plan||view.workout?'co-decision-active':view.option?'co-decision-optional':'co-decision-free')}>
      <span className="co-decision-dot" aria-hidden="true"/>
      {view.completedCount?'TRAINING ERLEDIGT':view.skipped?'BEWUSST AUSGELASSEN':view.plan?'PLAN IM KALENDER':view.workout?'TEILNAHME BESTÄTIGT':view.option?'FREIWILLIGER TERMIN':'KEIN TERMIN'}
     </span>}
     <h2>{loading&&!view?'Lade deinen Tag …':title}</h2>
     <p>{category}</p>
     {view&&!view.availabilityOk&&<p className="co-data-note">
       Krankheits- und Urlaubsstatus konnte nicht geprüft werden. Keine Trainingsfreigabe.</p>}
    </div>
    <button type="button" className="co-link" onClick={onCalendar}>Kalender öffnen <Icon name="arrow-up-right"/></button>
   </div>
   {!loading&&view?.availabilityOk&&!view.blocked&&!view.skipped&&!view.completedCount&&children}
  </details>}
  <section className="co-recovery-glance" aria-label="Garmin Erholung mit grafischen Trends">
    <div className="co-recovery-heading">
      <div>
        <span className="co-eyebrow">GARMIN · MORGENCHECK</span>
        <h2>Deine Erholung</h2>
      </div>
      <span className="co-data-day">{health?'Stand '+shortDay(health.metric_date):'Noch keine Daten'}</span>
    </div>
    <div className="co-recovery-insight">
      <CoachAvatar mood={guidance.level==='pause'?'firm':guidance.level==='caution'?'focused':guidance.level==='balanced'?'friendly':'supportive'}/>
      <div className="co-recovery-coach-copy">
        <span className="co-eyebrow">DEIN COACH · MEINE EINSCHÄTZUNG</span>
        <div className={'co-recovery-reading co-recovery-guidance '+guidance.level}>
          <strong>{guidance.title}</strong>
          <p className="co-recovery-lead">{guidance.advice}</p>
          <div className="co-recovery-next"><span className="co-eyebrow">MEIN TIPP FÜR DICH</span><p>{guidance.tip}</p></div>
          <small className="co-recovery-plan">{guidance.planText}</small>
          <details className="co-recovery-why"><summary>Was deine Werte sagen – warum ich das empfehle</summary><p>{recoveryNarrative(comparison)}</p>{guidance.evidence&&<p>{guidance.evidence}</p>}</details>
        </div>
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
        <RecoveryStatusMark status={recoveryStatus(entry.key,entry.row?.latest,entry.row?.median,{fresh:health?.metric_date===date})}/>
        {health?
          <RecoverySparkline history={view?.healthHistory||[]}
            metric={entry.key} day={health.metric_date}
            median={entry.row?.median??null} label={entry.name}/>:
          <div className="co-trend-empty">Noch keine Messwerte</div>}
        <p className="co-trend-meaning">{recoveryMetricMeaning(entry.row)}</p>
      </div>)}
    </div>
    <div className="co-recovery-secondary">
      <RecoverySleepDetails value={recoveryHistory.find(r=>r.metric_date===date)?.sleepDetail} status={sleepScoreStatus(recoveryHistory,date)}/>
      <section className="co-energy-detail" aria-label="Stress und Body Battery am letzten abgeschlossenen Tag">
        <header><span className="co-eyebrow">BELASTUNG AUSSERHALB DES TRAININGS</span><h3>Deine Energiereserven</h3><small>Gestern · abgeschlossener Tag, kein Live-Wert</small></header>
        <div className="co-energy-grid">{energy.map(entry=><div className={'co-trend-tile co-trend-'+entry.tone} key={entry.key}>
          <div className="co-trend-top"><div className="co-trend-label"><Icon name={entry.icon}/>{entry.label}</div>{entry.signal?.delta!=null&&<span className="co-trend-diff">{entry.signal.delta>0?'+':''}{Math.round(entry.signal.delta)}</span>}</div>
          <strong className="co-trend-value">{valText(entry.signal?.value,'/ 100')}</strong>
          <RecoveryStatusMark status={recoveryStatus(entry.key,entry.signal?.value,entry.signal?.base)}/>
          {entry.signal&&<RecoverySparkline history={recoveryHistory} metric={entry.key} day={entry.signal.date} median={entry.signal.base} label={entry.label}/>}
          <p className="co-trend-meaning">{entry.signal?.value==null?'Kein Messwert für gestern.':entry.signal.base===null?'Noch kein persönlicher Vergleich.':entry.key==='stress_avg'?(entry.signal.delta!>=10?'Gestern mehr Stress als üblich.':'Gestern keine deutliche Stresszunahme.'):(entry.signal.delta!<=-15?'Gestern geringeres Maximum als üblich.':'Gestern kein deutlich vermindertes Maximum.')}</p>
        </div>)}</div>
      </section>
    </div>
    <div className="co-recovery-context">
      <span><span className="co-mini-marker"/> Linie: letzte 7 Tage · gestrichelt: dein üblicher Wert</span>
      <span>Smileys: persönlicher Vergleich, kein allgemeiner Gesundheitswert. Werte allein sind keine Trainingsfreigabe.</span>
    </div>
    {(!view?.healthOk||!health)&&<p className="co-data-note">Garmin-Gesundheitsdaten sind momentan nicht verfügbar.</p>}
    {error&&<p className="co-data-note" role="alert">Einige Datenquellen sind gerade nicht erreichbar.</p>}
    <details className="co-recovery-details">
      <summary>Mehr wissen? Die Werte einfach erklärt</summary>
      <div className="co-recovery-explanation">
        <p><strong>Schlaf:</strong> Dauer und geschätzte Qualität der Nacht. Schlafphasen, Score und Wachzeit ergänzen die Dauer, sind aber keine eigenständige Trainingsfreigabe.
        <strong> HRV:</strong> Die Zeit zwischen deinen Herzschlägen schwankt leicht. Diese Schwankung
        kann Hinweise auf Belastung geben, ist aber kein Urteil über deine Fitness.
        <strong> Ruhepuls:</strong> Wie schnell dein Herz in Ruhe schlägt. Am besten mit deinen eigenen
        Werten vergleichen.</p>
        {weekTrend&&<p><strong>Diese Woche im Vergleich zur Vorwoche:</strong> {weekTrend.summary}</p>}
        <p>{guidance.bodyCheck} Tagesstress und maximale Body Battery werden nur aus abgeschlossenen Tagen verglichen. Fehlende Werte und heutige unvollständige Tageswerte sind keine Entwarnung.</p>
        <p><strong>So entsteht der Vergleich:</strong> Wir schauen auf deine Messungen aus den
        14 Tagen vor dem neuesten Wert. Der gestrichelte Strich zeigt den Wert in der Mitte
        dieser Messungen (Fachbegriff: Median). Dafür brauchen wir mindestens sieben Tage.
        Ein einzelner Wert kann deine Erholung nicht sicher beurteilen.</p>
        {comparison&&<p className="co-recovery-reference">
          Vergleichszeitraum: {shortDay(comparison.referenceStart)}–{shortDay(comparison.referenceEnd)}
          · Messungen: Schlaf {sleep?.sampleCount||0}, HRV {hrv?.sampleCount||0},
          Ruhepuls {rhr?.sampleCount||0}.
        </p>}
      </div>
    </details>
  </section>
 </div>
}
