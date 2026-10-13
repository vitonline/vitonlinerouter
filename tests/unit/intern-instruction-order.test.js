import { expect, it } from "vitest";
import { DefaultExecutor } from "../../open-sse/executors/default";
it("merges interleaved Codex instructions at the start for the strict Intern gateway", () => {
  const body = { messages: [{ role: "developer", content: "first" }, { role: "user", content: "question" }, { role: "system", content: "second" }, { role: "assistant", content: "reply" }, { role: "tool", tool_call_id: "call-1", content: "result" }] };
  const transformed = new DefaultExecutor("intern").transformRequest("qwen3.8-27b", body);
  expect(transformed.messages[0]).toMatchObject({ role: "system", content: "first\n\nsecond" });
  expect(transformed.messages.slice(1).map(m => m.role)).toEqual(["user", "assistant", "tool"]);
  expect(body.messages[0].role).toBe("developer");
  expect(body.messages).toHaveLength(5);
});
