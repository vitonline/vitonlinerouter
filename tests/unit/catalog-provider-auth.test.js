import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({connections:vi.fn()}));
vi.mock("@/lib/localDb",()=>({getProviderConnections:mocks.connections}));
vi.mock("@/lib/disabledModelsDb",()=>({getDisabledModels:async()=>({})}));
vi.mock("open-sse/providers/policy.js",()=>({ALLOWED_REGISTRY:[{id:"apinex",alias:"apinex",passthroughModels:true,transport:{modelsFetcher:{url:"https://api.apinex.bond/v1/models",type:"openai"}}}]}));
vi.mock("open-sse/config/providerModels.js",()=>({PROVIDER_MODELS:{apinex:[{id:"gpt-6-sol"},{id:"image",kind:"image"}]}}));
vi.mock("open-sse/providers/capabilities.js",()=>({getCapabilitiesForModel:()=>({})}));
vi.mock("open-sse/services/modelRenames.js",()=>({listModelRenames:()=>[],isHiddenRenameTarget:()=>false}));
vi.mock("next/server",()=>({NextResponse:{json:(body,init={})=>new Response(JSON.stringify(body),{status:init.status||200})}}));
const originalFetch=global.fetch;
beforeEach(()=>{vi.resetModules();mocks.connections.mockResolvedValue([{id:"disabled",provider:"apinex",isActive:false,apiKey:"do-not-use"},{id:"active",provider:"apinex",isActive:true,apiKey:"test-key"}]);});
afterEach(()=>{global.fetch=originalFetch;vi.clearAllMocks();});
it("authenticates nested registry model fetchers and replaces obsolete chat IDs without exposing the key",async()=>{
 global.fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{id:"gpt-6.1-sol"}]})));
 const {GET}=await import("../../src/app/api/models/catalog/route.js");
 const data=await (await GET()).json();
 expect(global.fetch).toHaveBeenCalledWith("https://api.apinex.bond/v1/models",expect.objectContaining({headers:{Authorization:"Bearer test-key"}}));
 expect(data.models.map(m=>m.id)).toEqual(["apinex/image","apinex/gpt-6.1-sol"]);
 expect(JSON.stringify(data)).not.toContain("test-key");
});
it("keeps offline registry fallbacks when the authenticated upstream list fails",async()=>{
 global.fetch=vi.fn().mockResolvedValue(new Response("unauthorized",{status:401}));
 const {GET}=await import("../../src/app/api/models/catalog/route.js");
 const data=await (await GET()).json();
 expect(data.models.map(m=>m.id)).toEqual(["apinex/gpt-6-sol","apinex/image"]);
});
