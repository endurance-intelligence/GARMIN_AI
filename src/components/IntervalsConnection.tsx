import {useEffect,useState} from 'react'
import type {FormEvent} from 'react'
import {garminSupabase,garminSupabaseUrl,garminPublishableKey} from '../lib/garminSupabase'
import '../styles/intervals-connection.css'

type Status={configured:boolean;connectedAt:string|null}
async function callIntervals(body?:Record<string,unknown>):Promise<Record<string,unknown>>{
 if(!garminSupabase)throw Error('Supabase ist nicht eingerichtet.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte zuerst unter Konto anmelden.')
 const result=await fetch(garminSupabaseUrl+'/functions/v1/garmin-intervals',{
  method:body?'POST':'GET',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 })
 const json=await result.json().catch(()=>({})) as Record<string,unknown>
 if(!result.ok)throw Error(typeof json.error==='string'?json.error:'Intervals.icu: HTTP '+result.status)
 return json
}
export function IntervalsConnection({active}:{active:boolean}){
 const [connected,setConnected]=useState(false)
 const [loaded,setLoaded]=useState(false)
 const [key,setKey]=useState('')
 const [busy,setBusy]=useState(false)
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 const [confirmDisconnect,setConfirmDisconnect]=useState(false)
 useEffect(()=>{
  if(!active)return
  let mounted=true
  void callIntervals().then(value=>{
   if(mounted){setConnected((value as unknown as Status).configured===true);setLoaded(true)}
  }).catch(e=>{if(mounted){setError(e instanceof Error?e.message:'Status nicht abrufbar');setLoaded(true)}})
  return ()=>{mounted=false}
 },[active])
 async function connect(e:FormEvent<HTMLFormElement>){
  e.preventDefault()
  if(busy)return
  setBusy(true);setError('');setNotice('')
  try{
   const result=await callIntervals({action:'connect',apiKey:key.trim()})
   if(result.connected!==true)throw Error('Intervals-Verbindung wurde nicht bestätigt')
   setKey('');setConnected(true);setConfirmDisconnect(false)
   setNotice('Intervals.icu verbunden. Trainings werden erst nach deiner ausdrücklichen Freigabe übertragen.')
  }catch(e){setError(e instanceof Error?e.message:'Verbindung fehlgeschlagen')}
  finally{setBusy(false)}
 }
 async function disconnect(){
  if(!confirmDisconnect){setConfirmDisconnect(true);return}
  setBusy(true);setError('');setNotice('')
  try{
   await callIntervals({action:'disconnect'})
   setConnected(false);setConfirmDisconnect(false)
   setNotice('Verbindung getrennt. Bereits übertragene Trainings bleiben bei Intervals.icu bestehen.')
  }catch(e){setError(e instanceof Error?e.message:'Trennung fehlgeschlagen')}
  finally{setBusy(false)}
 }
 return <article className="gi-connection" id="settings-intervals">
  <div className="gi-heading"><div>
   <span className="micro-label">TRAININGSÜBERTRAGUNG / INTERVALS.ICU</span>
   <h3>Dein Weg auf die Garmin-Uhr</h3>
   <p>GARMIN_AI → Intervals.icu → Garmin Connect. Die Garmin Personal API bleibt lesend.</p>
  </div><span className={'gi-status '+(connected?'is-on':'')}>
   {connected?'● Verbunden':loaded?'○ Nicht verbunden':'Prüfe …'}</span></div>
  {connected?
   <div className="gi-connected">
    <p>Du kannst freigegebene Trainings aus dem Kalender an Intervals.icu senden. Danach synchronisierst du deine Forerunner 965.</p>
    <button type="button" disabled={busy} className="secondary" onClick={()=>void disconnect()}>
     {confirmDisconnect?'Trennung bestätigen':'Verbindung trennen'}</button>
    {confirmDisconnect&&<button type="button" className="secondary" onClick={()=>setConfirmDisconnect(false)}>Abbrechen</button>}
   </div>
  :<form onSubmit={e=>void connect(e)}>
    <label htmlFor="gi-api-key">Intervals.icu API-Key</label>
    <div className="gi-form-row">
     <input id="gi-api-key" type="password" required minLength={12} autoComplete="off"
       placeholder="Persönlichen API-Key einfügen" value={key} onChange={e=>setKey(e.target.value)}/>
     <button className="primary" disabled={busy||key.trim().length<12} type="submit">
      {busy?'Prüfe …':'Verbinden'}</button>
    </div>
    <p>Du findest den Schlüssel bei <a href="https://intervals.icu/settings" target="_blank" rel="noreferrer">Intervals.icu → Settings → Developer Settings</a>.
     Der Schlüssel wird verschlüsselt in Supabase Vault gespeichert und nicht im Browser behalten.</p>
   </form>}
  <div className="gi-how">
   <strong>Einmalig bei Intervals.icu</strong>
   <p>Unter Garmin die Option <b>Upload planned workouts</b> aktivieren. Erst dadurch gelangen unsere Trainings von Intervals.icu nach Garmin Connect.</p>
  </div>
  {notice&&<p className="gi-notice" role="status">{notice}</p>}
  {error&&<p className="gi-error" role="alert">{error}</p>}
 </article>
}
