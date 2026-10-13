import { describe, it, expect } from "vitest";
import { redactSecrets, redactSecretText } from "../../open-sse/utils/redactSecrets.js";

describe("request log secret redaction", () => {
  it("redacts nested credentials and case-insensitive request and response headers without mutating input", () => {
    const input = { headers: { Authorization: "Bearer abc", "X-API-Key": "short", Cookie: "session=abc", "Set-Cookie": "session=def", "Content-Type": "application/json" }, body: { provider: { apiKey: "private", refresh_token: "refresh", accessToken: "access" }, messages: [{ content: "normal prompt" }] } };
    const result = redactSecrets(input);
    expect(result.headers.Authorization).toBe("[REDACTED]");
    expect(result.headers["Set-Cookie"]).toBe("[REDACTED]");
    expect(result.body.provider).toEqual({ apiKey: "[REDACTED]", refresh_token: "[REDACTED]", accessToken: "[REDACTED]" });
    expect(result.headers["Content-Type"]).toBe("application/json");
    expect(result.body.messages[0].content).toBe("normal prompt");
    expect(input.headers.Authorization).toBe("Bearer abc");
  });
  it("redacts upstream key echoes and URL credentials", () => {
    expect(redactSecretText("Incorrect API key: sk-ws-private.value https://example.test?key=secret&model=qwen Bearer private-token")).toBe("Incorrect API key: [REDACTED] https://example.test?key=[REDACTED]&model=qwen Bearer [REDACTED]");
  });
  it("handles cycles without failing the logger", () => {
    const input = {}; input.self = input;
    expect(redactSecrets(input)).toEqual({ self: "[Circular]" });
  });
});
