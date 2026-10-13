import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { redactSecrets } from '../open-sse/utils/redactSecrets.js';

const key=process.env.INTERN_SETUP_KEY;
if (!key) throw new Error('INTERN_SETUP_KEY is required');
const baseUrl='https://discovery-api.intern-ai.org.cn/v1';
let listing, data;
try {
 listing=await fetch(`${baseUrl}/models`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});
 data=await listing.json();
} catch(error) {
 listing={ok:false,status:0};
 data={error:{message:error.cause?.code||error.message}};
}
const modelIds=(data.data||[]).map(m=>m.id).filter(id=>typeof id==='string');
console.log(JSON.stringify({listingStatus:listing.status,modelIds}));
const dir=path.join(process.env.APPDATA,'vitonlinerouter');
const token=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'machine-id'),'utf8').trim()+'fr-cli-auth'+fs.readFileSync(path.join(dir,'auth/cli-secret'),'utf8').trim()).digest('hex').slice(0,16);
async function api(route,body,method) {
 const response=await fetch(`http://127.0.0.1:20128/api/${route}`,{headers:{'x-vr-cli-token':token,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{}),...(method?{method}:{}),signal:AbortSignal.timeout(150000)});
 if(!response.ok) throw new Error(`${route}: HTTP ${response.status}: ${JSON.stringify(redactSecrets(await response.json()))}`);
 return response.json();
}
const node={id:'intern'};
const connections=(await api('providers')).connections;
// Clean up the empty node from the initial custom-endpoint setup attempt.
for (const item of (await api('provider-nodes')).nodes) {
 if(item.prefix==='intern'&&item.baseUrl===baseUrl&&!connections.some(c=>c.provider===item.id)) await api(`provider-nodes/${item.id}`,undefined,'DELETE');
}
if (process.argv.includes('--cleanup-only')) process.exit();
if(!connections.some(c=>c.provider===node.id)) await api('providers',{provider:node.id,name:'Intern AI',apiKey:key});
const catalog=await api('models/catalog');
const ids=modelIds.length?modelIds:catalog.models.filter(m=>m.providerId==='intern').map(m=>m.id.slice('intern/'.length));
const report={provider:node.id,baseUrl,listingStatus:listing.status,listedModels:modelIds,listingError:listing.ok?undefined:data.error,tests:[],testedAt:new Date().toISOString()};
for(const id of ids) {
 const result=await api('models/test',{model:`intern/${id}`,kind:'llm'});
 report.tests.push({model:`intern/${id}`,...result});
 fs.writeFileSync('intern-ai-test-results.json',JSON.stringify(redactSecrets(report),null,2));
 console.log(`${id}: ${result.ok?'PASS':result.reason}`);
}
console.log(`Provider page: http://localhost:20128/dashboard/providers/${node.id}`);
