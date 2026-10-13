import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { redactSecrets } from '../open-sse/utils/redactSecrets.js';

const dataDir = path.join(process.env.APPDATA, 'vitonlinerouter');
const token = crypto.createHash('sha256').update(fs.readFileSync(path.join(dataDir, 'machine-id'), 'utf8').trim() + 'fr-cli-auth' + fs.readFileSync(path.join(dataDir, 'auth/cli-secret'), 'utf8').trim()).digest('hex').slice(0,16);
const headers = {'x-vr-cli-token': token, 'Content-Type':'application/json'};
async function api(route, body) {
  const res = await fetch(`http://127.0.0.1:20128/api/${route}`, { headers, ...(body ? {method:'POST',body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(150000) });
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`);
  return res.json();
}
const [connections, catalog] = await Promise.all([api('providers'), api('models/catalog')]);
const liveProvider=process.argv.find(a=>a.startsWith('--live-provider='))?.slice(16);
if (liveProvider) {
 const connection=connections.connections.find(c=>c.provider===liveProvider&&c.isActive!==false);
 if (!connection) throw new Error('No active connection for live model discovery');
 const live=await api(`providers/${encodeURIComponent(connection.id)}/models`);
 console.log(JSON.stringify({keys:Object.keys(live),models:live.models?.map(m=>({id:m.id,name:m.name})),warning:live.warning},null,2));
 process.exit();
}
if (process.argv.includes('--config-status')) {
 console.log(JSON.stringify(connections.connections.filter(c=>['cloudflare-ai','byteplus'].includes(c.provider)).map(c=>({provider:c.provider,active:c.isActive,accountIdPresent:!!c.providerSpecificData?.accountId,providerFieldNames:Object.keys(c.providerSpecificData||{})})),null,2));
 process.exit();
}
if (process.argv.includes('--issues')) {
 const issues=await api('providers/issues');
 fs.writeFileSync('provider-issues-current.json',JSON.stringify(redactSecrets(issues),null,2));
 console.log(JSON.stringify(issues.providers.map(p=>({provider:p.id,issues:p.issues.map(i=>i.reason)})),null,2));
 process.exit();
}
if (process.argv.includes('--verify-history')) {
 const saved=(await api('models/test')).results;
 const report=JSON.parse(fs.readFileSync('provider-access-report.json','utf8'));
 const latest=new Map(report.results.flatMap(r=>r.tests||[]).map(t=>[t.model,t]));
 const missing=[...latest].filter(([key,test])=>saved[key]?.testedAt!==test.testedAt).map(([key])=>key);
 console.log(JSON.stringify({latestTestRecords:latest.size,missing}));
 process.exit(missing.length?1:0);
}
if (process.argv.includes('--list')) {
 const listProvider=process.argv.find(a=>a.startsWith('--provider='))?.slice(11);
 console.log(JSON.stringify(catalog.models.filter(m=>listProvider ? m.providerId===listProvider : ['experientiallabs','openrouter','nanobanana'].includes(m.providerId)).map(m=>({id:m.id,kind:m.kind})),null,2));
 process.exit();
}
if (process.argv.includes('--discover')) {
 console.log(JSON.stringify({connectionKeys:Object.keys(connections),catalogKeys:Object.keys(catalog),modelExample:catalog.models?.[0],providers:connections.connections?.map(c=>({provider:c.provider,active:c.isActive}))},null,2));
 process.exit();
}
const selected = process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
const active = [...new Set(connections.connections.filter(c=>c.isActive!==false).map(c=>c.provider))];
const configured = (selected || active).sort((a,b)=>a==='apinex'?-1:b==='apinex'?1:a.localeCompare(b));
const report = {testedAt:new Date().toISOString(),scope:'One representative chat model per active configured provider; free alternatives on failure',results:[]};
const output = path.join(process.cwd(), process.argv.find(a=>a.startsWith('--output='))?.slice(9) || (selected ? 'provider-access-followup.json':'provider-access-report.json'));
for (const provider of configured) {
 const allModels = catalog.models.filter(m=>m.providerId===provider);
 const models = allModels.filter(m=>m.kind==='llm'||!m.kind);
 if (!allModels.length) {report.results.push({provider,skipped:'No model in catalog'}); continue;}
 const override = process.argv.find(a=>a.startsWith(`--model-${provider}=`))?.split('=').slice(1).join('=');
 const first = override ? allModels.find(m=>m.id===override) : (models[0]||allModels[0]);
 if (!first) throw new Error(`Model override not in catalog for ${provider}`);
 const alternatives = models.filter(m=>/free/i.test(m.id));
 const candidates = [first, ...alternatives.slice(0,1).filter(m=>m.id!==first.id)];
 const tests=[];
 try {
  await api('models/availability',{action:'clearCooldown',provider,model:'__all'});
  for (const model of candidates) {
   const result=await api('models/test',{model:model.id,kind:model.kind||'llm'});
   tests.push({model:model.id,...result});
   console.log(`${provider}: ${model.id}: ${result.ok?'PASS':result.reason}`);
   if(result.ok) break;
  }
 } catch(error) {tests.push({ok:false,error:error.message});console.log(`${provider}: ${error.message}`);}
 report.results.push({provider,tests});
 fs.writeFileSync(output,JSON.stringify(redactSecrets(report),null,2));
}
for (const provider of [...new Set(catalog.models.map(m=>m.providerId))].filter(p=>p!=='vitonlinerouter'&&!configured.includes(p))) {
 report.results.push({provider,skipped:connections.connections.some(c=>c.provider===provider)?'All saved connections disabled':'No saved connection'});
}
fs.writeFileSync(output,JSON.stringify(redactSecrets(report),null,2));
console.log(`Report: ${output}`);
