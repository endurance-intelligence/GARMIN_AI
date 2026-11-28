import {useEffect,useState} from 'react'
import {emptyHealthPreferences,normalizeHealthPreferences} from '../lib/healthPreferences.mjs'
import type {HealthPreferences} from '../lib/healthPreferences.mjs'
import {healthPreferencesRequest} from '../lib/healthPreferencesApi'
export function HealthProfileCard({active,onPreferences}:{active:boolean;onPreferences:(p:HealthPreferences|null)=>void}){
 const [prefs,setPrefs]=useState<HealthPreferences>(emptyHealthPreferences),[height,setHeight]=useState(''),[year,setYear]=useState('')
 const [date,setDate]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 useEffect(()=>{if(!active)return;const c=new AbortController();setReady(false);setNotice('');onPreferences(null)
  void healthPreferencesRequest(undefined,c.signal).then(d=>{if(c.signal.aborted)return;const p=normalizeHealthPreferences(d.preferences,d.date);if(!p)throw Error('Invalid profile');setPrefs(p);setDate(d.date);setHeight(p.heightCm===null?'':String(p.heightCm));setYear(p.birthYear===null?'':String(p.birthYear));onPreferences(p);setReady(true)}).catch(()=>{if(!c.signal.aborted)setNotice('Gesundheitsprofil konnte nicht geladen werden.')})
  return()=>c.abort()
 },[active,onPreferences])
 async function save(){
  if(!ready||busy)return
  const next=normalizeHealthPreferences({...prefs,heightCm:height.trim()===''?null:Number(height),birthYear:year.trim()===''?null:Number(year)},date)
  if(!next){setNotice('Bitte Eingaben und Altersbestätigung prüfen.');return}
  setBusy(true);setNotice('')
  try{const d=await healthPreferencesRequest({action:'save_health',preferences:next});if(!d.saved||!normalizeHealthPreferences(d.preferences,d.date))throw Error('Save failed');setPrefs(d.preferences);onPreferences(d.preferences);setNotice('Gesundheitsprofil gespeichert.');window.dispatchEvent(new Event('garmin-ai-health-preferences-changed'))}catch{setNotice('Speicherung nicht bestätigt.')}finally{setBusy(false)}
 }
 async function prefill(){
  if(!ready||busy)return
  setBusy(true);setNotice('')
  try{const d=await healthPreferencesRequest({action:'prefill_health'});if(d.status==='profile-prefill'&&d.candidate){const c=d.candidate;if(c.heightCm!==null)setHeight(String(c.heightCm));if(c.birthYear!==null)setYear(String(c.birthYear));setNotice(c.heightCm===null&&c.birthYear===null?'Keine eindeutig bezeichneten Profilwerte gefunden. Du kannst sie freiwillig ergänzen.':'Garmin-Vorschlag übernommen. Bitte prüfen und selbst speichern.')}else setNotice(d.status==='garmin-rate-limited'?'Garmin-Abfragen vorübergehend begrenzt.':'Garmin-Profil aktuell nicht verfügbar.')}catch{setNotice('Garmin-Profil konnte nicht gelesen werden.')}finally{setBusy(false)}
 }
 return <article className="health-profile-card"><h3>Dein Gesundheitsprofil</h3><p>Freiwillige Angaben. Der BMI ist nur eine grobe Orientierung bei Erwachsenen und unterscheidet nicht zwischen Muskel- und Fettmasse.</p>
  <button type="button" className="secondary" disabled={!ready||busy} onClick={()=>void prefill()}>Aus Garmin übernehmen (Vorschlag)</button>
  <fieldset disabled={!ready||busy}><legend>Persönliche Angaben</legend>
   <label>Körpergröße (cm) <input type="number" min="100" max="250" step="0.1" value={height} onChange={e=>setHeight(e.target.value)} placeholder="Optional"/></label>
   <label>Geburtsjahr <input type="number" min="1900" max={date?Number(date.slice(0,4)):undefined} step="1" value={year} onChange={e=>setYear(e.target.value)} placeholder="Optional"/></label>
   <label><input type="checkbox" checked={prefs.adultConfirmed} onChange={e=>setPrefs(p=>({...p,adultConfirmed:e.target.checked}))}/> Ich bin mindestens 18 Jahre alt und möchte die Gewichtsfunktionen nutzen.</label>
   <label>Wiege-Erinnerung im Coach <select value={prefs.weighReminder} onChange={e=>setPrefs(p=>({...p,weighReminder:e.target.value as HealthPreferences['weighReminder']}))}><option value="off">Aus</option><option value="daily">Täglich</option><option value="three-weekly">Mo / Mi / Fr</option></select></label>
  </fieldset><p>Keine Zielvorgabe, keine Push-Nachrichten. Du kannst Messungen jederzeit auslassen oder die Erinnerung abschalten.</p>
  <button type="button" className="primary" disabled={!ready||busy} onClick={()=>void save()}>{busy?'Prüfe …':'Profil speichern'}</button>
  {notice&&<p role="status">{notice}</p>}
 </article>
}
