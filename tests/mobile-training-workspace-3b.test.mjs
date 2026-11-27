import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
const page=read('src/pages/TrainingPage.tsx')
const history=read('src/components/TrainingHistory.tsx')
const development=read('src/components/TrainingDevelopment.tsx')
test('training workspace has three mutually exclusive active analysis scopes',()=>{
 for(const name of ['session','development','history'])assert.ok(page.includes("id:'"+name+"'"))
 assert.match(page,/const \[view,setView\]=useState<View>\('session'\)/)
 assert.match(page,/<LiveSessionAnalyst active=\{active&&view==='session'\} focus=\{focus\}/)
 assert.match(page,/<TrainingDevelopment active=\{active&&view==='development'\}/)
 assert.match(page,/<TrainingHistory active=\{active&&view==='history'\}/)
 assert.match(page,/aria-pressed=\{view===item.id\}/)
})
test('calendar activity and archive navigation reach the right scope',()=>{
 assert.match(page,/if\(focus\?\.token!==undefined\)setView\('session'\)/)
 assert.match(page,/setHistoryFocus\(n=>n\+1\);setView\('history'\)/)
 assert.match(history,/if\(focusToken\)\{setMonth\(current\)/)
 assert.match(page,/addEventListener\('garmin-ai-open-training-development',development\)/)
 assert.match(read('src/pages/CoachPage.tsx'),/dispatchEvent\(new Event\('garmin-ai-open-training-development'\)\)/)
})
test('history keeps canonical archive; development only requests extra evidence when expanded',()=>{
 assert.match(history,/if\(!active\)return/)
 assert.match(history,/readTrainingMonth\(month,controller.signal\)/)
 assert.match(history,/historyModel\(data\)/)
 assert.match(development,/if\(!active\|\|!garminSupabase\)/)
 assert.match(development,/goalRoute:snapshot.goalRoute/)
 assert.match(development,/\{evidenceOpen&&<>[\s\S]*<CoachEvidenceSummary/)
 assert.match(development,/<WeeklyPlanActualCard/)
 assert.match(development,/<CoachLongTermCard/)
 assert.match(read('src/styles/training-workspace.css'),/min-height:58px/)
})
