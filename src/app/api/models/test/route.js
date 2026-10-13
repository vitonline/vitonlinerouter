import { NextResponse } from "next/server";
import { pingModelByKind } from "./ping";
import { getModelTests, saveModelTest } from "@/lib/db/repos/modelTestsRepo";
import { isProviderAllowed } from "open-sse/providers/policy.js";
import { modelTestResult } from "@/shared/utils/modelTestResult";
import { getProviderNodes } from "@/lib/db/repos/nodesRepo";
import { normalizeModelTestHistory } from "@/shared/utils/modelTestProviders";
import { CAPABILITIES, pingCapability } from "./capabilities";

export async function GET() {
  try {
    const [saved, nodes] = await Promise.all([getModelTests(), getProviderNodes()]);
    const results = normalizeModelTestHistory(saved, nodes);
    return NextResponse.json({ results: Object.fromEntries(Object.entries(results).filter(([model]) =>
      !model.includes("/") || isProviderAllowed(results[model].providerId)).map(([key, result]) => [key, modelTestResult(result)])) });
  } catch {
    return NextResponse.json({ error: "Could not load saved model tests" }, { status: 500 });
  }
}

// POST /api/models/test - Ping a single model via internal completions or embeddings
export async function POST(request) {
  let model;
  let kind = "llm";
  let capability = "text";
  try {
    ({ model, kind = "llm", capability = "text" } = await request.json());
    if (!CAPABILITIES.includes(capability) || (capability !== "text" && kind !== "llm")) return NextResponse.json({ error: "Invalid capability for this model kind" }, { status: 400 });
    if (typeof model !== "string" || !model.trim() || model.length > 500) return NextResponse.json({ error: "Valid model required" }, { status: 400 });
    if (!["llm", "embedding", "image", "tts", "stt", "systemone"].includes(kind || "llm")) return NextResponse.json({ error: "Testing this model kind is not supported" }, { status: 400 });
    let result;
    const startedAt = Date.now();
    try {
      result = capability === "text" ? await pingModelByKind(model, kind || "llm", undefined, { signal: request.signal }) : await pingCapability(model, capability, { signal: request.signal });
      result.capability = capability;
    } catch (error) {
      if (request.signal?.aborted) return NextResponse.json({ cancelled: true }, { status: 499 });
      result = { ok: false, error: error.message, latencyMs: Date.now() - startedAt, capability };
    }
    try {
      if (request.signal?.aborted) return NextResponse.json({ cancelled: true }, { status: 499 });
      return NextResponse.json(await saveModelTest(model, kind || "llm", result, await getProviderNodes()));
    } catch {
      return NextResponse.json({ ...modelTestResult(result), persistenceError: "Could not save model test result" }, { status: 500 });
    }
  } catch (err) {
    const result = { ok: false, error: err.message };
    return NextResponse.json(modelTestResult(result), { status: 500 });
  }
}
