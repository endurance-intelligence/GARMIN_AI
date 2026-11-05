/**
 * GARMIN_AI v0.7.3.1 – local, read-only verification of Garmin Connect.
 * Never sends Garmin credentials, MFA data or tokens to localhost/frontend/Supabase.
 * Stores refreshable session only in the signed-in user's LOCALAPPDATA directory.
 * Third-party garminconnect-js uses unofficial Garmin Connect authentication.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { GarminClient, Garmin, FileTokenStore } from 'garminconnect-js';
import { gearRows, scheduledRows, activityGearRows, ensureNonemptyKnownShape, safeStatus } from './garmin-connect-model.mjs';

const root = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'GARMIN_AI');
const tokenDir = join(root, 'garmin-connect-tokens');
const reportFile = join(root, 'garmin-connect-check.json');
const activityId = '24725092836'; // validated earlier in GARMIN_AI; read-only context check.
const now = new Date();
const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
const through = new Date(now.getTime() + 28 * 86400000).toISOString().slice(0, 10);

async function visible(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(question)).trim(); }
  finally { rl.close(); }
}
async function hidden(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Password input requires an interactive PowerShell window');
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = Boolean(input.isRaw);
    let answer = '';
    process.stdout.write(question);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.removeListener('data', handle);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(answer);
    };
    function handle(chunk) {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') return finish(new Error('Cancelled'));
        if (ch === '\u007f' || ch === '\b') { answer = answer.slice(0, -1); continue; }
        if (ch >= ' ' && answer.length < 500) answer += ch;
      }
    }
    input.on('data', handle);
  });
}

async function checkOne(name, loader, normalize) {
  try {
    const data = await loader();
    const rows = ensureNonemptyKnownShape(data, normalize(data), name);
    return { status: 'ok', count: rows.length, items: rows };
  } catch (error) {
    return { status: safeStatus(error), count: null, items: null };
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Run in an interactive PowerShell console, not in CI or a pipeline');
  }
  await mkdir(tokenDir, { recursive: true, mode: 0o700 });
  const client = new GarminClient({ tokenStore: new FileTokenStore(tokenDir) });
  const existing = await client.loadTokens();
  if (!existing) {
    console.log('One-time Garmin Connect sign-in. Credentials are not stored.');
    const email = await visible('Garmin email: ');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Invalid email');
    let password = await hidden('Garmin password (hidden): ');
    if (!password) throw new Error('Empty password');
    let outcome;
    try { outcome = await client.login(email, password); }
    finally { password = ''; }
    if (outcome?.state === 'mfa_required') {
      let code = await hidden('Garmin MFA code (hidden): ');
      if (!/^\d{4,10}$/.test(code)) throw new Error('Invalid MFA code');
      try { await client.resumeLogin(outcome.mfaState, code); }
      finally { code = ''; }
    }
    console.log('Garmin Connect sign-in completed.');
  } else {
    console.log('Reusing saved Garmin Connect session; no password needed.');
  }
  const garmin = new Garmin(client);
  const profile = await garmin.getUserProfile();
  if (!Number.isSafeInteger(profile.profileId)) throw new Error('Profile does not contain a numeric ID');

  const gear = await checkOne('gear', () => garmin.getGear(profile.profileId), gearRows);
  const schedule = await checkOne('schedule', () => garmin.getScheduledWorkoutSummaries(from, through), scheduledRows);
  const activityGear = await checkOne('activityGear', () => garmin.getActivityGear(activityId), activityGearRows);

  // Data cache only; tokens are in a separate directory, never in this report.
  const report = {
    source: 'Garmin Connect (unofficial)',
    readOnly: true,
    checkedAt: new Date().toISOString(),
    calendar: { startDate: from, endDate: through },
    activityId,
    gear,
    schedule,
    activityGear,
  };
  await writeFile(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.table([
    { area: 'Gear catalog', status: gear.status, count: gear.count },
    { area: 'Training calendar', status: schedule.status, count: schedule.count },
    { area: 'Gear linked to activity', status: activityGear.status, count: activityGear.count },
  ]);
  if (gear.status === 'ok' && gear.items?.length) {
    console.log('Gear names:', gear.items.map((g) => g.name || g.id).join(' | '));
  }
  console.log('Sanitized local report:', reportFile);
  console.log('Garmin tokens stay exclusively at:', tokenDir);
  if ([gear, schedule, activityGear].some((r) => r.status !== 'ok')) process.exitCode = 2;
}

main().catch((error) => {
  // Do not print exception objects from authentication libraries (may include URLs/tokens).
  console.error('Garmin Connect check failed:', error instanceof Error ? error.name : 'unknown');
  console.error('If sign-in is blocked, do not repeatedly retry; Garmin limits login attempts.');
  process.exitCode = 1;
});
