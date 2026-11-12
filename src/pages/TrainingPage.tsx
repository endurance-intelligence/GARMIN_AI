import {useState} from 'react'
import {Icon} from '../components/Icon'
import {LiveSessionAnalyst} from '../components/LiveSessionAnalyst'
import {AerobicEvidencePanel} from '../components/AerobicEvidencePanel'
import type {Page} from '../navigation'

/** The production Session Intelligence page shows only real Garmin observations.
 * Old example verdicts, faux fueling entries and stale Garmin calendar
 * snapshots intentionally stay out of the athlete's analysis.
 */
export function TrainingPage({active,onGo}:{active:boolean;onGo:(page:Page)=>void}){
 const [aerobicOpen,setAerobicOpen]=useState(false)
 return <section className={active?'page active':'page'}>
  <div className="page-intro introduction-v3">
   <div><div className="eyebrow">SESSION INTELLIGENCE / ECHTE GARMIN-DATEN</div>
    <h1>Jede Einheit.<br/><span className="gradient-word">Eine Erkenntnis.</span></h1>
    <p>Deine gemessenen Läufe statt Demo-Urteile. Der Analyst zeigt Belege, Datenlücken
     und – sofern du den Trainingszweck zuordnest – einen nachvollziehbaren Vergleich.</p>
   </div>
  </div>
  <LiveSessionAnalyst active={active}/>
  <div className="ss-training-shortcut" style={{display:'flex',flexWrap:'wrap',
   justifyContent:'space-between',alignItems:'center',gap:12,padding:16,
   border:'1px solid rgba(148,164,219,.18)',borderRadius:14,margin:'12px 0',
   background:'linear-gradient(120deg,#1d2843,#161e31)'}}>
   <div><strong style={{color:'#eaeaff'}}>Kraft &amp; Mobility</strong>
    <p style={{margin:'5px 0 0',color:'#adc0dd',fontSize:12}}>
     Eigene Kraft- und Stabilisationseinheiten planen, statt Demotraining anzeigen.</p></div>
   <button type="button" className="secondary" onClick={()=>onGo('strength')}>
    Stabi Studio öffnen <Icon name="arrow-up-right"/></button>
  </div>
  <details className="ss-aerobic-expand" open={aerobicOpen}
   onToggle={event=>setAerobicOpen(event.currentTarget.open)}
   style={{margin:'16px 0',border:'1px solid rgba(148,164,219,.22)',
    background:'linear-gradient(120deg,#17233b,#101827)',borderRadius:15,
    padding:'14px 16px'}}>
   <summary style={{cursor:'pointer',fontWeight:750,color:'#e7eeff',fontSize:14}}>
    Aerobe Vergleichsläufe · vertiefende Analyse
   </summary>
   {aerobicOpen&&<>
    <p style={{color:'#b3c4df',fontSize:12,lineHeight:1.6}}>
     Vergleich von HF- und Geschwindigkeitsverläufen. Das ist keine Bestimmung
     deiner aeroben Schwelle und keine Trainingsfreigabe.</p>
    <AerobicEvidencePanel active={active&&aerobicOpen}/>
   </>}
  </details>
  <p className="page-disclaimer">Nur echte Garmin-Daten. Keine künstlichen Trainingsnoten,
   keine vorgetäuschten Analyseergebnisse und keine automatischen Änderungen am Trainingsplan.</p>
 </section>
}
