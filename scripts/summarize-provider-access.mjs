import fs from 'node:fs';
const base=JSON.parse(fs.readFileSync('provider-access-report.json','utf8'));
const follow=JSON.parse(fs.readFileSync('provider-access-followup.json','utf8'));
const entries=new Map(base.results.map(r=>[r.provider,r]));
for(const r of follow.results.filter(r=>r.tests)) {
 const existing=entries.get(r.provider);
 entries.set(r.provider,{provider:r.provider,tests:[...(existing?.tests||[]),...r.tests]});
}
function category(test) {
 const error=test.error||'';
 if(test.ok)return 'Passed';
 if(/daily check.in/i.test(error))return 'Daily check-in required';
 if(/No active credentials/i.test(error))return 'No active connection';
 if(/free_tier_limit_exceeded|free_tier_limit_reached/.test(error))return 'Free allowance exhausted';
 if(/WebShield|malicious_url/.test(error))return 'Security software blocked upstream';
 if(/agentic harnesses/.test(error))return 'Model requires agentic harness';
 return test.reason||'Probe error';
}
const results=[...entries.values()].map(r=>({...r,tests:r.tests?.map(t=>({...t,category:category(t)}))}));
const tested=results.filter(r=>r.tests?.length);
const passed=tested.filter(r=>r.tests.some(t=>t.ok));
const counts={listed:results.length,tested:tested.length,passed:passed.length,withoutPassingSample:tested.length-passed.length,untested:results.length-tested.length,probes:tested.reduce((n,r)=>n+r.tests.length,0)};
const merged={...base,scope:'Representative model probes through local router, not every model or every saved credential. 15-second model-test timeout. Disabled connections were not enabled.',counts,results};
fs.writeFileSync('provider-access-report.json',JSON.stringify(merged,null,2));
const rows=results.map(r=>`| ${r.provider} | ${r.tests?.map(t=>`${t.model}: **${t.category}** (${t.latencyMs??'?'} ms)`).join('<br>')||r.skipped} |`).join('\n');
fs.writeFileSync('provider-access-report.md',`# Provider access test\n\nRun: ${base.testedAt}\n\n${counts.listed} providers accounted for; ${counts.tested} probed; ${counts.passed} had a passing sample; ${counts.withoutPassingSample} had no passing sample; ${counts.untested} untested. ${counts.probes} total probes.\n\n${merged.scope}\n\n## APInex\n\nClaude Opus 5.5 returned upstream 402: requires at least one balance top-up. Free GPT-6 Luna returned upstream 402: daily check-in required at https://apinex.bond/airdrop?tab=quests. Clearing cooldown does not change these account conditions. Neither probe returned the old invalid-key error.\n\n| Provider | Results |\n|---|---|\n${rows}\n\nFull sanitized upstream messages are saved in provider-access-report.json. Dashboard model test history also retains these results. A passing sample does not establish access to other models or every connection. Timeouts do not establish provider outage.\n`);
console.log(JSON.stringify(counts));
console.log('Passing samples: '+passed.map(r=>r.provider).join(', '));
