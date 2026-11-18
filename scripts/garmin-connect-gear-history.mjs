/**
 * GARMIN_AI v0.7.3.3 - read-only historic gear assignment fetch.
 * Only runs from an interactive local console. No Garmin credentials / tokens leave this machine.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { GarminClient, Garmin, FileTokenStore } from 'garminconnect-js';
import { normalizeGearActivities, validateCompleteHistory } from './garmin-gear-history-model.mjs';

const root = join(process.env.LOCALAPPDATA || join(homedir(),'.local','share'), 'GARMIN_AI');
const sourceFile = join(root,'garmin-connect-check.json');
const historyFile = join(root,'garmin-connect-gear-history.json');
const tokens = join(root,'garmin-connect-tokens');
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Requires interactive PowerShell console');
  const report = JSON.parse(await readFile(sourceFile, 'utf8'));
  const gear = report.gear, schedule = report.schedule, activityGear = report.activityGear;
  if (report.readOnly !== true || report.source !== 'Garmin Connect (unofficial)' ||
      gear?.status !== 'ok' || schedule?.status !== 'ok' || activityGear?.status !== 'ok' ||
      !Array.isArray(gear.items) || !Array.isArray(activityGear.items)) throw new Error('Invalid or partial Garmin verification report');
  if (!gear.items.length || gear.items.length > 100) throw new Error('Unexpected Garmin gear count');
  if (Date.now() - Date.parse(report.checkedAt) > 7*86400000 ||
      !Number.isFinite(Date.parse(report.checkedAt))) throw new Error('Old verification report: run node scripts/garmin-connect-verify.mjs again');

  const client = new GarminClient({ tokenStore: new FileTokenStore(tokens) });
  if (!await client.loadTokens()) throw new Error('No local Garmin Connect session. Run v0.7.3.1 sign-in verification.');
  const garmin = new Garmin(client);
  const groups = [];
  console.log('Garmin Gear History - read-only, requests:',gear.items.length);
  for (let i=0; i<gear.items.length; i++) {
    const g=gear.items[i];
    if (typeof g.id !== 'string') throw new Error('Missing Garmin gear ID');
    // Garmin's getGearActivities does not paginate beyond 1000. A full page is unsafe.
    const result=await garmin.getGearActivities(g.id, 1000);
    const rows=normalizeGearActivities(result,g.id);
    groups.push(rows);
    console.log(String(i+1).padStart(2,'0')+'/'+gear.items.length, 'links:',rows.length);
    if (i+1 < gear.items.length) await pause(450);
  }
  const links=validateCompleteHistory(gear.items,groups,report.activityId,activityGear.items);
  const history={
    source:'Garmin Connect (unofficial)',
    readOnly:true,
    scope:'complete',
    checkedAt:new Date().toISOString(),
    baseReportCheckedAt:report.checkedAt,
    gearIds:gear.items.map(x=>x.id),
    gearChecked:gear.items.length,
    activityGearLinks:links,
  };
  await mkdir(root,{recursive:true});
  await writeFile(historyFile,JSON.stringify(history,null,2),{mode:0o600});
  console.log('=== GARMIN GEAR HISTORY VERIFIED ===');
  console.log('Gear scanned:',history.gearChecked);
  console.log('Activity-to-gear links:',links.length);
  console.log('Sanitized local history:',historyFile);
  console.log('No Garmin writes. Do not upload the file; import via localhost only.');
}

main().catch(e=>{
  console.error('Gear history NOT saved:',e instanceof Error?e.message:'unknown error');
  console.error('If Garmin returns rate limit/authorization errors, avoid repeated retries.');
  process.exitCode=1;
});
