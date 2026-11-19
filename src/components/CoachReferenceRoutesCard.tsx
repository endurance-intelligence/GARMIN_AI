import {useEffect,useState} from 'react'
import {garminPublishableKey,garminSupabase,garminSupabaseUrl} from '../lib/garminSupabase'
import '../styles/coach-reference-routes.css'

type Run={date:string;distanceKm:number;paceSecKm:number|null;averageHr:number|null;rpe:number|null}
type Comparison={status:'paired-medians'|'single-pair';oldDate:string;newDate:string;
  olderRuns:number;newerRuns:number;oldPace:number;newPace:number;
  deltaSecKm:number;olderHr:number;newerHr:number;olderRpe:number;newerRpe:number}
type Route={id:string;title:string;gpsStatus:'verified'|'candidate';runs:number;distanceKm:number;gainM:number;
  firstDate:string;lastDate:string;comparison:Comparison|null;history:Run[]}
type Payload={kind:'reference-route-candidates';readOnly:true;
  coverage:{withGpsEnds:number;withElevationProfile:number;gpsTracksAvailable:number;
    gpsVerifiedGroups:number;repeatedGroups:number;repeatedRuns:number};
  scan:{runningRead:number;metadataCandidates:number;samplesExamined:number;capped:boolean};
  routes:Route[];caveat:string;source:string}
