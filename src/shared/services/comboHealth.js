import { getProviderConnections, getProviderNodes } from "@/lib/localDb";
import { getModelTests } from "@/lib/db/repos/modelTestsRepo";
import { normalizeModelTestHistory } from "@/shared/utils/modelTestProviders";
import { filterComboHealth } from "@/shared/utils/comboHealth";
import REGISTRY from "open-sse/providers/registry/index.js";
export async function getHealthyComboModels(models) {
  const [connections, nodes, saved] = await Promise.all([getProviderConnections(), getProviderNodes(), getModelTests()]);
  return filterComboHealth(models, { connections, nodes, tests: normalizeModelTestHistory(saved, nodes), registry: REGISTRY });
}
