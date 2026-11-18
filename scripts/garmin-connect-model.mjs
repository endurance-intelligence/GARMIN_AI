/** GARMIN_AI v0.7.3.1 – strictly allowlisted local Garmin Connect models. */
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const text = (v, n = 120) => typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null;
const id = (v) => (typeof v === 'number' && Number.isSafeInteger(v)) ||
  (typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v)) ? String(v) : null;
const records = (v, label) => {
  if (!Array.isArray(v)) throw new Error(label + ': unexpected upstream shape');
  return v;
};

/**
 * Retired gear stays in the history; unknown Garmin states are not treated as active.
 */
export function normalizeGearStatus(value) {
  if (typeof value !== 'string') return 'unknown';
  const status = value.trim().toLowerCase();
  return status === 'active' || status === 'retired' ? status : 'unknown';
}

export function gearRows(raw) {
  const data = records(raw, 'gear');
  return data.map((v) => {
    const g = obj(v);
    return {
      id: id(g.uuid ?? g.gearUUID ?? g.gearUuid ?? g.gearId),
      name: text(g.displayName ?? g.name),
      brand: text(g.brand ?? g.make),
      model: text(g.customMakeModel ?? g.model),
      type: text(g.gearTypeName ?? (typeof g.gearType === 'string' ? g.gearType : obj(g.gearType).typeKey)),
      status: normalizeGearStatus(g.gearStatusName ?? (typeof g.gearStatus === 'string' ? g.gearStatus : obj(g.gearStatus).statusName ?? obj(g.gearStatus).name) ?? g.status),
    };
  }).filter((g) => g.id || g.name);
}

export function scheduledRows(raw) {
  const data = records(raw, 'schedule');
  return data.map((v) => {
    const w = obj(v);
    return {
      date: text(w.scheduleDate ?? w.calendarDate, 10),
      id: id(w.scheduledWorkoutId ?? w.workoutScheduleId),
      workoutId: id(w.workoutId ?? w.workoutUuid),
      name: text(w.workoutName ?? w.workoutPhrase ?? w.name),
      sport: text(w.workoutType ?? w.sportType),
      restDay: w.isRestDay === true,
    };
  }).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date || '') && (w.name || w.restDay || w.id || w.workoutId));
}

export function activityGearRows(raw) {
  const data = records(raw, 'activityGear');
  return data.map((v) => {
    const g = obj(v);
    return {
      id: id(g.uuid ?? g.gearUUID ?? g.gearUuid ?? g.gearId),
      name: text(g.displayName ?? g.name),
    };
  }).filter((g) => g.id || g.name);
}

export function ensureNonemptyKnownShape(raw, mapped, label) {
  if (Array.isArray(raw) && raw.length > 0 && mapped.length === 0) {
    throw new Error(label + ': unrecognized fields');
  }
  return mapped;
}

export function safeStatus(error) {
  // Never expose URLs, credentials, cookies or raw Garmin responses.
  const status = Number(obj(error).status);
  if (status === 401 || status === 403) return 'access-denied';
  if (status === 429) return 'rate-limited';
  if (status === 404 || status === 405) return 'unavailable';
  if (error instanceof Error && /shape|fields/.test(error.message)) return 'unsupported-shape';
  return 'request-failed';
}
