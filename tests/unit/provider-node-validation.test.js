import { expect, it } from "vitest";
import { validateProviderNode } from "../../src/shared/utils/providerNodeValidation.js";
const input = { name: " New API ", prefix: "new-api", baseUrl: "https://example.com/v1/chat/completions", type: "openai-compatible", apiType: "chat" };
it("normalizes names and endpoints for all supported formats", () => {
  expect(validateProviderNode(input)).toMatchObject({ name: "New API", baseUrl: "https://example.com/v1" });
  expect(validateProviderNode({ ...input, type: "anthropic-compatible", baseUrl: "https://example.com/api/v1/messages" }).baseUrl).toBe("https://example.com/api/v1");
  expect(validateProviderNode({ ...input, type: "custom-embedding", baseUrl: "https://example.com/v1/embeddings" }).baseUrl).toBe("https://example.com/v1");
});
it.each(["openai", "qw", "qwencloud", "bpm", "flagshiprouter", "openai-compatible-chat-example", "Upper", "a/b", "a".repeat(65)])("rejects invalid or reserved prefix %s", prefix => {
  expect(() => validateProviderNode({ ...input, prefix })).toThrow();
});
it("rejects duplicate prefixes but permits editing the same node", () => {
  const nodes = [{ id: "existing", prefix: "new-api" }];
  expect(() => validateProviderNode(input, nodes)).toThrow(expect.objectContaining({ status: 409 }));
  expect(validateProviderNode(input, nodes, "existing").prefix).toBe("new-api");
});
it.each([{ name: {} }, { name: "x".repeat(121) }, { prefix: [] }, { baseUrl: "file:///private" }, { baseUrl: "https://user:pass@example.com" }, { baseUrl: "https://example.com?api_key=secret" }, { type: "unknown" }, { apiType: "wrong" }])("rejects malformed server input %j", patch => {
  expect(() => validateProviderNode({ ...input, ...patch })).toThrow();
});
