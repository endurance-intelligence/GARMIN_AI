import {useEffect,useState} from 'react'
import {athleteProfileRequest} from '../lib/athleteProfileApi'
import type {ProfileFieldAvailability} from '../lib/athleteProfile.mjs'

const labels:[keyof ProfileFieldAvailability,string][]=[['heightCandidate','Körpergröße'],['ageCandidate','Alter / Geburtsdatum'],['sexCandidate','Geschlecht'],['weightCandidate','Gewicht im Profil']]
const messages:Record<string,string>={'garmin-not-configured':'Garmin-Verbindung noch nicht eingerichtet.','garmin-rate-limited':'Garmin begrenzt gerade Abfragen. Bitte später erneut prüfen.','garmin-unavailable':'Garmin-Profil derzeit nicht erreichbar.','cycle-unavailable':'Keine auswertbaren Zyklusdaten verfügbar.','schema-review':'Garmin liefert Zyklusfelder. Die Phasenzuordnung bleibt ungeprüft.'}
export function HealthDataAvailability({active}:{active:boolean}){
 const [cycle,setCycle]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[fields,setFields]=useState<ProfileFieldAvailability|null>(null)
 useEffect(()=>{if(!active)return;const c=new AbortController();setReady(false);setCycle(false);setFields(null);setNotice('');void athleteProfileRequest(undefined,c.signal).then(d=>{if(!c.signal.aborted){setCycle(d.profile?.cycleEnabled===true);setReady(true)}}).catch(()=>{if(!c.signal.aborted)setNotice('Gesundheitsdatenprüfung derzeit nicht verfügbar.')});return()=>c.abort()},[active])
 async function check(action:'check_profile'|'check_cycle'){
  if(!ready||busy||(action==='check_cycle'&&!cycle))return
  setBusy(true);setNotice('');if(action==='check_profile')setFields(null)
  try{const result=await athleteProfileRequest({action,confirm:true});if(result.status==='profile-checked'&&result.fields){setFields(result.fields);setNotice('Verfügbare Profilfelder geprüft. Noch keine Werte importiert.')}else setNotice(messages[result.status??'']||'Keine bestätigten Daten verfügbar.')}catch{setNotice('Prüfung fehlgeschlagen.')}finally{setBusy(false)}
 }
 return <article className="health-data-availability">
  <small>HEALTH INTELLIGENCE</small><h3>Deine Garmin-Daten</h3>
  <p>Wir prüfen, welche Profilinformationen Garmin bereitstellt, bevor wir zusätzliche Eingaben benötigen. Es werden keine Gesundheitswerte gespeichert oder Trainingspläne geändert.</p>
  <button type="button" className="secondary" disabled={!ready||busy} onClick={()=>void check('check_profile')}>{busy?'Prüfe …':'Profilfelder prüfen'}</button>
  {fields&&<dl>{labels.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{fields[key]?'Feld vorhanden · Bedeutung prüfen':'Nicht im Profil gefunden'}</dd></div>)}</dl>}
  <p>Zyklusabfrage: {ready?(cycle?'Freiwillig erlaubt':'Nicht freigegeben'):'Noch nicht geprüft'}. Den automatischen Import kannst du separat unter Mehr → Gesundheit steuern.</p>
  {cycle&&<button type="button" className="secondary" disabled={!ready||busy} onClick={()=>void check('check_cycle')}>Zyklusdaten prüfen</button>}
  {notice&&<p role="status">{notice}</p>}
 </article>
}
