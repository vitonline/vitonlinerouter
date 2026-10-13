import { afterEach, expect, it, vi } from "vitest";
const connection=vi.hoisted(()=>({id:"connection",provider:"apinex",apiKey:"test-key"}));
vi.mock("@/models",async importOriginal=>({...await importOriginal(),getProviderConnectionById:async()=>connection}));
vi.mock("next/server",()=>({NextResponse:{json:(body,init={})=>new Response(JSON.stringify(body),{status:init.status||200})}}));
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});
it("lists APInex models using the registry's endpoint and stored credential",async()=>{
 const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[{id:"gpt-6.1-sol"}]})));
 global.fetch=fetchMock;
 const {GET}=await import("../../src/app/api/providers/[id]/models/route.js");
 const response=await GET(new Request("http://localhost/api/providers/connection/models"),{params:Promise.resolve({id:"connection"})});
 expect(response.status).toBe(200);
 expect(fetchMock).toHaveBeenCalledWith("https://api.apinex.bond/v1/models",expect.objectContaining({headers:expect.objectContaining({Authorization:"Bearer test-key"})}));
 const data=await response.json();
 expect(data.models).toEqual([{id:"gpt-6.1-sol"}]);
 expect(JSON.stringify(data)).not.toContain("test-key");
});
