/**
 * GARMIN_AI v0.7.3.3 - strict activity-to-gear link normalization.
 * A truncated Garmin result must never be classified as a complete history.
 */
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x) ? x : {};
const gearId = x => typeof x === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(x) ? x : null;
const activityId = x => {
  const s = typeof x === 'number' && Number.isSafeInteger(x) ? String(x) : x;
  return typeof s === 'string' && /^\d{5,20}$/.test(s) ? s : null;
};
export const normalizeUuid = id => typeof id === 'string' ? id.replace(/-/g, '').toLowerCase() : '';

export function normalizeGearActivities(raw, id, max = 1000) {
  if (!Array.isArray(raw) || !gearId(id)) throw new Error('Invalid gear activity result');
  if (raw.length >= max) throw new Error('Gear history may be truncated at request limit');
  const seen = new Set();
  const links = [];
  for (const value of raw) {
    const r = obj(value);
    const idValue = activityId(r.activityId ?? r.activityID ?? obj(r.activity).activityId);
    if (!idValue) throw new Error('Unrecognized gear activity identifier');
    if (!seen.has(idValue)) {
      seen.add(idValue);
      links.push({ activityId:idValue, gearId:id });
    }
  }
  return links;
}

export function validateCompleteHistory(gearRows, groupedLinks, knownActivityId, knownGearRows) {
  if (!Array.isArray(gearRows) || !Array.isArray(groupedLinks) || !Array.isArray(knownGearRows)) {
    throw new Error('Missing Garmin history input');
  }
  const ids = gearRows.map(g => gearId(g.id));
  if (ids.some(x => !x) || new Set(ids.map(normalizeUuid)).size !== ids.length) {
    throw new Error('Invalid or duplicate Garmin gear IDs');
  }
  if (groupedLinks.length !== ids.length) throw new Error('Not every gear was checked');
  const links = groupedLinks.flat();
  if (links.length > 3000) throw new Error('History exceeds safe snapshot limit');
  const unique = new Set(links.map(x => x.activityId+':'+normalizeUuid(x.gearId)));
  if (unique.size !== links.length) throw new Error('Duplicate gear links');
  const known = knownGearRows.map(x=>gearId(x.id)).filter(Boolean);
  if (known.length && !activityId(knownActivityId)) throw new Error('Known activity ID missing');
  for (const k of known) {
    if (!links.some(x=>x.activityId===knownActivityId && normalizeUuid(x.gearId)===normalizeUuid(k))) {
      throw new Error('Previously verified activity gear association missing from history');
    }
  }
  return links;
}
