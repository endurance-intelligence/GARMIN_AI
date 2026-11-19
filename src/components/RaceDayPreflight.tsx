import {useEffect,useState} from 'react'
import type {GelPlanEvent} from '../lib/gelTiming.mjs'
import type {AidPlanEvent} from '../lib/raceAidPlan.mjs'
import {runRaceDayPreflight} from '../lib/raceDayPreflight.mjs'
import type {RacePreflightResult} from '../lib/raceDayPreflight.mjs'
import {Icon} from './Icon'
import '../styles/race-day-preflight.css'

/** Intentional action only. Never advances a lap, modifies a plan or writes to its race key. */
export function RaceDayPreflight({keyName,raceDate,raceName,total,completed,
 loaded,storageReady,saved,startTime,fuelSchedule,aidSchedule}:{
 keyName:string;raceDate:string;raceName:string;total:number;completed:number;
 loaded:boolean;storageReady:boolean;saved:boolean;startTime:string;
 fuelSchedule:GelPlanEvent[]|null;aidSchedule:AidPlanEvent[]|null
}){
 const [result,setResult]=useState<RacePreflightResult|null>(null)
 useEffect(()=>setResult(null),[keyName,total,completed,loaded,storageReady,
  saved,startTime,fuelSchedule,aidSchedule])
 const run=()=>{
  let storage:Storage|null=null
  try{storage=window.localStorage}catch{/* restricted browser storage */}
  setResult(runRaceDayPreflight({storage,key:keyName,raceDate,raceName,
   total,expectedCompleted:completed,loaded,storageReady,saved,startTime,
   gelEvents:fuelSchedule,aidEvents:aidSchedule}))
 }
 return <details className="rdp-root">
  <summary><Icon name="shield-check"/> Renntag-Check auf diesem Handy</summary>
  <div className="rdp-content">
   <p>Prüft Rennplan, Verpflegung und die Schreibfähigkeit des lokalen Speichers.
    Keine Test-Runde, keine Änderung deines Rennstands.</p>
   <button className="rdp-run" type="button" onClick={run}>
    <Icon name="check-circle"/> Jetzt auf diesem Gerät prüfen</button>
   {result&&<div className="rdp-results" aria-live="polite">
    <strong className={'rdp-status is-'+result.status}>
     {result.status==='ready'?'Alle geprüften Punkte bereit':
      result.status==='review'?'Vor dem Start noch etwas prüfen':
      'Mindestens ein wichtiger Punkt funktioniert nicht'}
    </strong>
    <ul>{result.checks.map(x=><li key={x.id} className={'is-'+x.status}>
     <Icon name={x.status==='ok'?'check-circle':
      x.status==='blocked'?'alert-circle':'info'}/>
     <span><strong>{x.label}</strong><small>{x.detail}</small></span>
    </li>)}</ul>
    <p className="rdp-caveat">{result.caveat}</p>
   </div>}
   {!result&&<p className="rdp-caveat">Der Test läuft nur nach deinem Tipp.
    Für einen vollständigen Neustart ohne Internet gibt es keine Garantie.</p>}
  </div>
 </details>
}
