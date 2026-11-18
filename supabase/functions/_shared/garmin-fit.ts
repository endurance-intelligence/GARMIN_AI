/**
 * GARMIN_AI v0.7.2 - official Garmin FIT decoding, no GPS/position persistence.
 * Runs only inside the existing private Garmin detail worker.
 */
import { Decoder, Stream } from 'npm:@garmin/fitsdk@21.218.0'
import { unzipSync } from 'npm:fflate@0.8.2'
import { terrainWindows } from './activity-terrain.mjs'

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {}
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : []
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null
const numeric = (v: unknown, min: number, max: number): number | undefined => {
  const n = num(v)
  return n !== null && n >= min && n <= max ? n : undefined
}
const dateMs = (v: unknown): number | undefined => {
  const ms = v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(ms) && ms >= Date.UTC(2000, 0, 1) && ms <= Date.now() + 86400000 ? ms : undefined
}
const pick = (v: Obj, ...keys: string[]): unknown => {
  for (const k of keys) if (v[k] !== null && v[k] !== undefined) return v[k]
  return undefined
}
const iso = (v: unknown): string | undefined => {
  const t = dateMs(v)
  return t === undefined ? undefined : new Date(t).toISOString()
}
const limit = (value: unknown, max = 100): string | undefined => typeof value === 'string' && value.length <= max ? value : undefined

export class GarminFitDownloadError extends Error {
  constructor(readonly status: number) { super(`fit-download HTTP ${status}`) }
}

