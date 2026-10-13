import { randomUUID } from "node:crypto";
import { getAdapter } from "@/lib/db/driver";
import { redactSecretText } from "open-sse/utils/redactSecrets";
async function persistTrace(record) {
  try {
    const db = await getAdapter();
    db.transaction(() => {
      db.run("INSERT INTO kv(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value", ["routingTraces", `${record.at}-${record.id}`, JSON.stringify(record)]);
      const rows = db.all("SELECT key FROM kv WHERE scope = ? ORDER BY key DESC", ["routingTraces"]);
      for (const row of rows.slice(100)) db.run("DELETE FROM kv WHERE scope = ? AND key = ?", ["routingTraces", row.key]);
    });
  } catch { /* Diagnostics must not discard a successful completion. */ }
}
export async function traceComboRouting(run, options) {
  const id = randomUUID(), start = Date.now(), attempts = [];
  const handler = options.handleSingleModel;
  const response = await run({ ...options, handleSingleModel: async (body, model, context) => {
    const at = Date.now();
    const attempt = { model, requestedModel: model, provider: model.split("/")[0], status: 0, latencyMs: 0 };
    attempts.push(attempt);
    try {
      const result = await handler(body, model, context);
      const actual = result.headers.get("x-fr-upstream-model") || result.headers.get("x-fr-selected-model") || model;
      Object.assign(attempt, { model: actual, provider: actual.split("/")[0], status: result.status, latencyMs: Date.now() - at });
      return result;
    } catch (error) {
      Object.assign(attempt, { status: 500, latencyMs: Date.now() - at, error: redactSecretText(error.name || "Request failed").slice(0, 100) });
      throw error;
    }
  } });
  const selected = response.ok ? attempts.find(a => a.status >= 200 && a.status < 300)?.model : null;
  const record = { id, combo: options.comboName, attempts: [...attempts], selectedModel: selected, status: response.status, latencyMs: Date.now() - start, at: new Date().toISOString() };
  let responseBody = response.body;
  if (response.ok && responseBody && response.headers.get("content-type")?.includes("text/event-stream")) {
    record.streamStatus = "in_progress";
    const reader = responseBody.getReader();
    let finalized = false;
    const finish = async (status, error) => {
      if (finalized) return;
      finalized = true;
      record.streamStatus = status; record.streamDurationMs = Date.now() - start;
      if (error) record.streamError = redactSecretText(error.name || "Stream failed").slice(0, 100);
      await persistTrace(record);
    };
    responseBody = new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (finalized) return;
          if (chunk.done) { await finish(options.signal?.aborted ? "cancelled" : "completed"); controller.close(); }
          else controller.enqueue(chunk.value);
        } catch (error) { await finish(options.signal?.aborted ? "cancelled" : "failed", options.signal?.aborted ? null : error); controller.error(error); }
      },
      async cancel(reason) {
        await finish("cancelled");
        await reader.cancel(reason);
      },
    });
  }
  await persistTrace(record);
  const headers = new Headers(response.headers);
  headers.set("x-fr-route-id", id); headers.set("x-fr-model-attempts", String(attempts.length));
  headers.set("x-fr-routing-ms", String(record.latencyMs));
  if (selected) headers.set("x-fr-selected-model", selected);
  return new Response(responseBody, { status: response.status, statusText: response.statusText, headers });
}
