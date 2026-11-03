/** GARMIN_AI v0.5.2 – bounded activity detail enrichment, server-side only.
 *  One Garmin activity per invocation; summary + sampled chart + laps + HR zones,
 *  optional structured-workout link. No GPS/polyline and no Garmin writes.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const GARMIN = 'https://personal.connectapi.garmin.com'
type Dict = Record<string, unknown>
function object(x: unknown): Dict {
  return x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Dict : {}
}
function number(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null
  const v = Number(x)
  return Number.isFinite(v) ? v : null
}
function string(x: unknown): string | null {
  return typeof x === 'string' && x.trim() ? x.trim() : null
}
function list(x: unknown): unknown[] { return Array.isArray(x) ? x : [] }
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  } })
}
function serviceKey(): string {
  try {
    const modern = object(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))
    if (string(modern.default)) return string(modern.default)!
  } catch { /* fall back */ }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('Supabase credentials unavailable')
}
class GarminHttpError extends Error {
  constructor(readonly stage: string, readonly status: number) {
    super(`${stage} HTTP ${status}`)
  }
}
async function fetchGarmin(path: string, kind: 'ApiKey' | 'Bearer', token: string, method = 'GET', stage = 'garmin') {
  const response = await fetch(GARMIN + path, {
    method, headers: { Authorization: `${kind} ${token}` },
    signal: AbortSignal.timeout(18000),
  })
  if (!response.ok) throw new GarminHttpError(stage, response.status)
  if (response.status === 204) return null
  const body = await response.text()
  if (!body.trim()) return null
  try { return JSON.parse(body) as unknown }
  catch { return stage === 'token' ? body.trim() : null }
}
async function optionalGarmin(path: string, token: string, stage: string): Promise<unknown> {
  try { return await fetchGarmin(path, 'Bearer', token, 'GET', stage) }
  catch (e) {
    // Optional chart/laps/zones are not exposed for every sport or Personal API key.
    if (e instanceof GarminHttpError && [400, 403, 404, 405, 406].includes(e.status)) return null
    throw e
  }
}
function descriptors(raw: unknown) {
  const mapped = list(object(raw).metricDescriptors).slice(0, 80).map(item => {
    const d = object(item); const key = string(d.key); const index = number(d.metricsIndex)
    if (!key || index === null || index < 0 || !Number.isInteger(index) || index > 200) return null
    const unit = object(d.unit)
    return { key, index, unit: string(unit.key), factor: number(unit.factor) }
  }).filter(x => x !== null)
  return mapped as { key: string; index: number; unit: string | null; factor: number | null }[]
}
function chart(raw: unknown) {
  const details = object(raw)
  const desc = descriptors(raw)
  const lookup = (pattern: RegExp): number | undefined => desc.find(x => pattern.test(x.key))?.index
  // Garmin Connect emits direct*/sum* metric keys; use the descriptor index,
  // never a hard-coded column position. Keep timestamp/elapsed semantics separate.
  const positions = {
    timestamp: lookup(/^directTimestamp$/i) ?? lookup(/^timestamp$/i),
    elapsed: lookup(/^sumElapsedDuration$/i) ?? lookup(/^sumElapsedTime$/i) ?? lookup(/^elapsed(Duration|Time)$/i),
    hr: lookup(/^directHeartRate$/i) ?? lookup(/^heartRate$/i),
    speed: lookup(/^directSpeed$/i) ?? lookup(/^speed$/i),
    distance: lookup(/^sumDistance$/i) ?? lookup(/^distance$/i),
    cadence: lookup(/^directDoubleCadence$/i) ?? lookup(/^directRunCadence$/i) ?? lookup(/^directBikeCadence$/i) ?? lookup(/^(direct)?cadence$/i) ?? lookup(/^runCadence$/i),
    elevation: lookup(/^directElevation$/i) ?? lookup(/^elevation$/i),
  }
  // No latitude, longitude, GPS coordinates or polyline are persisted.
  const points: Record<string, number>[] = []
  let hrCount = 0
  for (const [i, row] of list(details.activityDetailMetrics).slice(0, 1800).entries()) {
    const metrics = list(object(row).metrics)
    if (!metrics.length) continue
    const p: Record<string, number> = { i }
    for (const [field, index] of Object.entries(positions)) {
      if (index === undefined) continue
      const val = number(metrics[index])
      if (val !== null) p[field] = val
    }
    if (Object.keys(p).length <= 1) continue
    if (p.hr !== undefined) hrCount++
    points.push(p)
  }
  const usefulKeys = new Set(Object.values(positions).filter(x => x !== undefined))
  return { points, hrCount, descriptors: desc.filter(x => usefulKeys.has(x.index)),
    available: list(details.activityDetailMetrics).length > 0 }
}
function laps(raw: unknown) {
  const root = object(raw)
  const items = Array.isArray(raw) ? raw : list(root.lapDTOs ?? root.laps ?? root.lapList)
  const normalized = items.slice(0, 1000).map((lap, i) => {
    const d = object(lap)
    return {
      index: number(d.lapIndex ?? d.lapNumber) ?? i + 1,
      elapsed_s: number(d.elapsedDuration ?? d.elapsedTime),
      moving_s: number(d.movingDuration),
      distance_m: number(d.distance),
      avg_hr: number(d.averageHR ?? d.averageHeartRate),
      max_hr: number(d.maxHR ?? d.maxHeartRate),
      avg_speed: number(d.averageSpeed),
      avg_cadence: number(d.averageRunCadence ?? d.averageCadence),
      intensity: string(d.intensityType ?? d.lapType),
    }
  })
  return { items: normalized, available: Array.isArray(raw) || Array.isArray(root.lapDTOs) || Array.isArray(root.laps) }
}
function zones(raw: unknown) {
  const root = object(raw)
  const entries = Array.isArray(raw) ? raw : list(root.zones ?? root.hrTimeInZones ?? root.heartRateZones)
  return { items: entries.slice(0, 20).map(zone => {
    const d = object(zone)
    return { zone: number(d.zoneNumber ?? d.zone ?? d.zoneIndex),
      seconds: number(d.secsInZone ?? d.timeInZone ?? d.duration),
      low_bpm: number(d.zoneLowBoundary ?? d.lowBoundary),
      high_bpm: number(d.zoneHighBoundary ?? d.highBoundary),
    }
  }), available: entries.length > 0 }
}
function workouts(raw: unknown) {
  const root = object(raw)
  const entries = Array.isArray(raw) ? raw : (root.workoutName || root.workoutSegments ? [root] : list(root.workouts ?? root.workoutList ?? root.data))
  return entries.slice(0, 10).map(item => {
    const d = object(item)
    const segments = list(d.workoutSegments).slice(0, 30).map(s => {
      const seg = object(s)
      return { type: string(seg.segmentType), steps: list(seg.workoutSteps).slice(0, 100).map(step => {
        const w = object(step)
        return { type: string(w.stepType),
          category: string(w.exerciseCategory), exercise: string(w.exerciseName),
          duration_type: string(object(w.durationType).durationTypeKey ?? w.durationType),
          duration_value: number(w.durationValue),
          target_type: string(object(w.targetType).workoutTargetTypeKey ?? w.targetType),
          repeat: number(w.numberOfIterations),
        }
      }) }
    })
    return { name: string(d.workoutName ?? d.name), segments }
  })
}
function cleanSummary(raw: unknown) {
  const root = object(raw), s = object(root.summaryDTO)
  return { activity_id: string(root.activityId?.toString()),
    name: string(root.activityName), sport_type: string(object(root.activityTypeDTO).typeKey),
    duration_s: number(s.duration ?? s.elapsedDuration),
    moving_s: number(s.movingDuration), distance_m: number(s.distance),
    avg_hr: number(s.averageHR ?? s.averageHeartRate),
    max_hr: number(s.maxHR ?? s.maxHeartRate),
    avg_speed: number(s.averageSpeed), aerobic_te: number(s.aerobicTrainingEffect),
    anaerobic_te: number(s.anaerobicTrainingEffect),
    training_load: number(s.activityTrainingLoad),
    direct_workout_rpe: number(s.directWorkoutRpe),
    direct_workout_feel: number(s.directWorkoutFeel),
  }
}
async function process(id: string, sport: string | null, token: string) {
  const summary = await fetchGarmin(`/activity-service/activity/${id}`, 'Bearer', token, 'GET', 'summary')
  if (summary === null || Object.keys(object(summary)).length === 0) throw new Error('summary-empty')
  const summaryData = cleanSummary(summary)
  const strength = /strength|mobility|cardio|pilates|yoga|training/i.test(sport ?? '')
  const results = await Promise.all([
    optionalGarmin(`/activity-service/activity/${id}/details?maxChartSize=1800&maxPolylineSize=0`, token, 'chart'),
    optionalGarmin(`/activity-service/activity/${id}/laps`, token, 'laps'),
    optionalGarmin(`/activity-service/activity/${id}/hrTimeInZones`, token, 'zones'),
    strength ? optionalGarmin(`/activity-service/activity/${id}/workouts`, token, 'workouts') : Promise.resolve(null),
  ])
  const c = chart(results[0]), l = laps(results[1]), z = zones(results[2])
  return { summary: summaryData, laps: l.items, samples: c.points,
    descriptors: c.descriptors, zones: z.items, workouts: workouts(results[3]),
    chartAvailable: c.available, lapsAvailable: l.available, zonesAvailable: z.available,
    hrCount: c.hrCount, rpe: summaryData.direct_workout_rpe,
    feeling: summaryData.direct_workout_feel,
    status: c.available && l.available ? 'complete' : 'partial' }
}
function safeError(error: unknown): { reason: string; permanent: boolean; rateLimited: boolean } {
  if (error instanceof GarminHttpError) {
    const permanent = error.stage === 'summary' && error.status === 404
    return { reason: `${error.stage} HTTP ${error.status}`, permanent, rateLimited: error.status === 429 }
  }
  return { reason: error instanceof Error && error.message === 'summary-empty' ? 'summary-empty' : 'request-failed',
    permanent: false, rateLimited: false }
}
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const submitted = req.headers.get('x-garmin-sync-secret') || ''
  if (!/^[a-f0-9]{64}$/.test(submitted)) return json({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL') || ''
  const apiKey = Deno.env.get('GARMIN_API_KEY') || ''
  if (!url || !apiKey) return json({ error: 'Backend configuration missing' }, 503)

  let admin
  try { admin = createClient(url, serviceKey(), { auth: { autoRefreshToken: false, persistSession: false } }) }
  catch { return json({ error: 'Backend configuration missing' }, 503) }
  const { data: valid, error: authError } = await admin.rpc('garmin_verify_cron_token', { p_token: submitted })
  if (authError) return json({ error: 'Authorization unavailable' }, 503)
  if (valid !== true) return json({ error: 'Unauthorized' }, 401)

  let token: string
  try {
    const result = await fetchGarmin('/personalapitoken-service/personal-api/personal-api-key/token', 'ApiKey', apiKey, 'POST', 'token')
    token = (typeof result === 'string' ? result : JSON.stringify(result)).trim().replace(/^"|"$/g, '')
    if (!/^[A-Za-z0-9_+/.=-]{20,2048}$/.test(token)) throw new Error('Garmin token format')
  } catch (error) {
    console.error('GARMIN_AI detail auth failed', safeError(error).reason)
    return json({ error: 'Garmin authorization unavailable' }, 502)
  }

  let stored = 0, partial = 0, skipped = false
  // Maximum 2 activities per scheduled invocation; reduces API pressure.
  for (let n = 0; n < 2; n++) {
    const { data: claim, error: claimError } = await admin.rpc('garmin_detail_claim')
    if (claimError) {
      console.error('GARMIN_AI detail claim failed', claimError.code)
      return json({ error: 'Detail claim failed' }, 503)
    }
    if (!claim) { skipped = true; break }
    const id = String(claim.activity_id ?? '')
    const lease = String(claim.lease_token ?? '')
    if (!/^\d+$/.test(id) || !/^[0-9a-f-]{36}$/.test(lease)) {
      return json({ error: 'Invalid detail claim' }, 503)
    }
    try {
      const d = await process(id, string(claim.sport_type), token)
      const { error: storeError } = await admin.rpc('garmin_detail_store', {
        p_activity_id: id, p_lease_token: lease, p_status: d.status,
        p_summary: d.summary, p_laps: d.laps, p_samples: d.samples,
        p_descriptors: d.descriptors, p_zones: d.zones, p_workouts: d.workouts,
        p_chart_available: d.chartAvailable, p_laps_available: d.lapsAvailable,
        p_zones_available: d.zonesAvailable, p_hr_count: d.hrCount,
        p_rpe: d.rpe, p_feeling: d.feeling,
      })
      if (storeError) throw new Error(`storage ${storeError.code}`)
      stored++
      if (d.status === 'partial') partial++
    } catch (error) {
      const safe = safeError(error)
      const { error: failError } = await admin.rpc('garmin_detail_fail', {
        p_activity_id: id, p_lease_token: lease,
        p_reason: safe.reason, p_permanent: safe.permanent,
      })
      if (failError) console.error('GARMIN_AI detail fail record unavailable', failError.code)
      console.error('GARMIN_AI detail activity failed', safe.reason)
      if (safe.rateLimited) break
    }
  }
  return json({ ok: true, stored, partial, noMoreEligible: skipped })
})
