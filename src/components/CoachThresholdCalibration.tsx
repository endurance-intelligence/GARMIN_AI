import {useEffect,useState} from 'react'
import {garminPublishableKey,garminSupabase,garminSupabaseUrl} from '../lib/garminSupabase'
import {validateThresholdCalibration} from '../lib/coachThresholds.mjs'
import type {ThresholdCalibration} from '../lib/coachThresholds.mjs'
import '../styles/coach-threshold-calibration.css'

const labels:Record<ThresholdCalibration['test_type'],string>={
 lab_lactate:'Laktatdiagnostik im Labor',
 lab_ventilatory:'Spiroergometrie / Atemgasanalyse im Labor',
 field_test:'Dokumentierter Feldtest (Schätzung)'
}
async function request(method:'GET'|'POST',body?:Record<string,unknown>){
 if(!garminSupabase)throw Error('Die Anmeldung ist derzeit nicht verfügbar.')
 const {data:{session}}=await garminSupabase.auth.getSession()
 if(!session)throw Error('Bitte zuerst anmelden.')
 const resp=await fetch(garminSupabaseUrl+'/functions/v1/garmin-threshold-calibration',{
  method,cache:'no-store',headers:{
   authorization:'Bearer '+session.access_token,apikey:garminPublishableKey,
   ...(body?{'content-type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})
 })
 const data=await resp.json().catch(()=>({})) as {
  saved?:boolean;calibration?:ThresholdCalibration|null;error?:string}
 if(!resp.ok)throw Error(data.error||'Schwellenprofil nicht verfügbar ('+resp.status+')')
 return data
}
export function CoachThresholdCalibration({active,today,calibration,onChange}:{
 active:boolean;today:string;calibration:ThresholdCalibration|null;
 onChange:(next:ThresholdCalibration|null)=>void
}){
 const [lt1,setLt1]=useState('')
 const [lt2,setLt2]=useState('')
 const [date,setDate]=useState('')
 const [source,setSource]=useState<ThresholdCalibration['test_type']>('lab_lactate')
 const [note,setNote]=useState('')
 const [confirmed,setConfirmed]=useState(false)
 const [loading,setLoading]=useState(false)
 const [busy,setBusy]=useState(false)
 const [loaded,setLoaded]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 useEffect(()=>{
  if(!active||!garminSupabase)return
  let mounted=true
  setLoading(true);setError('');setNotice('')
  void request('GET').then(data=>{
   if(!mounted)return
   const item=data.calibration||null
   onChange(item)
   if(item){
    setLt1(String(item.lt1_bpm));setLt2(String(item.lt2_bpm))
    setDate(item.tested_on);setSource(item.test_type);setNote(item.note||'')
   }
   setLoaded(true)
  }).catch(e=>{
   if(mounted){setError(e instanceof Error?e.message:'Schwellenprofil nicht verfügbar')}
  }).finally(()=>{if(mounted)setLoading(false)})
  return()=>{mounted=false}
 },[active])
 async function save(){
  if(busy)return
  setError('');setNotice('')
  const candidate={lt1_bpm:Number(lt1),lt2_bpm:Number(lt2),
   tested_on:date,test_type:source}
  const assessment=validateThresholdCalibration(candidate,today)
  if(!assessment.valid||!Number.isInteger(Number(lt1))||
   !Number.isInteger(Number(lt2))||!lt1.trim()||!lt2.trim()){
   setError(assessment.reason||'Bitte Testwerte und Testdatum prüfen.')
   return
  }
  if(!confirmed){
   setError('Bitte bestätige, dass die Werte einem vorhandenen Test entstammen.')
   return
  }
  setBusy(true)
  try{
   const result=await request('POST',{action:'save',confirm:true,
    lt1:candidate.lt1_bpm,lt2:candidate.lt2_bpm,
    testedOn:date,testType:source,note})
   if(!result.saved||!result.calibration)throw Error('Speicherung nicht bestätigt.')
   onChange(result.calibration)
   setConfirmed(false)
   setNotice('Schwellenprofil gespeichert. Garmin- und Kalenderdaten unverändert.')
  }catch(e){setError(e instanceof Error?e.message:'Schwellen nicht gespeichert.')}
  finally{setBusy(false)}
 }
 async function clear(){
  if(busy||!calibration)return
  if(!window.confirm('Dein eingetragenes LT1-/LT2-Schwellenprofil dauerhaft löschen?'))return
  setBusy(true);setError('');setNotice('')
  try{
   const result=await request('POST',{action:'delete',confirm:true})
   if(!result.saved||result.calibration!==null)throw Error('Löschen nicht bestätigt.')
   onChange(null);setLt1('');setLt2('');setDate('');setNote('')
   setConfirmed(false);setNotice('Schwellenprofil gelöscht.')
  }catch(e){setError(e instanceof Error?e.message:'Löschen fehlgeschlagen.')}
  finally{setBusy(false)}
 }
 const assessment=validateThresholdCalibration(calibration,today)
 return <details className="ctc-root" aria-label="Gemessene oder dokumentierte LT1- und LT2-Herzfrequenzschwellen hinterlegen">
  <summary className="ctc-summary">
   <span className="ctc-mark" aria-hidden="true">◎</span>
   <span><small>OPTIONAL · DEINE PERSÖNLICHEN SCHWELLEN</small>
    <strong>LT1 und LT2 aus deinem Test hinterlegen</strong>
    <span>{calibration&&assessment.valid?
     'Gespeichert · '+labels[calibration.test_type]+' · '+calibration.tested_on.split('-').reverse().join('.'):
     'Ohne Testwerte bleiben die Garmin-Gerätezonen die einzige Zonenansicht.'}</span>
   </span>
   <span aria-hidden="true">⌄</span>
  </summary>
  <div className="ctc-content">
   <p>Trage Werte nur ein, wenn du die Herzfrequenz an LT1 und LT2 aus einer
    Laktatdiagnostik, Atemgasanalyse oder einem dokumentierten Feldtest kennst.
    Die App berechnet <strong>keine Schwellen aus Alter, Maximalpuls oder Garmin-Zone 2.</strong>
    Ein Feldtest ist eine Schätzung; die App überprüft keinen Laborbefund.</p>
   {loading&&<p role="status">Persönliches Schwellenprofil wird geladen …</p>}
   {loaded&&<form onSubmit={e=>{e.preventDefault();void save()}} className="ctc-form">
    <div className="ctc-fields">
     <label>LT1 · Herzfrequenz (bpm)
      <input type="number" inputMode="numeric" min="70" max="195" step="1"
       placeholder="Wert aus deinem Test" value={lt1}
       onChange={e=>{setLt1(e.target.value);setConfirmed(false)}}/>
     </label>
     <label>LT2 · Herzfrequenz (bpm)
      <input type="number" inputMode="numeric" min="95" max="220" step="1"
       placeholder="Wert aus deinem Test" value={lt2}
       onChange={e=>{setLt2(e.target.value);setConfirmed(false)}}/>
     </label>
     <label>Testdatum
      <input type="date" min="1990-01-01" max={today} value={date}
       onChange={e=>{setDate(e.target.value);setConfirmed(false)}}/>
     </label>
     <label>Woher stammen die Werte?
      <select value={source} onChange={e=>{
       setSource(e.target.value as ThresholdCalibration['test_type']);setConfirmed(false)}}>
       {Object.entries(labels).map(([key,text])=><option value={key} key={key}>{text}</option>)}
      </select>
     </label>
    </div>
    <label className="ctc-notes">Testnotiz (optional)
     <input maxLength={240} value={note} placeholder="Zum Beispiel Testart und Rahmenbedingungen"
      onChange={e=>setNote(e.target.value)}/>
    </label>
    <label className="ctc-confirm"><input type="checkbox" checked={confirmed}
     onChange={e=>setConfirmed(e.target.checked)}/>
     <span>Ich bestätige: Beide Herzfrequenzwerte stammen aus einem vorhandenen Test
      und sind nicht aus Garmin-Zonen geschätzt.</span>
    </label>
    <div className="ctc-actions">
     <button type="submit" disabled={busy||!confirmed}>
      {busy?'Speichere …':'Testwerte ausdrücklich speichern'}</button>
     {calibration&&<button type="button" disabled={busy} onClick={()=>void clear()}>
      Schwellenprofil löschen</button>}
    </div>
   </form>}
   {calibration&&assessment.isOld&&<p className="ctc-warning">
    Der Test ist mehr als 18 Monate alt. Er wird nicht als Grundlage einer aktuellen
    Schwellen-Zeitverteilung verwendet.</p>}
   {error&&<p className="ctc-warning" role="alert">{error}</p>}
   {notice&&<p className="ctc-confirmation" role="status">{notice}</p>}
   <p className="ctc-caveat">Nur zur Analyse aufgezeichneter HF-Zeit. Die Berechnung kann die
    physiologischen Schwellen nicht verifizieren und erlaubt keine automatische Änderung
    an Trainingsplänen. Bei einem neuen Test sollten die Grenzen neu eingetragen werden.</p>
  </div>
 </details>
}
