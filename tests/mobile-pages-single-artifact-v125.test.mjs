import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const pipeline=readFileSync(new URL('../.github/workflows/garmin-ai-mobile-web.yml',import.meta.url),'utf8')
test('published site is the exact verified build, uploaded once and deployed in a separate job',()=>{
 const verify=pipeline.split('\n  verify:')[1]?.split('\n  deploy:')[0]||''
 const deploy=pipeline.split('\n  deploy:')[1]||''
 assert.match(verify,/name: Test full production source/)
 assert.match(verify,/Test all maintained integration, UI and security contracts/)
 assert.match(verify,/run: npm run build/)
 assert.match(verify,/Validate Pages base path/)
 assert.match(verify,/uses: actions\/upload-pages-artifact@v4/)
 assert.equal((pipeline.match(/uses: actions\/upload-pages-artifact@v4/g)||[]).length,1)
 assert.match(verify,/github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/)
 assert.match(deploy,/needs: verify/)
 assert.match(deploy,/uses: actions\/deploy-pages@v4/)
 assert.doesNotMatch(deploy,/actions\/upload-pages-artifact|npm run build|npm ci|actions\/checkout@/)
 assert.match(deploy,/pages: write/)
 assert.match(deploy,/id-token: write/)
 assert.match(deploy,/name: github-pages/)
 assert.match(pipeline,/workflow_dispatch:/)
})
