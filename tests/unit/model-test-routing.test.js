import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiKeys: vi.fn(),
  getConsistentMachineId: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getApiKeys: mocks.getApiKeys,
}));

vi.mock("@/shared/utils/machineId", () => ({
  getConsistentMachineId: mocks.getConsistentMachineId,
}));

vi.mock("@/lib/db/repos/modelTestsRepo", () => ({
  getModelTests: vi.fn(async () => ({})),
  saveModelTest: vi.fn(async (_model, _kind, result) => result),
}));
vi.mock("@/lib/db/repos/nodesRepo", () => ({ getProviderNodes: vi.fn(async () => []) }));

vi.mock("next/server", () => ({
  NextResponse: {
    json(body, init = {}) {
      return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
}));

const originalFetch = global.fetch;

describe("model test route kind routing", () => {
  it("tests speech using the audio endpoint and requires actual audio", async () => {
    const { POST } = await import("../../src/app/api/models/test/route.js");
    global.fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]), {headers:{"Content-Type":"audio/mpeg"}}));
    const request=()=>new Request("http://localhost/api/models/test", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"edge-tts/en-US-AriaNeural",kind:"tts"})});
    expect((await (await POST(request())).json()).ok).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain("/api/v1/audio/speech");
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({model:"edge-tts/en-US-AriaNeural",input:"Test"});
    global.fetch.mockResolvedValue(new Response("{}", {headers:{"Content-Type":"application/json"}}));
    expect((await (await POST(request())).json()).ok).toBe(false);
  });
  it("does not send unsupported media types to chat", async () => {
    const { POST } = await import("../../src/app/api/models/test/route.js");
    const res=await POST(new Request("http://localhost/api/models/test",{method:"POST",body:JSON.stringify({model:"provider/video",kind:"video"})}));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApiKeys.mockResolvedValue([{ key: "sk-internal", isActive: true }]);
    mocks.getConsistentMachineId.mockResolvedValue("cli-token");
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      created: 1,
      data: [{ b64_json: "abc" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("routes image model tests to /api/v1/images/generations", async () => {
    const { POST } = await import("../../src/app/api/models/test/route.js");

    const req = new Request("http://localhost/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "hf/black-forest-labs/FLUX.1-schnell",
        kind: "image",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/images/generations"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "hf/black-forest-labs/FLUX.1-schnell",
          prompt: "test",
        }),
      })
    );
  });

  it("routes embedding model tests to /api/v1/embeddings", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ embedding: [0.1, 0.2] }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const { POST } = await import("../../src/app/api/models/test/route.js");

    const req = new Request("http://localhost/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "voyage/voyage-3-large",
        kind: "embedding",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/embeddings"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "voyage/voyage-3-large",
          input: "test",
        }),
      })
    );
  });

  it("fails embedding model tests when provider returns no embedding data", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ embedding: null }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const { POST } = await import("../../src/app/api/models/test/route.js");

    const req = new Request("http://localhost/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "voyage/voyage-3-large",
        kind: "embedding",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.error).toBe("Provider returned no embedding data");
  });

  it("routes stt model tests to /api/v1/audio/transcriptions", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      text: "test",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const { POST } = await import("../../src/app/api/models/test/route.js");

    const req = new Request("http://localhost/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "hf/openai/whisper-small",
        kind: "stt",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/audio/transcriptions"),
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      })
    );
  });

  it("returns formatted HTTP errors for non-2xx embedding responses", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "bad upstream" },
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    }));

    const { POST } = await import("../../src/app/api/models/test/route.js");

    const req = new Request("http://localhost/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "voyage/voyage-3-large",
        kind: "embedding",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.status).toBe(502);
    expect(body.error).toBe("HTTP 502: bad upstream");
  });
});
