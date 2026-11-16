import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildActivityCoach,classifyRun} from '../supabase/functions/garmin-coach-review/coachReview.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

const easy={
 activity_id:'25053088856',activity_name:'10 k locker',sport_type:'running',
 start_time_local:'2026-11-12 11:16:52',distance_m:10022.87,duration_s:3712.38,
 average_heart_rate:131
}
const hrs=[120,133,134,135,125,131,147,147,127,121]
const speeds=[2.45,2.69,2.78,2.63,2.57,2.95,2.83,3.13,2.59,2.54]
const fit={
 fit_laps:speeds.map((speed,i)=>({intensity:'interval',distanceM:1000,avgSpeed:speed,avgHr:hrs[i]})),
 fit_terrain:[{terrain:'uphill',gradePct:3.4},{terrain:'downhill',gradePct:-4.4}]
}
const goal={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',distance_km:112}
test('10 km easy run uses halves, not just first/last km or a false plan',()=>{
 const r=buildActivityCoach(easy,fit,goal)
 assert.equal(classifyRun(easy,fit),'easy')
 assert.match(r.headline,/locker bezeichnet/)
 assert.equal(r.averageHr,131)
 assert.deepEqual(r.kilometerHrs,hrs)
 assert.match(r.positive,/10,0 km, Ø 131 bpm/)
 assert.match(r.positive,/25 % Geschwindigkeitsspanne/)
 assert.match(r.positive,/Anstiege und Gefälle/)
 assert.match(r.attention,/erste\/zweite Streckenhälfte Ø 129 → 135 bpm/)
 assert.match(r.attention,/7 % schneller/)
 assert.match(r.attention,/kein belastbarer Cardiac Drift/)
 assert.doesNotMatch(r.attention,/HF erster\/letzter Kilometerabschnitt/)
 assert.match(r.goal,/Taper und Frische/)
 assert.match(r.goal,/Ein ruhiger Lauf/)
 assert.doesNotMatch(r.goal,/Einzelne gute Intervalle/)
})
test('missing terrain or per-km HR stays an explicit evidence limitation',()=>{
 const noTerrain=buildActivityCoach(easy,{fit_laps:fit.fit_laps},goal)
 assert.doesNotMatch(noTerrain.positive,/FIT-Streckenprofil/)
 const withoutHr=buildActivityCoach(easy,{fit_laps:fit.fit_laps.map(l=>({...l,avgHr:null}))},goal)
 assert.match(withoutHr.attention,/fehlen Abschnittswerte/)
 assert.deepEqual(withoutHr.kilometerHrs,[])
})
test('plan vs actual is only shown when a real approved plan is found',()=>{
 const cmp=read('src/components/PlanActualReview.tsx')
 assert.match(cmp,/if\(match.status==='no-plan'\|\|match.status==='no-link'\)return null/)
 assert.doesNotMatch(cmp,/PLAN ↔ IST \/ OHNE ZUORDNUNG/)
 assert.match(cmp,/Plausibel zugeordnet/)
 assert.match(cmp,/Trainingsplan derzeit nicht erreichbar/)
})
test('Intervals pace zone percentages are not shown as raw seconds or 999',()=>{
 const src=read('src/components/IntervalsCoachContext.tsx')
 assert.match(src,/displayPaceZoneLimits/)
 assert.match(src,/threshold\*p\/100/)
 assert.match(src,/x>=40&&x<250/)
 assert.match(read('src/components/SessionVisualInsights.tsx'),/Pace-Grenzen aus der/)
 assert.match(read('src/components/SessionVisualInsights.tsx'),/min\/km/)
 assert.doesNotMatch(src,/API-Rohwerte|paceZones\.join/)
 assert.match(src,/firstHrLimit/)
 assert.match(src,/kein LT1-Nachweis/)
})
test('user-specific zones count km means, not fabricated time-in-zone',()=>{
 const review=read('supabase/functions/garmin-coach-review/coachReview.mjs')
 const fn=read('supabase/functions/garmin-coach-review/index.ts')
 const view=read('src/components/CoachEvidenceSummary.tsx')
 assert.match(review,/kilometerHrs:type==='intervals'\?\[\]/)
 assert.match(fn,/fit_quality,fit_terrain/)
 assert.match(view,/averageHr=\{r.averageHr\} kilometerHrs=\{r.kilometerHrs\}/)
 assert.match(view,/kind=\{r.type\}/)
})
