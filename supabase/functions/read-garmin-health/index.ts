/** GARMIN_AI v0.4.1 - authenticated, single-athlete recovery read API.
 * Health rows stay private behind RLS. The service-role client is only used
 * AFTER Supabase Auth verifies the JWT AND the confirmed owner email matches.
 * This function never changes workouts, recommendations or health records.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const projectUrl = Deno.env.get('SUPABASE_URL') || ''
const ownerEmail = (Deno.env.get('GARMIN_HEALTH_OWNER_EMAIL') || '').trim().toLowerCase()

function key(kind: 'publishable' | 'secret'): string {
  const modernName = kind === 'publishable' ? 'SUPABASE_PUBLISHABLE_KEYS' : 'SUPABASE_SECRET_KEYS'
  const legacyName = kind === 'publishable' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
  try {
    const keys: unknown = JSON.parse(Deno.env.get(modernName) || '{}')
    if (keys && typeof keys === 'object' && 'default' in keys) {
      const selected = (keys as { default?: unknown }).default
      if (typeof selected === 'string' && selected) return selected
    }
  } catch { /* Use legacy project key if configured. */ }
  return Deno.env.get(legacyName) || ''
}

function cors(origin: string | null): Record<string, string> {
  // Vite development environment ONLY. Production requires a new allowlist.
  const permitted = !!origin && /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)
  return {
    ...(permitted ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  }
}

function reply(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers })
}

function utcDay(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const headers = cors(origin)
  if (origin && !headers['Access-Control-Allow-Origin']) return reply({ error: 'Origin not allowed' }, 403, headers)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'GET') return reply({ error: 'Method not allowed' }, 405, headers)

  // Fail closed, even if an attacker gets a valid account in this Supabase project.
  if (!projectUrl || !ownerEmail || !key('publishable') || !key('secret')) {
    return reply({ error: 'Private dashboard not configured' }, 503, headers)
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')
  if (!match) return reply({ error: 'Login required' }, 401, headers)

  try {
    const auth = createClient(projectUrl, key('publishable'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    // getUser(token) verifies the token with Supabase Auth, not by decoding it.
    const { data: { user }, error: authError } = await auth.auth.getUser(match[1])
    if (authError || !user) return reply({ error: 'Invalid session' }, 401, headers)
    if (!user.email_confirmed_at || user.email?.trim().toLowerCase() !== ownerEmail) {
      return reply({ error: 'This account is not authorized for Garmin Health' }, 403, headers)
    }

    const admin = createClient(projectUrl, key('secret'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.from('garmin_daily_metrics')
      .select('metric_date,hrv_ms,resting_heart_rate,sleep_seconds,stress_avg,body_battery_max,synced_at')
      .gte('metric_date', utcDay(29))
      .order('metric_date', { ascending: true })
      .limit(31)
    if (error) {
      console.error('GARMIN_AI recovery read failed:', error.code)
      return reply({ error: 'Database read unavailable' }, 502, headers)
    }
    return reply({ source: 'Garmin / Supabase', requestedDays: 30, metrics: data ?? [] }, 200, headers)
  } catch {
    return reply({ error: 'Private data endpoint unavailable' }, 503, headers)
  }
})
