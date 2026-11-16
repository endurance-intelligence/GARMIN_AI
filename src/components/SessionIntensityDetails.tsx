import {useState} from 'react'
import type {SessionSample} from '../lib/sessionAnalysis'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import {IntensityEvidencePanel} from './IntensityEvidencePanel'
import '../styles/session-live.css'

/** Optional context, never a second Coach verdict or a requirement for a run review. */
export function SessionIntensityDetails({samples,activityDate}:{
 samples:SessionSample[];activityDate:string|null
}){
 const [open,setOpen]=useState(false)
 const {data,loading,error}=useGarminHrProfile(open)
 return <section className="lsa-intensity-expand" aria-label="Optionale Herzfrequenz-Zonen">
  <button className="lsa-intensity-toggle" type="button" aria-expanded={open}
   onClick={()=>setOpen(v=>!v)}>
   <span>{open?'−':'+'} HF-Zonen im Detail</span>
   <small>Optional · Garmin-Referenz, keine zusätzliche Coach-Bewertung</small>
  </button>
  {open&&<div className="lsa-intensity-content">
   {loading&&<p className="lsa-note">Lade persönliche Garmin-HF-Zonen …</p>}
   {error&&<p className="lsa-note" role="status">{error}</p>}
   <IntensityEvidencePanel samples={samples} activityDate={activityDate} profileData={data}/>
  </div>}
 </section>
}
