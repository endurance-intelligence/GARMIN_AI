import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {profileFieldAvailability,cycleAvailability} from '../src/lib/athleteProfile.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('only capability flags leave the profile probe; missing data are not invented',()=>{
 assert.deepEqual(profileFieldAvailability({userData:{height:170,birthDate:'1990-01-01',gender:'FEMALE',weight:60000,privateNote:'test'}}),{heightCandidate:true,ageCandidate:true,sexCandidate:true,weightCandidate:true})
 assert.deepEqual(profileFieldAvailability({fitnessAge:30,unrelated:{height:180},weight:null}),{heightCandidate:false,ageCandidate:false,sexCandidate:false,weightCandidate:false})
 assert.deepEqual(profileFieldAvailability(null),{heightCandidate:false,ageCandidate:false,sexCandidate:false,weightCandidate:false})
 assert.equal(cycleAvailability({dayInCycle:10,currentPhase:2}),'schema-review')
})
test('both manual probes use the shared guarded client and cycle consent',()=>{
 const source=read('supabase/functions/garmin-athlete-profile/index.ts')
 assert.match(source,/createGarminPersonalClient/)
 assert.equal(source.match(/await api\.ready\(\)/g)?.length,2)
 assert.equal(source.match(/await api\.getToken\(\)/g)?.length,2)
 assert.doesNotMatch(source,/personalapitoken-service|console\.log|console\.error/)
 assert.match(source,/profile\?\.cycleEnabled!==true/)
 assert.match(source,/fields:profileFieldAvailability/)
 const ui=read('src/components/HealthDataAvailability.tsx')
 assert.match(ui,/action==='check_cycle'&&!cycle/)
 assert.match(ui,/Noch keine Werte importiert/)
 assert.match(read('src/pages/SettingsPage.tsx'),/<HealthDataAvailability active=/)
})
