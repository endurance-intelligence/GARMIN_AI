/** GARMIN_AI v0.3.1 - scheduled Garmin -> Supabase ingestion.
 *  Garmin API key stays in Supabase Edge secrets; 256-bit scheduler token
 *  lives in encrypted Postgres Vault, verified through a service-role-only RPC.
 *  Neither token nor Garmin data is public. Garmin access is read-only.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

type RecordLike = Record<string, unknown>
const GARMIN = 'https://personal.connectapi.garmin.com'
const LIMIT = 10

function asObject(value: unknown): RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordLike : {}
}
function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
function adminKey(): string {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    try {
      const map = JSON.parse(modern) as Record<string, string>
      if (map.default) return map.default
    } catch { /* Try legacy key below. */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('No server-side Supabase secret key available')
}
async function garminCall(path: string, type: 'ApiKey' | 'Bearer', secret: string, method = 'GET') {
  const response = await fetch(GARMIN + path, {
    method,
    headers: { Authorization: `${type} ${secret}` },
    signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error(`Garmin ${path.includes("/personalapitoken-service/") ? "token" : path.includes("/activitylist-service/") ? "activities" : "detail"} HTTP ${response.status}`)
  return await response.text()
}
async function accessToken(key: string): Promise<string> {
  const value = (await garminCall(
    '/personalapitoken-service/personal-api/personal-api-key/token', 'ApiKey', key, 'POST'
  )).trim().replace(/^"|"$/g, '')
  if (!/^[A-Za-z0-9_+/.=-]{20,2048}$/.test(value)) throw new Error('Unexpected Garmin token')
  return value
}
async function readActivities(key: string) {
  const token = await accessToken(key)
  const raw = JSON.parse(await garminCall(
    `/activitylist-service/activities/search/activities?start=0&limit=${LIMIT}`, 'Bearer', token
  )) as unknown
  const object = asObject(raw)
  const list = Array.isArray(raw) ? raw : (object.activities ?? object.activityList ?? object.data)
  if (!Array.isArray(list)) throw new Error('Unexpected Garmin activities response')
  const rows = list.map((value: unknown) => {
    const activity = asObject(value)
    const id = activity.activityId
    if (typeof id !== 'number' && typeof id !== 'string') return null
    if (!/^\d+$/.test(String(id))) return null
    return {
      activity_id: String(id),
      activity_name: asText(activity.activityName) ?? 'Aktivitaet',
      start_time_local: asText(activity.startTimeLocal),
      sport_type: asText(asObject(activity.activityType).typeKey) ?? asText(activity.sportType),
      distance_m: asNumber(activity.distance),
      duration_s: asNumber(activity.duration),
      average_heart_rate: asNumber(activity.averageHR ?? activity.averageHeartRate),
      rpe_raw: null as number | null,
      feeling_raw: null as number | null,
      raw_activity: activity,
      synced_at: new Date().toISOString(),
    }
  }).filter((row): row is NonNullable<typeof row> => row !== null)

  // Only read one activity detail for now. More activity details and health metrics
  // will be added as separate bounded synchronization jobs.
  if (rows.length) {
    try {
      const detail = JSON.parse(await garminCall(
        `/activity-service/activity/${rows[0].activity_id}`, 'Bearer', token
      )) as unknown
      const summary = asObject(asObject(detail).summaryDTO)
      rows[0].rpe_raw = asNumber(summary.directWorkoutRpe)
      rows[0].feeling_raw = asNumber(summary.directWorkoutFeel)
      rows[0].raw_activity = { ...rows[0].raw_activity, summaryDTO: summary }
    } catch { /* An unavailable detail must not prevent activity synchronization. */ }
  }
  return rows
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const submittedToken = req.headers.get('x-garmin-sync-secret') ?? ''
  if (!/^[a-f0-9]{64}$/.test(submittedToken)) return json({ error: 'Unauthorized' }, 401)
  const apiKey = Deno.env.get('GARMIN_API_KEY') ?? ''
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  if (!apiKey || !url) return json({ error: 'Server configuration incomplete' }, 503)

  let admin
  try {
    admin = createClient(url, adminKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  } catch { return json({ error: 'Supabase admin configuration incomplete' }, 503) }

  // The verifier is service-role-only; the token lives solely in encrypted
  // Supabase Vault, never in Git, browser code or an Edge Function environment.
  const { data: allowed, error: authorizationError } = await admin.rpc(
    'garmin_verify_cron_token', { p_token: submittedToken }
  )
  if (authorizationError) {
    console.error('GARMIN_AI scheduler authorization unavailable:', authorizationError.code)
    return json({ error: 'Authorization service unavailable' }, 503)
  }
  if (allowed !== true) return json({ error: 'Unauthorized' }, 401)

  try {
    const rows = await readActivities(apiKey)
    if (rows.length > 0) {
      // Preserve RPE/Feeling enriched by the separate detail job; the ten-item
      // list response contains no such fields for most activities.
      const ids = rows.map(row => row.activity_id)
      const { data: current, error: lookupError } = await admin.from('garmin_activities')
        .select('activity_id,rpe_raw,feeling_raw,raw_activity')
        .in('activity_id', ids)
      if (lookupError) throw new Error(`Database lookup: ${lookupError.code}`)
      type Existing = { activity_id: string; rpe_raw: unknown; feeling_raw: unknown; raw_activity: unknown }
      const previous = new Map<string, Existing>((current ?? []).map((item: Existing) => [String(item.activity_id), item]))
      for (const row of rows) {
        const existing = previous.get(row.activity_id)
        if (!existing) continue
        row.rpe_raw ??= asNumber(existing.rpe_raw)
        row.feeling_raw ??= asNumber(existing.feeling_raw)
        const oldRaw = asObject(existing.raw_activity)
        const freshRaw = asObject(row.raw_activity)
        row.raw_activity = { ...oldRaw, ...freshRaw,
          ...(freshRaw.summaryDTO === undefined && oldRaw.summaryDTO !== undefined
            ? { summaryDTO: oldRaw.summaryDTO } : {}),
        }
      }
      const { error } = await admin.from('garmin_activities').upsert(rows, {
        onConflict: 'activity_id',
      })
      if (error) throw new Error(`Database upsert: ${error.message}`)
    }
    // Successful sync log. A failure here should be visible, not silently ignored.
    const { error: logError } = await admin.from('garmin_sync_runs').insert({
      activity_count: rows.length,
      result: 'success',
      finished_at: new Date().toISOString(),
    })
    if (logError) throw new Error(`Sync log: ${logError.message}`)
    return json({ ok: true, source: 'Garmin Personal API', stored: rows.length })
  } catch (error) {
    // Do not disclose keys or raw Garmin data in error messages or logs.
    const message = error instanceof Error ? error.message : 'Unexpected synchronization failure'
    console.error('GARMIN_AI sync failed:', message.replace(/[A-Za-z0-9_+/.=-]{90,}/g, '[redacted]'))
    return json({ ok: false, error: 'Synchronization failed; check Edge Function logs' }, 502)
  }
})
