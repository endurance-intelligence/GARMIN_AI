import {useEffect,useMemo,useState} from 'react'
import type {Session} from '@supabase/supabase-js'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {Icon} from '../components/Icon'
import {WeatherPanel} from '../components/WeatherPanel'
import '../styles/horizon-calendar.css'

type GarminWorkout={
 date:string;id:string|null;workoutId:string|null;name:string|null;
 sport:string|null;restDay:boolean
}
type GarminSnapshot={schedule:GarminWorkout[];checked_at:string;synced_at:string}
type Plan={
 id:string;training_date:string;title:string;state:string;session_type:string;
 sport:string;garmin_workout_id:number|null;notes:string
}
type CalendarEntry={key:string;date:string;title:string;sub:string;source:'garmin'|'plan';status:string}
const LOCAL_TZ='Europe/Berlin'
function todayBerlin(){
 const parts=new Intl.DateTimeFormat('de-DE',{
  timeZone:LOCAL_TZ,year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date())
 const value=(key:string)=>parts.find(part=>part.type===key)?.value||''
 return [value('year'),value('month'),value('day')].join('-')
}
function moveDay(iso:string,delta:number){
 return new Date(Date.parse(iso+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10)
}
function monday(iso:string){
 const d=new Date(iso+'T12:00:00Z').getUTCDay()
 return moveDay(iso,-((d+6)%7))
}
function shortDay(iso:string){
 return new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'short'}).format(
  new Date(iso+'T12:00:00Z')).replace('.','')
}
function dayNumber(iso:string){return iso.slice(8,10).replace(/^0/,'')}
function monthTitle(iso:string){
 return new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',month:'long',year:'numeric'}).format(
  new Date(iso+'T12:00:00Z'))
}
function longDate(iso:string){
 return new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(
  new Date(iso+'T12:00:00Z'))
}
function readState(state:string){
 switch(state){
  case 'confirmed':return {text:'Mit Garmin bestätigt',type:'verified'}
  case 'pending':return {text:'Freigegeben · Garmin ausstehend',type:'waiting'}
  case 'sending':return {text:'Übertragung läuft',type:'waiting'}
  case 'needs_review':return {text:'Prüfung erforderlich',type:'warning'}
  case 'cancelled':return {text:'Abgesagt',type:'muted'}
  default:return {text:'Entwurf · nicht übertragen',type:'draft'}
 }
}
async function ownerGet<T>(session:Session,endpoint:string):Promise<T>{
 const res=await fetch(garminSupabaseUrl+'/functions/v1/'+endpoint,{
  cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
 })
 if(!res.ok)throw Error('HTTP '+res.status)
 return await res.json() as T
}

