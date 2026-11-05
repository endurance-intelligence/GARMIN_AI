/**
 * GARMIN_AI v0.7.3.2 – only fields required for a private, read-only Garmin snapshot.
 * All Garmin payloads are untrusted. Never serialize tokens, GPS or profile data.
 */
import { gearRows, scheduledRows } from './garmin-connect-model.mjs';

const safeId = (value, length = 80) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  return text.length <= length && /^[a-zA-Z0-9_-]+$/.test(text) ? text : null;
};
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function snapshotGear(raw) {
  if (!Array.isArray(raw)) throw new Error('gear-shape');
  const rows = gearRows(raw);
  if (rows.length !== raw.length || rows.some(row => !row.id)) throw new Error('gear-identity');
  return rows.map(row => {
    // Garmin often stores the actual shoe name in customMakeModel while
    // displayName is empty or merely a color (e.g. "Black").
    const main = row.model || row.name || row.brand || 'Equipment';
    const suffix = row.name && row.name.toLowerCase() !== main.toLowerCase() ? ' · ' + row.name : '';
    return {
      id: row.id,
      name: (main + suffix).slice(0, 180),
      brand: row.brand,
      model: row.model,
      type: row.type,
    };
  });
}

export function snapshotSchedule(raw) {
  if (!Array.isArray(raw)) throw new Error('schedule-shape');
  const rows = scheduledRows(raw);
  if (rows.length !== raw.length) throw new Error('schedule-incomplete');
  return rows;
}

export function snapshotGearActivityLinks(raw, gearId) {
  if (!Array.isArray(raw) || !safeId(gearId)) throw new Error('gear-links-shape');
  const rows = raw.map(value => {
    const row = object(value);
    const activity = object(row.activity);
    const activityId = safeId(row.activityId ?? row.activityID ?? activity.activityId, 20);
    if (!activityId || !/^\d{5,20}$/.test(activityId)) throw new Error('gear-links-identity');
    return { gearId: String(gearId), activityId };
  });
  return rows;
}

export function uniqueLinks(collections) {
  if (!Array.isArray(collections)) throw new Error('gear-links-shape');
  const index = new Map();
  for (const item of collections.flat()) {
    if (!item?.activityId || !item?.gearId) throw new Error('gear-links-incomplete');
    index.set(item.activityId + ':' + item.gearId, item);
  }
  return [...index.values()];
}
