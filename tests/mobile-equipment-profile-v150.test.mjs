import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {normalizeEquipmentProfile,hasEquipment} from '../src/lib/equipmentProfile.mjs'
import {buildGoalSupplement,buildGoalProfile} from '../src/lib/goalTrainingFocus.mjs'
const today='2026-11-25',profile=buildGoalProfile({today,goal:{goal:{race_date:'2027-06-01',race_name:'Test',distance_km:65}}})
const boards=[{start:'2026-11-16',activities:[],manual:[]},{start:'2026-11-23',activities:[],manual:[]}]
const args={today,profile,boards,days:[{date:today,kind:'mobility',minutes:20,approvable:true}]}
test('explicit equipment, unknown vs empty, finite incline and cycling availability',()=>{
 assert.equal(normalizeEquipmentProfile(null),null)
 assert.deepEqual(normalizeEquipmentProfile({available:[],treadmillMaxInclinePct:null}),{available:[],treadmillMaxInclinePct:null})
 for(const available of [['unknown'],['rowing','rowing']])assert.equal(normalizeEquipmentProfile({available,treadmillMaxInclinePct:null}),null)
 assert.equal(normalizeEquipmentProfile({available:['rowing'],treadmillMaxInclinePct:6}),null)
 assert.equal(normalizeEquipmentProfile({available:['treadmill'],treadmillMaxInclinePct:41}),null)
 assert.equal(normalizeEquipmentProfile({available:['treadmill'],treadmillMaxInclinePct:6}).treadmillMaxInclinePct,6)
 assert.equal(hasEquipment({available:['trainer'],treadmillMaxInclinePct:null},'cycling'),true)
 assert.equal(hasEquipment(null,'rowing'),false)
})
test('unconfirmed or disabled equipment cannot produce a new supplement; protection still wins',()=>{
 assert.equal(buildGoalSupplement(args).suggestion,null)
 assert.equal(buildGoalSupplement({...args,equipment:{available:[],treadmillMaxInclinePct:null}}).suggestion,null)
 const equipment={available:['bodyweight'],treadmillMaxInclinePct:null}
 assert.equal(buildGoalSupplement({...args,equipment}).suggestion.kind,'strength')
 assert.equal(buildGoalSupplement({...args,equipment,protectedPhase:true}).suggestion,null)
})
test('settings saves privately, refreshes coach and snapshot includes the owner profile',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 assert.match(read('src/pages/SettingsPage.tsx'),/<EquipmentProfileSettings active=\{active\}/)
 assert.match(read('src/components/EquipmentProfileSettings.tsx'),/confirm:true,profile/)
 assert.match(read('src/components/EquipmentProfileSettings.tsx'),/garmin-ai-coach-changed/)
 const reader=read('supabase/functions/_shared/coach-archive-reader.ts')
 assert.match(reader,/normalizeEquipmentProfile\(\{available:equipment.available/)
 assert.match(reader,/garmin_equipment_profile'\).select[^\n]+\.eq\('user_id',userId\)/)
 assert.match(reader,/life:\{context:c,runs,equipmentProfile,trainingRhythm\}/)
 assert.match(read('src/lib/coachSevenDay.mjs'),/equipment:input.life\?\.equipmentProfile/)
 const api=read('supabase/functions/garmin-equipment-profile/index.ts')
 assert.match(api,/auth\.auth\.getUser/)
 assert.match(api,/user\.email_confirmed_at/)
 assert.match(api,/user\.email\?\.trim\(\)\.toLowerCase\(\)!==owner/)
 assert.match(api,/input.confirm!==true/)
 assert.match(api,/user_id:user.id/)
 assert.doesNotMatch(api,/garmin-training-plan|intervals\.icu/)
})
