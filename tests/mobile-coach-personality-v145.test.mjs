import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {coachMood,resolveFollowUp} from '../src/lib/coachPersonality.mjs'
import {resolveCoachQuestion} from '../src/lib/askCoach.mjs'
import {buildCoachChatContext} from '../src/lib/coachChatContext.mjs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const today='2026-11-25'
const p=(kind,extra={})=>({today,days:[{date:today,kind,title:'Test',reason:'Coach reason',minutes:null,...extra}],signals:[],flags:[]})
test('avatar expresses the existing coach decision, not pace or guilt',()=>{
 assert.equal(coachMood(null),'neutral')
 assert.equal(coachMood(p('chosen',{selectedGroup:{advice:'skip'}})),'firm')
 assert.equal(coachMood(p('recovery')),'supportive')
 assert.equal(coachMood(p('completed')),'supportive')
 assert.equal(coachMood(p('race')),'focused')
 const plan=p('easy');plan.nextImpact={fresh:true,status:'reduce',latest:{deltaMinutes:40}}
 assert.equal(coachMood(plan),'reflective')
 plan.nextImpact={fresh:true,status:'stable',latest:{deltaMinutes:0,rpe:4,feeling:'good'}}
 assert.equal(coachMood(plan),'celebrate')
})
test('local follow-ups keep prior topic, new explicit topics and symptoms take priority',()=>{
 assert.equal(resolveFollowUp('Und morgen?','weather',resolveCoachQuestion),'weather')
 assert.equal(resolveFollowUp('Warum genau?','recovery',resolveCoachQuestion),'recovery')
 assert.equal(resolveFollowUp('Brustschmerz heute?','weather',resolveCoachQuestion),'symptoms')
 assert.equal(resolveFollowUp('Was ist die Hauptstadt von Frankreich?',null,resolveCoachQuestion),null)
})
test('minimal context excludes raw credentials, GPS, account IDs and stale weather',()=>{
 const snapshot={health:{metrics:[],secret:'secret-raw'},boards:[],plans:{entries:[]},goal:{},life:{context:{}},token:'secret-token'}
 const x=buildCoachChatContext({today,snapshot,plan:p('recovery'),weather:{date:'2026-11-24',text:'stale-weather'}})
 assert.match(x,/Coach reason/)
 assert.doesNotMatch(x,/secret-raw|secret-token|stale-weather/)
})
test('external chat requires consent, owner authorization, bounded inputs and separate web research',()=>{
 const e=read('supabase/functions/garmin-coach-chat/index.ts'),c=read('src/components/AskCoachCard.tsx'),client=read('src/lib/coachChatClient.ts')
 assert.match(e,/auth\.auth\.getUser\(token\)/)
 assert.match(e,/user\?\.email_confirmed_at/)
 assert.match(e,/body\.consent!==true/)
 assert.match(e,/research&&body\.context/)
 assert.match(e,/store:false/)
 assert.match(e,/type:'web_search'/)
 assert.match(e,/COACH_OPENAI_API_KEY/)
 assert.doesNotMatch(e,/service_role|\.insert\(|\.upsert\(|garmin-training-plan/)
 assert.match(c,/!configured\|\|!consent/)
 assert.match(c,/mode==='personal'&&topic==='weather'/)
 assert.match(client,/mode==='personal'\?context:''/)
 assert.doesNotMatch(client,/COACH_OPENAI_API_KEY|api\.openai\.com/)
})
