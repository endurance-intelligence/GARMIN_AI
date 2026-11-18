/** GARMIN_AI v0.4.1 - authenticated, single-athlete recovery read API.
 * Health rows stay private behind RLS. The service-role client is only used
 * AFTER Supabase Auth verifies the JWT AND the confirmed owner email matches.
 * This function never changes workouts, recommendations or health records.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const projectUrl = Deno.env.get('SUPABASE_URL') || ''
const ownerEmail = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL') || '').trim().toLowerCase()

function key(kind: 'publishable' | 'secret'): string {
  const modernName = kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS'
  const legacyName = kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const keys: unknown = JSON.parse(Deno.env.get(modernName) || '{}')
    if (keys && typeof keys === 'object' && 'default' in keys) {
      const selected = (keys as { default?: unknown }).default
      if (typeof selected === 'string' && selected) return selected
    }
  } catch { /* Use legacy project key if configured. */ }
  return Deno.env.get(legacyName) || ''
}

function cors(origin: string | null): Record<string, string> {
  // Vite development environment ONLY. Production requires a new allowlist.
  const permitted = origin==='https://endurance-intelligence.github.io' || (!!origin && /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin))
  return {
    ...(permitted ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  }
}

function reply(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers })
}

function utcDay(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}


// Volume metrics are derived from Garmin activity LIST rows, not from workout samples.
// Never call total minutes or average HR a proprietary Garmin training-load score.
type ActivityRow = {
  start_time_local: string | null
  sport_type: string | null
  distance_m: number | null
  duration_s: number | null
  average_heart_rate: number | null
  rpe_raw: number | null
}
function finiteNonnegative(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
function sportCategory(type: string | null): 'running' | 'cycling' | 'strength' | 'soccer' | 'other' {
  const s = (type || '').toLowerCase()
  if (s.includes('run') || s.includes('jog')) return 'running'
  if (s.includes('soccer') || s.includes('football')) return 'soccer'
  if (s.includes('cycl') || s.includes('bik')) return 'cycling'
  if (s.includes('strength') || s.includes('weight') || s.includes('mobility') || s.includes('pilates')) return 'strength'
  return 'other'
}
function fixed(value: number, places = 1): number { return Number(value.toFixed(places)) }

async function readTraining(admin: ReturnType<typeof createClient>) {
  // Date is stored as Garmin local timestamp text (YYYY-MM-DD...). Compare ISO date prefix.
  const dates = Array.from({ length: 28 }, (_, i) => utcDay(27 - i))
  const { data, error } = await admin.from('garmin_activities')
    .select('start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw')
    .gte('start_time_local', dates[0])
    .order('start_time_local', { ascending: false })
    .limit(1000)
  if (error) throw new Error(`activities ${error.code}`)
  const rows = (data ?? []) as ActivityRow[]
  const count = [0, 0, 0, 0]
  const runKm = [0, 0, 0, 0]
  const minutes = [0, 0, 0, 0]
  const sportCounts = { running: 0, cycling: 0, strength: 0, soccer: 0, other: 0 }
  let avgHeartRateAvailable28 = 0
  let rpeAvailable28 = 0
  for (const row of rows) {
    const date = row.start_time_local?.slice(0, 10) ?? ''
    const offset = dates.indexOf(date)
    if (offset === -1) continue
    const week = Math.floor(offset / 7) // 0 oldest, 3 newest
    const sport = sportCategory(row.sport_type)
    count[week]++
    sportCounts[sport]++
    minutes[week] += finiteNonnegative(row.duration_s) / 60
    if (sport === 'running') runKm[week] += finiteNonnegative(row.distance_m) / 1000
    if (typeof row.average_heart_rate === 'number' && Number.isFinite(row.average_heart_rate)) avgHeartRateAvailable28++
    if (typeof row.rpe_raw === 'number' && Number.isFinite(row.rpe_raw)) rpeAvailable28++
  }
  const { data: progress, error: progressError } = await admin.from('garmin_history_backfill_state')
    .select('status').limit(1).maybeSingle()
  if (progressError) console.error('GARMIN_AI history status unavailable:', progressError.code)
  const historyStatus = !progressError && progress?.status === 'complete' ? 'complete'
    : !progressError && progress?.status ? 'backfill' : 'unknown'
  return {
    source: 'Garmin activity list / Supabase', windowDays: 28,
    historyStatus, truncated: rows.length === 1000,
    activityCount7: count[3], activityCount28: count.reduce((a, b) => a + b, 0),
    runKm7: fixed(runKm[3]), runKm28: fixed(runKm.reduce((a, b) => a + b, 0)),
    previousRunKm7: fixed(runKm[2]),
    minutes7: Math.round(minutes[3]), minutes28: Math.round(minutes.reduce((a, b) => a + b, 0)),
    previousMinutes7: Math.round(minutes[2]), weeklyRunKm: runKm.map(x => fixed(x)),
    sportCounts, avgHeartRateAvailable28, rpeAvailable28,
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const headers = cors(origin)
  if (origin && !headers['Access-Control-Allow-Origin']) return reply({ error: 'Origin not allowed' }, 403, headers)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'GET') return reply({ error: 'Method not allowed' }, 405, headers)

  // Fail closed, even if an attacker gets a valid account in this Supabase project.
  if (!projectUrl || !ownerEmail || !key('publishable') || !key('secret')) {
    return reply({ error: 'Private dashboard not configured' }, 503, headers)
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')
  if (!match) return reply({ error: 'Login required' }, 401, headers)

  try {
    const auth = createClient(projectUrl, key('publishable'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // getUser(token) verifies the token with Supabase Auth, not by decoding it.
    const { data: { user }, error: authError } = await auth.auth.getUser(match[1])
    if (authError || !user) return reply({ error: 'Invalid session' }, 401, headers)
    if (!user.email_confirmed_at || user.email?.trim().toLowerCase() !== ownerEmail) {
      return reply({ error: 'This account is not authorized for Garmin Health' }, 403, headers)
    }

    const admin = createClient(projectUrl, key('secret'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.from('garmin_daily_metrics')
      .select('metric_date,hrv_ms,resting_heart_rate,sleep_seconds,stress_avg,body_battery_max,synced_at')
      .gte('metric_date', utcDay(29))
      .order('metric_date', { ascending: true })
      .limit(31)
    if (error) {
      console.error('GARMIN_AI recovery read failed:', error.code)
      return reply({ error: 'Database read unavailable' }, 502, headers)
    }
    // A failed training-volume read must NOT hide already validated health data.
    let training: Awaited<ReturnType<typeof readTraining>> | null = null
    try { training = await readTraining(admin) }
    catch (caught) {
      console.error('GARMIN_AI training summary unavailable:', caught instanceof Error ? caught.message : 'unexpected')
    }
    return reply({ source: 'Garmin / Supabase', requestedDays: 30, metrics: data ?? [], training }, 200, headers)
  } catch {
    return reply({ error: 'Private data endpoint unavailable' }, 503, headers)
  }
})
