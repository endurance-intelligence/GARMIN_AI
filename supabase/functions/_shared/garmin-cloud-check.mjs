/** Pure, safe classification of an HTTPS Garmin Connect response. */
export function classifyGarminCloudCheck(httpStatus,body) {
  if(httpStatus===401||httpStatus===403)return 'auth_failed'
  if(httpStatus===429)return 'rate_limited'
  if(!Number.isInteger(httpStatus)||httpStatus<200||httpStatus>=300)return 'unavailable'
  if(!body||typeof body!=='object'||Array.isArray(body))return 'invalid_response'
  // Garmin's socialProfile response includes a displayName/profile identifier.
  // Confirm structure only; never store or return the profile identifier itself.
  const profile=body
  const hasProfile=(typeof profile.displayName==='string'&&profile.displayName.length>0)||
    (typeof profile.profileId==='number'&&Number.isFinite(profile.profileId))||
    (typeof profile.id==='number'&&Number.isFinite(profile.id))
  return hasProfile?'verified':'invalid_response'
}
export function accessTokenNotExpired(expiresAt,nowSeconds=Math.floor(Date.now()/1000)) {
  // Garmin Connect OAuth2 from garminconnect-js stores seconds, not millis.
  return Number.isFinite(expiresAt)&&expiresAt>nowSeconds+30 &&
    expiresAt<nowSeconds+365*24*3600
}
