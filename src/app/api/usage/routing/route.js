import { getAdapter } from "@/lib/db/driver";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = await getAdapter();
  return Response.json({ traces: db.all("SELECT value FROM kv WHERE scope = ? ORDER BY key DESC LIMIT 50", ["routingTraces"]).map(r => JSON.parse(r.value)) }, { headers: { "Cache-Control": "no-store" } });
}
