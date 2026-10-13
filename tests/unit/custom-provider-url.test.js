import { it, expect } from "vitest";
import { normalizeCustomProviderUrl } from "../../src/shared/utils/customProviderUrl.js";
it.each([
  ["https://discovery-api.intern-ai.org.cn", "https://discovery-api.intern-ai.org.cn/v1"],
  ["https://example.com/api/v1/", "https://example.com/api/v1"],
  ["https://example.com/v1/chat/completions", "https://example.com/v1"],
  ["https://example.com/api/v1/responses", "https://example.com/api/v1"],
  ["https://example.com/v1/messages", "https://example.com/v1"],
  ["http://localhost:8080/v1", "http://localhost:8080/v1"],
])("normalizes %s", (input, output)=>expect(normalizeCustomProviderUrl(input)).toBe(output));
it.each(["bad-url", "file:///secret", "https://user:pass@example.com", "https://example.com?key=secret", "https://example.com/#fragment"])("rejects %s", input=>expect(()=>normalizeCustomProviderUrl(input)).toThrow());
