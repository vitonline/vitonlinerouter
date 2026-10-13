import fs from 'node:fs';
import { localApi } from './lib/local-router-api.mjs';
const candidates = ['intern/qwen3.8-27b', 'intern/deepseek-v4-flash-0731', 'intern/glm-5.3', 'intern/kimi-k2.6', 'intern/minimax-m3'];
const report = { at: new Date().toISOString(), models: [], results: [] };
for (const model of candidates) {
  let passed = true;
  for (const capability of ['text', 'streaming', 'tools', 'json']) {
    const result = await localApi('models/test', { method: 'POST', body: { model, capability } });
    report.results.push({ model, capability, ok: result.ok, reason: result.reason, latencyMs: result.latencyMs });
    fs.writeFileSync('recommended-models-verification.json', JSON.stringify(report, null, 2));
    console.log(`${model} ${capability}: ${result.ok ? 'passed' : result.reason}`);
    if (!result.ok) { passed = false; break; }
  }
  if (passed) report.models.push(model);
  if (report.models.length === 3) break;
}
fs.writeFileSync('recommended-models-verification.json', JSON.stringify(report, null, 2));
if (report.models.length < 3) throw new Error('Fewer than three models qualified; do not promote the pool');
