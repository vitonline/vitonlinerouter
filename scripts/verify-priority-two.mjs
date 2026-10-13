import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const dataDir = path.join(process.env.APPDATA, 'vitonlinerouter');
const token = crypto.createHash('sha256').update(fs.readFileSync(path.join(dataDir, 'machine-id'), 'utf8').trim() + 'fr-cli-auth' + fs.readFileSync(path.join(dataDir, 'auth/cli-secret'), 'utf8').trim()).digest('hex').slice(0, 16);
async function api(route, body) {
  const response = await fetch(`http://127.0.0.1:20128/api/${route}`, { headers: { 'x-vr-cli-token': token, 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(75000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return result;
}
const model = 'intern/qwen3.8-27b';
if (process.argv.includes('--recheck-text')) {
  const result = await api('models/test', { model });
  console.log(JSON.stringify({ model, ok: result.ok, reason: result.reason, latencyMs: result.latencyMs }));
  process.exit(result.ok ? 0 : 1);
}
if (process.argv.includes('--cancellation-status')) {
  const record = (await api('models/test')).results['intern/intern-s2'];
  const connection = (await api('providers')).connections.find(item => item.provider === 'intern');
  console.log(JSON.stringify({ testedAt: record?.testedAt, attempts: record?.attempts?.length || 1, reason: record?.reason, connectionStatus: connection?.testStatus, verificationNeeded: connection?.verificationNeeded }));
  process.exit();
}
const before = (await api('models/test')).results[model];
assert.ok(before?.ok, 'Use the previously working Intern model');
const report = { testedAt: new Date().toISOString(), results: [] };
for (const capability of ['streaming', 'json', 'tools']) {
  const result = await api('models/test', { model, capability });
  report.results.push({ model, capability, ok: result.ok, reason: result.reason, error: result.error, latencyMs: result.latencyMs });
  console.log(`${capability}: ${result.ok ? 'verified' : result.reason}`);
  fs.writeFileSync('priority-two-live-verification.json', JSON.stringify(report, null, 2));
}
const after = (await api('models/test')).results[model];
assert.equal(after.ok, before.ok, 'Capability probes must preserve basic text status');
assert.equal(after.testedAt, before.testedAt, 'Capability probes must preserve basic text timestamp');
assert.ok(after.attempts.length >= 4, 'History includes baseline and capability attempts');
assert.ok(after.historySummary.attempts >= 4);
assert.ok(after.capabilities.streaming && after.capabilities.json && after.capabilities.tools);
report.historyVerified = true;
report.basicTextResultPreserved = true;
fs.writeFileSync('priority-two-live-verification.json', JSON.stringify(report, null, 2));
console.log('Live history and separate capability persistence verified');
