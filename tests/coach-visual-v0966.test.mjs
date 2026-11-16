import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {heartZoneDistribution,zoneIndexForHr,splitBarHeight,paceLabel} from '../src/lib/trainingVisuals.mjs'
import {buildActivityCoach} from '../supabase/functions/garmin-coach-review/coachReview.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('Garmin heart samples are binned against Intervals HR boundaries without inventing time',()=>{
 const boundaries=[142,151,159,168,173,178,186]
 const samples=[...Array.from({length:70},()=>({hr:130})),
  ...Array.from({length:20},()=>({hr:165})),
  ...Array.from({length:10},()=>({hr:190}))]
 const result=heartZoneDistribution(samples,boundaries)
 assert.equal(result.valid,100)
 assert.equal(result.bands.length,8)
 assert.equal(result.bands[0].percentage,70)
 assert.equal(result.bands[3].percentage,20)
 assert.equal(result.bands[7].percentage,10)
 assert.equal(result.bands.reduce((sum,b)=>sum+b.count,0),100)
 assert.equal(zoneIndexForHr(160,boundaries),4)
 assert.equal(zoneIndexForHr(186,boundaries),7)
 assert.equal(zoneIndexForHr(187,boundaries),8)
 assert.equal(zoneIndexForHr(null,boundaries),null)
 assert.equal(heartZoneDistribution([{hr:120}],boundaries),null)
 assert.equal(heartZoneDistribution(Array.from({length:100},(_,i)=>({hr:i<60?130:null})),boundaries),null)
})
test('five real 1600m repeats create graphic cards; warmup and cooldown stay excluded',()=>{
 const activity={activity_id:'24725092836',activity_name:'ORC Track - Extensive Intervalle - 5 x 1600',
  sport_type:'track_running',start_time_local:'2026-11-14 09:06:54',distance_m:13200,average_heart_rate:152}
 const laps=[{intensity:'warmup',distanceM:1700,avgSpeed:2.6,elapsedS:660,avgHr:124},
  ...[436.2,436.2,430.6,428.1,429.3].flatMap((time,i)=>[
   {intensity:'active',distanceM:1600,avgSpeed:1600/time,elapsedS:time,avgHr:[160,168,168,171,167][i]},
   {intensity:'recovery',distanceM:400,avgSpeed:2,elapsedS:200,avgHr:135}
  ]),{intensity:'cooldown',distanceM:1700,avgSpeed:2.6,elapsedS:630,avgHr:127}]
 const result=buildActivityCoach(activity,{fit_laps:laps},null)
 assert.equal(result.type,'intervals')
 assert.equal(result.intervals.length,5)
 assert.equal(result.kilometers.length,0)
 assert.deepEqual(result.intervals.map(i=>i.avgHr),[160,168,168,171,167])
 assert.deepEqual(result.intervals.map(i=>i.distanceM),[1600,1600,1600,1600,1600])
 assert.equal(result.intervals[0].paceSeconds,273)
 assert.equal(paceLabel(result.intervals[0].paceSeconds),'4:33')
 assert.equal(result.intervals.at(-1).paceSeconds,268)
 assert.ok(splitBarHeight(result.intervals,4)>splitBarHeight(result.intervals,0))
})
test('a 10km easy run displays kilometers rather than artificial interval repeats',()=>{
 const activity={activity_id:'25053088856',activity_name:'10 k locker',sport_type:'running',
  start_time_local:'2026-11-12 11:16:52',distance_m:10022,average_heart_rate:131}
 const speeds=[2.45,2.69,2.78,2.63,2.57,2.95,2.83,3.13,2.59,2.54]
 const hr=[120,133,134,135,125,131,147,147,127,121]
 const result=buildActivityCoach(activity,{fit_laps:speeds.map((x,i)=>({
  intensity:'interval',distanceM:1000,avgSpeed:x,avgHr:hr[i]
 }))},null)
 assert.equal(result.type,'easy')
 assert.equal(result.intervals.length,0)
 assert.equal(result.kilometers.length,10)
 assert.equal(result.kilometers[7].avgHr,147)
})
test('the new session visual is a genuine responsive graphic below the single coach verdict',()=>{
 const analyst=read('src/components/LiveSessionAnalyst.tsx')
 const detail=read('src/components/SessionIntensityDetails.tsx')
 const visual=read('src/components/SessionVisualInsights.tsx')
 const summary=read('src/components/IntervalsCoachContext.tsx')
 const css=read('src/styles/session-visual-insights.css')
 const i=analyst.indexOf('<CoachEvidenceSummary active=')
 const j=analyst.indexOf('<SessionIntensityDetails key=')
 const k=analyst.indexOf('<details className="lsa-deep-dive">')
 assert.ok(i>0&&i<j&&j<k)
 assert.match(detail,/Trainingszonen &amp; Wiederholungen/)
 assert.match(detail,/<SessionVisualInsights/)
 assert.match(detail,/Garmin-HF-Zonen als Vergleich/)
 assert.match(visual,/sv-split-bar-well/)
 assert.match(visual,/heartZoneDistribution/)
 assert.match(visual,/role="img"/)
 assert.match(visual,/displayPaceZoneLimits/)
 assert.match(visual,/hrBands\.valid\.toLocaleString/)
 assert.match(visual,/Messpunktanteile, keine exakte Zeit/)
 assert.match(visual,/Ø-HF in Z/)
 assert.match(visual,/Warm-up, Erholung und Cool-down/)
 assert.ok(visual.includes("readPrivate('garmin-coach-review?id='+id"))
 assert.ok(visual.includes("readPrivate('garmin-intervals-insights?id='+id"))
 assert.match(css,/@media\(max-width:600px\)/)
 assert.match(css,/scroll-snap-type/)
 assert.equal((summary.match(/<details className="ic-zones"/g)||[]).length,0)
 assert.doesNotMatch(summary,/TRAININGSBELASTUNG/)
 assert.match(visual,/TRAININGSBELASTUNG/)
 assert.match(visual,/Schätzung aus Dauer und Intensität/)
 assert.match(visual,/role="group" aria-label="Intervals.icu Trainingsbelastung"/)
 assert.ok(style.includes('.sv-load-kpi'))
 assert.doesNotMatch(summary,/API-Rohwerte|paceZones\.join/)
})
