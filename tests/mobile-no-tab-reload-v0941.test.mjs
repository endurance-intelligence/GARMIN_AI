import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('same authenticated owner is reverified without unmounting the entire UI',()=>{
 const gate=read('src/components/OnlineAccessGate.tsx')
 assert.match(gate,/const sameApprovedUser=authorizedUserId\.current===userId/)
 assert.match(gate,/if\(!sameApprovedUser\)\{/)
 assert.match(gate,/if\(authorizedUserId\.current===userId&&lastVerifiedToken\.current===session\.access_token\)return/)
 assert.match(gate,/if\(inFlight\?\.userId===userId&&inFlight\.token===session\.access_token\)return/)
 assert.match(gate,/void verify\(session\)\.then\(next=>/)
 assert.match(gate,/setStatus\(next\)/)
 assert.match(gate,/if\(status==='authorized'\)return <>{children}<\/>/)
})
test('logout and account switch never bypass server-side owner verification',()=>{
 const gate=read('src/components/OnlineAccessGate.tsx')
 assert.match(gate,/if\(!session\|\|!userId\)\{/)
 assert.match(gate,/authorizedUserId\.current=null\s+lastVerifiedToken\.current=null\s+setStatus\('signed-out'\)/)
 assert.match(gate,/if\(!sameApprovedUser\)\{/)
 assert.match(gate,/setStatus\('checking'\)/)
 assert.match(gate,/garmin-app-access/)
 assert.match(gate,/lastVerifiedToken\.current=next==='authorized'\?session\.access_token:null/)
})
test('Race Prep keeps unsaved Event Scout and GPX state on app tab changes',()=>{
 const scout=read('src/components/RaceEventResearch.tsx')
 const route=read('src/components/RaceRouteViewer.tsx')
 const weather=read('src/components/RaceForecastCompact.tsx')
 assert.match(scout,/loadedRefreshKey\.current===refreshKey/)
 assert.match(scout,/loadedRefreshKey\.current=refreshKey/)
 assert.match(route,/loadedRefreshKey\.current===refreshKey/)
 assert.match(route,/loadedRefreshKey\.current=refreshKey/)
 assert.match(weather,/loadedWeatherKey\.current===key/)
 assert.match(weather,/loadedWeatherKey\.current=key/)
 assert.match(weather,/loadedStage\.current/)
 assert.match(scout,/sessionStorage\.setItem\(cacheKey\(goal\.raceDate\)/)
})
