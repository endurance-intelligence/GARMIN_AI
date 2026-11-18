/**
 * Safe structural validation only. Do not emit token fields in logs or API responses.
 * Pure JS: shared by the Supabase Edge bootstrap and Node.js cloud worker.
 */
export function isGarminCloudSession(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))return false
  const a=input.oauth1,b=input.oauth2
  if(!a || typeof a!=='object' || Array.isArray(a) ||
     !b || typeof b!=='object' || Array.isArray(b)) return false
  for(const [obj,key] of [[a,'oauth_token'],[a,'oauth_token_secret'],
                          [b,'access_token'],[b,'refresh_token']]) {
    if(typeof obj[key]!=='string' || obj[key].length<10 || obj[key].length>8192)return false
  }
  if(!Number.isFinite(b.expires_at) || !Number.isFinite(b.refresh_token_expires_at))return false
  if(a.domain && a.domain!=='garmin.com')return false
  const text=JSON.stringify(input)
  return text.length<=20000
}
export function tokenChanged(before,after) {
  if(!isGarminCloudSession(before)||!isGarminCloudSession(after))
    throw Error('Invalid Garmin session')
  return JSON.stringify(before)!==JSON.stringify(after)
}
