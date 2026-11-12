import {useEffect,useMemo,useRef,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {berlinDateToday} from '../lib/coachGoal'
import {buildSevenDayCoach,coachAddDays,coachMonday} from '../lib/coachSevenDay.mjs'
import type {CoachDay} from '../lib/coachSevenDay.mjs'
import {Icon} from './Icon'
import '../styles/coach-seven-day.css'

type Snapshot={
 health:Record<string,unknown>;boards:Record<string,unknown>[];
 options:Record<string,unknown>;plans:{entries:Array<Record<string,unknown>>};
 goal:Record<string,unknown>
}
type SubmitResponse={saved?:boolean;id?:string;state?:string;revision?:number;error?:string}
const formatDate=(day:string)=>new Intl.DateTimeFormat('de-DE',{
 timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'
}).format(new Date(day+'T12:00:00Z'))

export function CoachSevenDay({active,onCalendar}:{active:boolean;onCalendar:()=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null)
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [symptoms,setSymptoms]=useState(false)
 const [reload,setReload]=useState(0)
 const [review,setReview]=useState<string|null>(null)
 const [saving,setSaving]=useState<string|null>(null)
 const ids=useRef<Record<string,string>>({})
 const requested=useRef<string|null>(null)
 const today=berlinDateToday()
 useEffect(()=>{
  if(!active||!garminSupabase)return
  const requestKey=today+'|'+reload
  if(requested.current===requestKey)return
  let mounted=true
  const controller=new AbortController()
  setLoading(true);setError('');setNotice('')
  void (async()=>{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte zuerst anmelden.')
   const get=async(path:string)=>{
    const res=await fetch(garminSupabaseUrl+'/functions/v1/'+path,{
     signal:controller.signal,cache:'no-store',
     headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
    })
    if(!res.ok)throw Error('Garmin-Daten aktuell nicht vollständig erreichbar ('+res.status+').')
    return await res.json() as Record<string,unknown>
   }
   const first=coachMonday(today),second=coachMonday(coachAddDays(today,6))
   const weeks=first===second?[first]:[first,second]
   const [health,options,plans,goal,...boards]=await Promise.all([
    get('read-garmin-health'),get('garmin-weekly-options'),
    get('garmin-training-plan'),get('garmin-coach-goal'),
    ...weeks.map(w=>get('garmin-week-board?start='+encodeURIComponent(w)))
   ])
   if(!mounted)return
   if(!Array.isArray(options.options)||!Array.isArray(plans.entries)||
    !boards.every(b=>Array.isArray(b.activities)&&Array.isArray(b.manual)))
    throw Error('Einige Kalenderdaten sind unvollständig; keine Planung erstellt.')
   setSnapshot({health,options,plans:{entries:plans.entries as Array<Record<string,unknown>>},goal,boards})
   requested.current=requestKey
  })().catch(e=>{
   if(mounted&&!(e instanceof Error&&e.name==='AbortError'))
    setError(e instanceof Error?e.message:'Coach-Daten nicht verfügbar.')
  }).finally(()=>{if(mounted)setLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[active,today,reload])
 const plan=useMemo(()=>snapshot?buildSevenDayCoach({
  today,health:snapshot.health,options:snapshot.options,boards:snapshot.boards,
  plans:snapshot.plans,goal:snapshot.goal,symptoms
 }):null,[snapshot,today,symptoms])
 async function accept(day:CoachDay){
  if(!garminSupabase||saving||!plan||!day.approvable||symptoms||review!==day.date)return
  if(plan.days.find(x=>x.date===day.date)!==day)return
  setSaving(day.date);setError('');setNotice('')
  try{
   const {data:{session}}=await garminSupabase.auth.getSession()
   if(!session)throw Error('Bitte erneut anmelden.')
   const requestId=ids.current[day.date]||(ids.current[day.date]=crypto.randomUUID())
   const res=await fetch(garminSupabaseUrl+'/functions/v1/garmin-training-plan',{
    method:'POST',cache:'no-store',
    headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
     'content-type':'application/json'},
    body:JSON.stringify({
     action:'create',clientRequestId:requestId,date:day.date,
     title:day.title,sessionType:'event',sport:day.sport,
     notes:'Coach Intelligence v1.0 · '+day.minutes+
      ' Min. · Entwurf nach ausdrücklicher Bestätigung. Keine automatische Garmin-Übertragung.'
    })
   })
   const json=await res.json().catch(()=>({})) as SubmitResponse
   if(!res.ok||!json.saved)throw Error(json.error||'Entwurf nicht gespeichert.')
   setSnapshot(prev=>prev?{
    ...prev,plans:{entries:[...prev.plans.entries,{
     id:json.id,training_date:day.date,title:day.title,sport:day.sport,
     state:'draft',session_type:'event',revision:json.revision||1
    }]}
   }:prev)
   setReview(null)
   setNotice('Für '+formatDate(day.date)+' als GARMIN_AI-Entwurf gespeichert. Keine Übertragung an Garmin oder Intervals.icu.')
  }catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen.')}
  finally{setSaving(null)}
 }
 if(!active)return null
 return <section className="c7-root" aria-label="Coach Intelligence mit sieben Tagen Trainingsvorschlägen">
  <div className="c7-top">
   <div><span className="c7-eyebrow"><Icon name="sparkles"/> COACH INTELLIGENCE / V1.0</span>
    <h2>Deine nächsten 7 Tage.</h2>
    <p>Garmin-Daten, Erholung, Hauptziel und freiwillige Gruppentermine – erklärt statt bewertet.</p>
   </div>
   <button type="button" className="c7-refresh" disabled={loading||saving!==null}
    onClick={()=>{setReload(x=>x+1);setReview(null)}}><Icon name="refresh-cw"/> Aktualisieren</button>
  </div>
  <label className="c7-symptom"><input type="checkbox" checked={symptoms}
   onChange={e=>{setSymptoms(e.target.checked);setReview(null)}}/>
   <span>Aktuell krank, Schmerzen oder ungewöhnlich erschöpft</span></label>
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
     {day.approvable&&!symptoms&&<div className="c7-actions">
      {review===day.date?<div className="c7-confirm">
       <span>Nur diesen Vorschlag als Entwurf speichern?</span>
       <div><button type="button" disabled={saving!==null} onClick={()=>void accept(day)}>
        {saving===day.date?'Speichere …':'Ja, Entwurf speichern'}</button>
        <button type="button" className="c7-secondary" disabled={saving!==null}
         onClick={()=>setReview(null)}>Abbrechen</button></div>
      </div>:
       <button type="button" disabled={saving!==null} onClick={()=>setReview(day.date)}>
        Vorschlag prüfen</button>}
     </div>}
    </article>)}
   </div>
   {notice&&<p className="c7-ok" role="status">{notice}</p>}
   <div className="c7-footer">
    <p>Nur Vorschläge: Keine Garmin-Schreibzugriffe, kein automatisches Intervals-Publishing.
     Jeder Kalendereintrag entsteht erst nach deiner Bestätigung.
     Krankheit, Schmerzen und dein subjektives Befinden haben Vorrang vor den Messwerten.</p>
    <button type="button" className="c7-secondary" onClick={onCalendar}>
     Kalender ansehen <Icon name="arrow-up-right"/></button>
   </div>
  </>}
 </section>
}
