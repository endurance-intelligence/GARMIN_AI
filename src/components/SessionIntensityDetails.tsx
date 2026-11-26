import {useState} from 'react'
import type {SessionSample} from '../lib/sessionAnalysis'
import {SessionVisualInsights} from './SessionVisualInsights'
import type {SessionZoneSummary} from './SessionVisualInsights'
import '../styles/session-live.css'

/** One visual deep dive, not a second Coach verdict. Only read data while visible. */
export function SessionIntensityDetails({samples,activityDate,activityId,active,avgHr,averagePace,onZoneSummary}:{
 samples:SessionSample[];activityDate:string|null;activityId:string;active:boolean;avgHr?:number|null;averagePace?:string;onZoneSummary?:(summary:SessionZoneSummary|null)=>void
}){
 const [open,setOpen]=useState(true)
 return <section className="lsa-intensity-expand lsa-intensity-visual" aria-label="Grafische Laufanalyse">
  <button className="lsa-intensity-toggle" type="button" aria-expanded={open}
   onClick={()=>setOpen(v=>!v)}>
   <span><small className="lsa-visual-overline">DEEP DIVE / GRAFISCHE ANALYSE</small>
    Trainingszonen &amp; Wiederholungen</span>
   <small>{open?'− Einklappen':'+ Öffnen'}</small>
  </button>
  {open&&<div className="lsa-intensity-content">
   <SessionVisualInsights active={active&&open} activityId={activityId} samples={samples} activityDate={activityDate} avgHr={avgHr} averagePace={averagePace} onZoneSummary={onZoneSummary}/>
  </div>}
 </section>
}
