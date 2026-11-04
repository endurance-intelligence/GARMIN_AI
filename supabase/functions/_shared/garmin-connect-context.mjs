/**
 * GARMIN_AI v0.7.3: strict, privacy-minimal Garmin Connect read models.
 * Garmin Connect endpoints are unofficial and response shapes may change.
 * Never treat an unknown response as an empty equipment or calendar list.
 */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
const label = (value, max = 140) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
const identifier = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const id = String(value)
  return /^[a-zA-Z0-9-]{1,64}$/.test(id) ? id : null
}

/** Throw if Garmin's payload no longer has a recognized list shape. */
function items(raw, keys) {
  if (Array.isArray(raw)) return raw
  let root = object(raw)
  if (!root) throw new Error('garmin-context-unexpected-shape')
  for (let level = 0; level < 2; level++) {
    for (const key of keys) {
      if (Array.isArray(root[key])) return root[key]
    }
    root = object(root.data)
    if (!root) break
  }
  throw new Error('garmin-context-unexpected-shape')
}

export function normalizeGear(raw, limit = 100) {
  const source = items(raw, ['gear', 'gears', 'gearList', 'gearItems', 'assignedGear', 'items', 'results', 'content', 'data'])
  const records = source.slice(0, limit).map(value => {
    const g = object(value) || {}
    return {
      id: identifier(g.uuid ?? g.gearUUID ?? g.gearUuid ?? g.gearId),
      name: label(g.displayName ?? g.name),
      brand: label(g.brand ?? g.make),
      model: label(g.customMakeModel ?? g.model),
      type: label(typeof g.gearType === 'string' ? g.gearType : (object(g.gearType)?.typeKey ?? object(g.gearType)?.gearTypeKey)),
      status: label(g.gearStatus ?? g.status),
    }
  }).filter(g => g.id || g.name)
  if (source.length && !records.length) throw new Error('garmin-context-unexpected-shape')
  return { items: records, mayHaveMore: source.length >= limit }
}

export function normalizeSchedule(raw, limit = 200) {
  const source = items(raw, ['scheduledWorkouts', 'workoutSchedule', 'workoutSchedules', 'workoutScheduleSummaries', 'workouts', 'items', 'results', 'content', 'data'])
  const records = source.slice(0, limit).map(value => {
    const w = object(value) || {}
    return {
      date: label(w.scheduleDate ?? w.calendarDate ?? w.date, 10),
      scheduleId: identifier(w.scheduledWorkoutId ?? w.workoutScheduleId ?? w.scheduleId),
      workoutId: identifier(w.workoutId),
      workoutUuid: identifier(w.workoutUuid),
      name: label(w.workoutName ?? w.name ?? w.workoutPhrase),
      sport: label(w.workoutType ?? w.sportType ?? w.sportTypeKey),
      isRestDay: w.isRestDay === true,
      planName: label(w.tpPlanName),
    }
  }).filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w.date ?? '') && (w.name || w.isRestDay || w.workoutId || w.workoutUuid))
  if (source.length && !records.length) throw new Error('garmin-context-unexpected-shape')
  return { items: records, mayHaveMore: source.length >= limit }
}

export function validCalendarRange(from, through) {
  function parse(ymd) {
    if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return NaN
    const ms = Date.parse(ymd + 'T00:00:00Z')
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === ymd ? ms : NaN
  }
  const a = parse(from), b = parse(through)
  return Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a <= 44 * 86400000
}
