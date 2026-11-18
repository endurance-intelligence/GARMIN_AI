/** GARMIN_AI v0.7.3.5 — identity and file validation shared by Edge and tests. */
export function normalizedGearImageId(value) {
  if (typeof value !== 'string') return null
  const bare=value.replace(/-/g,'').toLowerCase()
  return /^[0-9a-f]{32}$/.test(bare) ? bare : null
}

export function isActiveRunningShoe(gear) {
  if(!gear || typeof gear!=='object' || Array.isArray(gear)) return false
  return gear.status==='active' &&
    typeof gear.type==='string' && /shoes?|schuh/i.test(gear.type)
}

export function looksLikeWebP(bytes) {
  if(!(bytes instanceof Uint8Array) || bytes.length<16) return false
  return String.fromCharCode(...bytes.slice(0,4))==='RIFF' &&
    String.fromCharCode(...bytes.slice(8,12))==='WEBP'
}
