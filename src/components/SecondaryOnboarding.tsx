import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import {IntervalsConnection} from './IntervalsConnection'
import {TrainingRhythmSettings} from './TrainingRhythmSettings'
import {EquipmentProfileSettings} from './EquipmentProfileSettings'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {ATHLETE_SPORTS,ATHLETE_LEVELS,ATHLETE_GOALS,emptyAthleteProfile,normalizeAthleteProfile} from '../lib/athleteProfile.mjs'
import type {AthleteProfile} from '../lib/athleteProfile.mjs'
import {athleteProfileRequest} from '../lib/athleteProfileApi'
import {ensureEmptyTrainingRhythm} from '../lib/trainingHistoryApi'
import '../styles/secondary-onboarding.css'

const stages=['Garmin','Intervals.icu','Sportarten','Trainingsrhythmus','Trainingsziel','Women’s Health','Abschluss']
const weekdays=['Mo','Di','Mi','Do','Fr','Sa','So']
export function SecondaryOnboarding({userId,children}:{userId:string;children:ReactNode}){
 const key='garmin-ai-onboarding-v1:'+userId
 const [step,setStep]=useState(0)
 const [finished,setFinished]=useState(()=>{try{return localStorage.getItem(key)==='done'}catch{return false}})
 const [garmin,setGarmin]=useState<'checking'|'available'|'pending'|'unknown'>('checking')
 const [revision,setRevision]=useState(0)
 const [profile,setProfile]=useState<AthleteProfile>(emptyAthleteProfile)
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [savedCycle,setSavedCycle]=useState(false),[keyConfigured,setKeyConfigured]=useState(false)
 useEffect(()=>{if(finished)return;const c=new AbortController();setReady(false);setError('');void athleteProfileRequest(undefined,c.signal).then(d=>{if(c.signal.aborted)return;setProfile(normalizeAthleteProfile(d.profile)||emptyAthleteProfile());setSavedCycle(d.profile?.cycleEnabled===true);setKeyConfigured(d.garminKeyConfigured===true);setReady(true)}).catch(()=>{if(!c.signal.aborted)setError('Profil konnte nicht geladen werden. Bitte erneut öffnen oder später einrichten.')});return()=>c.abort()},[finished])
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
 const normalized=normalizeAthleteProfile(profile)
 async function save(){
  if(!normalized||!ready||busy)return
  setBusy(true);setError('')
  try{await ensureEmptyTrainingRhythm();const d=await athleteProfileRequest({action:'save',confirm:true,profile:normalized});if(!d.saved||!normalizeAthleteProfile(d.profile))throw Error('Speicherung nicht bestätigt');setSavedCycle(d.profile!.cycleEnabled);finish()}catch(e){setError(e instanceof Error?e.message:'Speichern fehlgeschlagen')}finally{setBusy(false)}
 }
 async function checkCycle(){
  if(!savedCycle||!profile.cycleEnabled||busy)return
  setBusy(true);setError('');setNotice('')
  try{const d=await athleteProfileRequest({action:'check_cycle',confirm:true});setNotice(d.status==='schema-review'?'Garmin liefert Zyklusfelder. Die genaue Phasenzuordnung muss noch verifiziert werden.':d.status==='garmin-rate-limited'?'Garmin begrenzt gerade Abfragen. Der gemeinsame API-Schutz bleibt aktiv.':d.status==='garmin-not-configured'?'Der persönliche Garmin-Key ist noch nicht eingerichtet.':'Keine auswertbaren Zyklusdaten verfügbar. Prüfe Garmin Connect.')}catch{setError('Zyklusabfrage nicht möglich.')}finally{setBusy(false)}
 }
 function toggleSport(id:string){setProfile(p=>({...p,sports:p.sports.includes(id)?p.sports.filter(x=>x!==id):[...p.sports,id]}))}
 const labelOf=(value:string|null,options:Array<[string,string]>)=>options.find(([id])=>id===value)?.[1]||'Noch offen'
 return <main className="onboarding-shell" aria-label="GARMIN_AI Einrichtungsassistent">
  <header><span className="micro-label">DEIN PERSÖNLICHER COACH</span><h1>Willkommen bei GARMIN_AI.</h1><p>Wir richten deine eigenen Verbindungen und Trainingsmöglichkeiten ein. Keine fremden Trainingsvorgaben, keine automatische Workout-Freigabe.</p></header>
  <ol className="onboarding-steps" aria-label="Einrichtungsschritte">{stages.map((label,i)=><li key={label} aria-current={i===step?'step':undefined}><button type="button" onClick={()=>setStep(i)}><span>{i+1}</span>{label}</button></li>)}</ol>
  <section className="onboarding-step">
   <p className="micro-label">SCHRITT {step+1} / {stages.length}</p>
   {step===0&&<><h2>Dein Garmin-Konto</h2><p>1. Melde dich mit deinem eigenen Garmin-Connect-Konto an.</p><p>2. Öffne <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noreferrer">Personal API Key</a>, erstelle einen Schlüssel und wähle die Laufzeit (bis zu einem Jahr).</p><p>3. Hinterlege ihn einmalig mit der Administration ausschließlich als GARMIN_API_KEY im eigenen Supabase-Projekt. Nicht per Chat oder E-Mail teilen. {keyConfigured?'Ein Schlüssel ist serverseitig hinterlegt; die Verbindung muss noch bestätigt werden.':'Noch kein Schlüssel bestätigt.'}</p><p>4. Prüfe danach den Datenimport. Eine eigene Intervals.icu-Verbindung folgt im nächsten Schritt.</p><p role="status">{garmin==='available'?'Eigene Gesundheitsdaten sind vorhanden.':garmin==='pending'?'Noch keine Gesundheitsdaten importiert.':garmin==='checking'?'Prüfe Datenimport …':'Datenimport momentan nicht prüfbar.'}</p><button type="button" onClick={()=>setRevision(n=>n+1)}>Import erneut prüfen</button></>}
   {step===1&&<><h2>Trainings auf deine Uhr übertragen</h2><p>Erstelle bei Bedarf dein eigenes <a href="https://intervals.icu/" target="_blank" rel="noreferrer">Intervals.icu-Konto</a>, verbinde Garmin und aktiviere die Übertragung geplanter Workouts. Füge danach deinen persönlichen API-Key im geschützten Formular ein.</p><IntervalsConnection active/></>}
   {step===2&&<><h2>Welche Sportarten möchtest du machen?</h2><fieldset disabled={!ready||busy} className="onboarding-fields"><legend>Mehrfachauswahl</legend>{ATHLETE_SPORTS.map(([id,label])=><label key={id}><input type="checkbox" checked={profile.sports.includes(id)} onChange={()=>toggleSport(id)}/>{label}</label>)}</fieldset><EquipmentProfileSettings active/></>}
   {step===3&&<><h2>Wann möchtest du trainieren?</h2><div className="onboarding-fields"><label>Trainingstage pro Woche <select value={profile.daysPerWeek??''} disabled={!ready||busy} onChange={e=>setProfile(p=>({...p,daysPerWeek:e.target.value?Number(e.target.value):null,preferredDays:[]}))}><option value="">Bitte auswählen</option>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Zeit pro Einheit <select value={profile.sessionMinutes??''} disabled={!ready||busy} onChange={e=>setProfile(p=>({...p,sessionMinutes:e.target.value?Number(e.target.value):null}))}><option value="">Bitte auswählen</option>{[15,20,30,45,60,75,90,120,150,180].map(n=><option key={n} value={n}>{n} Min.</option>)}</select></label><fieldset disabled={!ready||busy||!profile.daysPerWeek}><legend>Bevorzugte Tage (optional)</legend>{weekdays.map((d,i)=><label key={d}><input type="checkbox" checked={profile.preferredDays.includes(i+1)} disabled={!profile.preferredDays.includes(i+1)&&profile.preferredDays.length>=(profile.daysPerWeek??0)} onChange={()=>setProfile(p=>({...p,preferredDays:p.preferredDays.includes(i+1)?p.preferredDays.filter(x=>x!==i+1):[...p.preferredDays,i+1]}))}/>{d}</label>)}</fieldset></div><TrainingRhythmSettings active expanded onSaved={()=>{}}/></>}
   {step===4&&<><h2>Was möchtest du erreichen?</h2><fieldset className="onboarding-fields" disabled={!ready||busy}><legend>Trainingsziel</legend>{ATHLETE_GOALS.map(([id,label])=><label key={id}><input type="radio" name="onboarding-goal" checked={profile.goal===id} onChange={()=>setProfile(p=>({...p,goal:id}))}/>{label}</label>)}</fieldset><fieldset className="onboarding-fields" disabled={!ready||busy}><legend>Dein aktueller Trainingsstand</legend>{ATHLETE_LEVELS.map(([id,label])=><label key={id}><input type="radio" name="onboarding-level" checked={profile.level===id} onChange={()=>setProfile(p=>({...p,level:id}))}/>{label}</label>)}</fieldset>{profile.goal==='race'&&<p>Wettkampf, Datum und Distanz anschließend unter Goals festlegen. Kein voreingestelltes fremdes Wettkampfziel.</p>}</>}
   {step===5&&<><h2>Women's Health – freiwillig</h2><p>Der Coach kann nach deiner ausdrücklichen Freigabe die Verfügbarkeit von Zyklusdaten in Garmin prüfen. Keine pauschalen Trainingsregeln nach Zyklusphase; keine Diagnosen. Deine Entscheidung kannst du hier jederzeit ändern.</p><label className="onboarding-fields"><input type="checkbox" disabled={!ready||busy} checked={profile.cycleEnabled} onChange={e=>setProfile(p=>({...p,cycleEnabled:e.target.checked}))}/>Ich möchte die Zyklusabfrage aus Garmin für meinen persönlichen Coach erlauben.</label><p>Die Freigabe wird erst beim Speichern übernommen. Aktuell erfolgt nur die ausdrücklich gestartete Verfügbarkeitsprüfung; noch kein automatischer Import oder zyklusbasierter Trainingsvorschlag.</p>{savedCycle&&profile.cycleEnabled&&<button type="button" disabled={busy} onClick={()=>void checkCycle()}>Zyklusdaten prüfen</button>}</>}
   {step===6&&<><h2>Dein persönliches Profil</h2><dl><dt>Sportarten</dt><dd>{profile.sports.map(id=>labelOf(id,ATHLETE_SPORTS)).join(', ')||'Noch offen'}</dd><dt>Trainingstage / Zeit</dt><dd>{profile.daysPerWeek??'–'} Tage / {profile.sessionMinutes??'–'} Min.</dd><dt>Ziel</dt><dd>{labelOf(profile.goal,ATHLETE_GOALS)}</dd><dt>Trainingsstand</dt><dd>{labelOf(profile.level,ATHLETE_LEVELS)}</dd><dt>Zyklusabfrage</dt><dd>{profile.cycleEnabled?'Freiwillig erlaubt':'Aus'}</dd></dl><p>Die persönlichen Präferenzen werden separat gespeichert. Die automatische Trainingsplanung nach diesem Profil wird noch integriert. Übersprungene Verbindungen bleiben offen.</p>{!normalized&&<p role="status">Bitte Sportarten, Trainingstage, Zeit, Ziel und Trainingsstand auswählen, um das Profil zu speichern.</p>}</>}
   {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </section>
  <footer><button type="button" disabled={step===0} onClick={()=>setStep(i=>Math.max(0,i-1))}>Zurück</button>{step<stages.length-1?<button type="button" className="primary" onClick={()=>setStep(i=>i+1)}>Weiter / später ergänzen</button>:<button type="button" className="primary" disabled={!normalized||!ready||busy} onClick={()=>void save()}>{busy?'Speichere …':'Profil speichern & Dashboard'}</button>}</footer>
  <button type="button" className="secondary" disabled={busy} onClick={finish}>Später vervollständigen</button> <button type="button" className="secondary" disabled={busy} onClick={()=>void garminSupabase?.auth.signOut()}>Abmelden</button>
 </main>
}
