import {useEffect,useMemo,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {buildSevenDayCoach} from '../lib/coachSevenDay.mjs'
import {loadCoachSnapshot} from '../lib/coachSnapshot'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {CoachDay} from '../lib/coachSevenDay.mjs'
import {Icon} from './Icon'
import {CoachLifeContext} from './CoachLifeContext'
import type {CoachContextPayload} from './CoachLifeContext'
import '../styles/coach-seven-day.css'

type SubmitResponse={saved?:boolean;id?:string;state?:string;revision?:number;error?:string}
const formatDate=(day:string)=>new Intl.DateTimeFormat('de-DE',{
 timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'
}).format(new Date(day+'T12:00:00Z'))

export function CoachSevenDay({active,onCalendar}:{active:boolean;onCalendar:(date?:string)=>void}){
 const [snapshot,setSnapshot]=useState<CoachSnapshot|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [contextBusy,setContextBusy]=useState(false)
 const [reload,setReload]=useState(0)
 const [review,setReview]=useState<string|null>(null)
 const [startTime,setStartTime]=useState('18:00')
 const [saving,setSaving]=useState<string|null>(null)
 const [savedDay,setSavedDay]=useState<string|null>(null)
 const ids=useRef<Record<string,string>>({})
 const today=berlinDateToday()
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  const controller=new AbortController()
  setLoading(true);setError('');setNotice('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden.')
   const data=await loadCoachSnapshot(session,today,controller.signal)
   if(mounted)setSnapshot(data)
  })().catch(e=>{
   if(mounted&&!(e instanceof Error&&e.name==='AbortError'))
    setError(e instanceof Error?e.message:'Coach-Daten nicht verfügbar.')
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,today,reload])
 const plan=useMemo(()=>snapshot?buildSevenDayCoach({
  today,health:snapshot.health,options:snapshot.options,boards:snapshot.boards,
  plans:snapshot.plans,goal:snapshot.goal,life:snapshot.life
 }):null,[snapshot,today])
 async function updateLife(action:{action:string;[key:string]:string|boolean}){
  if(!garminSupabase||contextBusy||saving!==null)return
  setContextBusy(true);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte anmelden.')
   const response=await fetch(garminSupabaseUrl+'/functions/v1/garmin-coach-context',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'},
    body:JSON.stringify(action)
   })
   const result=await response.json().catch(()=>({})) as {
    saved?:boolean;context?:CoachContextPayload['context'];runs?:CoachContextPayload['runs'];error?:string
   }
   if(!response.ok||result.saved!==true||!result.context||!Array.isArray(result.runs))
    throw Error(result.error||'Coach-Kontext konnte nicht gespeichert werden.')
   setSnapshot(prev=>prev?{...prev,life:{context:result.context!,runs:result.runs!}}:prev)
   setReview(null)
   setNotice('Deine Angaben wurden gespeichert und der 7-Tage-Coach neu berechnet. Keine Garmin-Änderung.')
  }catch(e){setError(e instanceof Error?e.message:'Coach-Kontext nicht gespeichert.')}
  finally{setContextBusy(false)}
 }
 async function accept(day:CoachDay){
  if(!garminSupabase||saving||contextBusy||!plan||!snapshot||!day.approvable||review!==day.date)return
  if(plan.days.find(x=>x.date===day.date)!==day)return
  setSaving(day.date);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   const requestId=ids.current[day.date]||(ids.current[day.date]=crypto.randomUUID())
   const structured=day.sport==='running'&&
    ['easy','long','return_easy'].includes(day.kind)&&Number.isSafeInteger(day.minutes)
   const payload=structured?{
    action:'create_coach_workout',clientRequestId:requestId,date:day.date,
    title:day.title,kind:day.kind,minutes:day.minutes,startTime
   }:{
    action:'create',clientRequestId:requestId,date:day.date,
    title:day.title,sessionType:'event',sport:day.kind==='mobility'?'strength':day.sport,
    notes:'Coach Intelligence · '+day.minutes+
      ' Min. · Nur Kalendereintrag. Keine automatische Garmin-Übertragung.'
   }
   const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-training-plan',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'},
    body:JSON.stringify(payload)
   })
   const json=await res.json().catch(()=>({})) as SubmitResponse
   if(!res.ok||!json.saved)throw Error(json.error||'Entwurf nicht gespeichert.')
   setSnapshot(prev=>prev?{
    ...prev,plans:{entries:[...prev.plans.entries,{
     id:json.id,training_date:day.date,title:day.title,
     sport:day.kind==='mobility'?'strength':day.sport,
     state:'draft',session_type:'event',revision:json.revision||1,
     notes:structured?'Coach · '+day.minutes+' Min. ab '+startTime+
      ' · 3 zeitgesteuerte Abschnitte · ohne Pace/HF-Ziel':'Nur Kalendereintrag'
    }]}
   }:prev)
   setReview(null)
   setSavedDay(day.date)
   setNotice((structured?
    'Zeitgesteuertes Lauf-Workout ('+day.minutes+' Min., Start '+startTime+
    ') als Entwurf gespeichert. Nächster Schritt: im Kalender freigeben und danach bewusst an Intervals.icu senden.':
    'Kalendereintrag als Entwurf gespeichert; keine strukturierte Garmin-Übertragung.')+
    ' Es wurde noch nichts an Garmin oder Intervals.icu gesendet.')
  }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}
  finally{setSaving(null)}
 }
 if(!active)return null
 return <section className="c7-root" aria-label="Coach Intelligence mit sieben Tagen Trainingsvorschlägen">
  <div className="c7-top">
   <div><span className="c7-eyebrow"><Icon name="sparkles"/> COACH INTELLIGENCE / V1.3</span>
    <h2>Deine nächsten 7 Tage.</h2>
    <p>Garmin-Daten, Erholung, Hauptziel und freiwillige Gruppentermine – erklärt statt bewertet.</p>
   </div>
   <button type="button" className="c7-refresh" disabled={loading||saving!==null}
    onClick={()=>{setReload(x=>x+1);setReview(null)}}><Icon name="refresh-cw"/> Aktualisieren</button>
  </div>
  {snapshot&&<CoachLifeContext life={snapshot.life} busy={contextBusy||saving!==null} onAction={updateLife}/>} 
  {loading&&!plan&&<p className="c7-alert" role="status">Prüfe aktuelle Garmin- und Kalenderdaten …</p>}
  {error&&<p className="c7-error" role="alert">{error}</p>}
  {plan&&<>
   <div className="c7-evidence">
    <div className="c7-evidence-label"><strong>Datenlage und Begründung</strong>
     <span>{plan.attention?'Konservativer Modus':'Individuell eingeordnet'}</span></div>
    <p>{plan.attentionText}</p>
    <details><summary>Verwendete Garmin-Daten ansehen</summary>
     <ul>{plan.flags.map((x,i)=><li key={i}>{x}</li>)}</ul>
     {plan.signals.length>0&&<p><strong>Auffälligkeiten:</strong> {plan.signals.join(' · ')}</p>}
     <p>Median: jeweils 14 Kalendertage vor dem letzten Messwert, erst ab 7 gültigen Werten.
      Die Abweichungsgrenzen sind Vorsichtsregeln, keine medizinischen Grenzwerte.
      Kein KI-Readiness-Score, keine Diagnose.</p>
    </details>
   </div>
   <div className="c7-week" role="list">
    {plan.days.map(day=><article className={'c7-day c7-'+day.kind} key={day.date} role="listitem">
     <div className="c7-day-main"><div className="c7-date">{formatDate(day.date)}</div>
      <div className="c7-day-copy"><strong>{day.title}</strong>
       <p>{day.reason}</p>
       <small>{day.approvable?'Vorschlag · nicht im Kalender gespeichert':
        ['chosen','option'].includes(day.kind)?'Freiwillige Trainingsoption':
        day.kind==='existing'?'Bereits im Kalender':day.kind==='completed'?'Garmin-Aktivität vorhanden':
        'Kein neuer Kalendereintrag'}</small>
      </div></div>
     {day.approvable&&!contextBusy&&<div className="c7-actions">
      {review===day.date?<div className="c7-confirm">
       <span>Nur diesen Vorschlag als Entwurf speichern?</span>
       {day.sport==='running'&&['easy','long','return_easy'].includes(day.kind)&&
        <div className="c7-structured-preview">
         <span>Garmin-Workout: {day.minutes} Min. · Einlaufen, lockerer Lauf, Auslaufen.
          Automatisch zeitgesteuert, ohne Pace- oder HF-Ziel.</span>
         <label>Startzeit in Intervals.icu
          <select value={startTime} onChange={e=>setStartTime(e.target.value)}
           disabled={saving!==null}>
           {Array.from({length:31},(_,i)=>{
            const time=String(6+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')
            return <option value={time} key={time}>{time} Uhr</option>
           })}
          </select>
         </label>
         <small>Erst hier speichern, danach im Kalender freigeben und ausdrücklich senden.
          Intervals.icu muss das Workout korrekt bestätigen, bevor du es auf Garmin verwendest.</small>
        </div>}
       <div><button type="button" disabled={saving!==null} onClick={()=>void accept(day)}>
        {saving===day.date?'Speichere …':'Ja, Entwurf speichern'}</button>
        <button type="button" className="c7-secondary" disabled={saving!==null}
         onClick={()=>setReview(null)}>Abbrechen</button></div>
      </div>:
       <button type="button" disabled={saving!==null} onClick={()=>{setReview(day.date);setStartTime('18:00')}}>
        Vorschlag prüfen</button>}
     </div>}
    </article>)}
   </div>
   {notice&&<div className="c7-saved-next" role="status">
    <p className="c7-ok">{notice}</p>
    {savedDay&&<button type="button" className="c7-next-calendar" onClick={()=>onCalendar(savedDay)}>
     Im Kalender weiter · {formatDate(savedDay)} <Icon name="arrow-up-right"/>
    </button>}
   </div>}
   <div className="c7-footer">
    <p>Nur Vorschläge: Keine direkten Garmin-Schreibzugriffe, kein automatisches Intervals-Publishing.
     Zeitgesteuerte Lauf-Workouts benötigen drei separate Schritte: Entwurf, Kalenderfreigabe, Intervals-Versand.
     Jeder Kalendereintrag entsteht erst nach deiner Bestätigung.
     Deine Krankheits- und Verfügbarkeitsangaben haben Vorrang vor den Messwerten.</p>
    <button type="button" className="c7-secondary" onClick={()=>onCalendar()}>
     Kalender ansehen <Icon name="arrow-up-right"/></button>
   </div>
  </>}
 </section>
}
