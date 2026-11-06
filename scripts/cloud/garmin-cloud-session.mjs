/** v0.7.6: validate secret payloads without exposing their contents. */
export function isGarminCloudSession(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))return false
  const a=input.oauth1,b=input.oauth2
  if(!a||typeof a!=='object'||!b||typeof b!=='object')return false
  for(const [object,key] of [[a,'oauth_token'],[a,'oauth_token_secret'],
                            [b,'access_token'],[b,'refresh_token']]) {
    if(typeof object[key]!=='string'||object[key].length<10||object[key].length>8192)return false
  }
  if(!Number.isFinite(b.expires_at)||!Number.isFinite(b.refresh_token_expires_at))return false
  if(a.domain && a.domain!=='garmin.com')return false
  return true
}
export function tokenChanged(before,after) {
  if(!isGarminCloudSession(before)||!isGarminCloudSession(after))
    throw Error('Invalid Garmin session')
  return JSON.stringify(before)!==JSON.stringify(after)
}
