/** GARMIN_AI v0.4.0 - server-side, read-only Garmin daily health ingestion.
 *  This is a separate job from activities. No health data or secrets are returned
 *  to browsers, logged, or stored in Git. Missing data never becomes zero.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

type JsonMap = Record<string, unknown>
type HealthColumn = 'hrv_ms' | 'resting_heart_rate' | 'sleep_seconds' | 'stress_avg' | 'body_battery_max'
type HealthDay = { metric_date: string } & Partial<Record<HealthColumn, number>>
type SourceName = 'hrv' | 'daily' | 'sleep' | 'stress' | 'battery'

const GARMIN = 'https://personal.connectapi.garmin.com'
const DAYS_BACK = 15 // Today + 15 prior calendar days, to absorb late Garmin uploads.
const FIELDS: HealthColumn[] = ['hrv_ms', 'resting_heart_rate', 'sleep_seconds', 'stress_avg', 'body_battery_max']

function obj(v: unknown): JsonMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as JsonMap : {}
}
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : [] }
function records(v: unknown, keys: string[]): unknown[] {
  if (Array.isArray(v)) return v
  const o = obj(v)
  for (const key of keys) if (Array.isArray(o[key])) return arr(o[key])
  return typeof o.calendarDate === 'string' ? [o] : []
}
function num(v: unknown, min: number, max: number): number | undefined {
  // Only genuine numeric measurements, never null/strings/booleans.
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return undefined
  return v
}
function dateOf(v: unknown): string | null {
  const o = obj(v)
  const raw = o.calendarDate ?? o.date ?? o.day
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}
function dateUtc(n: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - n)
  return date.toISOString().slice(0, 10)
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
function adminKey(): string {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    try {
      const keys = JSON.parse(modern) as JsonMap
      if (typeof keys.default === 'string' && keys.default) return keys.default
    } catch { /* fall back to the legacy service role key */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('Supabase server key unavailable')
}
async function garmin(path: string, auth: 'ApiKey' | 'Bearer', key: string, method = 'GET', label = 'request') {
  const response = await fetch(GARMIN + path, {
    method,
    headers: { Authorization: `${auth} ${key}` },
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`)
  return response.text()
}
async function bearer(key: string): Promise<string> {
  const token = (await garmin(
    '/personalapitoken-service/personal-api/personal-api-key/token',
    'ApiKey', key, 'POST', 'token',
  )).trim().replace(/^"|"$/g, '')
  if (!/^[A-Za-z0-9_+/.=-]{20,2048}$/.test(token)) throw new Error('Garmin token format invalid')
  return token
}

function normalize(sources: Partial<Record<SourceName, unknown>>, start: string, end: string): HealthDay[] {
  const byDate = new Map<string, HealthDay>()
  function assign(date: string | null, field: HealthColumn, value: number | undefined) {
    if (!date || date < start || date > end || value === undefined) return
    const day = byDate.get(date) ?? { metric_date: date }
    day[field] = value
    byDate.set(date, day)
  }

  for (const raw of records(sources.hrv, ['hrvSummaries', 'data'])) {
    const row = obj(raw)
    assign(dateOf(row), 'hrv_ms', num(row.lastNightAvg, 1, 500))
  }
  for (const raw of records(sources.daily, ['data', 'dailySummaries', 'summaries'])) {
    const row = obj(raw)
    const date = dateOf(row)
    const heart = obj(row.heartRate)
    const stress = obj(row.stress)
    const battery = obj(row.bodyBattery)
    assign(date, 'resting_heart_rate', num(heart.restingValue ?? heart.restingHeartRate, 20, 220))
    assign(date, 'stress_avg', num(stress.avgLevel ?? stress.averageStressLevel, 0, 100))
    assign(date, 'body_battery_max', num(battery.maxValue ?? battery.highestValue, 0, 100))
  }
  for (const raw of records(sources.sleep, ['dailySleepSummaries', 'data', 'sleepSummaries'])) {
    const wrapper = obj(raw)
    const row = Object.keys(obj(wrapper.dailySleepDTO)).length ? obj(wrapper.dailySleepDTO) : wrapper
    const seconds = num(row.sleepTimeSeconds ?? row.totalSleepSeconds, 1, 86400)
    if (seconds !== undefined) assign(dateOf(row), 'sleep_seconds', Math.round(seconds))
  }
  for (const raw of records(sources.stress, ['data', 'dailyStressSummaries', 'stressSummaries'])) {
    const row = obj(raw)
    const values = obj(row.values)
    assign(dateOf(row), 'stress_avg', num(values.overallStressLevel ?? row.overallStressLevel, 0, 100))
  }
  for (const raw of records(sources.battery, ['data', 'reports', 'bodyBatteryReports', 'dailyBodyBattery'])) {
    const row = obj(raw)
    const report = obj(row.bodyBattery)
    assign(dateOf(row), 'body_battery_max', num(
      row.maxValue ?? row.highestValue ?? report.maxValue ?? report.highestValue, 0, 100,
    ))
  }
  return [...byDate.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date))
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const submitted = req.headers.get('x-garmin-sync-secret') ?? ''
  if (!/^[a-f0-9]{64}$/.test(submitted)) return json({ error: 'Unauthorized' }, 401)
  const apiKey = Deno.env.get('GARMIN_API_KEY') ?? ''
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  if (!apiKey || !url) return json({ error: 'Health ingestion configuration incomplete' }, 503)

  let admin
  try {
    admin = createClient(url, adminKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  } catch { return json({ error: 'Supabase admin configuration incomplete' }, 503) }

  const { data: allowed, error: authError } = await admin.rpc('garmin_verify_cron_token', {
    p_token: submitted,
  })
  if (authError) {
    console.error('GARMIN_AI health authorization unavailable:', authError.code)
    return json({ error: 'Authorization service unavailable' }, 503)
  }
  if (allowed !== true) return json({ error: 'Unauthorized' }, 401)

  const start = dateUtc(DAYS_BACK)
  const end = dateUtc(0)
  try {
    const token = await bearer(apiKey)
    const requests: [SourceName, string][] = [
      ['hrv', `/hrv-service/hrv/daily/${start}/${end}`],
      ['daily', `/usersummary-service/v2/dailysummaries?startDate=${start}&endDate=${end}`],
      ['sleep', `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${start}&endDate=${end}`],
      ['stress', `/usersummary-service/stats/stress/daily/${start}/${end}`],
      ['battery', `/wellness-service/wellness/bodyBattery/reports/daily?startDate=${start}&endDate=${end}`],
    ]
    // Independent requests: a temporarily unavailable Garmin endpoint cannot
    // erase or prevent saving measurements from the other endpoints.
    const results = await Promise.allSettled(requests.map(async ([name, path]) => {
      const payload = await garmin(path, 'Bearer', token, 'GET', name)
      return payload.trim() ? JSON.parse(payload) as unknown : null
    }))
    const sourceData: Partial<Record<SourceName, unknown>> = {}
    const unavailable: SourceName[] = []
    results.forEach((result, index) => {
      const name = requests[index][0]
      if (result.status === 'fulfilled') sourceData[name] = result.value
      else {
        unavailable.push(name)
        const reason = result.reason instanceof Error ? result.reason.message : 'unknown error'
        // Log only the endpoint category and HTTP status / failure type.
        const status = /HTTP \d{3}/.exec(reason)?.[0] ?? 'unavailable'
        console.warn(`GARMIN_AI health ${name}: ${status}`)
      }
    })
    if (unavailable.length === requests.length) throw new Error('All Garmin health sources unavailable')

    const incoming = normalize(sourceData, start, end)
    if (incoming.length === 0) throw new Error('No parseable daily health metrics')
    // Preserve older non-null values when an endpoint is missing a daily value.
    const { data: saved, error: readError } = await admin.from('garmin_daily_metrics')
      .select('metric_date,hrv_ms,resting_heart_rate,sleep_seconds,stress_avg,body_battery_max,raw_metrics')
      .gte('metric_date', start).lte('metric_date', end)
    if (readError) throw new Error(`Health database read: ${readError.code}`)
    const existing = new Map<string, JsonMap>(arr(saved).map((v) => [String(obj(v).metric_date), obj(v)]))
    const now = new Date().toISOString()
    const merged = incoming.map((day) => {
      const previous = existing.get(day.metric_date) ?? {}
      const fields: Partial<Record<HealthColumn, number | null>> = {}
      for (const field of FIELDS) {
        const value = day[field] ?? previous[field]
        fields[field] = typeof value === 'number' && Number.isFinite(value) ? value : null
      }
      return {
        metric_date: day.metric_date,
        ...fields,
        raw_metrics: previous.raw_metrics ?? {},
        synced_at: now,
      }
    })
    if (merged.length > 0) {
      const { error } = await admin.from('garmin_daily_metrics').upsert(merged, {
        onConflict: 'metric_date',
      })
      if (error) throw new Error(`Health database upsert: ${error.code}`)
    }
    const message = `window=${start}..${end}; days=${merged.length}; sources=${requests.length - unavailable.length}/${requests.length}; missing=${unavailable.join(',') || 'none'}`
    const { error: logError } = await admin.from('garmin_sync_runs').insert({
      source: 'garmin-health', result: 'success', activity_count: 0,
      message, finished_at: now,
    })
    if (logError) throw new Error(`Health sync log: ${logError.code}`)
    // Never return individual wearable measurements to the caller.
    return json({ ok: true, source: 'Garmin Personal API', healthDays: merged.length,
      sourcesOk: requests.length - unavailable.length, sourcesTotal: requests.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown health sync error'
    const safe = message.replace(/[A-Za-z0-9_+/.=-]{90,}/g, '[redacted]').slice(0, 150)
    console.error('GARMIN_AI health sync failed:', safe)
    try {
      await admin.from('garmin_sync_runs').insert({
        source: 'garmin-health', result: 'error', activity_count: 0,
        message: safe, finished_at: new Date().toISOString(),
      })
    } catch { /* logging errors must not expose health values */ }
    return json({ ok: false, error: 'Health synchronization failed; check Edge Function logs' }, 502)
  }
})
