import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {emptyHealthPreferences,normalizeHealthPreferences,adultBmi,weighReminderDue,explicitGarminProfile} from '../src/lib/healthPreferences.mjs'
const today='2026-11-28',base={heightCm:177,birthYear:1990,adultConfirmed:true,weighReminder:'daily'}
test('BMI is optional, adult-confirmed, calculated solely from height and weight',()=>{
 assert.equal(adultBmi(77.8,base,today),24.8)
 assert.equal(adultBmi(77.8,emptyHealthPreferences(),today),null)
 assert.equal(adultBmi(77.8,{...base,birthYear:2010},today),null)
 assert.equal(adultBmi(null,base,today),null)
 assert.equal(normalizeHealthPreferences({...base,heightCm:1.77},today),null)
 assert.equal(normalizeHealthPreferences({...base,weighReminder:'always'},today),null)
})
test('weigh reminders default off, respect the requested days and skip already measured or dismissed days',()=>{
 assert.equal(weighReminderDue(emptyHealthPreferences(),today,[],null),false)
 assert.equal(weighReminderDue(base,today,[],null),true)
 assert.equal(weighReminderDue(base,today,[today],null),false)
 assert.equal(weighReminderDue(base,today,[],today),false)
 assert.equal(weighReminderDue({...base,weighReminder:'three-weekly'},today,[],null),false)
 assert.equal(weighReminderDue({...base,weighReminder:'three-weekly'},'2026-11-27',[],null),true)
 assert.equal(weighReminderDue({...base,adultConfirmed:false},today,[],null),false)
})
test('Garmin prefill does not guess units, resolve conflicting heights or expose raw birth dates',()=>{
 assert.deepEqual(explicitGarminProfile({userData:{height:177,weight:78000,birthDate:'1990-01-01',gender:'FEMALE'}}),{heightCm:null,birthYear:1990})
 assert.deepEqual(explicitGarminProfile({heightCm:177,profile:{heightCm:178}}),{heightCm:null,birthYear:null})
 assert.deepEqual(explicitGarminProfile({heightCm:177,birthYear:1990}),{heightCm:177,birthYear:1990})
})
test('separate health preferences remain owner only and never change the training profile',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
 const api=read('supabase/functions/garmin-athlete-profile/index.ts'),sql=read('supabase/migrations/20261128140021_garmin_health_preferences.sql')
 assert.match(sql,/enable row level security/)
 assert.match(sql,/from public, anon, authenticated/)
 assert.match(api,/auth\.auth\.getUser/)
 assert.match(api,/from\('garmin_health_preferences'\).*eq\('user_id',user.id\)/)
 assert.match(api,/user_id:user.id,height_cm/)
 assert.match(api,/input.action==='prefill_health'/)
 assert.match(read('src/pages/CoachPage.tsx'),/<WeighReminder/)
 assert.match(read('src/components/SyncCenter.tsx'),/adultBmi\(trend.latest\[1\]/)
})