const valid=(value:unknown):value is Payload=>{
  if(!value||typeof value!=='object')return false
  const v=value as Record<string,unknown>
  return v.kind==='reference-route-candidates'&&v.readOnly===true&&
    !!v.coverage&&!!v.scan&&Array.isArray(v.routes)&&v.routes.length<=10&&
    v.routes.every((r:Route)=>['verified','candidate'].includes(r.gpsStatus)&&typeof r.id==='string'&&
      typeof r.runs==='number'&&r.runs>=2&&
      Array.isArray(r.history)&&r.history.length<=8)
}
const date=(s:string)=>s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4)
const pace=(n:number|null)=>{
  if(n===null||!Number.isFinite(n))return '–'
  const s=Math.round(n)
  return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+' min/km'
}
const delta=(n:number)=>{
  const sign=n<0?'−':n>0?'+':'±'
  return sign+Math.abs(Math.round(n))+' Sek./km'
}
export function CoachReferenceRoutesCard({active}:{active:boolean}){
  const [opened,setOpened]=useState(false)
  const [attempted,setAttempted]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [data,setData]=useState<Payload|null>(null)
  useEffect(()=>{
    if(!active||!opened||attempted||!garminSupabase)return
    const controller=new AbortController()
    let mounted=true
    setAttempted(true);setLoading(true);setError('')
    void (async()=>{
      const {data:{session}}=await garminSupabase.auth.getSession()
      if(!session)throw Error('Bitte zuerst unter Einstellungen anmelden.')
      const response=await fetch(garminSupabaseUrl+'/functions/v1/read-garmin-reference-routes',{
        method:'GET',cache:'no-store',signal:controller.signal,
        headers:{authorization:'Bearer '+session.access_token,apikey:garminPublishableKey}
      })
      if(!response.ok)throw Error('Streckenanalyse gerade nicht erreichbar ('+response.status+').')
      const result:unknown=await response.json()
      if(!valid(result))throw Error('Unvollständige Antwort der Garmin-Streckenanalyse.')
      if(mounted)setData(result)
    })().catch(e=>{
      if(mounted&&!controller.signal.aborted)
        setError(e instanceof Error?e.message:'Streckenanalyse nicht verfügbar.')
    }).finally(()=>{if(mounted)setLoading(false)})
    return ()=>{mounted=false;controller.abort()}
  },[active,opened,attempted])
  const retry=()=>{setData(null);setError('');setAttempted(false)}
  return <details className="crr-root" open={opened}
    onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary className="crr-heading">
      <span className="crr-icon" aria-hidden="true">◎</span>
      <span><small>COACH · STRECKENVERGLEICH</small>
        <strong>Meine wiederkehrenden Laufstrecken</strong>
        <span>GPS-Streckenabgleich · Tempo &amp; Herzfrequenz vergleichen</span>
      </span>
      <span aria-hidden="true">⌄</span>
    </summary>
    {opened&&<div className="crr-body">
      {loading&&<p role="status">Vergleiche Garmin-Läufe und Höhenprofile …</p>}
      {error&&<p className="crr-message" role="alert">{error}
        <button type="button" onClick={retry}>Erneut versuchen</button>
      </p>}
      {!garminSupabase&&<p>Garmin-Anmeldung ist noch nicht eingerichtet.</p>}
      {data&&<>
        <div className="crr-summary">
          <div><small>STRECKENGRUPPEN</small><strong>{data.coverage.repeatedGroups}</strong></div>
          <div><small>GPS-VERIFIZIERT</small><strong>{data.coverage.gpsVerifiedGroups}</strong></div>
          <div><small>ZUGEORDNETE LÄUFE</small><strong>{data.coverage.repeatedRuns}</strong></div>
          <div><small>LÄUFE MIT GPS-PROFIL</small><strong>{data.coverage.gpsTracksAvailable}</strong></div>
        </div>
        {data.scan.capped&&<p className="crr-message">Begrenzte Datenmenge: Die Übersicht ist nicht vollständig.</p>}
        {data.routes.length===0&&<p className="crr-message">
          Noch keine Strecke mit ausreichend übereinstimmendem Start/Ziel,
          Distanz und Höhenprofil. Kein negatives Trainingsergebnis.
        </p>}
        {data.routes.map(route=><details key={route.id} className="crr-route">
          <summary>
            <span><strong>{route.title}</strong>
              <small>{route.gpsStatus==='verified'?'✓ GPS-verifiziert':'◌ GPS noch nicht bestätigt'} ·
                {' '}{route.runs} Läufe · ca. {route.distanceKm.toLocaleString('de-DE')} km ·
                {' '}{route.gainM} hm</small></span>
            <span>{route.comparison?'Vergleich verfügbar':'Weitere Daten nötig'} <span aria-hidden="true">⌄</span></span>
          </summary>
          <div className="crr-route-body">
            <p>Aufzeichnungen: {date(route.firstDate)} bis {date(route.lastDate)}</p>
            {route.comparison?<>
              <div className="crr-pair">
                <div><small>FRÜHER · {date(route.comparison.oldDate)}</small>
                  <strong>{pace(route.comparison.oldPace)}</strong>
                  <span>Ø {route.comparison.olderHr} bpm · RPE {route.comparison.olderRpe}</span></div>
                <div><small>ZULETZT · {date(route.comparison.newDate)}</small>
                  <strong>{pace(route.comparison.newPace)}</strong>
                  <span>Ø {route.comparison.newerHr} bpm · RPE {route.comparison.newerRpe}</span></div>
              </div>
              <p className="crr-observation"><strong>{delta(route.comparison.deltaSecKm)}</strong>
                {' '}bei vergleichbarer HF und Anstrengung.
                {' '}{route.comparison.status==='single-pair'
                  ?'Ein einzelnes Laufpaar – noch kein belastbarer Trend.'
                  :'Median aus je zwei früheren und neueren Läufen.'}
              </p>
            </>:<p className="crr-message">
              Für einen fairen Tempo-Vergleich fehlen mindestens zwei lockere
              Läufe im Abstand von drei Wochen mit ähnlicher HF (±4 bpm),
              ähnlichem RPE und verlässlicher Bewegungszeit.
            </p>}
            <div className="crr-history">
              <small>ZULETZT AUF DIESER STRECKE</small>
              {route.history.map((run,i)=><div key={run.date+'-'+i}>
                <span>{date(run.date)}</span><strong>{pace(run.paceSecKm)}</strong>
                <span>{run.averageHr===null?'HF –':run.averageHr+' bpm'}</span>
                <span>{run.rpe===null?'RPE –':'RPE '+run.rpe}</span>
              </div>)}
            </div>
          </div>
        </details>)}
        <p className="crr-disclaimer">
          <strong>GPS-Streckenabgleich:</strong> Nur ausdrücklich als GPS-verifiziert
          markierte Gruppen stimmen auch anhand von 51 räumlichen FIT-Messpunkten überein.
          Andere bleiben vorläufige Kandidaten nach Start/Ziel, Distanz und Höhenprofil.
          Pulswerte, RPE und Tempo sind Messbeobachtungen; Wetter, Untergrund,
          Ermüdung und Sensorgenauigkeit bleiben Einflussfaktoren.
          Keine automatische Trainingsplanänderung.
        </p>
      </>}
    </div>}
  </details>
}
