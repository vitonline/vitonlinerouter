import { expect, it } from "vitest";
import { normalizeModelTestHistory, normalizeModelTestRecord } from "../../src/shared/utils/modelTestProviders.js";
import { buildProviderIssues } from "../../src/shared/utils/providerIssues.js";
const node = { id: "openai-compatible-chat-example", prefix: "my-api", name: "My API" };
it("maps legacy custom prefixes to stable provider IDs without changing upstream model slashes", () => {
  const record = normalizeModelTestRecord({ model: "my-api/org/model", ok: false, error: "[401]" }, [node]);
  expect(record).toMatchObject({ model: "my-api/org/model", providerId: node.id });
  const [group] = buildProviderIssues([{ ...node, serviceKinds: ["llm"] }], [{ provider: node.id, isActive: true }], { a: record });
  expect(group).toMatchObject({ id: node.id, name: "My API", manageUrl: `/dashboard/providers/${node.id}` });
  expect(group.issues[0].models[0].model).toBe("my-api/org/model");
});
it("keeps saved tests reachable after a custom prefix changes and selects the newest duplicate", () => {
  const records = normalizeModelTestHistory({ a: { model: "old/org/model", providerId: node.id, ok: false, testedAt: "2026-10-11" }, b: { model: "my-api/org/model", ok: true, testedAt: "2026-10-12" } }, [node]);
  expect(Object.keys(records)).toEqual(["my-api/org/model"]);
  expect(records["my-api/org/model"]).toMatchObject({ providerId: node.id, ok: true });
});
it("retains normal provider aliases and distinguishes reasoning-only issues", () => {
  expect(normalizeModelTestRecord({ model: "qw/model" }).providerId).toBe("qwencloud");
  const record = normalizeModelTestRecord({ model: "my-api/test", ok: false, verification: "reasoning_only", connectionAccepted: true }, [node]);
  const [group] = buildProviderIssues([node], [{ provider: node.id, isActive: true }], { a: record });
  expect(group.passedModels).toBe(0);
  expect(group.issues[0].reason).toBe("Reasoning only; no usable answer");
});
