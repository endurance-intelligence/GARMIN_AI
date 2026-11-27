import {useEffect,useRef,useState} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import {availableCoachQuestions,answerCoachQuestion} from '../lib/askCoach.mjs'
import type {CoachTopic,CoachAnswer} from '../lib/askCoach.mjs'
import {coachChatMood} from '../lib/coachPersonality.mjs'
import {CoachAvatar} from './CoachAvatar'
import {Icon} from './Icon'
import '../styles/ask-coach.css'
type Turn={id:number;query:string;topic:CoachTopic;local:CoachAnswer}
export function AskCoachCard({active,today,snapshot,plan,weather,onDecision,onProgress,onGoals,onSymptoms}:{
 active:boolean;today:string;snapshot:CoachSnapshot;plan:SevenDayPlan;weather?:{date:string;text:string}|null;
 onDecision:()=>void;onProgress:()=>void;onGoals:()=>void;onSymptoms:()=>void
}){
 const [turns,setTurns]=useState<Turn[]>([])
 const questions=availableCoachQuestions({today,snapshot,plan,weather})
 const counter=useRef(0),bottom=useRef<HTMLDivElement|null>(null)
 useEffect(()=>{if(active&&turns.length)bottom.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[active,turns.length])
 const actions={decision:onDecision,progress:onProgress,goals:onGoals,symptoms:onSymptoms}
 const labels={decision:'Tagesentscheidung prüfen',progress:'Analyse öffnen',goals:'Goals öffnen',symptoms:'Beschwerden / Pause'}
 function clear(){setTurns([])}
 function send(raw:string,topic:CoachTopic){
  const text=raw.trim();if(!text||!questions.some(q=>q.id===topic))return
  const local=answerCoachQuestion({topic,today,snapshot,plan,weather,query:text})
  setTurns(old=>[...old,{id:++counter.current,query:text,topic,local}].slice(-20))
 }
 return <section className="ask-coach ask-chat" aria-label="Frag deinen Coach">
  <header className="ask-chat-header"><CoachAvatar mood={coachChatMood()} small/><div><span>DEIN TRAININGSPARTNER</span><h2>Frag deinen Coach.</h2><p>Wähle eine Frage – ich antworte direkt aus deinen verfügbaren Daten.</p></div><button type="button" className="ask-new" disabled={!turns.length} onClick={clear}>Neu</button></header>
  <div className="ask-suggestions">
   <div className="ask-questions" aria-label="Beantwortbare Fragen">
    {questions.map(q=><button key={q.id} type="button" onClick={()=>send(q.label,q.id)}>{q.label}</button>)}
   </div>
   {!questions.length&&<p>Momentan fehlen die Daten für eine persönliche Antwort.</p>}
  </div>
  <div className="ask-thread" aria-live="polite">
   {!turns.length&&<div className="ask-welcome"><CoachAvatar mood={coachChatMood()} small/><p>Tippe eine der verfügbaren Fragen an. Du brauchst nichts einzutippen.</p></div>}
   {turns.map(t=><div className="ask-turn" key={t.id}>
    <p className="ask-user">{t.query}</p>
    <div className="ask-reply"><CoachAvatar mood={coachChatMood(t.topic)} small/><div className="ask-bubble">
     <strong>{t.local.title}</strong>{t.local.body.map((p,i)=><p key={i}>{p}</p>)}<small>Quelle: {t.local.source}</small>{t.local.action&&<button type="button" onClick={actions[t.local.action]}>{labels[t.local.action]} <Icon name="arrow-up-right"/></button>}
    </div></div>
   </div>)}
   <div ref={bottom}/>
  </div>
  <small className="ask-note">Lokaler Coach · Garmin-Daten und Trainingsregeln. Kein externer KI-Dienst. Verlauf nur in dieser Ansicht. Keine automatischen Trainingsänderungen.</small>
 </section>
}
