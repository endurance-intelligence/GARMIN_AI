import {useMemo,useState} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import {COACH_QUESTIONS,answerCoachQuestion,resolveCoachQuestion} from '../lib/askCoach.mjs'
import type {CoachTopic} from '../lib/askCoach.mjs'
import {Icon} from './Icon'
import '../styles/ask-coach.css'

export function AskCoachCard({today,snapshot,plan,onDecision,onProgress,onGoals,onSymptoms}:{
 today:string;snapshot:CoachSnapshot;plan:SevenDayPlan;
 onDecision:()=>void;onProgress:()=>void;onGoals:()=>void;onSymptoms:()=>void
}){
 const [query,setQuery]=useState('')
 const [selected,setSelected]=useState<{topic:CoachTopic|null;text:string}|null>(null)
 const result=useMemo(()=>selected?answerCoachQuestion({topic:selected.topic,today,snapshot,plan}):null,
  [selected,today,snapshot,plan])
 const actions={decision:onDecision,progress:onProgress,goals:onGoals,symptoms:onSymptoms}
 const labels={decision:'Coach-Plan ansehen',progress:'Tempo/Puls und Strecken vergleichen',goals:'Goals öffnen',symptoms:'Beschwerden / Pause'}
 return <section className="ask-coach" aria-label="Frag deinen Coach">
  <header><span><Icon name="message-circle"/> DEIN PERSÖNLICHER COACH</span>
   <h2>Frag deinen Coach.</h2><p>Dein Training. Deine Fragen.</p></header>
  <details className="ask-suggestions">
   <summary>Beispielfragen</summary>
  <div className="ask-questions" aria-label="Vorgeschlagene Fragen">
   {COACH_QUESTIONS.map(q=><button key={q.id} type="button"
    aria-pressed={selected?.topic===q.id&&selected.text===q.label}
    onClick={()=>{setSelected({topic:q.id,text:q.label});setQuery('')}}>{q.label}</button>)}
  </div>
  </details>
  <form className="ask-form" onSubmit={e=>{e.preventDefault();const text=query.trim()
   if(text){setSelected({topic:resolveCoachQuestion(text),text});setQuery('')}}}>
   <label htmlFor="ask-coach-query">Oder stelle eine Frage zu diesen Themen</label>
   <div><input id="ask-coach-query" value={query} maxLength={240} onChange={e=>setQuery(e.target.value)}
    placeholder="Warum heute locker laufen?"/><button type="submit" disabled={!query.trim()}>Fragen</button></div>
  </form>
  {selected&&result&&<div className="ask-result" aria-live="polite">
   <p className="ask-user">{selected.text}</p><strong>{result.title}</strong>
   {result.body.map((p,i)=><p key={i}>{p}</p>)}
   <small>Quelle: {result.source}</small>
   {result.action&&<button type="button" onClick={actions[result.action]}>{labels[result.action]} <Icon name="arrow-up-right"/></button>}
   <button type="button" className="ask-reset" onClick={()=>setSelected(null)}>Antwort schließen</button>
  </div>}
  <small className="ask-note">Erste Version: regelbasierte Themenantworten, kein freier KI-Chat. Keine Trainingsänderungen oder externen KI-Dienste.</small>
 </section>
}
