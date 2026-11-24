import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validGoalLogo,LOGO_PREFIX,MAX_LOGO_LENGTH} from '../supabase/functions/_shared/goal-logo.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('only bounded WebP data or explicit removal accepted',()=>{
 const fixture=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64')
 assert.equal(fixture.subarray(0,4).toString(),'RIFF')
 fixture.writeUInt32LE(fixture.length-8,4)
 assert.equal(validGoalLogo(LOGO_PREFIX+fixture.toString('base64')),true)
 for(const x of [null,undefined,'https://example.com/img.png','data:image/svg+xml;base64,AAAA',LOGO_PREFIX+'A'.repeat(MAX_LOGO_LENGTH),LOGO_PREFIX+'AAAA',LOGO_PREFIX+'@@@@'])assert.equal(validGoalLogo(x),false)
 assert.equal(validGoalLogo(''),true)
})
test('both editors stage preview, removal and upload with goal save',()=>{
 for(const file of ['src/components/CoachGoalPanel.tsx','src/components/RaceGoalsPanel.tsx']){
  const s=read(file)
  assert.match(s,/<GoalLogoEditor/)
  assert.match(s,/logoDraft===undefined\?\{\}:\{logoData:logoDraft\}/)
  assert.match(s,/logoPreparing/)
 }
 const ui=read('src/components/GoalLogoEditor.tsx')
 assert.match(ui,/Bild hochladen/)
 assert.match(ui,/Bild entfernen/)
 assert.match(ui,/image\/webp/)
 assert.match(ui,/640\/bitmap.width/)
})
test('private goals read logos only on request and promotion keeps both logos',()=>{
 for(const file of ['supabase/functions/garmin-coach-goal/index.ts','supabase/functions/garmin-race-goals/index.ts']){
  const s=read(file)
  assert.match(s,/auth\.auth\.getUser/)
  assert.match(s,/searchParams.get\('includeLogo'\)==='1'/)
  assert.match(s,/validGoalLogo/)
  assert.match(s,/goal_logo:/)
 }
 const sql=read('supabase/migrations/20261124155428_private_goal_logos.sql')
 assert.match(sql,/old_goal.goal_logo/)
 assert.match(sql,/chosen.goal_logo/)
 assert.match(sql,/security invoker/)
 assert.match(sql,/goal_logo=excluded.goal_logo/)
 assert.match(read('supabase/migrations/20261124155438_goal_logo_prefix_check.sql'),/length\('data:image\/webp;base64,'\)/)
})
