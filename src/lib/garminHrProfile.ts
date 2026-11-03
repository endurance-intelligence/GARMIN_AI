/** GARMIN_AI v0.6.2: snapshot model returned by the private owner-only Edge Function. */
export type GarminRunningHrProfile = {
  sport: 'running'
  method: string | null
  zones: number[] | null // 5 zone maxima, BPM, not physiological LT1/LT2 thresholds
  zone1Min: number | null
  maxHr: number | null
  restingHr: number | null
  lthr: number | null
  sources: {zones:string|null;maxHr:string|null;restingHr:string|null;lthr:string|null}
}
export type HrProfileSnapshot = {observedAt:string;profile:GarminRunningHrProfile}
export type HrProfileCheck = {route:'profile-settings'|'zones-v2'|'zones-v2-no-defaults'|'zones-v2-empty-defaults'|'zones-v1';status:number;parsed?:boolean}
export type HrProfileResult = {
  checks?:HrProfileCheck[]
  profile: GarminRunningHrProfile|null
  observedAt:string|null
  history:HrProfileSnapshot[]
  lastAttemptAt:string|null
  lastSuccessAt:string|null
  lastError:string|null
  ok?:boolean
  skipped?:boolean
  error?:string
}
export function safeZoneMax(profile:GarminRunningHrProfile|null,zone:number):number|null {
  const values=profile?.zones
  if (!Array.isArray(values)||values.length!==5 || zone<1||zone>5) return null
  if (!values.every((n,i)=>Number.isInteger(n)&&n>=70&&n<=230&&(i===0||n>values[i-1]))) return null
  if (values[4]<125) return null
  return values[zone-1]
}
export function getZoneRows(profile:GarminRunningHrProfile|null) {
  const z=profile?.zones
  if (!z || z.length!==5 || safeZoneMax(profile,5)===null) return []
  return z.map((high,i)=>({zone:i+1,low:i===0?profile.zone1Min:z[i-1]+1,high}))
}
export function humanSyncError(error:string|null|undefined):string|null {
  if (!error) return null
  if (error==='garmin_zones_unavailable') return 'Garmin liefert über die getesteten Personal-API-Abfragen noch keine eindeutig nutzbaren Laufzonen. Details der einzelnen HTTP-Antworten stehen unten. Bestehende Daten bleiben unverändert.'
  if (error==='unrecognized_running_zones') return 'Garmin liefert ein unerwartetes Zonenformat. Die bestehenden Werte bleiben erhalten; wir müssen die API-Struktur prüfen.'
  if (/^garmin_token_http_\d+$/.test(error)) return `Garmin-Tokenabruf fehlgeschlagen (HTTP ${error.slice(-3)}). Der HR-Zonen-Endpunkt wurde noch nicht erreicht.`
  if (/^garmin_http_\d+$/.test(error)) return `Garmin-Zugriff fehlgeschlagen (HTTP ${error.slice(-3)}). Die letzten gespeicherten Werte bleiben sichtbar.`
  if (error==='garmin_api_key_missing') return 'Garmin API Key fehlt in den serverseitigen Supabase-Secrets.'
  if (error==='profile_store_failed'||error==='profile_status_failed') return 'Supabase-Speicherung fehlgeschlagen. Bitte Migration und RLS prüfen.'
  return 'Profilabgleich nicht möglich. Die letzten gespeicherten Werte bleiben erhalten.'
}
