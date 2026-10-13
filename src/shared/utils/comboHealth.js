import { modelTestKey, modelTestReason } from "./modelTestResult";
import { resolveProviderId } from "@/shared/constants/providers";

const ACCOUNT_ACTIONS = new Set(["Authentication rejection", "Expired or missing CodingPlan subscription", "Credits or plan restrictions", "Model incompatible with CodingPlan", "Model unsupported or unavailable", "Access restricted", "Daily check-in required", "Free allowance exhausted"]);
export function filterComboHealth(models, { connections, nodes = [], tests = {}, registry = [], now = Date.now() }) {
  const eligible = [], skipped = [];
  for (const model of models) {
    const slash = model.indexOf("/");
    const prefix = model.slice(0, slash), id = model.slice(slash + 1);
    const node = nodes.find(n => n.prefix === prefix || n.id === prefix);
    const provider = node?.id || resolveProviderId(prefix);
    const accounts = connections.filter(c => c.provider === provider && c.isActive !== false);
    const isPublic = registry.some(p => p.id === provider && p.noAuth);
    const unlocked = accounts.filter(c => ![c.rateLimitedUntil, c.modelLock___all, c[`modelLock_${id}`]].some(t => t && new Date(t).getTime() > now));
    let reason;
    if (!isPublic && !accounts.length) reason = "No enabled connection";
    else if (!isPublic && !unlocked.length) reason = "Active cooldown";
    const test = tests[modelTestKey(model)] || tests[model];
    if (!reason && test && !test.ok && !unlocked.some(c => c.verificationNeeded)) {
      const age = now - Date.parse(test.testedAt);
      const failure = test.reason || modelTestReason(test.error, test.status);
      // Historical failures are not permanent truth. Reconsider account failures
      // after 24h and temporary failures after 5m; direct model tests bypass this.
      const windowMs = ACCOUNT_ACTIONS.has(failure) ? 86400000 : 300000;
      if (Number.isFinite(age) && age < windowMs) reason = failure;
    }
    (reason ? skipped : eligible).push(reason ? { model, reason } : model);
  }
  return { eligible, skipped };
}
