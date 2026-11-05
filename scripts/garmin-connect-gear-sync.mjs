/**
 * GARMIN_AI v0.7.3.6 – local, resumable gear association scan.
 * Read-only Garmin Connect session. Never writes Garmin, never exposes tokens.
 * After a timeout, repeat the command: only remaining gear items are fetched.
 */
import { readFile, writeFile, rename, rm, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { GarminClient, Garmin, FileTokenStore } from 'garminconnect-js'
import {
  canonicalGearId,startGearScan,resumeGearScan,saveGearScanResult,
  finishGearScan,compareLinkSets,
} from './garmin-gear-sync-model.mjs'

const root=join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'GARMIN_AI')
const reportPath=join(root,'garmin-connect-check.json')
const progressPath=join(root,'garmin-gear-sync-progress.json')
const historyPath=join(root,'garmin-connect-gear-history.json')
const tokenPath=join(root,'garmin-connect-tokens')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const atomic=async(path,obj)=>{
  const tmp=path+'.tmp-'+process.pid
  try {
    await writeFile(tmp,JSON.stringify(obj,null,2),{mode:0o600})
    await rename(tmp,path)
  } finally {
    await rm(tmp,{force:true}).catch(()=>{})
  }
}

async function main() {
  await mkdir(root,{recursive:true})
  const report=JSON.parse(await readFile(reportPath,'utf8'))
  if(report.source!=='Garmin Connect (unofficial)' || report.readOnly!==true ||
     report.gear?.status!=='ok' || !Array.isArray(report.gear.items) ||
     !report.gear.items.length || report.gear.items.length>100)
    throw Error('Garmin gear catalog missing: run the local Garmin verification')
  const gear=report.gear.items
  // The rest of the app reads the same trusted gear IDs from this report.
  const ids=gear.map(x=>canonicalGearId(x?.id))
  if(ids.some(x=>!x)) throw Error('Garmin gear IDs invalid')
  let state=startGearScan(gear)
  try {
    const previous=JSON.parse(await readFile(progressPath,'utf8'))
    state=resumeGearScan(previous,gear)
    console.log('Continuing previous Garmin gear scan with',Object.keys(state.completed).length,'completed items.')
  } catch {
    console.log('Starting a new complete Garmin gear scan.')
    await atomic(progressPath,state)
  }

  const client=new GarminClient({tokenStore:new FileTokenStore(tokenPath)})
  if(!await client.loadTokens()) throw Error('No local Garmin Connect session; run the local sign-in verification')
  const garmin=new Garmin(client)
  for (let i=0;i<gear.length;i++) {
    const id=ids[i]
    if(Object.hasOwn(state.completed,id)) {
      console.log(String(i+1).padStart(2,'0')+'/'+gear.length, 'cached:',state.completed[id].length)
      continue
    }
    // Do not retry aggressively: Garmin can time out or rate-limit requests.
    // A failure leaves all confirmed earlier results in the local checkpoint.
    let raw
    try {
      raw=await garmin.getGearActivities(gear[i].id,1000)
    } catch (error) {
      console.error('Garmin read interrupted at',i+1,'/',gear.length,'(',error instanceof Error?error.name:'request-failed',')')
      console.error('Progress saved. Repeat the scan to continue remaining items.')
      throw Error('Garmin gear scan incomplete')
    }
    state=saveGearScanResult(state,gear[i].id,raw)
    await atomic(progressPath,state)
    console.log(String(i+1).padStart(2,'0')+'/'+gear.length, 'links:',state.completed[id].length)
    if(i+1<gear.length) await sleep(700)
  }
  const links=finishGearScan(state)
  let previousLinks=[]
  try {
    const prior=JSON.parse(await readFile(historyPath,'utf8'))
    if(Array.isArray(prior.activityGearLinks)) previousLinks=prior.activityGearLinks
  } catch { /* no previous history yet */ }
  const diff=compareLinkSets(previousLinks,links)
  const history={
    source:'Garmin Connect (unofficial)',readOnly:true,scope:'complete',
    checkedAt:new Date().toISOString(),
    baseReportCheckedAt:report.checkedAt,
    gearIds:gear.map(x=>x.id),
    gearChecked:gear.length,
    activityGearLinks:links,
  }
  await atomic(historyPath,history)
  await rm(progressPath,{force:true})
  console.log('=== GARMIN GEAR SYNC READY ===')
  console.log('All gear checked:',gear.length)
  console.log('Previous link count:',previousLinks.length)
  console.log('Current link count:',links.length)
  console.log('Differences: +'+diff.added+' / -'+diff.removed)
  console.log('No Garmin writes. Import the verified result in Equipment after review.')
}

main().catch(error=>{
  console.error('Sync not completed:',error instanceof Error?error.message:'unknown error')
  process.exitCode=1
})
