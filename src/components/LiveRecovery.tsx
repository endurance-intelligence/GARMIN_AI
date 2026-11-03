import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { TrainingLoadPanel, type TrainingSummary } from './TrainingLoadPanel'
import { Icon } from './Icon'
import { garminSupabase, garminSupabaseReady, garminSupabaseUrl, garminPublishableKey } from '../lib/garminSupabase'
import '../styles/garmin-recovery.css'

type MetricKey = 'hrv_ms' | 'resting_heart_rate' | 'sleep_seconds' | 'stress_avg' | 'body_battery_max'
type Day = {
  metric_date: string
  hrv_ms: number | null
  resting_heart_rate: number | null
  sleep_seconds: number | null
  stress_avg: number | null
  body_battery_max: number | null
  synced_at: string
}
type HealthResponse = { source: string; requestedDays: number; metrics: Day[]; training?: TrainingSummary | null }

type MetricInfo = { key: MetricKey; title: string; unit: string; icon: string; accent: string }
const sleep: MetricInfo = { key: 'sleep_seconds', title: 'Schlafdauer', unit: 'h', icon: 'moon', accent: 'lime' }
const recovery: MetricInfo[] = [
  { key: 'hrv_ms', title: 'Herzfrequenzvariabilität', unit: 'ms', icon: 'waves', accent: 'violet' },
  { key: 'resting_heart_rate', title: 'Ruhepuls', unit: 'bpm', icon: 'heart-pulse', accent: 'blue' },
  { key: 'stress_avg', title: 'Tagesstress', unit: '/100', icon: 'activity', accent: 'orange' },
  { key: 'body_battery_max', title: 'Body Battery max.', unit: '/100', icon: 'activity', accent: 'lilac' },
]

function formatted(value: number | null, key: MetricKey): string {
  if (value === null || !Number.isFinite(value)) return '–'
  if (key === 'sleep_seconds') {
    const minutes = Math.round(value / 60)
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
  }
  return Math.round(value).toLocaleString('de-DE')
}

