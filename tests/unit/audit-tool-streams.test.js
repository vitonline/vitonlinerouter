import { describe, it, expect } from "vitest";
import { initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.js";
import { openaiToClaudeResponse } from "../../open-sse/translator/response/openai-to-claude.js";

const chunk = (tool, finish_reason = null) => ({id:"fixture", model:"fixture", choices:[{index:0, delta:tool ? {tool_calls:[tool]} : {}, finish_reason}]});
describe("audit tool stream regressions", () => {
  it("keeps no-id tool calls in completed Responses output", () => {
    const state = initState(FORMATS.OPENAI_RESPONSES);
    const events = [
      ...openaiToOpenAIResponsesResponse(chunk({index:0,function:{name:"Read",arguments:'{"file_path":"fixture"}'}}),state),
      ...openaiToOpenAIResponsesResponse(chunk(null,"tool_calls"),state),
    ];
    const added = events.find(event => event.data?.type === "response.output_item.added");
    expect(added?.data.item.name).toBe("Read");
    const completed = events.find(event => event.data?.type === "response.completed");
    expect(completed.data.response.output).toEqual(expect.arrayContaining([expect.objectContaining({name:"Read",arguments:'{"file_path":"fixture"}'})]));
  });
  it("buffers name/arguments arriving before the real call ID", () => {
    const state = initState(FORMATS.OPENAI_RESPONSES);
    openaiToOpenAIResponsesResponse(chunk({index:0,function:{name:"Read",arguments:'{"file_path":'}}),state);
    const events = openaiToOpenAIResponsesResponse(chunk({index:0,id:"real_id",function:{arguments:'"fixture"}'}}),state);
    expect(events.find(event => event.data?.type === "response.output_item.added").data.item.call_id).toBe("real_id");
    expect(events.filter(event => event.data?.type === "response.function_call_arguments.delta").map(event => event.data.delta).join("")).toBe('{"file_path":"fixture"}');
  });
  it("waits for Claude tool names and preserves earlier arguments", () => {
    const state = initState(FORMATS.CLAUDE);
    const first = openaiToClaudeResponse(chunk({index:0,id:"real_id",function:{arguments:'{"file_path":'}}),state);
    expect(first.some(event => event.content_block?.type === "tool_use")).toBe(false);
    const named = openaiToClaudeResponse(chunk({index:0,function:{name:"Read",arguments:'"fixture"}'}}),state);
    expect(named.find(event => event.content_block?.type === "tool_use").content_block.name).toBe("Read");
    const done = openaiToClaudeResponse(chunk(null,"tool_calls"),state);
    expect(done.find(event => event.delta?.type === "input_json_delta").delta.partial_json).toBe('{"file_path":"fixture"}');
  });
});
