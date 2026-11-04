import {useMemo} from 'react'
import type {SessionSample} from '../lib/sessionAnalysis'
import type {HrProfileResult,GarminRunningHrProfile} from '../lib/garminHrProfile'
import {assessIntensity} from '../lib/intensityEvidence'
import '../styles/intensity-evidence.css'

const colors=['#7185a3','#78a7ff','#5fd3bc','#b4db7a','#efbc78','#ed879b','#9296ab']
const pretty=(v:number)=>v.toLocaleString('de-DE',{maximumFractionDigits:1})
function selectReference(data:HrProfileResult|null,activityDate:string|null):{profile:GarminRunningHrProfile|null;kind:'historical'|'current'|'missing';observedAt:string|null}{
  const t=activityDate?Date.parse(activityDate):NaN
  if(Number.isFinite(t)){
    const matching=(data?.history??[]).filter(s=>Number.isFinite(Date.parse(s.observedAt))&&Date.parse(s.observedAt)<=t)
      .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]
    if(matching)return {profile:matching.profile,kind:'historical',observedAt:matching.observedAt}
  }
  return data?.profile?{profile:data.profile,kind:'current',observedAt:data.observedAt}: {profile:null,kind:'missing',observedAt:null}
}
export function IntensityEvidencePanel({samples,activityDate,profileData}:{samples:SessionSample[];activityDate:string|null;profileData:HrProfileResult|null}){
  const ref=useMemo(()=>selectReference(profileData,activityDate),[profileData,activityDate])
  const result=useMemo(()=>assessIntensity(samples,ref.profile),[samples,ref.profile])
  const referenceText=ref.kind==='historical'?'Garmin-Profil, das spätestens am Lauftag protokolliert wurde':ref.kind==='current'?'Aktuell gespeichertes Garmin-Profil – nicht rückwirkend als damalige Zonen bestätigt':'Noch kein Garmin-Profil gespeichert'
  return <section className="iie-wrap" aria-label="Individuelles Intensitätsprofil">
    <div className="iie-top"><div><span className="micro-label">INDIVIDUAL INTENSITY / v0.7.0</span><h4>Wo lag dein Puls?</h4></div><span className="iie-reference">Garmin-Referenz · keine LT1-Messung</span></div>
    <p className="iie-meta">{referenceText}{ref.observedAt?` · Stand ${new Date(ref.observedAt).toLocaleDateString('de-DE')}`:''}</p>
    {result.status==='insufficient'?<p className="iie-muted">Noch keine belastbare Verteilung: mindestens 80 gültige HF-Messpunkte und 75 % HF-Abdeckung erforderlich ({result.validSamples} von {result.totalSamples} Messpunkten vorhanden).</p>
    :result.status==='no-zones'?<p className="iie-muted">Die fünf Garmin-Zonengrenzen fehlen oder sind nicht eindeutig. Keine Ersatz-Zonen geschätzt.</p>
    :<>
      <div className="iie-bands" role="img" aria-label="Anteil der Herzfrequenz-Messpunkte je Garmin-Zone">
        {result.bands.map((b,i)=><div key={b.key} className="iie-row">
          <span className="iie-label">{b.label}</span>
          <div className="iie-track"><div className="iie-fill" style={{width:`${b.share}%`,background:colors[i]}}/></div>
          <span className="iie-number">{pretty(b.share)} %</span>
          <small className="iie-range">{b.lower===null?`≤ ${b.upper}`:b.upper===null?`≥ ${b.lower}`:`${b.lower}–${b.upper}`} bpm</small>
        </div>)}
      </div>
      <p className="iie-note">{result.validSamples} gültige HF-Messpunkte: {pretty(result.belowZ1Z2Share??0)} % lagen unterhalb oder innerhalb der Garmin-Zone 2. Das ist <strong>kein</strong> Nachweis für physiologische Zone 2 oder die Qualität des Laufs.</p>
      {ref.kind==='current'&&<p className="iie-warning">Historischer Vergleich mit heutigen Zonen. Keine rückwirkende Zielerfüllung oder Trainingsentscheidung daraus ableiten.</p>}
    </>}
    <p className="iie-foot">Prozentwerte beschreiben Messpunktanteile, keine exakt gemessene Zeit in den Zonen. Die Laktatschwelle (LSHF) beschreibt nicht die erste aerobe Schwelle (LT1/VT1). Keine Trainingsfreigabe.</p>
  </section>
}
