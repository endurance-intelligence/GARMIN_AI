/** Development-only, localhost Garmin Personal API adapter. No key or token reaches React. */
import type { Plugin } from 'vite'
import { spawn } from 'node:child_process'

const BASE = 'https://personal.connectapi.garmin.com'
let cachedToken: { value: string; until: number } | null = null

type GarminHttp = { status: number; text: string }

function validSecret(value: string): boolean {
  // Garmin personal keys and access tokens contain no quotes, backslashes, spaces or newlines.
  return value.length >= 20 && value.length < 2048 && /^[A-Za-z0-9_+\/.=-]+$/.test(value)
}

function request(path: string, authType: 'ApiKey' | 'Bearer', secret: string, method = 'GET'): Promise<GarminHttp> {
  if (!validSecret(secret)) throw new Error('Ungueltiges Schluesselformat')
  if (!path.startsWith('/')) throw new Error('Ungueltiger Pfad')
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' ? 'curl.exe' : 'curl'
    const args = ['--silent', '--show-error', '--max-time', '25', '--config', '-', '--request', method,
      '--write-out', '\n__GARMIN_HTTP__:%{http_code}', BASE + path]
    const child = spawn(executable, args, { windowsHide: true, stdio: 'pipe' })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (part: string) => {
      out += part
      if (out.length > 2_000_000) child.kill()
    })
    child.stderr.on('data', (part: string) => { err = (err + part).slice(-1000) })
    child.on('error', () => reject(new Error('curl konnte nicht gestartet werden')))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error('Garmin-Verbindungsfehler (curl Exit ' + code + ')'))
      const mark = out.lastIndexOf('\n__GARMIN_HTTP__:')
      if (mark < 0) return reject(new Error('Garmin-Antwort ohne HTTP-Status'))
      const status = Number(out.slice(mark + '\n__GARMIN_HTTP__:'.length).trim())
      if (!Number.isInteger(status)) return reject(new Error('Ungueltiger HTTP-Status'))
      resolve({ status, text: out.slice(0, mark) })
    })
    // Secret is passed through stdin config, never as a process command-line argument.
    child.stdin.end(`header = "Authorization: ${authType} ${secret}"\n`)
  })
}

async function accessToken(key: string): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value
  const response = await request('/personalapitoken-service/personal-api/personal-api-key/token', 'ApiKey', key, 'POST')
  if (response.status !== 200) throw new Error('Garmin-Authentifizierung: HTTP ' + response.status)
  const token = response.text.trim().replace(/^"|"$/g, '')
  if (!validSecret(token) || token.split('.').length !== 3) throw new Error('Garmin hat ein unerwartetes Tokenformat geliefert')
  cachedToken = { value: token, until: Date.now() + 23 * 60 * 60 * 1000 }
  return token
}

function parseJSON(response: GarminHttp): unknown {
  if (response.status !== 200) throw new Error('Garmin-Anfrage: HTTP ' + response.status)
  try { return JSON.parse(response.text) as unknown } catch { throw new Error('Garmin-Antwort enthaelt kein gueltiges JSON') }
}

type Dict = Record<string, unknown>
function object(value: unknown): Dict { return value && typeof value === 'object' && !Array.isArray(value) ? value as Dict : {} }
function numberOrNull(value: unknown): number | null { const n = Number(value); return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? n : null }
function textOr(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value : fallback }

async function recentActivities(key: string) {
  const token = await accessToken(key)
  const json = parseJSON(await request('/activitylist-service/activities/search/activities?start=0&limit=5', 'Bearer', token))
  const root = object(json)
  const entries: unknown = Array.isArray(json) ? json : (root.activities ?? root.activityList ?? root.data)
  if (!Array.isArray(entries)) throw new Error('Garmin-Aktivitaetsliste hat ein unbekanntes Format')
  const results = entries.map((entry: unknown) => {
    const a = object(entry)
    const distance = numberOrNull(a.distance)
    const duration = numberOrNull(a.duration)
    return {
      id: String(a.activityId ?? ''),
      name: textOr(a.activityName, 'Aktivitaet'),
      date: textOr(a.startTimeLocal, ''),
      distanceKm: distance === null ? null : +(distance / 1000).toFixed(2),
      durationMin: duration === null ? null : Math.round(duration / 60),
      averageHR: numberOrNull(a.averageHR ?? a.averageHeartRate),
      rpe: null as number | null,
      feeling: null as number | null,
    }
  })
  // Read the detailed on-watch feedback for one activity; do not make five requests needlessly.
  if (results.length && /^\d+$/.test(results[0].id)) {
    try {
      const d = object(parseJSON(await request('/activity-service/activity/' + results[0].id, 'Bearer', token)))
      const s = object(d.summaryDTO)
      results[0].rpe = numberOrNull(s.directWorkoutRpe)
      results[0].feeling = numberOrNull(s.directWorkoutFeel)
    } catch { /* Missing detail is not an error for the entire activity list. */ }
  }
  return { source: 'Garmin Personal API', activities: results, count: results.length }
}

export function garminLocalApi(): Plugin {
  return {
    name: 'garmin-local-dev-only',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/garmin', (req, res) => {
        const send = (status: number, data: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.end(JSON.stringify(data))
        }
        if (req.method !== 'GET') return send(405, { error: 'Nur lesender Zugriff' })
        const key = process.env.GARMIN_API_KEY ?? ''
        if (req.url?.split('?')[0] === '/status') return send(200, { connected: Boolean(key), mode: 'local-development' })
        if (req.url?.split('?')[0] !== '/activities') return send(404, { error: 'Unbekannter Endpunkt' })
        if (!key) return send(401, { error: 'Garmin-Key fehlt. Starte ueber Start-GarminDev.ps1.' })
        void recentActivities(key)
          .then(result => send(200, result))
          .catch((error: unknown) => send(502, { error: error instanceof Error ? error.message : 'Garmin nicht erreichbar' }))
      })
    },
  }
}
