/** GARMIN_AI v0.5.0: bounded, resumable historical Garmin activity import.
 *  Paginated read-only Garmin API fetch, private Supabase RPC cursor, Vault token auth.
 *  This first phase imports activity LIST records; per-activity track/interval detail
 *  is a separate future job. Never return raw health data or credentials.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const GARMIN = 'https://personal.connectapi.garmin.com'
const PAGE_SIZE = 50

type Dict = Record<string, unknown>
function obj(value: unknown): Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Dict : {}
}
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
function json(value: unknown, code = 200): Response {
  return new Response(JSON.stringify(value), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
function serviceKey(): string {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Dict
      if (typeof parsed.default === 'string' && parsed.default) return parsed.default
    } catch { /* fall back */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('Supabase service credentials unavailable')
}
async function request(path: string, kind: 'ApiKey' | 'Bearer', token: string, method = 'GET', label = 'request') {
  const response = await fetch(GARMIN + path, {
    method,
    headers: { Authorization: `${kind} ${token}` },
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`)
  return response.text()
}
async function readPage(key: string, offset: number) {
  const token = (await request(
    '/personalapitoken-service/personal-api/personal-api-key/token',
    'ApiKey', key, 'POST', 'token',
  )).trim().replace(/^"|"$/g, '')
  if (!/^[A-Za-z0-9_+/.=-]{20,2048}$/.test(token)) throw new Error('Garmin token format')

  const raw = JSON.parse(await request(
    `/activitylist-service/activities/search/activities?start=${offset}&limit=${PAGE_SIZE}`,
    'Bearer', token, 'GET', 'activity-list',
  )) as unknown
  const outer = obj(raw)
  const entries = Array.isArray(raw) ? raw : (outer.activities ?? outer.activityList ?? outer.data)
  if (!Array.isArray(entries)) throw new Error('Activity list response shape')
  if (entries.length > PAGE_SIZE) throw new Error('Unexpected Garmin activity page size')

  const ids = new Set<string>()
  const rows = [] as Dict[]
  for (const entry of entries) {
    const activity = obj(entry)
    const id = String(activity.activityId ?? '')
    if (!/^\d+$/.test(id) || ids.has(id)) continue
    ids.add(id)
    rows.push({
      activity_id: id,
      activity_name: str(activity.activityName) ?? 'Aktivitaet',
      start_time_local: str(activity.startTimeLocal),
      sport_type: str(obj(activity.activityType).typeKey) ?? str(activity.sportType),
      distance_m: num(activity.distance),
      duration_s: num(activity.duration),
      average_heart_rate: num(activity.averageHR ?? activity.averageHeartRate),
      raw_activity: activity,
    })
  }
  return { received: entries.length, rows }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const submitted = req.headers.get('x-garmin-sync-secret') ?? ''
  if (!/^[a-f0-9]{64}$/.test(submitted)) return json({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const apiKey = Deno.env.get('GARMIN_API_KEY') ?? ''
  if (!url || !apiKey) return json({ error: 'Backend configuration missing' }, 503)

  let admin
  try {
    admin = createClient(url, serviceKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  } catch { return json({ error: 'Backend configuration missing' }, 503) }

  // Same private Vault authorization already used by the running Garmin jobs.
  const { data: valid, error: authError } = await admin.rpc('garmin_verify_cron_token', {
    p_token: submitted,
  })
  if (authError) return json({ error: 'Authorization unavailable' }, 503)
  if (valid !== true) return json({ error: 'Unauthorized' }, 401)

  const { data: claim, error: claimError } = await admin.rpc('garmin_history_claim')
  if (claimError) {
    console.error('GARMIN_AI history claim failed', claimError.code)
    return json({ error: 'History claim failed' }, 503)
  }
  if (!claim) return json({ ok: true, skipped: true, reason: 'No active page' })

  const offset = Number(claim.offset)
  const leaseToken = String(claim.lease_token ?? '')
  if (!Number.isSafeInteger(offset) || offset < 0 || !/^[a-f0-9-]{36}$/.test(leaseToken)) {
    return json({ error: 'Invalid history claim' }, 503)
  }

  try {
    const page = await readPage(apiKey, offset)
    const { data, error } = await admin.rpc('garmin_history_apply_page', {
      p_lease_token: leaseToken,
      p_offset: offset,
      p_received: page.received,
      p_rows: page.rows,
    })
    if (error) {
      console.error('GARMIN_AI history apply failed', error.code)
      throw new Error('database-apply')
    }
    return json({ ok: true, progress: data })
  } catch (caught) {
    // Store only the safe stage and status, never raw Garmin responses or tokens.
    const reason = caught instanceof Error ? caught.message : 'unexpected'
    const safeReason = /^(token|activity-list) HTTP \d{3}$/.test(reason)
      ? reason : /^(Garmin token format|Activity list response shape|Unexpected Garmin activity page size|database-apply)$/.test(reason)
      ? reason : 'request-failed'
    const { error } = await admin.rpc('garmin_history_fail', {
      p_lease_token: leaseToken,
      p_reason: safeReason,
    })
    if (error) console.error('GARMIN_AI history failure recording unavailable', error.code)
    console.error('GARMIN_AI history page failed', safeReason)
    return json({ ok: false, error: 'History page failed; see backfill state' }, 502)
  }
})
