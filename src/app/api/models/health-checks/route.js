import { getSettings, updateSettings } from "@/lib/localDb";
import { DEFAULT_HEALTH_CHECK_CONFIG, validateHealthCheckConfig } from "@/shared/utils/healthCheckConfig";
import { startModelHealthChecks } from "@/shared/services/modelHealthChecks";
export const dynamic = "force-dynamic";
export async function GET() {
  const settings = await getSettings();
  return Response.json({ config: settings.modelHealthChecks || DEFAULT_HEALTH_CHECK_CONFIG, state: settings.modelHealthCheckState || {} }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request) {
  let config;
  try { config = validateHealthCheckConfig(await request.json()); }
  catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  await updateSettings({ modelHealthChecks: config });
  startModelHealthChecks();
  return Response.json({ config });
}
