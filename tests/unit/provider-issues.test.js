import { expect, it } from "vitest";
import { buildProviderIssues } from "../../src/shared/utils/providerIssues.js";
const providers = [{id:"apinex",display:{name:"APInex"}}, {id:"byteplus"}, {id:"edge-tts",noAuth:true,serviceKinds:["tts"]}];

it("groups model failures under their provider with specific account actions and preserves passing coverage", () => {
 const groups = buildProviderIssues(providers, [{provider:"apinex",isActive:true},{provider:"byteplus",isActive:true}], {
  a:{model:"apx/free/gpt-6-luna",ok:false,error:"Daily check-in required [402] sk-private",kind:"llm",testedAt:"2026-10-12T00:00:00Z"},
  b:{model:"apinex/claude-opus-5.5",ok:false,error:"balance top-up required"},
  c:{model:"apinex/gpt-6-luna",ok:true},
  d:{model:"byteplus/test",ok:false,error:"InvalidSubscription: CodingPlan expired"}
 });
 const apinex=groups.find(p=>p.id==="apinex");
 expect(apinex.passedModels).toBe(1);
 expect(apinex.issues.map(i=>i.reason)).toEqual(["Daily check-in required","Credits or plan restrictions"]);
 expect(apinex.issues[0]).toMatchObject({actionUrl:"https://apinex.bond/airdrop?tab=quests",models:[{model:"apinex/free/gpt-6-luna",kind:"llm"}]});
 expect(JSON.stringify(groups)).not.toContain("sk-private");
 expect(groups.find(p=>p.id==="byteplus").issues[0].reason).toBe("Expired or missing CodingPlan subscription");
 expect(groups.some(p=>p.id==="edge-tts")).toBe(false);
});
it("reports disabled connections even alongside an active connection and removes resolved failures", () => {
 const groups=buildProviderIssues(providers,[{provider:"apinex",isActive:false},{provider:"apinex",isActive:true},{provider:"byteplus",isActive:true}],{a:{model:"apinex/free/gpt-6-luna",ok:true}});
 const apinex=groups.find(p=>p.id==="apinex");
 expect(apinex.issues).toHaveLength(1);
 expect(apinex.issues[0].reason).toBe("Disabled connections were not enabled");
 expect(apinex.issues[0].models).toEqual([]);
});
it("does not treat public speech providers as missing credentials and links diagnostics to their media page",()=>{
 const groups=buildProviderIssues(providers,[],{a:{model:"edge-tts/en-US-AriaNeural",kind:"tts",ok:false,error:"timed out"}});
 const edge=groups.find(p=>p.id==="edge-tts");
 expect(edge.issues).toHaveLength(1);
 expect(edge.manageUrl).toBe("/dashboard/media-providers/tts/edge-tts");
 expect(edge.issues[0].models[0].kind).toBe("tts");
});
it("does not duplicate connection issues when registry entries share a provider ID",()=>{
 const groups=buildProviderIssues([{id:"bai"},{id:"bai"}],[{provider:"bai",isActive:false}],{});
 expect(groups).toHaveLength(1);
 expect(groups[0].issues).toHaveLength(1);
});
it("reports a reset awaiting verification without claiming a healthy connection",()=>{
 const groups=buildProviderIssues([{id:"qwencloud"}],[{provider:"qwencloud",isActive:true,testStatus:"unknown",verificationNeeded:true}],{});
 expect(groups[0].issues[0]).toMatchObject({reason:"Cooldown cleared; verification needed",scope:"connections"});
});
