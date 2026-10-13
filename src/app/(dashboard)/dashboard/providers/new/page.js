"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Button, Input, Select, SegmentedControl } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { normalizeCustomProviderUrl } from "@/shared/utils/customProviderUrl";

const options = Object.values(AI_PROVIDERS).map(p=>({value:p.id,label:p.name})).sort((a,b)=>a.label.localeCompare(b.label));
export default function NewProviderPage() {
  const router=useRouter();
  const [mode,setMode]=useState("custom");
  const [provider,setProvider]=useState("");
  const [form,setForm]=useState({name:"",prefix:"",baseUrl:"",format:"chat",apiKey:""});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const change=(field,value)=>{setForm(prev=>({...prev,[field]:value}));setError("");};
  async function submit(event) {
    event.preventDefault();setError("");
    if(mode==="existing") {
      if(!provider) return setError("Choose a provider.");
      router.push(`/dashboard/providers/${encodeURIComponent(provider)}`);return;
    }
    let baseUrl;
    try {baseUrl=normalizeCustomProviderUrl(form.baseUrl);} catch(err) {return setError(err.message);}
    if(!form.name.trim()||!/^[a-z][a-z0-9-]*$/.test(form.prefix)) return setError("Enter a name and a prefix using lowercase letters, digits, and hyphens.");
    if(!form.apiKey.trim()) return setError("Enter an API key.");
    setLoading(true);let createdNode;
    try {
      const existingResponse=await fetch("/api/provider-nodes");
      if(!existingResponse.ok) throw new Error("Could not check existing providers. Try again.");
      const {nodes}=await existingResponse.json();
      if(AI_PROVIDERS[form.prefix]||nodes.some(n=>n.prefix===form.prefix)) throw new Error("That model prefix is already used. Choose another.");
      const response=await fetch("/api/provider-nodes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:form.name.trim(),prefix:form.prefix,baseUrl,type:form.format==="anthropic"?"anthropic-compatible":"openai-compatible",apiType:form.format==="responses"?"responses":"chat"})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Could not create provider.");
      createdNode=data.node;
      const connectionResponse=await fetch("/api/providers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider:createdNode.id,name:form.name.trim(),apiKey:form.apiKey.trim()})});
      const connectionData=await connectionResponse.json();
      if(!connectionResponse.ok) throw new Error(connectionData.error||"Could not save connection.");
      setForm(prev=>({...prev,apiKey:""}));router.push(`/dashboard/providers/${encodeURIComponent(createdNode.id)}`);
    } catch(err) {
      if(createdNode) await fetch(`/api/provider-nodes/${encodeURIComponent(createdNode.id)}`,{method:"DELETE"}).catch(()=>{});
      setError(err.message||"Could not add provider. Try again.");
    } finally {setLoading(false);}
  }
  return <div className="mx-auto flex max-w-2xl flex-col gap-6">
    <Link href="/dashboard/models" className="text-sm text-primary hover:underline">← Back to Models</Link>
    <div><h1 className="text-3xl font-semibold">Add provider</h1><p className="mt-2 text-text-muted">Connect an existing provider or add your own API endpoint.</p></div>
    <SegmentedControl value={mode} onChange={value=>{setMode(value);setError("");}} options={[{value:"custom",label:"New API provider"},{value:"existing",label:"Existing provider"}]} />
    <Card><form onSubmit={submit} className="flex flex-col gap-5">
      {mode==="existing"?<><Select label="Provider" options={[{value:"",label:"Choose a provider"},...options]} value={provider} onChange={event=>setProvider(event.target.value)} /><p className="text-sm text-text-muted">Open its setup page to add an API key or sign in.</p></>:<>
        <Input label="Provider name" value={form.name} onChange={event=>change("name",event.target.value)} placeholder="e.g. My AI provider" required />
        <Input label="Model prefix" value={form.prefix} onChange={event=>change("prefix",event.target.value)} placeholder="e.g. my-provider" hint="Model IDs will look like my-provider/model-name." required />
        <Input label="API base URL" type="url" value={form.baseUrl} onChange={event=>change("baseUrl",event.target.value)} placeholder="https://api.example.com/v1" required />
        <Select label="API format" value={form.format} onChange={event=>change("format",event.target.value)} options={[{value:"chat",label:"OpenAI Chat Completions"},{value:"responses",label:"OpenAI Responses"},{value:"anthropic",label:"Anthropic Messages"}]} />
        <Input label="API key" type="password" value={form.apiKey} onChange={event=>change("apiKey",event.target.value)} placeholder="Enter your provider key" required />
        <p className="text-sm text-text-muted">After adding, fetch or add models on the provider page and test them. Access and charges depend on your provider account.</p>
      </>}
      {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3"><Link href="/dashboard/models" className="flex-1"><Button type="button" variant="ghost" fullWidth>Cancel</Button></Link><Button type="submit" loading={loading} disabled={loading} fullWidth className="flex-1">{mode==="existing"?"Open provider setup":"Add provider"}</Button></div>
    </form></Card>
  </div>;
}
