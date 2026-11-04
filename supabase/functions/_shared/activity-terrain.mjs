/**
 * GARMIN_AI v0.7.2 - deterministic terrain windows from measured distance/elevation.
 * No grade-adjusted pace, no intensity score, no physiological inference.
 */
const finite = v => typeof v === 'number' && Number.isFinite(v)

function median(values) {
  const v = values.filter(finite).sort((a, b) => a - b)
  if (!v.length) return null
  return v[Math.floor(v.length / 2)]
}

function interpolate(series, d) {
  let lo = 0, hi = series.length - 1
  if (d < series[0].d || d > series[hi].d) return null
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (series[mid].d < d) lo = mid + 1
    else hi = mid
  }
  const right = series[lo]
  if (right.d === d) return right.h
  if (lo === 0) return null
  const left = series[lo - 1]
  const width = right.d - left.d
  // Never interpolate over distance gaps: a large gap hides terrain changes.
  if (width <= 0 || width > 150) return null
  return left.h + ((d - left.d) / width) * (right.h - left.h)
}

/** @param {Array<{distance?:number,elevation?:number}>} records */
export function terrainWindows(records, windowM = 100) {
  if (!Array.isArray(records) || !Number.isInteger(windowM) || windowM < 50 || windowM > 250) {
    throw new Error('Invalid terrain input')
  }
  // Full distance range, *not* a sequence of array indexes or timestamps.
  const valid = records.filter(p => finite(p?.distance) && p.distance >= 0 &&
    finite(p?.elevation) && p.elevation >= -500 && p.elevation <= 9000)
  if (valid.length < 8) return { windows: [], quality: 'insufficient-elevation', windowM }
  const series = []
  for (let i = 0; i < valid.length; i++) {
    const d = valid[i].distance
    if (series.length && d <= series.at(-1).d) continue
    // Short median removes isolated barometric/GPS elevation spikes.
    const neighborhood = valid.slice(Math.max(0, i - 2), Math.min(valid.length, i + 3))
      .filter(p => Math.abs(p.distance - d) <= 25).map(p => p.elevation)
    const h = median(neighborhood)
    if (h !== null) series.push({ d, h })
  }
  if (series.length < 8 || series.at(-1).d - series[0].d < windowM) {
    return { windows: [], quality: 'insufficient-distance', windowM }
  }
  const windows = []
  const startBin = Math.ceil(series[0].d / windowM) * windowM
  for (let start = startBin; start + windowM <= series.at(-1).d; start += windowM) {
    const a = interpolate(series, start)
    const b = interpolate(series, start + windowM)
    if (a === null || b === null) continue
    const delta = b - a
    const gradePct = delta / windowM * 100
    // An implausible average gradient cannot justify a coach assessment.
    if (Math.abs(gradePct) > 35) continue
    windows.push({
      startDistanceM: start, endDistanceM: start + windowM,
      elevationDeltaM: Math.round(delta * 10) / 10,
      gradePct: Math.round(gradePct * 10) / 10,
      terrain: gradePct >= 3 ? 'uphill' : gradePct <= -3 ? 'downhill' : 'level',
    })
  }
  const expected = Math.floor((series.at(-1).d - startBin) / windowM)
  const coverage = expected > 0 ? windows.length / expected : 0
  return { windows, quality: coverage >= 0.8 ? 'usable' : 'partial', windowM,
    coverage: Math.round(coverage * 1000) / 1000 }
}