function trendPath(days: Day[], key: MetricKey): string {
  const values = days.map(d => d[key])
  const numeric = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (numeric.length < 2) return ''
  const min = Math.min(...numeric)
  const range = Math.max(1, Math.max(...numeric) - min)
  const w = 220
  const h = 57
  let path = ''
  values.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return
    const x = 4 + (i / Math.max(1, values.length - 1)) * (w - 8)
    const y = h - 6 - ((v - min) / range) * (h - 14)
    const previous = i > 0 ? values[i - 1] : null
    path += `${typeof previous === 'number' ? ' L ' : ' M '}${x.toFixed(1)} ${y.toFixed(1)}`
  })
  return path.trim()
}
function dayOffset(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function MetricCard({ info, days, period, prominent = false }: { info: MetricInfo; days: Day[]; period: 7 | 30; prominent?: boolean }) {
  const valid = days.filter(d => typeof d[info.key] === 'number' && Number.isFinite(d[info.key]))
  const last = valid.length ? valid[valid.length - 1][info.key] : null
  const average = valid.length ? valid.reduce((sum, d) => sum + (d[info.key] as number), 0) / valid.length : null
  return <article className={`ri-metric ri-${info.accent}${prominent ? ' ri-prominent' : ''}`}>
    <div className="ri-metric-head"><span className="ri-metric-icon"><Icon name={info.icon}/></span><span className="ri-metric-label">{info.title}</span></div>
    <div className="ri-metric-value">{formatted(last, info.key)}<small>{info.unit}</small></div>
    <div className="ri-metric-detail">Ø {formatted(average, info.key)} {info.unit} <span>· {valid.length}/{period} Tage</span></div>
    <svg className="ri-sparkline" viewBox="0 0 220 57" preserveAspectRatio="none" role="img" aria-label={`${info.title}, Verlauf über ${period} Tage, Lücken bleiben offen`}>
      <path d={trendPath(days, info.key)} fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </article>
}

function GroupTitle({ index, title, description, icon, aside }: { index: string; title: string; description: string; icon: string; aside?: string }) {
  return <div className="ri-group-head">
    <div className="ri-group-title-wrap"><span className="ri-group-icon"><Icon name={icon}/></span><div><span className="ri-index">{index} / INDICATORS</span><h4>{title}</h4><p>{description}</p></div></div>
    {aside && <span className="ri-group-aside">{aside}</span>}
  </div>
}

export function LiveRecovery({ active, period, onGoSettings }: { active: boolean; period: 7 | 30; onGoSettings: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [data, setData] = useState<HealthResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!garminSupabase) { setAuthReady(true); return }
    let live = true
    garminSupabase.auth.getSession().then(({ data: result }) => {
      if (live) { setSession(result.session); setAuthReady(true) }
    }).catch(() => { if (live) setAuthReady(true) })
    const { data: subscription } = garminSupabase.auth.onAuthStateChange((_event, next) => {
      if (live) { setSession(next); setAuthReady(true); if (!next) setData(null) }
    })
    return () => { live = false; subscription.subscription.unsubscribe() }
  }, [])

  const load = useCallback(async (token: string, signal: AbortSignal): Promise<HealthResponse> => {
    const response = await fetch(`${garminSupabaseUrl}/functions/v1/read-garmin-health`, {
      headers: { Authorization: `Bearer ${token}`, apikey: garminPublishableKey },
      cache: 'no-store', signal,
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : `HTTP ${response.status}`
      throw new Error(message)
    }
    return body as HealthResponse
  }, [])

  useEffect(() => {
    if (!active || !session) return
    const controller = new AbortController()
    setLoading(true); setError('')
    load(session.access_token, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Keine Verbindung') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [active, session, revision, load])

  const days = useMemo(() => (data?.metrics ?? []).filter(d => d.metric_date >= dayOffset(period - 1)), [data, period])
  const sleepCount = days.filter(d => typeof d.sleep_seconds === 'number').length
  return <>
    <div className="section-title"><h3>Deine Signale</h3><small>GARMIN HEALTH / LIVE · Keine medizinische Trainingsfreigabe</small></div>
    <section className="recovery-live ri-panel" aria-label="Garmin-Indikatoren nach Schlaf, Regeneration und Belastung">
      <div className="ri-top"><div><span className="micro-label">HORIZON / GARMIN INTELLIGENCE</span><p>Echte Messwerte aus Supabase · {period}-Tage-Ansicht · Keine automatische Trainingsentscheidung</p></div>
        {session && <button className="secondary ri-refresh" type="button" onClick={() => setRevision(r => r + 1)} disabled={loading}><Icon name="activity"/> {loading ? 'Lade ...' : 'Aktualisieren'}</button>}
      </div>
      {!garminSupabaseReady && <div className="ri-notice">Supabase-Zugang ist noch nicht konfiguriert. Prüfe die lokale Installation von v0.4.1.</div>}
      {garminSupabaseReady && !authReady && <div className="ri-notice">Anmeldung wird geprüft ...</div>}
      {garminSupabaseReady && authReady && !session && <div className="ri-gate"><div><strong>Garmin-Verbindung nicht angemeldet</strong><p>Den persönlichen Zugang verwaltest du jetzt unter Einstellungen. Hier erscheinen nach dem Login nur deine Messwerte.</p></div><button className="primary" onClick={onGoSettings} type="button">Zu Einstellungen <Icon name="arrow-up-right"/></button></div>}
      {error && <div className="recovery-live-error" role="alert">{error}</div>}
      {session && loading && !data && <div className="ri-notice">Deine Garmin-Werte werden geladen ...</div>}
      {session && data && <>
        <div className="ri-summary">{days.length} Datensätze im gewählten Zeitraum · Neuester Tag: {days.length ? days[days.length - 1].metric_date : '–'} {loading ? ' · Aktualisierung läuft' : ''}</div>
        <section className="ri-domain ri-sleep" aria-label="Schlafindikatoren">
          <GroupTitle index="01" title="Schlaf" icon="moon" description="Wie lange hast du geschlafen – und welche Nachtsignale fehlen uns noch?" aside={`${sleepCount}/${period} Nächte mit Dauerwert`}/>
          <div className="ri-sleep-layout"><MetricCard info={sleep} days={days} period={period} prominent/>
            <div className="ri-placeholder"><span>NOCH NICHT IMPORTIERT</span><strong>Nächtliche Herzfrequenz</strong><p>Das wäre ein sinnvoller Kontext zur Schlafdauer. Der Tagesruhepuls ist kein Ersatz für die nächtliche HF.</p><div className="ri-placeholder-line"/><strong>Schlafbewertung</strong><p>Nur anzeigen, wenn Garmin uns dafür tatsächlich einen Wert liefert.</p></div>
          </div>
          <p className="ri-fineprint">Schlafdauer allein beschreibt nicht die Schlafqualität. Fehlende Werte bleiben fehlend.</p>
        </section>
        <section className="ri-domain ri-recovery" aria-label="Gesundheits- und Regenerationsindikatoren">
          <GroupTitle index="02" title="Gesundheit & Regeneration" icon="heart-pulse" description="HRV und Ruhepuls im Kontext mit Stress und Body Battery – ohne pauschalen Readiness-Score." aside="Gemessene Garmin-Werte"/>
          <div className="ri-metric-grid">{recovery.map(info => <MetricCard key={info.key} info={info} days={days} period={period}/>)}</div>
          <p className="ri-fineprint">Vergleiche mit dem gewählten Zeitraum; eine belastbare persönliche Baseline folgt mit mehr Historie. Symptome und Befinden gehen vor Wearable-Werten.</p>
        </section>
        <TrainingLoadPanel training={data.training ?? null}/>
        <div className="recovery-live-note">Datenquelle: Garmin Personal API via Supabase. Die Coach-Empfehlung oberhalb dieser Ansicht ist weiterhin eine gekennzeichnete Demo und nicht aus diesen Messwerten errechnet.</div>
      </>}
    </section>
  </>
}
