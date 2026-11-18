/** Exactly the trusted GARMIN_AI frontend and local Vite development origins. */
export function allowedHrProfileOrigin(origin) {
  if (origin === 'https://endurance-intelligence.github.io') return true
  return typeof origin === 'string' &&
    /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
}
