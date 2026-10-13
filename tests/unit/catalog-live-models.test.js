import { expect, it } from "vitest";
import { registryModelsForCatalog, registryModelsFetcher, normalizeOpenAIModels } from "../../src/shared/utils/catalogModels.js";
const registered=[{id:"gpt-6-sol"},{id:"image",type:"image"}];
it("uses current live chat IDs for passthrough gateways without dropping media specs",()=>{
 expect(registryModelsForCatalog({passthroughModels:true},registered,[{id:"gpt-6.1-sol"}])).toEqual([{id:"image",type:"image"}]);
});
it("recognizes transport-declared model fetchers and normalizes OpenAI model IDs",()=>{
 const fetcher={url:"https://api.apinex.bond/v1/models",type:"openai"};
 expect(registryModelsFetcher({transport:{modelsFetcher:fetcher}})).toEqual(fetcher);
 expect(registryModelsFetcher({modelsFetcher:fetcher})).toEqual(fetcher);
 expect(normalizeOpenAIModels([{id:" gpt-6.1-sol ",name:"GPT 6.1 Sol"},{id:null},{id:""}])).toEqual([{id:"gpt-6.1-sol",name:"GPT 6.1 Sol",contextLength:undefined}]);
});
it("retains offline fallbacks and curated model lists",()=>{
 expect(registryModelsForCatalog({passthroughModels:true},registered,[])).toEqual(registered);
 expect(registryModelsForCatalog({},registered,[{id:"other"}])).toEqual(registered);
});
