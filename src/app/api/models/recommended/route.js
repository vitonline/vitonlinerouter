import { getRecommendedModels, RECOMMENDED_COMBO } from "@/shared/services/recommendedModels";
import { getComboByName, createCombo, updateCombo, getSettings, updateSettings } from "@/lib/localDb";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ name: RECOMMENDED_COMBO, models: await getRecommendedModels(), required: ["text", "streaming", "tools", "json"], freshnessHours: 24 });
}
export async function POST() {
  const models = await getRecommendedModels();
  if (models.length < 3) return Response.json({ error: "At least three models need fresh passing text, streaming, tools and JSON tests", qualified: models.length }, { status: 409 });
  const existing = await getComboByName(RECOMMENDED_COMBO);
  const combo = existing ? await updateCombo(existing.id, { models, kind: "llm" }) : await createCombo({ name: RECOMMENDED_COMBO, models, kind: "llm" });
  const settings = await getSettings();
  await updateSettings({ comboStrategies: { ...settings.comboStrategies, [RECOMMENDED_COMBO]: { fallbackStrategy: "fallback" } } });
  return Response.json(combo);
}
