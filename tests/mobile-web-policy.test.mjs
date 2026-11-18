import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const pages='https://endurance-intelligence.github.io'

test('production app is gated before private content is mounted',()=>{
  const app=read('src/App.tsx')
  const gate=read('src/components/OnlineAccessGate.tsx')
  assert.match(app,/<OnlineAccessGate>/)
  assert.match(gate,/if\(!import.meta.env.PROD\)/)
  assert.match(gate,/garmin-app-access/)
  assert.match(gate,/status==='authorized'/)
  assert.match(gate,/status==='denied'/)
  assert.match(gate,/status==='unavailable'/)
  assert.match(gate,/authorization.*Bearer /)
})
test('owner is checked on Supabase, not trusted from client UI',()=>{
  const edge=read('supabase/functions/garmin-app-access/index.ts')
  assert.match(edge,/auth\.auth\.getUser\(token\)/)
  assert.match(edge,/email_confirmed_at/)
  assert.match(edge,/GARMIN_HEALTH_OWNER_EMAIL/)
  assert.match(edge,/authorized:true/)
  assert.match(edge,/Access-Control-Allow-Origin/)
  assert.match(edge,new RegExp(pages.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
})
test('magic link keeps the full Pages subpath and cannot auto-create users',()=>{
  const auth=read('src/components/GarminAuthSettings.tsx')
  assert.match(auth,/import\.meta\.env\.BASE_URL/)
  assert.match(auth,/shouldCreateUser:\s*false/)
})
test('private browser APIs allow exact Pages origin, not arbitrary websites',()=>{
  const endpoints=[
    'read-garmin-health','read-garmin-session','garmin-connect-snapshot',
    'garmin-gear-image','garmin-sync-center','garmin-connect-cloud-check'
  ]
  for(const name of endpoints){
    const source=read('supabase/functions/'+name+'/index.ts')
    assert.ok(source.includes(pages),name+' must allow hosted origin')
    assert.match(source,/auth\.auth\.getUser\(/)
  }
})
test('localhost-only Garmin controls are not mounted on public production site',()=>{
  assert.match(read('src/App.tsx'),/import\.meta\.env\.DEV\s*&&\s*<LiveGarminActivities/)
  assert.match(read('src/components/LiveSessionAnalyst.tsx'),/import\.meta\.env\.DEV\s*\?\s*<SessionGearEditor/)
  assert.match(read('src/components/GarminConnectSnapshot.tsx'),/mode==='gear'\s*&&\s*import\.meta\.env\.DEV/)
  assert.match(read('src/components/SyncCenter.tsx'),/import\.meta\.env\.DEV\s*&&\s*data\.cloudConnect/)
})
test('GitHub Pages has correct Vite base and public-key-only frontend',()=>{
  assert.match(read('vite.config.ts'),/GITHUB_PAGES/)
  assert.match(read('vite.config.ts'),/GARMIN_AI\//)
  const client=read('src/lib/garminSupabase.ts')
  assert.match(client,/VITE_GARMIN_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(client,/VITE_[A-Z_]*SERVICE_ROLE/)
})
