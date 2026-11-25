import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import {EQUIPMENT_OPTIONS,normalizeEquipmentProfile} from '../lib/equipmentProfile.mjs'
import type {EquipmentId,EquipmentProfile} from '../lib/equipmentProfile.mjs'
import '../styles/equipment-profile.css'
async function request(profile?:EquipmentProfile,signal?:AbortSignal){
 if(!garminSupabase)throw Error('Bitte zuerst anmelden.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte zuerst anmelden.')
 const r=await fetch(garminSupabaseUrl+'/functions/v1/garmin-equipment-profile',{signal,cache:'no-store',method:profile?'POST':'GET',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,...(profile?{'content-type':'application/json'}:{})},...(profile?{body:JSON.stringify({action:'save',confirm:true,profile})}:{})})
 const data=await r.json().catch(()=>({}))
 if(!r.ok)throw Error(data.error||'Ausrüstungsprofil nicht erreichbar.')
 if(profile&&data.saved!==true)throw Error('Speicherung nicht bestätigt.')
 if(data.profile===null)return null
 const value=normalizeEquipmentProfile(data.profile)
 if(!value)throw Error('Ausrüstungsprofil ungültig.')
 return value
}
export function EquipmentProfileSettings({active}:{active:boolean}){
 const [saved,setSaved]=useState<EquipmentProfile|null>(null),[available,setAvailable]=useState<EquipmentId[]>([]),[incline,setIncline]=useState('')
 const [loading,setLoading]=useState(true),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{if(!active)return;const c=new AbortController();setLoading(true);setReady(false);setError('');setNotice('');void request(undefined,c.signal).then(p=>{if(c.signal.aborted)return;setSaved(p);setAvailable(p?.available||[]);setIncline(p?.treadmillMaxInclinePct==null?'':String(p.treadmillMaxInclinePct));setReady(true)}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'Profil nicht verfügbar.')}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort()},[active,retry])
 if(!active)return null
 const draft=normalizeEquipmentProfile({available,treadmillMaxInclinePct:available.includes('treadmill')&&incline.trim()!==''?Number(incline):null})
 const dirty=!saved||JSON.stringify(draft)!==JSON.stringify(saved)
 function toggle(id:EquipmentId){setAvailable(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);if(id==='treadmill'&&available.includes(id))setIncline('');setNotice('')}
 async function save(){if(!draft||!ready||busy)return;setBusy(true);setNotice('');setError('');try{const p=await request(draft);if(!p)throw Error('Speicherung nicht bestätigt.');setSaved(p);setAvailable(p.available);setIncline(p.treadmillMaxInclinePct==null?'':String(p.treadmillMaxInclinePct));setNotice('Profil gespeichert. Der Coach berücksichtigt deine Auswahl.');window.dispatchEvent(new Event('garmin-ai-coach-changed'))}catch(e){setError(e instanceof Error?e.message:'Speicherung fehlgeschlagen.')}finally{setBusy(false)}}
 return <section className="eq-profile" aria-label="Persönliche Trainingsausrüstung">
  <header><div><small>DEIN TRAININGSSTUDIO</small><h3>Trainiere mit dem, was du hast.</h3><p>Wähle aus, welche Trainingsmöglichkeiten du dem Coach zur Verfügung stellst. Kein Rückschluss aus alten Aktivitäten.</p></div><span>{saved?saved.available.length+' verfügbar':'Noch nicht eingerichtet'}</span></header>
  {loading&&<p role="status">Ausrüstungsprofil wird geladen …</p>}
  {error&&<p role="alert" className="eq-error">{error}</p>}
  {!loading&&!ready&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Erneut laden</button>}
  {ready&&<><div className="eq-grid">{EQUIPMENT_OPTIONS.map(item=><label key={item.id} className={'eq-option'+(available.includes(item.id)?' is-on':'')}><input type="checkbox" checked={available.includes(item.id)} onChange={()=>toggle(item.id)} disabled={busy}/><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div>
  {available.includes('treadmill')&&<label className="eq-incline">Maximale Steigung des Laufbands (optional, %)<input type="number" min={0} max={40} step={0.1} value={incline} onChange={e=>{setIncline(e.target.value);setNotice('')}} placeholder="Nicht bekannt" disabled={busy}/><small>Gerätegrenze, kein Trainingsziel. Ohne Angabe wird keine maximale Steigung angenommen.</small></label>}
  <div className="eq-footer"><p>Deine Auswahl wird privat gespeichert und auf anderen Geräten übernommen. Schuhe bleiben in Garmin. Keine automatischen Kalenderänderungen.</p><button type="button" disabled={!draft||!dirty||busy} onClick={()=>void save()}>{busy?'Speichere …':dirty?'Profil speichern':'Gespeichert'}</button></div>
  {notice&&<p role="status" className="eq-notice">{notice}</p>}</>}
 </section>
}