export async function downloadAndDecodeFit(activityId: string, bearer: string) {
  if (!/^\d{5,20}$/.test(activityId)) throw new Error('invalid-fit-activity-id')
  const response = await fetch(
    `https://personal.connectapi.garmin.com/download-service/files/activity/${activityId}`,
    { headers: { Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(27000) },
  )
  if (!response.ok) throw new GarminFitDownloadError(response.status)
  const claimedSize = Number(response.headers.get('content-length') || 0)
  if (claimedSize > 20_000_000) throw new Error('fit-download-size-limit')
  const binary = new Uint8Array(await response.arrayBuffer())
  if (binary.length === 0 || binary.length > 20_000_000) throw new Error('fit-download-size-limit')
  let fit = binary
  // Garmin's activity download endpoint returns a ZIP. Support a raw FIT only if verified.
  if (binary[0] === 0x50 && binary[1] === 0x4b) {
    const contents = unzipSync(binary, {
      filter: file => /\.fit$/i.test(file.name) && file.originalSize <= 25_000_000,
    })
    const files = Object.entries(contents).filter(([name]) => /\.fit$/i.test(name))
    if (files.length !== 1) throw new Error('fit-zip-file-count')
    fit = files[0][1]
  }
  if (fit.length > 25_000_000 || fit.length < 16) throw new Error('fit-size-invalid')
  const buffer = fit.buffer.slice(fit.byteOffset, fit.byteOffset + fit.byteLength) as ArrayBuffer
  const stream = Stream.fromArrayBuffer(buffer)
  const decoder = new Decoder(stream)
  if (!decoder.isFIT() || !decoder.checkIntegrity()) throw new Error('fit-integrity-failed')
  const decoded = decoder.read({ includeUnknownData: false })
  if (arr(decoded.errors).length) throw new Error('fit-decoder-errors')
  const m = obj(decoded.messages)
  const messageArray = (key: string) => arr(m[`${key}Mesgs`] ?? m[key])
  const rawRecords = messageArray('record')
  if (!rawRecords.length) throw new Error('fit-records-unavailable')
  if (rawRecords.length > 200000) throw new Error('fit-record-limit')

  const records: Obj[] = []
  let firstMs: number | undefined
  let previousMs = -Infinity
  let distanceInvalid = 0
  let previousDistance = -Infinity
  for (const item of rawRecords) {
    const r = obj(item)
    const ms = dateMs(r.timestamp)
    if (ms === undefined || ms < previousMs) continue
    if (firstMs === undefined) firstMs = ms
    previousMs = ms
    const distance = numeric(r.distance, 0, 1000000)
    if (distance !== undefined && distance + 2 < previousDistance) distanceInvalid++
    if (distance !== undefined) previousDistance = Math.max(distance, previousDistance)
    const point: Obj = {
      timestamp: new Date(ms).toISOString(),
      elapsed: Math.round((ms - firstMs) / 1000),
    }
    if (distance !== undefined) point.distance = distance
    const mapping: Array<[string, unknown, number, number]> = [
      ['hr', r.heartRate, 25, 240],
      ['speed', pick(r, 'enhancedSpeed', 'speed'), 0, 25],
      ['elevation', pick(r, 'enhancedAltitude', 'altitude'), -500, 9000],
      ['cadence', r.cadence, 0, 250],
      ['power', r.power, 0, 2500],
      ['temperature', r.temperature, -80, 80],
      ['verticalOscillation', r.verticalOscillation, 0, 500],
      ['verticalRatio', r.verticalRatio, 0, 100],
      ['groundContactTime', r.groundContactTime, 0, 1000],
      ['stepLength', r.stepLength, 0, 10000],
      ['gradeRecorded', r.grade, -40, 40],
    ]
    for (const [name, value, low, high] of mapping) {
      const v = numeric(value, low, high)
      if (v !== undefined) point[name] = v
    }
    records.push(point)
  }
  if (records.length < 2) throw new Error('fit-insufficient-records')

  const laps = messageArray('lap').slice(0, 2000).map((item, index) => {
    const r = obj(item)
    return {
      index: index + 1, startTime: iso(r.startTime), timestamp: iso(r.timestamp),
      distanceM: numeric(r.totalDistance, 0, 1e6),
      elapsedS: numeric(r.totalElapsedTime, 0, 1e7),
      movingS: numeric(r.totalTimerTime, 0, 1e7),
      avgHr: numeric(r.avgHeartRate, 25, 240), maxHr: numeric(r.maxHeartRate, 25, 240),
      avgSpeed: numeric(pick(r, 'enhancedAvgSpeed', 'avgSpeed'), 0, 25),
      totalAscentM: numeric(r.totalAscent, 0, 50000),
      totalDescentM: numeric(r.totalDescent, 0, 50000),
      intensity: limit(r.intensity), lapTrigger: limit(r.lapTrigger),
    }
  })
  const events = messageArray('event').slice(0, 5000).map(item => {
    const r = obj(item)
    return { timestamp: iso(r.timestamp), event: limit(r.event), eventType: limit(r.eventType),
      timerTrigger: limit(r.timerTrigger) }
  })
  const steps = messageArray('workoutStep').slice(0, 2000).map((item, index) => {
    const r = obj(item)
    return {
      index, name: limit(r.wktStepName), intensity: limit(r.intensity),
      durationType: limit(r.durationType), durationValue: num(r.durationValue),
      targetType: limit(r.targetType), targetValue: num(r.targetValue),
      customTargetValueLow: num(r.customTargetValueLow),
      customTargetValueHigh: num(r.customTargetValueHigh),
    }
  })
  const sessions = messageArray('session').slice(0, 16).map(item => {
    const r = obj(item)
    return {
      startTime: iso(r.startTime), sport: limit(r.sport), subSport: limit(r.subSport),
      totalDistanceM: num(r.totalDistance), totalElapsedS: num(r.totalElapsedTime),
      totalTimerS: num(r.totalTimerTime), avgHr: num(r.avgHeartRate),
      totalAscentM: num(r.totalAscent), totalDescentM: num(r.totalDescent),
      aerobicTrainingEffect: num(r.totalTrainingEffect),
    }
  })
  const terrain = terrainWindows(records)
  const count = (field: string) => records.filter(x => typeof x[field] === 'number').length
  const quality = {
    source: 'original-fit', rawRecordCount: rawRecords.length,
    validRecordCount: records.length, nonMonotonicDistanceCount: distanceInvalid,
    hrCoverage: count('hr') / records.length,
    elevationCoverage: count('elevation') / records.length,
    speedCoverage: count('speed') / records.length,
    powerCoverage: count('power') / records.length,
    terrainQuality: terrain.quality, terrainCoverage: terrain.coverage ?? 0,
    terrainWindowM: terrain.windowM,
  }
  return { records, laps, events, workoutSteps: steps, sessions,
    terrain: terrain.windows, quality }
}