export function CalendarPage({active}:{active:boolean}){
 const today=useMemo(todayBerlin,[])
 const [selected,setSelected]=useState(today)
 const [week,setWeek]=useState(0)
 const [snapshot,setSnapshot]=useState<GarminSnapshot|null>(null)
 const [plans,setPlans]=useState<Plan[]>([])
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [refresh,setRefresh]=useState(0)
 const start=moveDay(monday(today),week*7)
 const days=Array.from({length:7},(_,i)=>moveDay(start,i))
 const entries=useMemo<CalendarEntry[]>(()=>{
  const garmin=(snapshot?.schedule||[])
   .filter(w=>w.date&&/^\d{4}-\d{2}-\d{2}$/.test(w.date))
   .map((w,i)=>({
    key:'g-'+w.date+'-'+(w.id||w.workoutId||String(i)),
    date:w.date,title:w.name||(w.restDay?'Ruhetag':'Garmin-Training'),
    sub:w.restDay?'Ruhetag':(w.sport||'Training'),
    source:'garmin' as const,status:'garmin'
   }))
  const local=plans.filter(p=>p.state!=='cancelled').map(p=>({
   key:'p-'+p.id,date:p.training_date,title:p.title,
   sub:p.session_type==='workout'?'Garmin-Workout-Vorlage':'GARMIN_AI-Planung',
   source:'plan' as const,status:p.state
  }))
  return [...garmin,...local]
 },[snapshot,plans])
 const matching=entries.filter(e=>e.date===selected)
 const countInWeek=entries.filter(e=>e.date>=start&&e.date<=days[6]).length

 useEffect(()=>{
  if(!active||!garminSupabase)return
  const client=garminSupabase
  let mounted=true
  async function load(){
   setBusy(true);setError('');setNotice('')
   try{
    const {data:{session}}=await client.auth.getSession()
    if(!session)throw Error('Bitte zuerst anmelden')
    const outcomes=await Promise.allSettled([
     ownerGet<{snapshot:GarminSnapshot|null}>(session,'garmin-connect-snapshot'),
     ownerGet<{entries:Plan[]}>(session,'garmin-training-plan')
    ])
    if(!mounted)return
    if(outcomes[0].status==='fulfilled')setSnapshot(outcomes[0].value.snapshot)
    if(outcomes[1].status==='fulfilled')setPlans(outcomes[1].value.entries||[])
    if(outcomes.some(outcome=>outcome.status==='rejected')){
     setError('Ein Teil der Kalenderdaten ist gerade nicht erreichbar.')
    }
   }catch{
    if(mounted)setError('Kalender nicht abrufbar. Prüfe die Anmeldung unter Mehr → Einstellungen.')
   }finally{if(mounted)setBusy(false)}
  }
  void load()
  return ()=>{mounted=false}
 },[active,refresh])

 function changeWeek(delta:number){
  const next=Math.max(-1,Math.min(5,week+delta))
  setWeek(next)
  setSelected(moveDay(monday(today),next*7))
  setNotice('')
 }
 const isOld=snapshot?.checked_at?
  Date.now()-Date.parse(snapshot.checked_at)>36*3600000:true

 return <section className={active?'page active':'page'} aria-label="Trainingskalender">
  <div className="hc-intro">
   <div className="hc-eyebrow"><span className="hc-pulse"/> TRAININGSPLAN / HORIZON</div>
   <h1>Deine Woche.<br/><span>Dein Rhythmus.</span></h1>
   <p>Was Garmin bereits kennt und was GARMIN_AI für dich plant – sauber getrennt, ohne doppelte Kalender.</p>
  </div>
  <div className="hc-overview">
   <div><small>WOCHE</small><strong>{monthTitle(start)}</strong><span>{countInWeek} Einträge in dieser Woche</span></div>
   <button type="button" className="hc-refresh" onClick={()=>setRefresh(v=>v+1)} disabled={busy}>
    <Icon name="refresh-cw"/>{busy?'Prüfe …':'Aktualisieren'}
   </button>
  </div>
  <WeatherPanel active={active} mode="training" date={selected}/>
  <div className="hc-weekpanel">
   <div className="hc-toolbar">
    <div><small>DEIN TRAININGSKALENDER</small><h2>Wochenansicht</h2></div>
    <div className="hc-weekactions">
     <button type="button" aria-label="Vorherige Woche" onClick={()=>changeWeek(-1)} disabled={week<=-1}>‹</button>
     <button type="button" aria-label="Zur aktuellen Woche" onClick={()=>{setWeek(0);setSelected(today)}}>Heute</button>
     <button type="button" aria-label="Nächste Woche" onClick={()=>changeWeek(1)} disabled={week>=5}>›</button>
    </div>
   </div>
   <div className="hc-days" role="group" aria-label="Wochentag auswählen">
    {days.map(day=>{
     const count=entries.filter(e=>e.date===day).length
     return <button type="button" key={day}
      className={'hc-day'+(day===selected?' selected':'')+(day===today?' today':'')}
      aria-pressed={day===selected} aria-label={longDate(day)}
      onClick={()=>setSelected(day)}>
      <span>{shortDay(day)}</span><strong>{dayNumber(day)}</strong>
      <i className={count?'has-entry':''}/>
     </button>
    })}
   </div>
   <div className="hc-day-content">
    <div className="hc-day-heading">
     <div><span>AUSGEWÄHLTER TAG</span><h3>{longDate(selected)}</h3></div>
     <span className="hc-day-count">{matching.length} {matching.length===1?'Eintrag':'Einträge'}</span>
    </div>
    {matching.length?
     <div className="hc-entries">
      {matching.map(entry=>{
       const state=entry.source==='garmin'?
        {text:'Aus Garmin übernommen',type:'verified'}:readState(entry.status)
       return <article className={'hc-entry hc-entry-'+state.type} key={entry.key}>
        <div className="hc-entry-symbol"><Icon name={entry.source==='garmin'?'activity':'calendar-days'}/></div>
        <div className="hc-entry-copy">
         <strong>{entry.title}</strong>
         <small>{entry.sub}</small>
         <span className={'hc-entry-state '+state.type}>{state.text}</span>
        </div>
       </article>
      })}
     </div>:
     <div className="hc-empty">
      <div className="hc-empty-icon"><Icon name="calendar-days"/></div>
      <strong>Hier ist noch nichts geplant.</strong>
      <span>Ein freier Tag bleibt frei – wir erfinden keine Trainingseinheit.</span>
     </div>}
   </div>
  </div>
  <div className="hc-source-grid">
   <article>
    <div className="hc-source-icon"><Icon name="check"/></div>
    <div><strong>Garmin Connect</strong>
      <small>{snapshot?((snapshot.schedule||[]).length+' Kalendereinträge im gespeicherten Snapshot'):'Noch keine Kalendereinträge'}</small>
      <span className={isOld?'hc-source-warning':'hc-source-ok'}>
       {snapshot?.checked_at?
        (isOld?'Stand ist älter als 36 Stunden':'Letzter Garmin-Abruf bestätigt'):
        'Noch kein bestätigter Garmin-Abruf'}
      </span>
    </div>
   </article>
   <article>
    <div className="hc-source-icon"><Icon name="sparkles"/></div>
    <div><strong>GARMIN_AI Coach</strong><small>{plans.length} lokale Trainingspläne</small>
     <span>Übertragung nur nach Freigabe und erfolgreichem Garmin-Abgleich</span>
    </div>
   </article>
  </div>
  {error&&<p className="hc-error" role="alert">{error}</p>}
  {notice&&<p className="hc-notice" role="status">{notice}</p>}
  <p className="hc-footnote">Die App zeigt bestätigte Garmin-Snapshots und gespeicherte Entwürfe. Ein Entwurf ist kein Garmin-Termin. Kein Schreibzugriff wird durch diese Ansicht ausgelöst.</p>
 </section>
}
