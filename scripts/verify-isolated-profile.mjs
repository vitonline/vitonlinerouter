import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { verifyIsolatedAccounting } from './lib/verify-isolated-accounting.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vitonline-isolated-profile-'));
const app = path.resolve('cli/app'), data = path.join(root, 'data');
const password = crypto.randomBytes(24).toString('hex');
const base = 'http://127.0.0.1:20129';
let child, cookie;
let serverLog = '';
const report = { scope: 'Packaged server with a fresh profile on the current Windows host; not a clean VM', checks: {}, at: new Date().toISOString() };
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: root, TMP: root, APPDATA: path.join(root, 'appdata'), USERPROFILE: root, DATA_DIR: data, INITIAL_PASSWORD: password, PORT: '20129', HOSTNAME: '127.0.0.1', NODE_OPTIONS: '--use-system-ca' };
async function start() {
  child = spawn(process.execPath, [path.join(app, 'custom-server.js')], { cwd: app, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { serverLog += chunk; }); child.stderr.on('data', chunk => { serverLog += chunk; });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  report.startupError = serverLog.replaceAll(password, '[REDACTED]').slice(-1000);
  throw new Error('Isolated server did not start');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit;
}
async function api(route, method = 'GET', body) {
  const response = await fetch(`${base}/api/${route}`, { method, headers: { Cookie: cookie || '', 'Content-Type': 'application/json', 'x-vr-password': password }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const parsed = await response.json(); assert.ok(response.ok, `${route}: HTTP ${response.status}`); return parsed;
}
try {
  await start(); report.checks.freshProfileStartup = true;
  assert.equal((await fetch(`${base}/api/settings`)).status, 401); report.checks.unauthenticatedManagementDenied = true;
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  assert.equal(login.status, 200); cookie = login.headers.get('set-cookie').split(';')[0];
  await api('settings', 'PATCH', { password, currentPassword: password });
  const combo = await api('combos', 'POST', { name: 'RestoreFixture', models: ['fixture/one'] });
  const exported = await api('settings/database'); assert.equal(exported.configurationOnly, true); assert.deepEqual(exported.apiKeys, []);
  assert.ok(!JSON.stringify(exported).includes(password)); report.checks.secretFreeExport = true;
  await api(`combos/${combo.id}`, 'PUT', { models: ['fixture/two'] });
  await api('settings/database', 'POST', { ...exported, password });
  assert.deepEqual((await api(`combos/${combo.id}`)).models, ['fixture/one']); report.checks.configurationRestore = true;
  await stop(); await start();
  assert.deepEqual((await api(`combos/${combo.id}`)).models, ['fixture/one']); report.checks.restartPersistence = true;
  report.checks.accounting = await verifyIsolatedAccounting(api, base);
  report.checks.softwareUpdateAndRollback = 'Not tested: no independently packaged prior release / clean VM';
  console.log(JSON.stringify(report));
} finally {
  await stop(); fs.writeFileSync('isolated-profile-verification.json', JSON.stringify(report, null, 2));
  if (path.resolve(root).startsWith(path.join(os.tmpdir(), 'vitonline-isolated-profile-'))) fs.rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 500 });
}
