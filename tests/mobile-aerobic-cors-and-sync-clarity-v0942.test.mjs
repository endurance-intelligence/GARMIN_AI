import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {allowedAerobicOrigin} from '../supabase/functions/read-garmin-aerobic/corsPolicy.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('production GARMIN_AI can call aerobic audit and its preflight',()=>{
 const src=read('supabase/functions/read-garmin-aerobic/index.ts')
 assert.equal(allowedAerobicOrigin('https://endurance-intelligence.github.io'),true)
 assert.match(src,/const allowed=allowedAerobicOrigin\(origin\)/)
 assert.match(src,/'Access-Control-Allow-Origin':origin/)
 assert.match(src,/'Access-Control-Allow-Methods':'GET, OPTIONS'/)
 assert.match(src,/req.method==='OPTIONS'/)
})
test('strict origin allowlist cannot bypass the existing single-owner JWT gate',()=>{
 const src=read('supabase/functions/read-garmin-aerobic/index.ts')
 for(const origin of ['https://example.com','https://endurance-intelligence.github.io.evil.example',
   'http://endurance-intelligence.github.io','https://endurance-intelligence.github.io/other',
   'http://localhost:5172',null])
  assert.equal(allowedAerobicOrigin(origin),false,String(origin))
 for(const origin of ['http://localhost:5173','http://127.0.0.1:5179'])
  assert.equal(allowedAerobicOrigin(origin),true,String(origin))
 assert.match(src,/auth\.auth\.getUser\(match\[1\]\)/)
 assert.match(src,/user\.email_confirmed_at/)
 assert.match(src,/ownerEmail/)
 assert.match(src,/Cache-Control':'private, no-store'/)
 assert.match(src,/req.method!=='GET'/)
})
test('aerobic report remains only an evidence scan, not physiology threshold or medical diagnosis',()=>{
 const src=read('supabase/functions/read-garmin-aerobic/index.ts')
 assert.match(src,/No.*LT1\/VT1|NOT an LT1\/VT1/i)
 assert.match(src,/Keine.*Schwellenbestimmung|Kein LT1\/VT1-Bereich berechnet/)
 assert.doesNotMatch(src,/fetch\('https:\/\/personal.connectapi.garmin.com/)
})
test('sync center distinguishes optional Garmin snapshot from confirmed Intervals exports',()=>{
 const view=read('src/components/SyncCenter.tsx')
 assert.match(view,/Garmin-Kalender · Leseimport/)
 assert.match(view,/Garmin-Ausrüstung · bisheriger Import/)
 assert.match(view,/Coach → Intervals\.icu → Garmin-Uhr/)
 assert.match(view,/garmin-intervals/)
 assert.match(view,/intervals_sync_status==='confirmed'/)
 assert.match(view,/Der 7-Tage-Coach kann lockere Läufe als zeitgesteuerte Workouts vorbereiten/)
 assert.match(view,/Ankunft bei Garmin oder auf der Uhr/)
 assert.match(view,/Läufe als zeitgesteuerte Workouts vorbereiten/)
})
