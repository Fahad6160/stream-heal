import { describe, it, expect } from "vitest";
import { repairJson, parseStreamJson, extractJsonCandidate } from "../src/core/parser";

describe("extractJsonCandidate", () => {
  it("extracts json from markdown code block", () => {
    const input = 'Here is the data:\n```json\n{"name": "Alice"}\n```\nHope that helps!';
    const extracted = extractJsonCandidate(input);
    expect(extracted).toBe('{"name": "Alice"}');
  });

  it("extracts json when opening fence is not yet closed", () => {
    const input = '```json\n{"name": "Alice"';
    const extracted = extractJsonCandidate(input);
    expect(extracted).toBe('{"name": "Alice"');
  });

  it("finds the first brace even with conversational preamble", () => {
    const input = 'Sure, here is your requested payload: {"id": 123';
    const extracted = extractJsonCandidate(input);
    expect(extracted).toBe('{"id": 123');
  });

  it("handles array payloads", () => {
    const input = 'Result: [1, 2, 3';
    const extracted = extractJsonCandidate(input);
    expect(extracted).toBe('[1, 2, 3');
  });
});

describe("repairJson & parseStreamJson", () => {
  it("parses already valid complete JSON", () => {
    const input = '{"name": "Antigravity", "stars": 5000, "active": true}';
    expect(parseStreamJson(input)).toEqual({
      name: "Antigravity",
      stars: 5000,
      active: true
    });
  });

  it("repairs truncated unclosed strings", () => {
    const input = '{"title": "Streaming AI';
    expect(parseStreamJson(input)).toEqual({
      title: "Streaming AI"
    });
  });

  it("repairs trailing backslash in unclosed string safely", () => {
    const input = '{"path": "C:\\';
    expect(parseStreamJson(input)).toEqual({
      path: "C:"
    });
  });

  it("auto-repairs incomplete booleans and nulls", () => {
    expect(parseStreamJson('{"flag": tr')).toEqual({ flag: true });
    expect(parseStreamJson('{"flag": tru')).toEqual({ flag: true });
    expect(parseStreamJson('{"flag": fa')).toEqual({ flag: false });
    expect(parseStreamJson('{"flag": fal')).toEqual({ flag: false });
    expect(parseStreamJson('{"item": nu')).toEqual({ item: null });
  });

  it("repairs trailing commas", () => {
    const input = '{"items": [1, 2, 3, ], }';
    expect(parseStreamJson(input)).toEqual({
      items: [1, 2, 3]
    });
  });

  it("drops incomplete keys without values gracefully", () => {
    const input = '{"id": 101, "unfin';
    expect(parseStreamJson(input)).toEqual({
      id: 101
    });
  });

  it("handles keys with colon but no value yet", () => {
    const input = '{"id": 101, "status": ';
    expect(parseStreamJson(input)).toEqual({
      id: 101,
      status: null
    });
  });

  it("repairs deeply nested structures", () => {
    const input = '{"project": {"name": "stream-heal", "tags": ["ai", "streaming", {"type": "micro';
    expect(parseStreamJson(input)).toEqual({
      project: {
        name: "stream-heal",
        tags: [
          "ai",
          "streaming",
          {
            type: "micro"
          }
        ]
      }
    });
  });

  it("repairs numbers with trailing decimal dot", () => {
    const input = '{"price": 49.';
    expect(parseStreamJson(input)).toEqual({
      price: 49.0
    });
  });

  it("handles unescaped newlines in LLM stream strings", () => {
    const input = '{"prompt": "Line 1\nLine 2';
    const parsed = parseStreamJson<{ prompt: string }>(input);
    expect(parsed?.prompt).toBe("Line 1\nLine 2");
  });
});

