import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { garminPublishableKey, garminSupabase, garminSupabaseReady, garminSupabaseUrl } from '../lib/garminSupabase'
import { analyzeSession } from '../lib/sessionAnalysis'
import { SessionGoalReview } from './SessionGoalReview'
import type { SessionSample } from '../lib/sessionAnalysis'
import '../styles/session-live.css'

type Activity = {
  id: string; name: string; date: string; sport: string
  distanceM: number | null; durationS: number | null; avgHr: number | null
  rpeRaw: number | null; detailStatus: string; hrSamples: number; laps: number
}
type ActivityListResponse = { source: string; activities: Activity[] }
type SessionResponse = {
  activity: Omit<Activity, 'detailStatus' | 'hrSamples' | 'laps'>
  details: { status: string; hrSampleCount: number; lapCount: number; samples: SessionSample[]; fetchedAt: string | null }
}
const formatNumber = (value: number, decimals=0) => value.toLocaleString('de-DE', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
const runTypes: Record<string,string> = { running: 'Lauf', track_running: 'Bahn', treadmill_running: 'Laufband', ultra_run: 'Ultra' }

function heartPath(samples: SessionSample[]): string {
  const valid = samples.filter(p => typeof p.hr === 'number' && p.hr>=35 && p.hr<=220)
  if (valid.length < 2) return ''
  const values = valid.map(p=>p.hr!)
  const min = Math.min(...values)-4
  const max = Math.max(...values)+4
  const span = Math.max(15,max-min)
  return valid.map((p,i) => {
    const x = 12 + i / (valid.length-1) * 616
    const y = 192 - ((p.hr!-min)/span)*160
    return `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}
async function readPrivate<T>(session: Session, params = ''): Promise<T> {
  const url = `${garminSupabaseUrl}/functions/v1/read-garmin-session${params}`
  const response = await fetch(url, {
    method: 'GET', headers: {
      authorization: `Bearer ${session.access_token}`,
      apikey: garminPublishableKey,
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Private Session API: HTTP ${response.status}`)
  return await response.json() as T
}

export function LiveSessionAnalyst({ active }: { active: boolean }) {
  const [session,setSession] = useState<Session | null>(null)
  const [authReady,setAuthReady] = useState(false)
  const [list,setList] = useState<Activity[]>([])
  const [selected,setSelected] = useState<string>('')
  const [details,setDetails] = useState<SessionResponse | null>(null)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)

  useEffect(() => {
    if (!active || !garminSupabase) return
    let mounted = true
    void garminSupabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setAuthReady(true) }
    }).catch(() => { if (mounted) setAuthReady(true) })
    const { data: { subscription } } = garminSupabase.auth.onAuthStateChange((_event, current) => {
      if (mounted) setSession(current)
    })
    return () => { mounted=false; subscription.unsubscribe() }
  }, [active])

  useEffect(() => {
    if (!active || !session) return
    let mounted = true
    void readPrivate<ActivityListResponse>(session).then(response => {
      if (!mounted) return
      setList(response.activities)
      setSelected(current => response.activities.some(a=>a.id===current) ? current : (response.activities[0]?.id ?? ''))
    }).catch(err => { if (mounted) setError(err instanceof Error ? err.message : 'Aktivitätsliste nicht verfügbar') })
    return () => { mounted=false }
  }, [active, session?.access_token, refresh])

  useEffect(() => {
    if (!active || !session || !selected) return
    let mounted = true
    setLoading(true); setError(''); setDetails(null)
    void readPrivate<SessionResponse>(session, `?id=${encodeURIComponent(selected)}`).then(result => {
      if (mounted) setDetails(result)
    }).catch(err => { if (mounted) setError(err instanceof Error ? err.message : 'Detaildaten nicht verfügbar') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted=false }
  }, [active, session?.access_token, selected, refresh])

  const analysis = useMemo(() => details ? analyzeSession(details.details.samples) : null, [details])
  const path = useMemo(() => details ? heartPath(details.details.samples) : '', [details])
  if (!active) return null
  return <section className="lsa-wrap" aria-label="Echter Garmin Session Analyst">
    <div className="lsa-head">
      <div><span className="micro-label">GARMIN / SESSION INTELLIGENCE · LIVE</span>
        <h2>Dein Lauf. Die echten Signale.</h2>
        <p>Gemessene HF-Verläufe aus Supabase · bewusst noch ohne automatisches Trainingsurteil.</p></div>
      {session && <button className="secondary" type="button" onClick={()=>setRefresh(r=>r+1)} disabled={loading}>Aktualisieren</button>}
    </div>
    {!garminSupabaseReady && <p className="lsa-note">Supabase ist lokal noch nicht konfiguriert.</p>}
    {garminSupabaseReady && !authReady && <p className="lsa-note">Login wird geprüft …</p>}
    {garminSupabaseReady && authReady && !session && <p className="lsa-note">Bitte zuerst unter <strong>Einstellungen</strong> anmelden. Der Analyst nutzt denselben privaten Supabase-Zugang wie Recovery.</p>}
    {session && <>
      <label className="lsa-picker">Garmin-Lauf auswählen
        <select value={selected} onChange={e=>setSelected(e.target.value)}>
          {!list.length && <option value="">Noch keine Läufe geladen</option>}
          {list.map(a=><option key={a.id} value={a.id}>{a.date?.slice(0,10)} · {a.name} · {runTypes[a.sport]??a.sport}{a.hrSamples>0?' · HF verfügbar':' · Details ausstehend'}</option>)}
        </select>
      </label>
      {error && <div className="lsa-error" role="alert">{error}</div>}
      {loading && <p className="lsa-note">Lese Garmin-Aktivität …</p>}
      {details && analysis && <>
        <div className="lsa-stat-grid">
          <div><span>DISTANZ</span><strong>{details.activity.distanceM==null?'–':formatNumber(details.activity.distanceM/1000,2)} <small>km</small></strong></div>
          <div><span>DAUER</span><strong>{details.activity.durationS==null?'–':formatNumber(details.activity.durationS/60)} <small>Min.</small></strong></div>
          <div><span>Ø HF · GARMIN</span><strong>{details.activity.avgHr==null?'–':formatNumber(details.activity.avgHr)} <small>bpm</small></strong></div>
          <div><span>HF-MESSPUNKTE</span><strong>{analysis.validHr} <small>/ {details.details.samples.length}</small></strong></div>
        </div>
        <div className="lsa-panels">
          <article className="lsa-chart">
            <div className="lsa-section-title"><strong>Herzfrequenz im Verlauf</strong><small>Messpunkte · keine geschätzten Werte</small></div>
            {path ? <svg viewBox="0 0 640 210" role="img" aria-label="Herzfrequenzverlauf der ausgewählten Aktivität" preserveAspectRatio="none">
              <g stroke="#334057" strokeWidth="1"><line x1="12" y1="52" x2="628" y2="52"/><line x1="12" y1="112" x2="628" y2="112"/><line x1="12" y1="172" x2="628" y2="172"/></g>
              <path d={path} stroke="#7CCFFF" fill="none" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
            </svg> : <p className="lsa-note">HF-Verlauf für diese Einheit noch nicht verfügbar.</p>}
            <div className="lsa-chart-axis"><span>Beginn</span><span>Mitte</span><span>Ende</span></div>
            <p className="lsa-quality">Status: {details.details.status} · Runden: {details.details.lapCount} · {details.activity.rpeRaw == null ? 'RPE fehlt' : `Garmin-RPE Rohwert ${details.activity.rpeRaw} (noch nicht skaliert)`}</p>
          </article>
          <article className="lsa-findings"><div className="lsa-section-title"><strong>Was zeigen die Daten?</strong><small>Belegbasiert · v0.6.0</small></div>
            {analysis.signals.map((s,i)=><div className={`lsa-signal ${s.level}`} key={`${i}-${s.title}`}><b>{s.title}</b><p>{s.explanation}</p></div>)}
          </article>
        </div>
        <SessionGoalReview key={details.activity.id} samples={details.details.samples} lapCount={details.details.lapCount} activityDate={details.activity.date}/>
        <p className="lsa-foot">Keine Trainingsfreigabe und keine automatische Änderung am Trainingsplan. Runden, HF-Zonen, Trainingstyp, Höhenprofil und Wetter werden erst berücksichtigt, wenn diese Daten verifiziert vorliegen.</p>
      </>}
    </>}
  </section>
}
