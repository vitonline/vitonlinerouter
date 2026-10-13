import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir = path.join(process.env.APPDATA, 'vitonlinerouter');
const cliToken = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'machine-id'), 'utf8').trim() + 'fr-cli-auth' + fs.readFileSync(path.join(dir, 'auth/cli-secret'), 'utf8').trim()).digest('hex').slice(0, 16);
export async function localApi(route, { method = 'GET', body, timeout = 75000 } = {}) {
  const response = await fetch(`http://127.0.0.1:20128/api/${route}`, { method, headers: { 'x-vr-cli-token': cliToken, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeout) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return data;
}
