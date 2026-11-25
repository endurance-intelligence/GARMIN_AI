import {useEffect,useRef,useState} from 'react'
import type {CoachSnapshot} from '../lib/coachSnapshot'
import type {SevenDayPlan} from '../lib/coachSevenDay.mjs'
import {COACH_QUESTIONS,answerCoachQuestion,resolveCoachQuestion} from '../lib/askCoach.mjs'
import type {CoachTopic,CoachAnswer} from '../lib/askCoach.mjs'
import {resolveFollowUp,coachChatMood} from '../lib/coachPersonality.mjs'
import {buildCoachChatContext} from '../lib/coachChatContext.mjs'
import {coachChatStatus,requestCoachChat} from '../lib/coachChatClient'
import type {ChatMode,CoachRemoteAnswer,CoachChatMessage} from '../lib/coachChatClient'
import {CoachAvatar} from './CoachAvatar'
import {Icon} from './Icon'
import '../styles/ask-coach.css'
type Turn={id:number;query:string;topic:CoachTopic|null;mode:ChatMode;local?:CoachAnswer;remote?:CoachRemoteAnswer;error?:string}
export function AskCoachCard({active,today,snapshot,plan,weather,onDecision,onProgress,onGoals,onSymptoms}:{
 active:boolean;today:string;snapshot:CoachSnapshot;plan:SevenDayPlan;weather?:{date:string;text:string}|null;
 onDecision:()=>void;onProgress:()=>void;onGoals:()=>void;onSymptoms:()=>void
}){
 const [query,setQuery]=useState(''),[mode,setMode]=useState<ChatMode>('local'),[configured,setConfigured]=useState<boolean|null>(null)
 const [consent,setConsent]=useState(false),[turns,setTurns]=useState<Turn[]>([]),[pending,setPending]=useState(false)
 const controller=useRef<AbortController|null>(null),counter=useRef(0),bottom=useRef<HTMLDivElement|null>(null)
 useEffect(()=>{if(!active)return;const c=new AbortController();setConfigured(null);void coachChatStatus(c.signal).then(setConfigured).catch(()=>{if(!c.signal.aborted)setConfigured(false)});return()=>c.abort()},[active])
 useEffect(()=>()=>controller.current?.abort(),[])
 useEffect(()=>{if(active&&turns.length)bottom.current?.scrollIntoView({block:'nearest',behavior:'smooth'})},[active,turns.length,pending])
 const actions={decision:onDecision,progress:onProgress,goals:onGoals,symptoms:onSymptoms}
 const labels={decision:'Tagesentscheidung prüfen',progress:'Analyse öffnen',goals:'Goals öffnen',symptoms:'Beschwerden / Pause'}
 function clear(){controller.current?.abort();controller.current=null;setPending(false);setTurns([]);setQuery('')}
 function switchMode(next:ChatMode){clear();setMode(next);setConsent(false)}
 async function send(raw:string,explicit?:CoachTopic){
  const text=raw.trim();if(!text||pending)return
  const topic=explicit||resolveFollowUp(text,turns.at(-1)?.topic||null,resolveCoachQuestion)
  const id=++counter.current
  const local=answerCoachQuestion({topic,today,snapshot,plan,weather,query:text})
  const safety=topic==='symptoms'
  // Personal weather is always the current shared forecast, never fabricated by an LLM.
  const useLocal=mode==='local'||safety||(mode==='personal'&&topic==='weather')
  if(!useLocal&&(!configured||!consent))return
  setQuery('')
  if(useLocal){setTurns(old=>[...old,{id,query:text,topic,mode,local}].slice(-20));return}
  const history:CoachChatMessage[]=turns.filter(t=>t.mode===mode&&t.remote).slice(-4).flatMap(t=>[{role:'user',content:t.query},{role:'assistant',content:t.remote!.text}] as CoachChatMessage[])
  const c=new AbortController();controller.current=c
  setTurns(old=>[...old,{id,query:text,topic,mode}].slice(-20));setPending(true)
  try{
   const remote=await requestCoachChat(mode as 'personal'|'research',[...history,{role:'user',content:text}],mode==='personal'?buildCoachChatContext({today,snapshot,plan,weather}):'',c.signal)
   if(!c.signal.aborted)setTurns(old=>old.map(t=>t.id===id?{...t,remote}:t))
  }catch(e){
   if(!c.signal.aborted)setTurns(old=>old.map(t=>t.id===id?{...t,error:e instanceof Error?e.message:'KI derzeit nicht erreichbar.',...(mode==='personal'&&topic?{local}:{})}:t))
  }finally{if(controller.current===c){controller.current=null;setPending(false)}}
 }
 const enabled=mode==='local'||(configured===true&&consent)
 return <section className="ask-coach ask-chat" aria-label="Frag deinen Coach">
  <header className="ask-chat-header"><CoachAvatar mood={coachChatMood()} small/><div><span>DEIN TRAININGSPARTNER</span><h2>Frag deinen Coach.</h2><p>Dein Training. Deine Fragen.</p></div><button type="button" className="ask-new" disabled={!turns.length} onClick={clear}>Neu</button></header>
  <div className="ask-modes" role="group" aria-label="Dialogmodus">
   {([['local','Coach'],['personal','KI-Dialog'],['research','Web-Recherche']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>switchMode(key)}>{label}</button>)}
  </div>
  {mode!=='local'&&<div className="ask-consent">
   <p>{configured===null?'KI-Verbindung wird geprüft …':configured?'Externer KI-Dienst · mögliche API-Kosten.':'KI-Schnittstelle noch nicht konfiguriert oder erreichbar. Der lokale Coach bleibt verfügbar.'}</p>
   {configured&&<label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{mode==='personal'?'Für diesen Dialog dürfen meine Fragen, ausgewählte Trainings- und Erholungsauswertungen und die letzten KI-Antworten an OpenAI übermittelt werden.':'Meine Fragen und bisherigen Antworten in diesem Recherche-Dialog dürfen an OpenAI und dessen Websuche übermittelt werden. Keine automatisch mitgesendeten Garmin-Daten. Keine persönlichen Angaben eingeben.'}</label>}
  </div>}
  <details className="ask-suggestions">
   <summary>Beispielfragen</summary>
   <div className="ask-questions" aria-label="Vorgeschlagene Fragen">
    {(mode==='research'?['Was sagt die Forschung zu polarisiertem Training?','Welche Erkenntnisse gibt es zu Ultra-Regeneration?']:COACH_QUESTIONS.map(q=>q.label)).map(q=><button key={q} type="button" disabled={!enabled||pending} onClick={()=>void send(q)}>{q}</button>)}
   </div>
  </details>
  <div className="ask-thread" aria-live="polite" aria-busy={pending}>
   {!turns.length&&<div className="ask-welcome"><CoachAvatar mood={coachChatMood()} small/><p>{mode==='research'?'Was möchtest du über Lauftraining recherchieren?':'Was beschäftigt dich heute? Wir schauen gemeinsam, was dich weiterbringt.'}</p></div>}
   {turns.map(t=><div className="ask-turn" key={t.id}>
    <p className="ask-user">{t.query}</p>
    <div className="ask-reply"><CoachAvatar mood={coachChatMood(t.topic,!t.local&&!t.remote&&!t.error)} small/><div className="ask-bubble">
     {t.error&&<p className="ask-error" role="alert">{t.error}{t.local?' · Lokale Einschätzung:':''}</p>}
     {t.local&&<><strong>{t.local.title}</strong>{t.local.body.map((p,i)=><p key={i}>{p}</p>)}<small>Quelle: {t.local.source}</small>{t.local.action&&<button type="button" onClick={actions[t.local.action]}>{labels[t.local.action]} <Icon name="arrow-up-right"/></button>}</>}
     {t.remote&&<><p className="ask-remote-text">{t.remote.text}</p><small>{t.remote.searched?'KI · Web-Recherche':'KI · ohne Websuche'} · keine Trainingsfreigabe</small>{t.remote.citations.length>0&&<div className="ask-citations">{t.remote.citations.map(c=><a key={c.url} href={c.url} target="_blank" rel="noreferrer">{c.title||c.url} ↗</a>)}</div>}</>}
     {!t.local&&!t.remote&&!t.error&&<p>Coach denkt nach …</p>}
    </div></div>
   </div>)}
   <div ref={bottom}/>
  </div>
  <form className="ask-form" onSubmit={e=>{e.preventDefault();void send(query)}}>
   <label htmlFor="ask-coach-query">Deine Frage</label>
   <div><input id="ask-coach-query" value={query} maxLength={800} onChange={e=>setQuery(e.target.value)} placeholder={mode==='research'?'Was möchtest du recherchieren?':'Was ist heute sinnvoll?'} disabled={!enabled||pending}/><button type="submit" disabled={!query.trim()||!enabled||pending}>Senden <Icon name="arrow-up-right"/></button></div>
  </form>
  <small className="ask-note">{mode==='local'?'Lokaler Coach · bekannte Themen und einfache Rückfragen, kein freier KI-Chat.':mode==='personal'?'KI-Dialog · Trainingskontext, ohne Websuche.':'Web-Recherche · öffentliches Wissen, keine Trainingsdaten.'} Verlauf nur in dieser Ansicht. Keine automatischen Trainingsänderungen.</small>
 </section>
}
