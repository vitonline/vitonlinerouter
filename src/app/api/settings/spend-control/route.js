import { getSettings, updateSettings } from "@/lib/localDb";
import { DEFAULT_SPEND_CONTROL, validateSpendControl, getSpendControlState } from "@/lib/db/repos/spendControl";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ config: (await getSettings()).spendControl || DEFAULT_SPEND_CONTROL, state: await getSpendControlState() }); }
export async function PUT(request) {
  try { const config = validateSpendControl(await request.json()); await updateSettings({ spendControl: config }); return Response.json({ config }); }
  catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
}
