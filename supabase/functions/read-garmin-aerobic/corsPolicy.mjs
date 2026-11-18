/** Production and local development origins for read-only Garmin aerobic analysis.
 * A permitted Origin does not grant access. Owner JWT verification is still mandatory.
 */
export function allowedAerobicOrigin(origin){
  if(origin==='https://endurance-intelligence.github.io')return true
  return typeof origin==='string' &&
    /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
}
