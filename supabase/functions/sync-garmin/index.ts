/** GARMIN_AI v0.3.1 - scheduled Garmin -> Supabase ingestion.
 *  Garmin API key stays in Supabase Edge secrets; 256-bit scheduler token
 *  lives in encrypted Postgres Vault, verified through a service-role-only RPC.
 *  Neither token nor Garmin data is public. Garmin access is read-only.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createGarminPersonalClient, GarminPersonalDeferred } from '../_shared/garmin-personal-client.mjs'

type RecordLike = Record<string, unknown>
const GARMIN = 'https://personal.connectapi.garmin.com'
// Bounded rolling reconciliation: also refresh recent edited activities.
const LIMIT = 40

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
function json(data: unknown, status = 200, headers: Record<string,string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
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
async function garminCall(fetcher: typeof fetch, path: string, type: 'ApiKey' | 'Bearer', secret: string, method = 'GET') {
  const response = await fetcher(GARMIN + path, {
    method,
    headers: { Authorization: `${type} ${secret}` },
    signal: AbortSignal.timeout(25000),
  })
  if (response.status === 429) throw new GarminPersonalDeferred(429)
  if (!response.ok) throw new Error(`Garmin ${path.includes("/personalapitoken-service/") ? "token" : path.includes("/activitylist-service/") ? "activities" : "detail"} HTTP ${response.status}`)
  return await response.text()
}
async function readActivities(api: Awaited<ReturnType<typeof createGarminPersonalClient>>) {
  const token = await api.getToken()
  const raw = JSON.parse(await garminCall(api.fetch,
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

  // Only read one activity detail per invocation. More activity details and health metrics
  // will be added as separate bounded synchronization jobs.
  if (rows.length) {
    try {
      const detail = JSON.parse(await garminCall(api.fetch,
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

function manualCors(origin: string | null): Record<string,string> {
  const allowlist=(Deno.env.get('GARMIN_APP_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)
  if (!origin || !(origin==='https://endurance-intelligence.github.io' ||
    /^http:\/\/(127\.0\.0\.1|localhost):517[3-9]$/.test(origin) || allowlist.includes(origin))) return {}
  return {'Access-Control-Allow-Origin':origin,'Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS'}
}
Deno.serve(async (req: Request) => {
  const origin=req.headers.get('origin')
  const headers=manualCors(origin)
  const reply=(data:unknown,status=200)=>json(data,status,headers)
  if(origin&&!headers['Access-Control-Allow-Origin'])return reply({error:'Origin not allowed'},403)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers})
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  const scheduled = req.headers.has('x-garmin-sync-secret')
  const submittedToken = req.headers.get('x-garmin-sync-secret') ?? ''
  const manualToken = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization')||'')?.[1]
  if(scheduled ? !/^[a-f0-9]{64}$/.test(submittedToken) : !manualToken)
    return reply({error:'Unauthorized'},401)
  const apiKey = Deno.env.get('GARMIN_API_KEY') ?? ''
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  if (!apiKey || !url) return reply({ error: 'Server configuration incomplete' }, 503)

  let admin
  try {
    admin = createClient(url, adminKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  } catch { return reply({ error: 'Supabase admin configuration incomplete' }, 503) }

  // The verifier is service-role-only; the token lives solely in encrypted
  // Supabase Vault, never in Git, browser code or an Edge Function environment.
  if (scheduled) {
    const {data:allowed,error:authorizationError}=await admin.rpc('garmin_verify_cron_token',{p_token:submittedToken})
    if(authorizationError)return reply({error:'Authorization service unavailable'},503)
    if(allowed!==true)return reply({error:'Unauthorized'},401)
  } else {
    const owner=(Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL')||'').trim().toLowerCase()
    if(!owner)return reply({error:'Manual sync not configured'},503)
    const {data:{user},error}=await admin.auth.getUser(manualToken!)
    if(error||!user)return reply({error:'Invalid session'},401)
    if(!user.email_confirmed_at||user.email?.trim().toLowerCase()!==owner)
      return reply({error:'Not authorized'},403)
  }

  try {
    const api = await createGarminPersonalClient(admin, apiKey, url)
    await api.ready()
    const {data:gate,error:gateError}=await admin.rpc('garmin_claim_activity_sync')
    if(gateError||typeof gate?.allowed!=='boolean'||typeof gate?.retryAt!=='string')
      return reply({error:'Sync protection unavailable'},503)
    if(!gate.allowed)
      return reply({ok:false,skipped:true,retryAt:gate.retryAt,error:'Activity sync cooldown'},scheduled?200:409)
    const rows = await readActivities(api)
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
    return reply({ ok: true, source: 'Garmin Personal API', stored: rows.length, retryAt:gate.retryAt })
  } catch (error) {
    // Do not disclose keys or raw Garmin data in error messages or logs.
    const message = error instanceof Error ? error.message : 'Unexpected synchronization failure'
    console.error('GARMIN_AI sync failed:', message.replace(/[A-Za-z0-9_+/.=-]{90,}/g, '[redacted]'))
    // Existing job log: record *failure* too. A stale success must not
    // make the mobile app claim that a subsequent failed job was healthy.
    try {
      await admin.from('garmin_sync_runs').insert({
        result: 'error', activity_count: 0,
        message: 'activity-sync-failed', finished_at: new Date().toISOString(),
      })
    } catch { /* failure visibility best effort; never log Garmin credentials */ }
    return reply({ ok: false, error: 'Synchronization deferred or failed; check Edge Function logs' }, error instanceof GarminPersonalDeferred ? (error.status === 429 ? 429 : 503) : 502)
  }
})
