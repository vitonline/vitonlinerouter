// Issue #3010 — Dashboard "Test" button fails for reasoning models because of a
// tiny max_tokens probe. pingModelByKind must use a sane budget (1024) and treat a
// reasoning-only (length-limited) response as a successful connection.
//
// The route module pulls in Next.js-only deps (@/lib/localDb, etc.) that don't
// resolve under raw vitest, so we mock them and exercise the exported function.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the heavy Next.js-dependent imports BEFORE importing ping.js.
vi.mock("@/lib/localDb", () => ({ getApiKeys: vi.fn(async () => [{ key: "test-key", isActive: true }]) }));
vi.mock("@/shared/constants/config", () => ({ UPDATER_CONFIG: { appPort: 20127 } }));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: vi.fn(async () => "cli-token") }));

const { pingModelByKind } = await import("../../src/app/api/models/test/ping.js");

describe("pingModelByKind reasoning models (#3010)", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(obj) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(obj),
      json: async () => obj,
    };
  }

  it("uses a 1024-token budget for the chat completions probe", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Hi there!" } }] }));

    await pingModelByKind("cline-pass/kimi-k3", "llm", "http://127.0.0.1:20127");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(1024);
  });

  it("distinguishes accepted reasoning from a usable answer", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            finish_reason: "length",
            message: { content: "", reasoning: "The user said hi — a simple greeting..." },
          },
        ],
      })
    );

    const result = await pingModelByKind("cline-pass/kimi-k3", "llm", "http://127.0.0.1:20127");
    expect(result.ok).toBe(false);
    expect(result.connectionAccepted).toBe(true);
    expect(result.verification).toBe("reasoning_only");
    expect(result.note).toMatch(/reasoning-only/);
  });

  it("still fails when there are no choices and no reasoning", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [] }));
    const result = await pingModelByKind("some/model", "llm", "http://127.0.0.1:20127");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no completion choices/);
  });

  it("passes a normal answer with the larger budget", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: "Hello!" } }] }));
    const result = await pingModelByKind("openai/gpt-4o", "llm", "http://127.0.0.1:20127");
    expect(result.ok).toBe(true);
    expect(result.verification).toBe("usable_response");
  });
  it.each([null, "", "   ", {}, [], [{ type: "image_url", image_url: { url: "https://example.com" } }]])("does not pass empty or non-text content %j", async (content) => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content } }] }));
    const result = await pingModelByKind("some/model", "llm");
    expect(result).toMatchObject({ ok: false, connectionAccepted: true, verification: "connection_accepted" });
  });
  it("accepts text content blocks", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: [{ type: "text", text: "Hello" }] } }] }));
    expect(await pingModelByKind("some/model", "llm")).toMatchObject({ ok: true, verification: "usable_response" });
  });
});
