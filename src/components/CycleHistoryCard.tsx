import {useEffect,useState} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import type {CycleState} from '../lib/cycleHistory.mjs'
import {cycleToday} from '../lib/cycleHistory.mjs'
import {HealthHistoryChart} from './HealthHistoryChart'
async function request(body?:Record<string,unknown>,signal?:AbortSignal){
 const session=(await garminSupabase?.auth.getSession())?.data.session
 if(!session)throw Error('Login')
 const r=await fetch(garminSupabaseUrl+'/functions/v1/garmin-athlete-profile?cycle=1',{method:body?'POST':'GET',signal,cache:'no-store',headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,confirm:true})}:{})})
 if(!r.ok)throw Error('Cycle unavailable')
 return await r.json() as CycleState
}
export function CycleHistoryCard({active}:{active:boolean}){
 const [state,setState]=useState<CycleState|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[accepted,setAccepted]=useState(false)
 useEffect(()=>{if(!active)return;const c=new AbortController();setState(null);setAccepted(false);setNotice('');void request(undefined,c.signal).then(d=>{if(!c.signal.aborted)setState(d)}).catch(()=>{if(!c.signal.aborted)setNotice('Zyklusbereich aktuell nicht erreichbar.')});return()=>c.abort()},[active])
 async function action(body:Record<string,unknown>){
  if(busy)return
  setBusy(true);setNotice('')
  try{const d=await request(body);setState(d);setAccepted(false)}catch{setNotice('Änderung oder Abgleich nicht bestätigt. Bitte später erneut prüfen.')}finally{setBusy(false)}
 }
 if(!active)return null
 const today=cycleToday(),latest=state?.observations.at(-1)
 return <section className="health-section"><details className="health-profile-card" open={state?.enabled||undefined}><summary>Zyklus & Wohlbefinden · freiwillig</summary>
 <p>Auf Wunsch wird dein in Garmin erfasster Zyklustag beim Gesundheitsabgleich gespeichert. Damit können später persönliche Muster mit Schlaf, HRV, Ruhepuls und Gewicht verglichen werden. Keine Fruchtbarkeits- oder Schwangerschaftsprognose.</p>
 <p>Es werden nur Datum und plausibler, nicht als Prognose gekennzeichneter Zyklustag gespeichert, keine Symptome, Notizen oder Schwangerschaftsdaten. Verlauf: bis zu 180 Tage. Freigabe jederzeit widerrufen und den gespeicherten Verlauf löschen.</p>
 {state?.enabled?<><p>Automatischer Import freigegeben.</p><p>{latest?'Letzte verfügbare Beobachtung: '+latest.date+' · Zyklustag '+latest.dayInCycle:'Noch kein bestätigter Zyklustag gespeichert.'}</p>
 {state.lastAttempt&&<p>Letzter Abgleich: {state.lastAttempt} · {state.status==='stored'?'Zyklustag übernommen':state.status==='pending'?'Abgleich begonnen':'Keine eindeutig auswertbaren Daten'}</p>}
 <HealthHistoryChart points={state.observations.map(o=>({date:o.date,value:o.dayInCycle}))} end={today} label="Zyklustag" unit="Tag"/>
 <button type="button" className="secondary" disabled={busy||state.lastAttempt===today} onClick={()=>void action({action:'sync_cycle_today'})}>Heute abgleichen</button> <button type="button" className="secondary" disabled={busy} onClick={()=>{if(window.confirm('Automatischen Zyklusimport deaktivieren und den gespeicherten Verlauf löschen?'))void action({action:'cycle_consent',enabled:false})}}>Deaktivieren & Verlauf löschen</button></>:state&&<>
 <label><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/> Ich erlaube ausdrücklich den täglichen Import und die Speicherung meiner Zyklustage für meine persönliche Gesundheitsanalyse.</label>
 <p><button type="button" className="primary" disabled={!accepted||busy} onClick={()=>void action({action:'cycle_consent',enabled:true})}>Automatischen Import aktivieren</button></p></>}
 {notice&&<p role="status">{notice}</p>}
 </details></section>
}
