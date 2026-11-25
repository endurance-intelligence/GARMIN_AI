import {useEffect,useRef,useState} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import {COACH_QUESTIONS,answerCoachQuestion,resolveCoachQuestion} from '../lib/askCoach.mjs'
import type {CoachTopic,CoachAnswer} from '../lib/askCoach.mjs'
import {resolveFollowUp,coachChatMood} from '../lib/coachPersonality.mjs'
import {CoachAvatar} from './CoachAvatar'
import {Icon} from './Icon'
import '../styles/ask-coach.css'
type Turn={id:number;query:string;topic:CoachTopic|null;local:CoachAnswer}
export function AskCoachCard({active,today,snapshot,plan,weather,onDecision,onProgress,onGoals,onSymptoms}:{
 active:boolean;today:string;snapshot:CoachSnapshot;plan:SevenDayPlan;weather?:{date:string;text:string}|null;
 onDecision:()=>void;onProgress:()=>void;onGoals:()=>void;onSymptoms:()=>void
}){
 const [query,setQuery]=useState(''),[turns,setTurns]=useState<Turn[]>([])
 const counter=useRef(0),bottom=useRef<HTMLDivElement|null>(null)
 useEffect(()=>{if(active&&turns.length)bottom.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[active,turns.length])
 const actions={decision:onDecision,progress:onProgress,goals:onGoals,symptoms:onSymptoms}
 const labels={decision:'Tagesentscheidung prüfen',progress:'Analyse öffnen',goals:'Goals öffnen',symptoms:'Beschwerden / Pause'}
 function clear(){setTurns([]);setQuery('')}
 function send(raw:string,explicit?:CoachTopic){
  const text=raw.trim();if(!text)return
  const topic=explicit||resolveFollowUp(text,turns.at(-1)?.topic||null,resolveCoachQuestion)
  const local=answerCoachQuestion({topic,today,snapshot,plan,weather,query:text,previousQuery:turns.at(-1)?.query})
  setQuery('')
  setTurns(old=>[...old,{id:++counter.current,query:text,topic,local}].slice(-20))
 }
 return <section className="ask-coach ask-chat" aria-label="Frag deinen Coach">
  <header className="ask-chat-header"><CoachAvatar mood={coachChatMood()} small/><div><span>DEIN TRAININGSPARTNER</span><h2>Frag deinen Coach.</h2><p>Dein Training. Deine Fragen.</p></div><button type="button" className="ask-new" disabled={!turns.length} onClick={clear}>Neu</button></header>
  <details className="ask-suggestions">
   <summary>Beispielfragen</summary>
   <div className="ask-questions" aria-label="Vorgeschlagene Fragen">
    {COACH_QUESTIONS.map(q=>q.label).map(q=><button key={q} type="button" onClick={()=>void send(q)}>{q}</button>)}
   </div>
  </details>
  <div className="ask-thread" aria-live="polite">
   {!turns.length&&<div className="ask-welcome"><CoachAvatar mood={coachChatMood()} small/><p>Frag mich zu deinem letzten Lauf, deinem Wochenumfang oder deinem nächsten Training.</p></div>}
   {turns.map(t=><div className="ask-turn" key={t.id}>
    <p className="ask-user">{t.query}</p>
    <div className="ask-reply"><CoachAvatar mood={coachChatMood(t.topic)} small/><div className="ask-bubble">
     {t.local&&<><strong>{t.local.title}</strong>{t.local.body.map((p,i)=><p key={i}>{p}</p>)}<small>Quelle: {t.local.source}</small>{t.local.action&&<button type="button" onClick={actions[t.local.action]}>{labels[t.local.action]} <Icon name="arrow-up-right"/></button>}</>}
    </div></div>
   </div>)}
   <div ref={bottom}/>
  </div>
  <form className="ask-form" onSubmit={e=>{e.preventDefault();void send(query)}}>
   <label htmlFor="ask-coach-query">Deine Frage</label>
   <div><input id="ask-coach-query" value={query} maxLength={800} onChange={e=>setQuery(e.target.value)} placeholder="Wie schnell war mein letzter Lauf?"/><button type="submit" disabled={!query.trim()}>Senden <Icon name="arrow-up-right"/></button></div>
  </form>
  <small className="ask-note">Lokaler Coach · Garmin-Daten und Trainingsregeln. Kein externer KI-Dienst. Verlauf nur in dieser Ansicht. Keine automatischen Trainingsänderungen.</small>
 </section>
}
