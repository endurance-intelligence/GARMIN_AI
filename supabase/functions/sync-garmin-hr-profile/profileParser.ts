/** Parse only explicit Garmin HR fields. Reject ambiguous shapes rather than inventing data. */
export type RunningHrProfile = {
  sport: 'running'
  method: string | null
  zones: number[] | null // max bpm of zones 1..5, monotonically increasing
  zone1Min: number | null
  maxHr: number | null
  restingHr: number | null
  lthr: number | null
  sources: { zones: string | null; maxHr: string | null; restingHr: string | null; lthr: string | null }
}

type ObjectValue = Record<string, unknown>
const obj = (x: unknown): ObjectValue => x && typeof x === 'object' && !Array.isArray(x) ? x as ObjectValue : {}
const arr = (x: unknown): unknown[] => Array.isArray(x) ? x : []
function number(x: unknown): number | null {
  if (typeof x !== 'number' && !(typeof x === 'string' && /^\d+(\.\d+)?$/.test(x))) return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}
function bpm(x: unknown, lo = 30, hi = 230): number | null {
  const n = number(x)
  return n !== null && Number.isInteger(n) && n >= lo && n <= hi ? n : null
}
function first(objValue: ObjectValue, keys: string[], lo=30,hi=230): number | null {
  for (const key of keys) { const n = bpm(objValue[key],lo,hi); if (n !== null) return n }
  return null
}
function valid5(x: unknown[]): number[] | null {
  const five = x.map(v => bpm(v, 55,230))
  if (five.length !== 5 || five.some(v=>v === null)) return null
  const z = five as number[]
  // A percentage array ending at 100 MUST NOT be misread as BPM zones.
  if (z[0] < 70 || z[4] < 125) return null
  return z.every((v,i) => i === 0 || v > z[i-1]) ? z : null
}
function readZoneRows(x: unknown): { zones: number[]; min: number | null } | null {
  if (!Array.isArray(x)) return null
  // A pure numeric array may be [Z1min,Z1max,Z2max,...,Z5max], or five maxima.
  if (x.every(v => typeof v === 'number')) {
    if (x.length === 6) { const z = valid5(x.slice(1)); const min = bpm(x[0]); return z && min !== null && min < z[0] ? { zones: z, min } : null }
    const z = valid5(x); return z ? { zones: z, min: null } : null
  }
  if (x.length !== 5) return null
  const parsed = x.map((v,i) => {
    const row = obj(v)
    const idx = number(row.zoneNumber ?? row.zone ?? row.zoneIndex)
    const upper = first(row, ['maxHeartRate','upperHeartRate','maxHr','max','end','to','upperBound','upper'])
    const lower = first(row, ['minHeartRate','minHr','min','start','lowerBound','lower'])
    return { idx: idx ?? i+1, upper, lower }
  }).sort((a,b) => a.idx-b.idx)
  if (!parsed.every((v,i) => v.idx === i+1 && v.upper !== null)) return null
  const z = valid5(parsed.map(v => v.upper)); if (!z) return null
  return { zones: z, min: parsed[0].lower !== null && parsed[0].lower! < z[0] ? parsed[0].lower : null }
}
function readFloors(row: ObjectValue): {zones:number[];min:number|null}|null {
  // Garmin v2 stores five STARTS in bpm, unlike the maxima shown by our UI.
  // Z1 ends at floor Z2 - 1; Z5 ends at the configured max HR used.
  const keys = ['zone1Floor','zone2Floor','zone3Floor','zone4Floor','zone5Floor']
  const floors = keys.map(k => bpm(row[k],45,230))
  if (floors.some(v => v === null)) return null
  const ff=floors as number[]
  if (!ff.every((v,i)=>i===0||v>ff[i-1])) return null
  const top=first(row,['maxHeartRateUsed','maxHeartRate','maximumHeartRate','maxHr'],100,230)
  if(top===null || top<ff[4]) return null
  const zones=valid5([ff[1]-1,ff[2]-1,ff[3]-1,ff[4]-1,top])
  if (!zones || ff[0]>=zones[0]) return null
  return {zones,min:ff[0]}
}
function isDefault(row: ObjectValue): boolean {
  return String(row.sport ?? row.sportType ?? '').toUpperCase()==='DEFAULT'
}
function isRunning(row: ObjectValue): boolean {
  const candidates = [row.sport, row.sportType, row.sportName, row.sportTypeKey, row.activityType, obj(row.sport).typeKey, obj(row.sportType).typeKey]
  return candidates.some(c => typeof c === 'string' && /^(running|run|RUNNING|RUN)$/i.test(c))
}
function chooseSport(raw: unknown): ObjectValue | null {
  const root = obj(raw)
  if (isRunning(root)) return root
  const nested = obj(root.heartRateZones)
  // A dedicated RUNNING profile always takes precedence over DEFAULT.
  for (const bucket of [nested,root]) {
    for (const name of ['RUNNING','running']) {
      if (Object.keys(obj(bucket[name])).length) return {...obj(bucket[name]),sport:'RUNNING'}
    }
  }
  const lists = Array.isArray(raw) ? [raw] :
    [root.heartRateZones,root.zonesBySport,root.sportZones,root.data].filter(Array.isArray)
  for (const items of lists) {
    const match=arr(items).map(obj).find(isRunning)
    if (match) return match
  }
  // Garmin can provide DEFAULT only: it is the explicitly configured fallback
  // for running, NOT an arbitrary cycling or swimming sport profile.
  if (isDefault(root)) return root
  for (const bucket of [nested,root]) {
    for (const name of ['DEFAULT','default']) {
      if (Object.keys(obj(bucket[name])).length) return {...obj(bucket[name]),sport:'DEFAULT'}
    }
  }
  for (const items of lists) {
    const fallback=arr(items).map(obj).find(isDefault)
    if (fallback) return fallback
  }
  return null
}
function readZones(row: ObjectValue): {zones:number[];min:number|null}|null {
  const floors=readFloors(row)
  if(floors) return floors
  const lists = ['zones','heartRateZones','heartRateZoneRanges','zoneRanges','heartRateZoneValues','zoneValues','zoneThresholds']
  for (const key of lists) {
    const result = readZoneRows(row[key]); if (result) return result
  }
  const maxNames = [
    ['zone1Max','zone1Maximum','zone1High','zone1Upper','z1Max'],
    ['zone2Max','zone2Maximum','zone2High','zone2Upper','z2Max'],
    ['zone3Max','zone3Maximum','zone3High','zone3Upper','z3Max'],
    ['zone4Max','zone4Maximum','zone4High','zone4Upper','z4Max'],
    ['zone5Max','zone5Maximum','zone5High','zone5Upper','z5Max'],
  ]
  const flat = maxNames.map(keys => first(row,keys))
  if (flat.every(v=>v !== null)) {
    const zones=valid5(flat); if (zones) return {zones,min:first(row,['zone1Min','zone1Minimum','z1Min'])}
  }
  const named = ['zone1','zone2','zone3','zone4','zone5'].map(k => {
    const raw = row[k]
    return bpm(raw) ?? first(obj(raw),['max','upper','maxHeartRate','maxHr'])
  })
  const zones=valid5(named)
  return zones ? {zones,min:first(row,['zone1Min','z1Min'])} : null
}
function scopedMetric(raw: unknown, keys: string[], lo:number, hi:number):number|null {
  const base = obj(raw)
  const containers = [base, obj(base.userData), obj(base.profile), obj(base.settings), obj(base.userProfile)]
  for (const value of containers) {
    const n = first(value,keys,lo,hi)
    if (n !== null) return n
  }
  return null
}
export function parseGarminHrProfile(zonesResponse: unknown, settingsResponse: unknown): RunningHrProfile | null {
  const sport = chooseSport(zonesResponse)
  const found = sport ? readZones(sport) : null
  if (!found) return null
  const root = obj(settingsResponse)
  const maxHr = first(sport!,['maxHeartRateUsed','maxHeartRate','maximumHeartRate','maxHr'],100,230) ?? scopedMetric(root,['maxHeartRate','maximumHeartRate','maxHR','maxHr'],100,230)
  const restingHr = first(sport!,['restingHeartRateUsed','restingHeartRate','restingHR'],25,120) ?? scopedMetric(root,['restingHeartRate','restingHR','restingHr','restingHeartRateValue'],25,120)
  const lthr = first(sport!,['lactateThresholdHeartRateUsed','lactateThresholdHeartRate','lactateThresholdHr','lthr'],80,220) ?? scopedMetric(root,['lactateThresholdHeartRateUsed','lactateThresholdHeartRate','lactateThresholdHr','lthr'],80,220)
  const methodRaw = sport!.method ?? sport!.zoneType ?? sport!.calculationMethod ?? sport!.heartRateZoneType ?? sport!.thresholdType ?? sport!.trainingMethod
  const method = typeof methodRaw === 'string' && methodRaw.length < 80 ? methodRaw : null
  return {
    sport:'running', method, zones:found.zones, zone1Min: found.min,
    maxHr,restingHr,lthr,
    sources:{zones:isDefault(sport!)?'Garmin Standardprofil (DEFAULT)':'Garmin Laufprofil (RUNNING)',maxHr:maxHr!==null?'Garmin Personal API':null,restingHr:restingHr!==null?'Garmin Personal API':null,lthr:lthr!==null?'Garmin Personal API':null},
  }
}
