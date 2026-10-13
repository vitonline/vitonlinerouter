import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const dir = path.join(process.env.APPDATA, 'flagshiprouter');
const token = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'machine-id'), 'utf8').trim() + 'fr-cli-auth' + fs.readFileSync(path.join(dir, 'auth/cli-secret'), 'utf8').trim()).digest('hex').slice(0, 16);
async function api(route, method = 'GET') {
  const response = await fetch(`http://127.0.0.1:20128/api/${route}`, { method, headers: { 'x-fr-cli-token': token }, signal: AbortSignal.timeout(90000) });
  assert.ok(response.ok, `${route}: HTTP ${response.status}`);
  return response.json();
}
await api('models/catalog');
const combo = await api('combos/default-provider', 'POST');
assert.equal(combo.name, 'MyDefaultProvider');
assert.equal(new Set(combo.models).size, combo.models.length);
assert.ok(combo.models.length > 0);
const settings = await api('settings');
assert.equal(settings.comboStrategies.MyDefaultProvider.fallbackStrategy, 'round-robin');
assert.equal(settings.comboStrategies.MyDefaultProvider.stickyRoundRobinLimit, 1);
assert.equal(settings.autoDefaultProviderCombo, true);
const list = await api('combos');
assert.equal(list.combos.filter(c => c.name === combo.name).length, 1);
const report = { name: combo.name, strategy: 'round-robin', autoIncludeModels: true, models: combo.models.length, checkedAt: new Date().toISOString() };
fs.writeFileSync('default-provider-combo-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
