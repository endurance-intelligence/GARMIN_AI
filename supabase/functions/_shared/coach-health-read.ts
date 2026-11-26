import {createClient} from 'npm:@supabase/supabase-js@2'
export function utcDay(daysAgo: number): string {
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

export async function readTraining(admin: ReturnType<typeof createClient>) {
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

