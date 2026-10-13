import { modelTestKey, modelTestResult } from "./modelTestResult";

const ACTIONS = {
  "Reasoning only; no usable answer": "The request was accepted, but the model returned only reasoning. Review thinking settings and output budget, then retest for a usable answer.",
  "Connection accepted; no usable answer": "The request was accepted without a usable answer. Check the model and response format, then retest.",
  "Model incompatible with CodingPlan": "Select byteplus/ark-code-latest or a model supported by your CodingPlan. This model is rejected by the CodingPlan endpoint; clearing cooldown does not add compatibility. Standard ModelArk API access uses a separate endpoint and billing configuration.",
  "Daily check-in required": "Complete the daily check-in, then clear cooldown and retest. Automatic check-in is not configured; no supported check-in API has been verified.",
  "Expired or missing CodingPlan subscription": "Review the provider's CodingPlan subscription and endpoint. Renew or select an account with a valid plan, then retest.",
  "Authentication rejection": "Verify the saved API key and required account/project identifier on the provider page, then retest.",
  "Credits or plan restrictions": "Review balance, pending holds, purchase requirements and model eligibility in the provider account.",
  "Free allowance exhausted": "Wait for the provider's allowance reset or select an eligible model/account. Clearing cooldown does not restore allowance.",
  "Security software blocked upstream": "Review the security software's block and the provider URL. The router does not bypass the block.",
  "Model requires agentic harness": "Use the provider's supported agent integration, or select another model such as OpenRouter's free router.",
  "Rate limit reached": "Wait before retesting, or select another eligible model/account.",
  "Upstream overload": "Retry later or select another model/provider.",
  "Request timed out": "Retest with the updated limits: chat 60 seconds, image 120 seconds, speech 30 seconds. A timeout does not prove an outage.",
  "No active connection": "Configure an active connection on the provider page, unless this is a public provider.",
  "Model unsupported or unavailable": "Select a current model from the provider's live catalog and check its supported endpoint. Older saved test results remain visible until retested.",
};

export function buildProviderIssues(providers, connections, tests) {
  // Registry aliases may contribute more than one entry with the same provider ID.
  providers = [...new Map(providers.map(provider => [provider.id, provider])).values()];
  const groups = new Map();
  const ensure = (providerId) => {
    if (!groups.has(providerId)) {
      const provider = providers.find(p => p.id === providerId);
      const mediaKind = provider?.serviceKinds?.find(kind => ["tts", "stt", "embedding", "image"].includes(kind));
      const manageUrl = mediaKind && !provider?.serviceKinds?.includes("llm")
        ? `/dashboard/media-providers/${mediaKind}/${encodeURIComponent(providerId)}`
        : `/dashboard/providers/${encodeURIComponent(providerId)}`;
      groups.set(providerId, { id: providerId, name: provider?.display?.name || provider?.name || providerId, manageUrl, issues: [], passedModels: 0 });
    }
    return groups.get(providerId);
  };
  for (const record of Object.values(tests)) {
    const model = modelTestKey(record.model);
    if (!model.includes("/")) continue;
    const providerId = record.providerId || model.split("/")[0];
    if (!providers.some(p => p.id === providerId)) continue;
    const group = ensure(providerId);
    const normalized = modelTestResult(record);
    if (normalized.ok) { group.passedModels++; continue; }
    let issue = group.issues.find(i => i.reason === normalized.reason && i.scope === "models");
    if (!issue) {
      issue = { reason: normalized.reason, action: ACTIONS[normalized.reason] || "Review the saved diagnostic, provider configuration and model availability, then retest.", scope: "models", models: [] };
      if (providerId === "apinex" && normalized.reason === "Daily check-in required") issue.actionUrl = "https://apinex.bond/airdrop?tab=quests";
      group.issues.push(issue);
    }
    issue.models.push({ model, kind: record.kind || "llm", testedAt: record.testedAt, error: normalized.error, latencyMs: record.latencyMs });
  }
  for (const provider of providers) {
    const saved = connections.filter(c => c.provider === provider.id);
    const unverified = saved.filter(c => c.isActive !== false && c.verificationNeeded);
    if (unverified.length) ensure(provider.id).issues.push({ reason: "Cooldown cleared; verification needed", action: "Cooldown was reset without proving access. Test a model to verify its usable response, or test the connection to check credentials.", scope: "connections", models: [], affected: `${unverified.length} connection(s) awaiting verification` });
    const disabled = saved.filter(c => c.isActive === false);
    if (disabled.length) ensure(provider.id).issues.push({ reason: "Disabled connections were not enabled", action: `${disabled.length} saved connection(s) are disabled. Enable only the connections you want to use, then test a model.`, scope: "connections", models: [], affected: "All models using those disabled connections" });
    if (!saved.length && !provider.noAuth) ensure(provider.id).issues.push({ reason: "No saved connection", action: "Add the provider credentials or service endpoint, then test a model.", scope: "connections", models: [], affected: "All models from this provider" });
    if (provider.allowed === false && saved.length) ensure(provider.id).issues.push({ reason: "Provider disabled by app policy", action: "This provider is excluded by the app's current provider policy. Review policy before using it.", scope: "connections", models: [], affected: "All models from this provider" });
  }
  return [...groups.values()].filter(g => g.issues.length).sort((a,b) =>
    Number(b.issues.some(i => i.scope === "models")) - Number(a.issues.some(i => i.scope === "models")) || a.name.localeCompare(b.name));
}
