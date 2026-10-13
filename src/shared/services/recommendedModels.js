import { getModelTests } from "@/lib/db/repos/modelTestsRepo";
import { getProviderNodes } from "@/lib/localDb";
import { normalizeModelTestHistory } from "@/shared/utils/modelTestProviders";
import { getHealthyComboModels } from "./comboHealth";
export const RECOMMENDED_COMBO = "RecommendedModels";
export function selectVerifiedModels(records, now = Date.now()) {
  return Object.values(records).filter(record => {
    const probes = record.capabilities || {};
    return ["text", "streaming", "tools", "json"].every(cap => {
      const test = probes[cap] || (cap === "text" && record.capability === "text" ? record : null);
      return test?.ok && now - Date.parse(test.testedAt) < 86400000;
    });
  }).sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity)).slice(0, 5).map(r => r.model);
}
export async function getRecommendedModels() {
  const [tests, nodes] = await Promise.all([getModelTests(), getProviderNodes()]);
  const models = selectVerifiedModels(normalizeModelTestHistory(tests, nodes));
  return (await getHealthyComboModels(models)).eligible;
}
