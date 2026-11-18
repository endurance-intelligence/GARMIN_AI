import {useState} from 'react'
import type {SessionSample} from '../lib/sessionAnalysis'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import {IntensityEvidencePanel} from './IntensityEvidencePanel'
import {SessionVisualInsights} from './SessionVisualInsights'
import '../styles/session-live.css'

/** One visual deep dive, not a second Coach verdict. Only read data while visible. */
export function SessionIntensityDetails({samples,activityDate,activityId,active}:{
 samples:SessionSample[];activityDate:string|null;activityId:string;active:boolean
}){
 const [open,setOpen]=useState(true)
 const [garminOpen,setGarminOpen]=useState(false)
 const {data,loading,error}=useGarminHrProfile(open&&garminOpen&&active)
 return <section className="lsa-intensity-expand lsa-intensity-visual" aria-label="Grafische Laufanalyse">
  <button className="lsa-intensity-toggle" type="button" aria-expanded={open}
   onClick={()=>setOpen(v=>!v)}>
   <span><small className="lsa-visual-overline">DEEP DIVE / GRAFISCHE ANALYSE</small>
    Trainingszonen &amp; Wiederholungen</span>
   <small>{open?'− Einklappen':'+ Öffnen'}</small>
  </button>
  {open&&<div className="lsa-intensity-content">
   <SessionVisualInsights active={active&&open} activityId={activityId} samples={samples}/>
   <div className="lsa-garmin-zone-detail">
    <button type="button" onClick={()=>setGarminOpen(v=>!v)} aria-expanded={garminOpen}>
     <span>{garminOpen?'−':'+'} Garmin-HF-Zonen als Vergleich</span>
     <small>Optional · historische Garmin-Referenz</small>
    </button>
    {garminOpen&&<div className="lsa-garmin-zone-body">
     {loading&&<p className="lsa-note">Lade persönliche Garmin-HF-Zonen …</p>}
     {error&&<p className="lsa-note" role="status">{error}</p>}
     <IntensityEvidencePanel samples={samples} activityDate={activityDate} profileData={data}/>
    </div>}
   </div>
  </div>}
 </section>
}
