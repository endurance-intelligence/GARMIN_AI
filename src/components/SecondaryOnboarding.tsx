import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {IntervalsConnection} from './IntervalsConnection'
import {TrainingRhythmSettings} from './TrainingRhythmSettings'
import {EquipmentProfileSettings} from './EquipmentProfileSettings'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/secondary-onboarding.css'

const stages=['Garmin','Intervals.icu','Trainingsrhythmus','Ausrüstung','Abschluss']
export function SecondaryOnboarding({userId,children}:{userId:string;children:ReactNode}){
 const key='garmin-ai-onboarding-v1:'+userId
 const [step,setStep]=useState(0)
 const [finished,setFinished]=useState(()=>{try{return localStorage.getItem(key)==='done'}catch{return false}})
 const [garmin,setGarmin]=useState<'checking'|'available'|'pending'|'unknown'>('checking')
 const [revision,setRevision]=useState(0)
 useEffect(()=>{const open=()=>{setStep(0);setFinished(false)};window.addEventListener('garmin-ai-open-onboarding',open);return()=>window.removeEventListener('garmin-ai-open-onboarding',open)},[])
 useEffect(()=>{
  if(finished||step!==0||!garminSupabase)return
  const c=new AbortController()
  setGarmin('checking')
  void garminSupabase.auth.getSession().then(async({data})=>{
   if(!data.session)throw Error('Login required')
   const response=await fetch(garminSupabaseUrl+'/functions/v1/read-garmin-health',{cache:'no-store',signal:c.signal,headers:{authorization:'Bearer '+data.session.access_token,apikey:garminPublishableKey}})
   if(!response.ok)throw Error('Garmin status unavailable')
   const result=await response.json()
   if(!c.signal.aborted)setGarmin(Array.isArray(result.metrics)&&result.metrics.length?'available':'pending')
  }).catch(()=>{if(!c.signal.aborted)setGarmin('unknown')})
  return()=>c.abort()
 },[finished,step,revision])
 if(finished)return <>{children}</>
 function finish(){try{localStorage.setItem(key,'done')}catch{}setFinished(true)}
 return <main className="onboarding-shell" aria-label="GARMIN_AI Einrichtungsassistent">
  <header><span className="micro-label">DEIN PERSÖNLICHER COACH</span><h1>Willkommen bei GARMIN_AI.</h1><p>Wir richten deine eigenen Verbindungen und Trainingsmöglichkeiten ein. Keine fremden Trainingsvorgaben, keine automatische Workout-Freigabe.</p></header>
  <ol className="onboarding-steps" aria-label="Einrichtungsschritte">{stages.map((label,i)=><li key={label} aria-current={i===step?'step':undefined}><button type="button" onClick={()=>setStep(i)}><span>{i+1}</span>{label}</button></li>)}</ol>
  <section className="onboarding-step">
   <p className="micro-label">SCHRITT {step+1} / {stages.length}</p>
   {step===0&&<><h2>Dein Garmin-Konto</h2><p>Verwende dein eigenes Garmin-Connect-Konto. Der persönliche Garmin-Import muss einmalig durch die Administration mit deinem eigenen Zugang eingerichtet werden. Kein Garmin-Passwort oder API-Key wird hier abgefragt.</p><p role="status">{garmin==='available'?'Eigene Gesundheitsdaten sind vorhanden.':garmin==='pending'?'Noch keine Gesundheitsdaten importiert.':garmin==='checking'?'Prüfe Datenimport …':'Datenimport momentan nicht prüfbar.'}</p><button type="button" onClick={()=>setRevision(n=>n+1)}>Import erneut prüfen</button></>}
   {step===1&&<><h2>Trainings auf deine Uhr übertragen</h2><p>Erstelle bei Bedarf dein eigenes <a href="https://intervals.icu/" target="_blank" rel="noreferrer">Intervals.icu-Konto</a>, verbinde Garmin und aktiviere die Übertragung geplanter Workouts. Füge danach deinen persönlichen API-Key im geschützten Formular ein.</p><IntervalsConnection active/></>}
   {step===2&&<><h2>Wann möchtest du trainieren?</h2><p>Wähle freiwillige Tage und Dauer für Rudern und Stabi. Du kannst alle Tage freilassen. Speichere deine Auswahl ausdrücklich.</p><TrainingRhythmSettings active expanded onSaved={()=>{}}/></>}
   {step===3&&<><h2>Was steht dir zur Verfügung?</h2><EquipmentProfileSettings active/></>}
   {step===4&&<><h2>Dein Coach ist für dich da.</h2><p>Öffne anschließend Goals und lege bei Bedarf dein eigenes Ziel fest. Du kannst auch ohne Wettkampfziel trainieren. Der Coach verwendet deine eigenen Garmin-Daten, nicht die Leistung eines anderen Athleten.</p><p>Übersprungene Schritte bleiben offen. Die Einrichtung hier abzuschließen bestätigt keine Garmin-Verbindung oder gespeicherten Einstellungen. Alles lässt sich später in den Einstellungen ergänzen.</p></>}
  </section>
  <footer><button type="button" disabled={step===0} onClick={()=>setStep(i=>Math.max(0,i-1))}>Zurück</button>{step<stages.length-1?<button type="button" className="primary" onClick={()=>setStep(i=>i+1)}>Weiter / später ergänzen</button>:<button type="button" className="primary" onClick={finish}>Zum Dashboard</button>}</footer>
  <button type="button" className="secondary" onClick={()=>void garminSupabase?.auth.signOut()}>Abmelden</button>
 </main>
}
