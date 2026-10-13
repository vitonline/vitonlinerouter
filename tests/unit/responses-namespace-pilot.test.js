import { expect, it } from "vitest";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses";
import { flattenResponsesTools } from "../../open-sse/shared/responsesToolNamespaces";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses";
import { initState } from "../../open-sse/translator/index";
import { FORMATS } from "../../open-sse/translator/formats";
it("preserves namespaced Codex tools and their continuation names", () => {
  const tools = [{ type: "function", name: "exec_command", parameters: { type: "object" } }, { type: "namespace", name: "multi_agent_v1", tools: [{ type: "function", name: "wait_agent", parameters: { type: "object" } }] }];
  const body = openaiResponsesToOpenAIRequest("model", { tools, input: [{ type: "function_call", namespace: "multi_agent_v1", name: "wait_agent", call_id: "call-1", arguments: "{}" }] });
  expect(body.tools.map(t => t.function.name)).toEqual(["exec_command", "multi_agent_v1__wait_agent"]);
  expect(body.messages[0].tool_calls[0].function.name).toBe("multi_agent_v1__wait_agent");
  expect(flattenResponsesTools(tools).namespaceByName.multi_agent_v1__wait_agent).toEqual({ name: "wait_agent", namespace: "multi_agent_v1" });
});
it("maps Responses structured format to Chat response_format", () => {
  const schema = { type: "object", properties: { marker: { type: "string" } } };
  const body = openaiResponsesToOpenAIRequest("model", { input: "hello", text: { format: { type: "json_schema", name: "test", strict: true, schema } } });
  expect(body.response_format.json_schema.schema).toEqual(schema);
  expect(body.response_format.type).toBe("json_schema");
  expect(body.text).toBeUndefined();
});
it("restores namespace identity on streamed tool-call items", () => {
  const state = initState(FORMATS.OPENAI_RESPONSES);
  state.namespaceTools = { group__read: { name: "read", namespace: "group" } };
  const events = openaiToOpenAIResponsesResponse({ id: "chat-1", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "group__read", arguments: "{}" } }] } }] }, state);
  expect(events.find(event => event.event === "response.output_item.added")?.data?.item).toMatchObject({ name: "read", namespace: "group" });
});
