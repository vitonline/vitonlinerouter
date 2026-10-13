import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";
import { getModelTests } from "@/lib/db/repos/modelTestsRepo";
import REGISTRY from "open-sse/providers/registry/index.js";
import { isProviderAllowed } from "open-sse/providers/policy.js";
import { buildProviderIssues } from "@/shared/utils/providerIssues";
import { getProviderNodes } from "@/lib/db/repos/nodesRepo";
import { normalizeModelTestHistory } from "@/shared/utils/modelTestProviders";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [connections, saved, nodes] = await Promise.all([getProviderConnections(), getModelTests(), getProviderNodes()]);
    const tests = normalizeModelTestHistory(saved, nodes);
    const providers = REGISTRY.filter(p => isProviderAllowed(p.id) || connections.some(c => c.provider === p.id))
      .map(p => ({ ...p, allowed: isProviderAllowed(p.id) }));
    const knownIds = new Set(providers.map(p => p.id));
    for (const c of connections) if (!knownIds.has(c.provider)) {
      knownIds.add(c.provider);
      const node = nodes.find(n => n.id === c.provider);
      providers.push({ id: c.provider, name: node?.name || c.name || c.provider, serviceKinds: node?.type === "custom-embedding" ? ["embedding"] : ["llm"], allowed: isProviderAllowed(c.provider) });
    }
    return NextResponse.json({ providers: buildProviderIssues(providers, connections, tests), updatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: "Could not load provider issues" }, { status: 500 });
  }
}
