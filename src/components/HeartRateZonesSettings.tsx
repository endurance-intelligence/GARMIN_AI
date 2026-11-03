import {getZoneRows,humanSyncError} from '../lib/garminHrProfile'
import {useGarminHrProfile} from '../lib/useGarminHrProfile'
import '../styles/heart-rate-zones.css'

const readable=(timestamp:string|null)=>timestamp ? new Date(timestamp).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}) : 'Noch nie'
const reading=(value:number|null,unit='bpm')=>value===null?'Nicht geliefert':`${value} ${unit}`
export function HeartRateZonesSettings({active}:{active:boolean}) {
  const {data,loading,syncing,error,sync}=useGarminHrProfile(active)
  if(!active)return null
  const profile=data?.profile??null
  const rows=getZoneRows(profile)
  const warn=humanSyncError(data?.lastError??data?.error)
  return <section className="hrz-wrap" aria-label="Persönliche Garmin-Laufzonen">
    <div className="hrz-header">
      <div><span className="micro-label">GARMIN_AI / DYNAMIC PERFORMANCE PROFILE · v0.6.2.3</span><h3>Deine Garmin-HF-Zonen</h3><p>Automatisch aus Garmin Connect gelesen · nur verifizierte Werte.</p></div>
      <button className="secondary" type="button" disabled={syncing||loading} onClick={()=>void sync(true)}>{syncing?'Synchronisiere …':'Jetzt synchronisieren'}</button>
    </div>
    <div className="hrz-meta"><span>Letzte erfolgreiche Prüfung: <strong>{readable(data?.lastSuccessAt??null)}</strong></span><span>Profiländerung erkannt: <strong>{readable(data?.observedAt??null)}</strong></span></div>
    {loading && <p className="hrz-message">Lade private Garmin-Profildaten …</p>}
    {error && <p className="hrz-error" role="alert">{error}</p>}
    {warn && <p className="hrz-warning" role="status">{warn}</p>}
    {data?.checks && data.checks.length>0 && <details className="hrz-history">
      <summary>Garmin-API-Diagnose ({data.checks.length} Prüfungen, keine persönlichen Werte)</summary>
      <div>{data.checks.map((check,i)=><p key={check.route+i}>
        <strong>{check.route}</strong>: HTTP {check.status}
        {check.parsed===true?' · Laufzonen erkannt':check.parsed===false?' · JSON erhalten, Laufzonenformat ungeklärt':''}
      </p>)}</div>
    </details>}
    {profile && <div className="hrz-metrics">
      <div><small>HFmax</small><strong>{reading(profile.maxHr)}</strong><span>{profile.sources.maxHr??'Nicht von dieser API geliefert'}</span></div>
      <div><small>Laktatschwellen-HF (LSHF)</small><strong>{reading(profile.lthr)}</strong><span>{profile.sources.lthr??'Nicht von dieser API geliefert'}</span></div>
      <div><small>Ruhepuls</small><strong>{reading(profile.restingHr)}</strong><span>{profile.sources.restingHr??'Nicht von dieser API geliefert'}</span></div>
    </div>}
    {rows.length>0 ? <div className="hrz-zone-list">
      {rows.map(({zone,low,high})=><div key={zone} className="hrz-zone-row"><span className={`hrz-marker hrz-marker-${zone}`}/><strong>Zone {zone}</strong><span>{low===null?`bis ${high}`:`${low}–${high}`} bpm</span></div>)}
      <p className="hrz-zone-caption">Laufen · {profile?.sources?.zones ?? 'Garmin-Konfiguration'}{profile?.method?` · Methode: ${profile.method}`:''}. Das sind Gerätezonen, keine bestätigten physiologischen Schwellen.</p>
    </div>:<p className="hrz-message">Noch keine eindeutig auslesbaren Laufzonen. Es werden keine Werte geschätzt oder aus anderen Sportarten übernommen.</p>}
    {data?.history && data.history.length>1 && <details className="hrz-history"><summary>Profiländerungen ansehen ({data.history.length} gespeicherte Versionen)</summary><div>{data.history.slice(0,8).map((entry,i)=><p key={entry.observedAt+i}><strong>{readable(entry.observedAt)}</strong> · {getZoneRows(entry.profile).map(z=>z.high).join(' / ')} bpm (Z1–Z5)</p>)}</div></details>}
    <p className="hrz-science"><strong>Wissenschaftliche Einordnung:</strong> Garmin-Zone 2 ist kein gemessener LT1/VT1-Grenzwert. Der Coach verwendet die Garmin-Zonen vorerst als beschreibende Referenz und leitet daraus keine „echte Zone 2“ oder Trainingsfreigabe ab. Änderungen an Garmin oder deinem Trainingsplan erfolgen nicht.</p>
  </section>
}
