import {useEffect,useMemo,useState} from 'react'
import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {selectCoachDecision} from '../lib/coachDecision.mjs'
import {Icon} from './Icon'
import '../styles/coach-decision-live.css'

const dated=(date:string)=>new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',
 weekday:'long',day:'2-digit',month:'2-digit'}).format(new Date(date+'T12:00:00Z'))
type Props={plan:SevenDayPlan;snapshot:CoachSnapshot;reviewDate:string|null;saving:boolean;
 onReview:(date:string)=>void;onCalendar:(date:string)=>void;onPlan:()=>void;
 selectedDate:string;onDecline:(date:string)=>void;onAcceptRest:(date:string)=>void;
 onReset:(date:string)=>void;onCustom:(date:string)=>void}
export function CoachDecisionLive({plan,snapshot,reviewDate,saving,onReview,onCalendar,onPlan,
 selectedDate,onDecline,onAcceptRest,onReset,onCustom}:Props){
 const [review,setReview]=useState<Record<string,unknown>|null>(null)
 const [intervals,setIntervals]=useState<Record<string,unknown>|null>(null)
 const [evidenceLoading,setEvidenceLoading]=useState(false)
 const lastRun=useMemo(()=>{
  const activities=snapshot.boards.flatMap(board=>Array.isArray(board.activities)?board.activities:[])
  return activities.filter(a=>/run|jog|trail|treadmill/i.test(String(a.sport_type||''))&&
   String(a.start_time_local||'').slice(0,10)<=plan.today)
   .sort((a,b)=>String(b.start_time_local||'').localeCompare(String(a.start_time_local||'')))[0]||null
 },[snapshot.boards,plan.today])
 const lastId=String(lastRun?.activity_id||'')
 useEffect(()=>{
  if(!/^\d{6,20}$/.test(lastId)||!garminSupabase){setReview(null);setIntervals(null);return}
  const controller=new AbortController()
  let mounted=true
  setEvidenceLoading(true);setReview(null);setIntervals(null)
  void garminSupabase.auth.getSession().then(async({data:{session}})=>{
   if(!session)throw Error('Not authenticated')
   const headers={authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
   const get=async(path:string)=>{
    const response=await fetch(garminSupabaseUrl+'/functions/v1/'+path,{
     cache:'no-store',headers,signal:controller.signal})
    if(!response.ok)throw Error('Coach source unavailable')
    return await response.json() as Record<string,unknown>
   }
   const [fit,icu]=await Promise.allSettled([
    get('garmin-coach-review?id='+encodeURIComponent(lastId)),
    get('garmin-intervals-insights?id='+encodeURIComponent(lastId))
   ])
   if(!mounted)return
   if(fit.status==='fulfilled'){
    const entries=fit.value.reviews
    if(Array.isArray(entries))setReview((entries.find(x=>String(x.activityId)===lastId)||null) as Record<string,unknown>|null)
   }
   if(icu.status==='fulfilled')setIntervals(icu.value)
  }).catch(()=>{}).finally(()=>{if(mounted)setEvidenceLoading(false)})
  return ()=>{mounted=false;controller.abort()}
 },[lastId])
 const options=Array.isArray(snapshot.options?.options)?snapshot.options.options:[]
 const choices=Array.isArray(snapshot.options?.choices)?snapshot.options.choices:[]
 const x=selectCoachDecision(plan,{options,choices,lastRun,review,intervals,selectedDate})
 if(!x)return null
 const {day}=x
 const reviewIsOpen=reviewDate===day.date
 const canChoose=!['illness','blocked','race','existing','completed'].includes(day.kind)
 const alreadyDecided=day.decision==='declined'||day.decision==='accepted'
 return <section className="cdl-root" aria-label="Echte Coach-Entscheidung mit Begründung">
  <header className="cdl-head">
   <div><span className="cdl-kicker"><Icon name="sparkles"/> COACH INTELLIGENCE · LIVE</span>
    <h3>Deine nächste Entscheidung.</h3></div>
   <span className="cdl-owner">Du entscheidest. Keine automatische Änderung.</span>
  </header>
  <div className="cdl-grid">
   <article className="cdl-choice">
    <div className="cdl-choice-top">
     <span className="cdl-overline"><span className="cdl-led"/> VORSCHLAG / {dated(day.date).toUpperCase()}</span>
     <span className={'cdl-status cdl-status-'+x.state}>
      {day.decision==='accepted'?'Von dir angenommen':day.decision==='declined'?'Von dir abgelehnt':
       x.actionable?'Prüfung offen':x.state==='calendar'?'Bereits eingetragen':'Kein Entwurf nötig'}
     </span>
    </div>
    <div className="cdl-choice-body">
     <span className="cdl-plan-kicker"><Icon name="activity"/> DEIN PLAN FÜR DIESEN TAG</span>
     <h4>{day.title}</h4>
     <p className="cdl-decision-note">{x.summary}</p>
     {day.minutes!==null&&<div className="cdl-duration">
      <span>COACH-UMFANG</span><strong>{day.minutes} Min.</strong>
      <small>Vorschlag, noch kein freigegebenes Workout</small>
     </div>}
     {x.current!=='Kein Training eingetragen'&&<div className="cdl-context-line">
      <span>{x.state==='calendar'?'IM KALENDER':'DEIN GRUPPENTERMIN'}</span>
      <strong>{x.current}</strong>
      {x.state==='calendar'&&<small>Bestehender Eintrag wird nicht überschrieben</small>}
     </div>}
     <div className="cdl-actions">
      {alreadyDecided?
       <button className="cdl-primary" type="button" disabled={saving}
        onClick={()=>onReset(day.date)}><Icon name="rotate-ccw"/> Umentscheiden</button>:
       x.actionable?
       <button className="cdl-primary" type="button" disabled={saving}
        onClick={()=>onReview(day.date)}>
        <Icon name="check"/> {reviewIsOpen?'Entwurf unten bestätigen':'Annehmen · Entwurf prüfen'}
        <Icon name="arrow-up-right"/></button>:
       x.state==='calendar'?
       <button className="cdl-primary" type="button" onClick={()=>onCalendar(day.date)}>
        <Icon name="calendar-days"/> Im Kalender prüfen <Icon name="arrow-up-right"/></button>:
       day.kind==='recovery'?
       <button className="cdl-primary cdl-nonwrite" type="button" disabled={saving}
        onClick={()=>onAcceptRest(day.date)}><Icon name="check"/> Erholungstag annehmen</button>:
       <button className="cdl-primary cdl-nonwrite" type="button" onClick={onPlan}>
        <Icon name="calendar-days"/> Wochenplan ansehen</button>}
      {canChoose&&!alreadyDecided&&<>
       <button className="cdl-secondary cdl-decline" type="button" disabled={saving}
        onClick={()=>onDecline(day.date)}><Icon name="x"/> Ablehnen</button>
       <button className="cdl-secondary cdl-custom" type="button" disabled={saving}
        onClick={()=>onCustom(day.date)}><Icon name="pencil"/> Eigener Vorschlag</button>
      </>}
      <button className="cdl-secondary cdl-week-link" type="button" onClick={onPlan}>
       Ganze Woche <Icon name="arrow-up-right"/></button>
     </div>
     <p className="cdl-smallprint">Keine automatische Änderung deines Trainingsplans.
      Deine Wahl wird gespeichert. Ein Workout bleibt ein Entwurf bis zur separaten Freigabe.</p>
    </div>
   </article>
   <article className="cdl-why">
    <div className="cdl-why-head"><span className="cdl-overline">THE REASONING / ECHTE DATEN</span>
     <span className="cdl-star" aria-hidden="true">✦</span></div>
    <h4>Warum dieser<br/>Vorschlag?</h4>
    <div className="cdl-specific"><strong>Für {dated(day.date)}:</strong> {x.reason}</div>
    {evidenceLoading&&<p className="cdl-evidence-loading">Prüfe die letzte Garmin-Einheit und Intervals.icu …</p>}
    <details className="cdl-why-detail">
     <summary>Trainingsdaten und Begründung aufklappen <Icon name="chevron-down"/></summary>
    <div className="cdl-factors">
     {x.causes.map((c,i)=><div className="cdl-factor" key={c.key}>
      <span className="cdl-factor-number">{String(i+1).padStart(2,'0')}</span>
      <div><strong>{c.title}</strong><p>{c.text}</p></div>
      <span className={'cdl-factor-dot cdl-factor-'+c.key} aria-hidden="true"/>
     </div>)}
    </div>
    {x.flags.length>0&&<p className="cdl-flags"><strong>Zusätzliche Signale:</strong> {x.flags.join(' · ')}</p>}
    </details>
    <p className="cdl-why-foot">{x.attentionText} Kein künstlicher Readiness-Wert und keine medizinische Freigabe.</p>
   </article>
  </div>
 </section>
}
