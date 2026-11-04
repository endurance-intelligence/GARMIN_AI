/** GARMIN_AI v0.6.0: read-only private session analyst API.
 * This endpoint never exposes Garmin tokens, GPS coordinates, or workouts outside the athlete's account.
 * Supabase Auth is verified INSIDE the function; never turn this into an anonymous data API.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const projectUrl = Deno.env.get('SUPABASE_URL') || ''
const ownerEmail = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL') || '').trim().toLowerCase()
const runningTypes = ['running', 'track_running', 'treadmill_running', 'ultra_run']

type NumericPoint = { i: number; hr?: number; speed?: number; elapsed?: number; distance?: number; elevation?: number; power?: number; cadence?: number }

function key(kind: 'publishable' | 'secret'): string {
  const modern = kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS'
  const legacy = kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const value: unknown = JSON.parse(Deno.env.get(modern) || '{}')
    if (value && typeof value === 'object' && 'default' in value) {
      const secret = (value as { default?: unknown }).default
      if (typeof secret === 'string' && secret) return secret
    }
  } catch { /* Legacy fallback for configured projects. */ }
  return Deno.env.get(legacy) || ''
}
function cors(origin: string | null): Record<string, string> {
  const allow = !!origin && /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
  return {
    ...(allow ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }
}
function json(value: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), { status, headers })
}
function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function point(value: unknown, i: number): NumericPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const hr = numeric(v.hr)
  const speed = numeric(v.speed)
  const elapsed = numeric(v.elapsed)
  const distance = numeric(v.distance)
  const elevation = numeric(v.elevation)
  const power = numeric(v.power)
  const cadence = numeric(v.cadence)
  // Whitelist only analysis metrics. Discard raw descriptors and any GPS payloads.
  const p: NumericPoint = { i }
  if (hr !== null && hr >= 35 && hr <= 220) p.hr = hr
  if (speed !== null && speed >= 0 && speed <= 20) p.speed = speed
  if (elapsed !== null && elapsed >= 0) p.elapsed = elapsed
  if (distance !== null && distance >= 0) p.distance = distance
  if (elevation !== null && elevation >= -500 && elevation <= 9000) p.elevation = elevation
  if (power !== null && power >= 0 && power <= 2500) p.power = power
  if (cadence !== null && cadence >= 0 && cadence <= 250) p.cadence = cadence
  return Object.keys(p).length > 1 ? p : null
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const headers = cors(origin)
  if (origin && !headers['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, headers)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405, headers)
  if (!projectUrl || !ownerEmail || !key('publishable') || !key('secret')) {
    return json({ error: 'Private analyst not configured' }, 503, headers)
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')
  if (!match) return json({ error: 'Login required' }, 401, headers)

  try {
    const auth = createClient(projectUrl, key('publishable'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await auth.auth.getUser(match[1])
    if (authError || !user) return json({ error: 'Invalid session' }, 401, headers)
    if (!user.email_confirmed_at || user.email?.trim().toLowerCase() !== ownerEmail) {
      return json({ error: 'Account not authorized for Garmin activity data' }, 403, headers)
    }
    const admin = createClient(projectUrl, key('secret'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (id !== null && !/^\d{5,20}$/.test(id)) return json({ error: 'Invalid activity ID' }, 400, headers)

    if (id === null) {
      const { data, error } = await admin.from('garmin_activities')
        .select('activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw')
        .in('sport_type', runningTypes)
        .order('start_time_local', { ascending: false })
        .limit(40)
      if (error) throw new Error(`activity-list ${error.code}`)
      const activities = data ?? []
      const ids = activities.map(a => String(a.activity_id))
      const details = ids.length ? await admin.from('garmin_activity_details')
        .select('activity_id,status,hr_sample_count,sample_count,lap_count,fit_status')
        .in('activity_id', ids) : { data: [], error: null }
      if (details.error) throw new Error(`detail-list ${details.error.code}`)
      const status = new Map((details.data ?? []).map(d => [String(d.activity_id), d]))
      return json({ source: 'Garmin / Supabase', activities: activities.map(a => ({
        id: String(a.activity_id), name: a.activity_name, date: a.start_time_local,
        sport: a.sport_type, distanceM: a.distance_m, durationS: a.duration_s,
        avgHr: a.average_heart_rate, rpeRaw: a.rpe_raw,
        detailStatus: status.get(String(a.activity_id))?.status ?? 'not-imported',
        hrSamples: status.get(String(a.activity_id))?.hr_sample_count ?? 0,
        laps: status.get(String(a.activity_id))?.lap_count ?? 0,
        fitStatus: status.get(String(a.activity_id))?.fit_status ?? 'not-imported',
      })) }, 200, headers)
    }

    const { data: activity, error: activityError } = await admin.from('garmin_activities')
      .select('activity_id,activity_name,start_time_local,sport_type,distance_m,duration_s,average_heart_rate,rpe_raw')
      .eq('activity_id', id).maybeSingle()
    if (activityError) throw new Error(`activity ${activityError.code}`)
    if (!activity || !runningTypes.includes(activity.sport_type)) return json({ error: 'Running activity not found' }, 404, headers)
    const { data: detail, error: detailError } = await admin.from('garmin_activity_details')
      .select('status,samples,hr_sample_count,lap_count,laps,summary,fetched_at,fit_status,fit_record_count,fit_laps,fit_events,fit_sessions,fit_workout_steps,fit_terrain,fit_quality,fit_fetched_at')
      .eq('activity_id', id).maybeSingle()
    if (detailError) throw new Error(`details ${detailError.code}`)
    const useFit = detail?.fit_status === 'complete' && numeric(detail?.fit_record_count) !== null && (detail?.fit_record_count ?? 0) > 1
    let rawSamples: unknown[] = Array.isArray(detail?.samples) ? detail.samples : []
    if (useFit) {
      const { data: chunks, error: chunkError } = await admin.from('garmin_fit_record_chunks')
        .select('records').eq('activity_id', id).order('chunk_index', { ascending: true })
      if (chunkError) throw new Error(`fit-chunks ${chunkError.code}`)
      rawSamples = (chunks ?? []).flatMap(c => Array.isArray(c.records) ? c.records : [])
    }
    const sampled = rawSamples.length <= 1800 ? rawSamples : Array.from({ length: 1800 }, (_, i) =>
      rawSamples[Math.floor(i * (rawSamples.length - 1) / 1799)])
    const samples = sampled.map((s, index) => point(s, index)).filter(p => p !== null)
    const summary = detail?.summary && typeof detail.summary === 'object' ? detail.summary as Record<string, unknown> : {}
    return json({
      source: 'Garmin / Supabase',
      activity: {
        id: String(activity.activity_id), name: activity.activity_name,
        date: activity.start_time_local, sport: activity.sport_type,
        distanceM: activity.distance_m, durationS: activity.duration_s,
        avgHr: activity.average_heart_rate, rpeRaw: activity.rpe_raw,
        maxHr: numeric(summary.max_hr),
      },
      details: {
        status: detail?.status ?? 'not-imported',
        hrSampleCount: detail?.hr_sample_count ?? 0,
        lapCount: detail?.lap_count ?? 0,
        laps: Array.isArray(detail?.laps) ? detail.laps.slice(0, 100).map((lap: unknown) => {
          const l = lap && typeof lap === 'object' && !Array.isArray(lap) ? lap as Record<string, unknown> : {}
          return { index: numeric(l.index), elapsedS: numeric(l.elapsed_s), distanceM: numeric(l.distance_m), avgHr: numeric(l.avg_hr) }
        }) : [],
        fetchedAt: detail?.fetched_at ?? null,
        fitStatus: detail?.fit_status ?? 'not-imported',
        fitFetchedAt: detail?.fit_fetched_at ?? null,
        sampleSource: useFit ? 'original-fit' : 'garmin-api-chart',
        fitRecordCount: detail?.fit_record_count ?? 0,
        fitLapCount: Array.isArray(detail?.fit_laps) ? detail.fit_laps.length : 0,
        fitEventCount: Array.isArray(detail?.fit_events) ? detail.fit_events.length : 0,
        fitWorkoutStepCount: Array.isArray(detail?.fit_workout_steps) ? detail.fit_workout_steps.length : 0,
        fitQuality: detail?.fit_quality ?? {},
        terrainWindows: Array.isArray(detail?.fit_terrain) ? detail.fit_terrain.slice(0, 10000) : [],
        samples,
      },
    }, 200, headers)
  } catch (error) {
    console.error('GARMIN_AI analyst read failed:', error instanceof Error ? error.message : 'unexpected')
    return json({ error: 'Session data currently unavailable' }, 502, headers)
  }
})
