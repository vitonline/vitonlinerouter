import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const dataDir = path.join(process.env.APPDATA, 'vitonlinerouter');
const token = crypto.createHash('sha256').update(fs.readFileSync(path.join(dataDir, 'machine-id'), 'utf8').trim() + 'fr-cli-auth' + fs.readFileSync(path.join(dataDir, 'auth/cli-secret'), 'utf8').trim()).digest('hex').slice(0, 16);
async function request(route, body) {
  const response = await fetch(`http://127.0.0.1:20128/api/${route}`, {
    headers: { 'x-vr-cli-token': token, 'Content-Type': 'application/json' },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
const report = { checkedAt: new Date().toISOString(), checks: [] };
for (const [name, body] of [
  ['reserved prefix', { name: 'Validation probe', prefix: 'qw', apiType: 'chat', baseUrl: 'https://example.com/v1' }],
  ['unsafe URL scheme', { name: 'Validation probe', prefix: 'validation-probe', apiType: 'chat', baseUrl: 'file:///tmp/api' }],
  ['malformed name', { name: {}, prefix: 'validation-probe', apiType: 'chat' }],
]) {
  const result = await request('provider-nodes', body);
  assert.equal(result.status, 400, name);
  report.checks.push({ name, status: result.status, error: result.body.error });
}
for (const route of ['models/test', 'providers/issues', 'provider-nodes']) {
  const result = await request(route);
  assert.equal(result.status, 200, route);
  report.checks.push({ name: route, status: result.status });
}
fs.writeFileSync('provider-health-upgrades-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
