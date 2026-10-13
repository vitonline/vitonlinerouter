import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { localApi } from './lib/local-router-api.mjs';
import { redactSecretText } from '../open-sse/utils/redactSecrets.js';
const privateRoot = path.resolve('.pilot-verification'); fs.mkdirSync(privateRoot, { recursive: true });
const root = fs.mkdtempSync(path.join(privateRoot, 'codex-probe-'));
const workspace = path.join(root, 'workspace'), home = path.join(root, 'codex');
fs.mkdirSync(workspace); fs.mkdirSync(home);
const markerValue = `VITONLINE_PILOT_${randomBytes(8).toString('hex')}`;
fs.writeFileSync(path.join(workspace, 'marker.txt'), markerValue);
fs.writeFileSync(path.join(workspace, 'schema.json'), JSON.stringify({ type: 'object', properties: { marker: { type: 'string' } }, required: ['marker'], additionalProperties: false }));
const key = (await localApi('keys')).keys.find(k => k.isActive)?.key;
if (!key) throw new Error('No active local router key');
let toolDeclarations = [];
const responseEvents = [];
const proxy = http.createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const payload = Buffer.concat(chunks);
  try { const body = JSON.parse(payload); if (body.tools) toolDeclarations = body.tools.map(t => ({ type: t.type, name: t.name, tools: t.tools?.map(child => ({ type: child.type, name: child.name })) })); } catch {}
  const upstream = http.request({ host: '127.0.0.1', port: 20128, method: request.method, path: request.url, headers: request.headers }, incoming => {
    let buffer = '';
    incoming.on('data', chunk => {
      buffer += chunk.toString(); const frames = buffer.split('\n\n'); buffer = frames.pop();
      for (const frame of frames) for (const line of frame.split('\n')) if (line.startsWith('data: ')) {
        try { const event = JSON.parse(line.slice(6)); if (/output_item|completed|failed|error/.test(event.type || '')) responseEvents.push({ type: event.type, itemType: event.item?.type, name: event.item?.name, namespace: event.item?.namespace }); } catch {}
      }
    });
    response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response);
  });
  upstream.on('error', () => { response.writeHead(502); response.end(); });
  response.on('close', () => { if (!response.writableFinished) upstream.destroy(); }); upstream.end(payload);
});
await new Promise(resolve => proxy.listen(20130, '127.0.0.1', resolve));
const model = process.env.PILOT_MODEL || 'RecommendedModels';
fs.writeFileSync(path.join(home, 'config.toml'), `model_provider = "vitonline_probe"\nmodel = ${JSON.stringify(model)}\n[model_providers.vitonline_probe]\nname = "VitonlineRouter"\nbase_url = "http://127.0.0.1:20130/v1"\nwire_api = "responses"\nenv_key = "VITONLINE_PROBE_KEY"\n`);
const executable = process.env.LOCAL_CODEX_BINARY;
if (!executable) throw new Error('Set LOCAL_CODEX_BINARY to the installed Codex executable');
const output = path.join(root, 'last.json');
const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--json', '--sandbox', 'workspace-write', '-c', 'approval_policy="never"', '-c', 'features.multi_agent=false', '-C', workspace, ...(process.env.PILOT_NO_OUTPUT_SCHEMA ? [] : ['--output-schema', path.join(workspace, 'schema.json')]), '-o', output, 'Use exec_command to read marker.txt with PowerShell Get-Content. Do not delegate or use subagents. Do not modify any files. Your final answer must be a JSON object with a marker field containing the exact marker from that file.'];
const child = spawn(executable, args, { env: { ...process.env, CODEX_HOME: home, VITONLINE_PROBE_KEY: key }, windowsHide: true });
child.stdin.end();
let stdout = '', stderr = '';
child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
const timer = setTimeout(() => child.kill(), 120000);
const exitCode = await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timer);
proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve));
const events = stdout.trim().split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
let final = null; try { final = JSON.parse(fs.readFileSync(output, 'utf8')); } catch {}
const errors = events.filter(e => e.type === 'error' || e.type === 'turn.failed' || e.item?.type === 'error').map(e => redactSecretText(e.message || e.error?.message || e.item?.message || 'Tool run failed'));
const commands = events.filter(e => e.item?.type === 'command_execution').map(e => ({ exitCode: e.item.exit_code, errorSnippet: redactSecretText(e.item.aggregated_output || '').slice(0, 300) }));
const report = { tool: 'Codex CLI', model, exitCode, toolDeclarations, streamedEvents: events.length, eventTypes: [...new Set(events.map(e => `${e.type}:${e.item?.type || ''}`))], toolCallObserved: commands.length > 0, toolExecutionSucceeded: commands.some(c => c.exitCode === 0), commandExecutions: commands, structuredFinalPassed: final?.marker === markerValue, errors, fixtureFinalMessage: events.filter(e => e.item?.type === 'agent_message').map(e => redactSecretText(e.item.text || '')).join('\n').slice(-1800), at: new Date().toISOString(), stderrSummary: redactSecretText(stderr.replaceAll(key, '[REDACTED]')).slice(-1000) };
report.responseEvents = responseEvents;
fs.writeFileSync('codex-pilot-verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, stderrSummary: undefined }));
if (!report.structuredFinalPassed || !report.toolCallObserved) process.exitCode = 1;
