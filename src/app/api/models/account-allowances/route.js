import { getProviderConnections } from "@/lib/localDb";
import { USAGE_APIKEY_PROVIDERS } from "@/shared/constants/providers";
import { GET as getUsage } from "@/app/api/usage/[connectionId]/route";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const connections = await getProviderConnections();
  const accounts = [];
  // Sequential reads avoid bursting provider account endpoints.
  for (const connection of connections) {
    const supported = connection.authType === "oauth" || USAGE_APIKEY_PROVIDERS.includes(connection.provider);
    const account = { id: connection.id, provider: connection.provider, name: connection.name || connection.provider, supported, checkedAt: new Date().toISOString(), quotas: {} };
    if (connection.isActive === false) account.message = "Disabled connection; allowance was not checked";
    else if (!supported) account.message = "Allowance API unavailable; check the provider account";
    else {
      try {
        const response = await getUsage(request, { params: Promise.resolve({ connectionId: connection.id }) });
        const usage = await response.json();
        for (const [name, quota] of Object.entries(usage.quotas || {})) {
          account.quotas[name] = { remaining: quota.remaining ?? null, total: quota.total ?? null, resetAt: quota.resetAt ?? null, unlimited: quota.unlimited === true };
        }
        account.message = Object.keys(account.quotas).length ? null : "Allowance could not be read; check the provider account";
      } catch { account.message = "Allowance check failed; check the provider account"; }
    }
    accounts.push(account);
  }
  return Response.json({ accounts }, { headers: { "Cache-Control": "no-store" } });
}
