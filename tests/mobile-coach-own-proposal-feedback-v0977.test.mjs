import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {assessCustomProposal} from '../src/lib/coachCustomProposal.mjs'
import {buildSevenDayCoach,coachAddDays} from '../src/lib/coachSevenDay.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

const race={race_name:'Heartbeat Ultra Fulda',race_date:'2026-11-21',distance_km:112}
const day={date:'2026-11-17',kind:'easy',title:'30 Min. locker statt Intervallen',
 minutes:30,approvable:true}
const plan={raceDate:race.race_date,signals:[]}
const assess=(kind,minutes,override={})=>assessCustomProposal({
 day,plan,goal:race,kind,minutes,...override
})

test('Coach really compares a user-entered 90-minute easy run with 30-minute taper proposal',()=>{
 const result=assess('run',90)
 assert.equal(result.level,'against')
 assert.equal(result.canSave,true,'athlete can consciously override and still save a draft')
 assert.equal(result.requiresAcknowledgment,true)
 assert.match(result.message,/90 statt 30 Minuten/)
 assert.match(result.message,/60 Minuten mehr/)
 assert.match(result.message,/Heartbeat Ultra Fulda/)
 assert.match(result.message,/4 Tage/)
 assert.match(result.message,/Coach bleibt bei 30 Minuten/)
})
test('a shorter easy run remains aligned with the existing conservative coach proposal',()=>{
 const result=assess('run',25)
 assert.equal(result.level,'aligned')
 assert.equal(result.requiresAcknowledgment,false)
 assert.match(result.message,/25 statt 30 Minuten/)
})
test('a 90-minute walk immediately before race is also cautioned, not blindly approved',()=>{
 const result=assess('walk',90)
 assert.equal(result.level,'against')
 assert.equal(result.requiresAcknowledgment,true)
 assert.match(result.message,/90 Minuten/)
})
test('a 90-minute run relative to 30-minute recommendation is questioned even without a race',()=>{
 const result=assess('run',90,{plan:{raceDate:null,signals:[]}})
 assert.equal(result.level,'against')
 assert.equal(result.requiresAcknowledgment,true)
})
test('rest day, race day and incomplete custom proposals cannot become unauthorized run approvals',()=>{
 const resting={...day,date:'2026-11-19',kind:'recovery',title:'Ruhetag',minutes:null,approvable:false}
 const noRun=assess('run',90,{day:resting})
 assert.equal(noRun.level,'blocked')
 assert.equal(noRun.canSave,false)
 assert.equal(assess('run',90,{day:{...day,kind:'race'}}).canSave,false)
 assert.equal(assess('run',9).canSave,false)
 assert.equal(assess('run',121).canSave,false)
})
test('no invented green light when Garmin signals advise caution',()=>{
 const result=assess('run',30,{plan:{raceDate:null,signals:['HRV deutlich unter Baseline']}})
 assert.equal(result.level,'review')
 assert.match(result.message,/HRV deutlich unter Baseline/)
 assert.equal(result.requiresAcknowledgment,true)
})
test('actual day title, not acceptance status, remains visible after decision for travel and rest',()=>{
 const today='2026-11-17'
 const snapshot={
  today,health:{metrics:Array.from({length:18},(_,i)=>({
   metric_date:coachAddDays(today,i-17),hrv_ms:48,resting_heart_rate:43,sleep_seconds:27000
  })),training:{runKm7:32,previousRunKm7:34,historyStatus:'complete',truncated:false}},
  boards:[{activities:[],manual:[]}],options:{options:[],choices:[]},plans:{entries:[]},
  goal:{goal:race},life:{context:{illness_state:'well',return_started_on:null,
   blocked_periods:[],run_reviews:[],day_decisions:[
    {date:'2026-11-19',choice:'accepted'}, {date:'2026-11-20',choice:'accepted'}
   ],race_recovery_checks:[]},runs:[]}
 }
 const p=buildSevenDayCoach(snapshot)
 assert.equal(p.days[2].title,'Ruhetag')
 assert.equal(p.days[3].title,'Ruhetag / Anfahrt')
 assert.equal(p.days[2].decision,'accepted')
 assert.equal(p.days[3].decision,'accepted')
 const seven=read('src/components/CoachSevenDay.tsx')
 const spot=read('src/components/CoachDecisionLive.tsx')
 assert.match(seven,/<strong title=\{day\.title\}>\{day\.title\}<\/strong>/)
 assert.match(seven,/day\.decision==='accepted'\?'✓ Angenommen'/)
 assert.doesNotMatch(seven,/day\.decision==='accepted'\?'Bestätigt'/)
 assert.match(spot,/<h4>\{day\.title\}<\/h4>/)
 assert.doesNotMatch(spot,/className="cdl-art"/)
})
test('live editable proposal shows detailed coach feedback before allowing deliberate override',()=>{
 const src=read('src/components/CoachSevenDay.tsx')
 const css=read('src/styles/coach-seven-day.css')
 assert.match(src,/assessCustomProposal\(\{day:customDay,plan,kind:customKind,minutes:customMinutes/)
 assert.match(src,/customAssessment\.requiresAcknowledgment&&!customAcknowledged/)
 assert.match(src,/Ich habe die Einschätzung gelesen/)
 assert.match(src,/Trotz Coach-Hinweis als Entwurf speichern/)
 assert.match(src,/role="status" aria-live="polite"/)
 assert.match(src,/assessment\.message\.slice\(0,235\)/)
 assert.match(src,/setCustomAcknowledged\(false\)/)
 assert.match(css,/\.c7-custom-assessment\.is-against/)
 assert.doesNotMatch(src,/action:'approve'/)
})
test('the first decision card is readable and content-led rather than a decorative comparison',()=>{
 const src=read('src/components/CoachDecisionLive.tsx')
 const css=read('src/styles/coach-decision-live.css')
 assert.match(src,/DEIN PLAN FÜR DIESEN TAG/)
 assert.match(src,/<h4>\{day\.title\}<\/h4>/)
 assert.doesNotMatch(src,/className="cdl-swap"/)
 assert.doesNotMatch(src,/className="cdl-art"/)
 assert.match(css,/\.cdl-art\{display:none\}/)
 assert.match(css,/\.cdl-choice h4\{font-size:clamp\(21px/)
})
