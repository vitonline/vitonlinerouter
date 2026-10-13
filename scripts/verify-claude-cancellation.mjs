import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { localApi } from './lib/local-router-api.mjs';
const key = (await localApi('keys')).keys.find(k => k.isActive)?.key;
const base = path.resolve('.pilot-verification'); fs.mkdirSync(base, { recursive: true });
const root = fs.mkdtempSync(path.join(base, 'cancel-probe-'));
const executable = 'C:/Users/HUAWEI/AppData/Local/Temp/vitonlinerouter-claude-probe-20261013/node_modules/@anthropic-ai/claude-code/bin/claude.exe';
const baseline = (await localApi('usage/history')).activeRequests || [];
const child = spawn(executable, ['-p', '--bare', '--no-session-persistence', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--model', 'RecommendedModels', 'Write a very long numbered sequence from 1 to 10000, one number per line.'], { cwd: root, windowsHide: true, env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(root, 'config'), ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_BASE_URL: 'http://127.0.0.1:20128', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } });
child.stdin.end(); let events = '', observed = false;
child.stdout.on('data', chunk => { events += chunk; }); child.stderr.on('data', () => {});
try {
  for (let i = 0; i < 40; i++) {
    const current = (await localApi('usage/history')).activeRequests || [];
    if (current.some(r => r.count > 0) && current.length > baseline.length && events.includes('text_delta')) { observed = true; break; }
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(observed, 'Did not observe a gateway request from the actual tool');
  const routeId = (await localApi('usage/routing')).traces.find(t => t.combo === 'RecommendedModels' && t.streamStatus === 'in_progress')?.id;
  assert.ok(routeId, 'No in-progress routing trace for streamed fixture');
  const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited;
  let cleared = false;
  for (let i = 0; i < 40; i++) {
    const current = (await localApi('usage/history')).activeRequests || [];
    if (current.length <= baseline.length) { cleared = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const report = { tool: 'Claude Code', upstreamRequestObserved: observed, callerTerminated: true, activeRequestsReturnedToBaseline: cleared, streamedEventsObserved: events.includes('stream_event'), at: new Date().toISOString() };
  const route = (await localApi('usage/routing')).traces.find(t => t.id === routeId);
  report.routingCancellationRecorded = route?.streamStatus === 'cancelled';
  fs.writeFileSync('claude-cancellation-verification.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  assert.ok(cleared, 'Gateway retained an active request after tool cancellation');
  assert.ok(report.routingCancellationRecorded, 'Stream trace did not record caller cancellation');
} finally { if (child.exitCode === null) child.kill(); }
