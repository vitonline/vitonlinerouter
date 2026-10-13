import assert from 'node:assert/strict';
import fs from 'node:fs';
import { localApi } from './lib/local-router-api.mjs';
const created = await localApi('keys', { method: 'POST', body: { name: 'Release verification temporary key' } });
try {
  const request = () => fetch('http://127.0.0.1:20128/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${created.key}`, 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.20' }, body: '{"messages":[]}' });
  const before = await request(); assert.equal(before.status, 400);
  await localApi(`keys/${created.id}`, { method: 'PUT', body: { isActive: false } });
  const after = await request(); assert.equal(after.status, 401);
  const report = { acceptedBeforeRevocation: true, rejectedAfterRevocation: true, at: new Date().toISOString() };
  fs.writeFileSync('key-revocation-verification.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await localApi(`keys/${created.id}`, { method: 'DELETE' }); }
