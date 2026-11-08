import { describe, it, expect } from "vitest";
import { parseStreamJson, repairJson, extractJsonCandidate } from "../src/core/parser";

describe("Production Edge Cases & Stress Testing", () => {
  describe("1. Empty, Malformed and Blank Inputs", () => {
    it("safely returns fallback on empty string, spaces, newlines", () => {
      expect(parseStreamJson("")).toBeNull();
      expect(parseStreamJson("   ")).toBeNull();
      expect(parseStreamJson("\n\n\t  \r")).toBeNull();
      expect(parseStreamJson(null as any)).toBeNull();
      expect(parseStreamJson(undefined as any)).toBeNull();
    });

    it("respects custom fallback value", () => {
      const customFallback = { status: "idle" };
      expect(parseStreamJson("", { fallback: customFallback })).toEqual({ status: "idle" });
      expect(parseStreamJson("invalid non-json text", { fallback: customFallback })).toEqual({
        status: "idle"
      });
    });
  });

  describe("2. Markdown Code Fences & Conversational Wrappers", () => {
    it("handles lowercase, uppercase, and untagged markdown codeblocks", () => {
      expect(parseStreamJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
      expect(parseStreamJson('```JSON\n{"a": 1}\n```')).toEqual({ a: 1 });
      expect(parseStreamJson('```javascript\n{"a": 1}\n```')).toEqual({ a: 1 });
      expect(parseStreamJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
    });

    it("handles unclosed opening markdown fence in flight", () => {
      expect(parseStreamJson('```json\n{"model": "gpt-4o", "ready": tr')).toEqual({
        model: "gpt-4o",
        ready: true
      });
    });

    it("strips conversational preamble before JSON and postamble after JSON", () => {
      const input = `Certainly! Here is the requested configuration data:
{
  "service": "auth-gateway",
  "port": 443
}
Let me know if you need additional parameters!`;
      expect(parseStreamJson(input)).toEqual({
        service: "auth-gateway",
        port: 443
      });
    });
  });

  describe("3. Incomplete Unicode Escape Sequences", () => {
    it("repairs truncated unicode escapes mid-hex in unclosed strings", () => {
      expect(parseStreamJson('{"text": "Special char \\u')).toEqual({ text: "Special char " });
      expect(parseStreamJson('{"text": "Special char \\u0')).toEqual({ text: "Special char " });
      expect(parseStreamJson('{"text": "Special char \\u00')).toEqual({ text: "Special char " });
      expect(parseStreamJson('{"text": "Special char \\u004')).toEqual({ text: "Special char " });
    });

    it("correctly parses completed unicode escapes", () => {
      expect(parseStreamJson('{"text": "\\u0041\\u0042\\u0043"}')).toEqual({ text: "ABC" });
    });
  });

  describe("4. Incomplete Numbers, Exponents & Signs", () => {
    it("repairs trailing decimal dots", () => {
      expect(parseStreamJson('{"score": 99.')).toEqual({ score: 99.0 });
      expect(parseStreamJson('[10., 20.]')).toEqual([10.0, 20.0]);
    });

    it("repairs floating-point scientific exponents in flight", () => {
      expect(parseStreamJson('{"rate": 1.2e')).toEqual({ rate: 1.2 });
      expect(parseStreamJson('{"rate": 1.2e+')).toEqual({ rate: 1.2 });
      expect(parseStreamJson('{"rate": 1.2e-')).toEqual({ rate: 1.2 });
      expect(parseStreamJson('[3.5e+, 4.2e-]')).toEqual([3.5, 4.2]);
    });

    it("repairs lone minus signs in flight", () => {
      expect(parseStreamJson('{"balance": -')).toEqual({ balance: 0 });
      expect(parseStreamJson('[-')).toEqual([0]);
    });
  });

  describe("5. Python-Style Constants Emitted by Models", () => {
    it("normalizes True, False, and None in objects and arrays", () => {
      const input = '{"isAdmin": True, "isBlocked": False, "metadata": None}';
      expect(parseStreamJson(input)).toEqual({
        isAdmin: true,
        isBlocked: false,
        metadata: null
      });

      const arrayInput = "[True, False, None]";
      expect(parseStreamJson(arrayInput)).toEqual([true, false, null]);
    });
  });

  describe("6. Comment Stripping Outside Strings", () => {
    it("strips single-line // comments cleanly", () => {
      const input = `{\n  // User identifier\n  "id": 1001,\n  // Active status\n  "active": true\n}`;
      expect(parseStreamJson(input)).toEqual({ id: 1001, active: true });
    });

    it("strips multi-line /* ... */ comments cleanly", () => {
      const input = `{\n  /* Gateway Configuration */\n  "gateway": "api-v1",\n  /* Timeout in milliseconds */\n  "timeout": 5000\n}`;
      expect(parseStreamJson(input)).toEqual({ gateway: "api-v1", timeout: 5000 });
    });

    it("does not strip slashes inside string literals", () => {
      const input = '{"url": "https://example.com/api//v1"}';
      expect(parseStreamJson(input)).toEqual({ url: "https://example.com/api//v1" });
    });
  });

  describe("7. Missing Commas Between Tokens", () => {
    it("auto-inserts missing commas between object properties", () => {
      const input = '{"name": "Alex" "role": "Engineer"}';
      expect(parseStreamJson(input)).toEqual({ name: "Alex", role: "Engineer" });
    });

    it("auto-inserts missing commas between nested objects and arrays", () => {
      const input = '{"user": {} "items": []}';
      expect(parseStreamJson(input)).toEqual({ user: {}, items: [] });
    });

    it("repairs unclosed quote before comma and unclosed quote inside array", () => {
      const input = '{"name":"raj, "age": 25, "hobby": ["]}';
      expect(parseStreamJson(input)).toEqual({
        name: "raj",
        age: 25,
        hobby: [""]
      });
    });

    it("repairs missing quotes between array string elements", () => {
      const input = '{"name":"raj, "age": 25, "hobby":["cricket, "racing"';
      expect(parseStreamJson(input)).toEqual({
        name: "raj",
        age: 25,
        hobby: ["cricket", "racing"]
      });
    });

    it("normalizes single-quoted JSON while preserving internal apostrophes", () => {
      const input = "{'name': 'raj', 'bio': \"Dr. O'Connor\", 'active': true}";
      expect(parseStreamJson(input)).toEqual({
        name: "raj",
        bio: "Dr. O'Connor",
        active: true
      });
    });

    it("repairs leading decimals, leading pluses, and duplicate commas", () => {
      const input = '{"price": .50, "count": +15, "items": [1,, 2, 3]}';
      expect(parseStreamJson(input)).toEqual({
        price: 0.5,
        count: 15,
        items: [1, 2, 3]
      });
    });

    it("repairs unquoted string values and empty colons before commas", () => {
      const input = '{"status": active, "role": admin, "skipped": , "ready": true}';
      expect(parseStreamJson(input)).toEqual({
        status: "active",
        role: "admin",
        skipped: null,
        ready: true
      });
    });

    it("preserves literal characters, code snippets, and braces inside streaming strings", () => {
      // Approach 1 (Strict Streaming Integrity): Characters inside an open string are preserved as literal data
      expect(parseStreamJson('{"user":"Raj}')).toEqual({ user: "Raj}" });
      expect(parseStreamJson('["apple", "banana]')).toEqual(["apple", "banana]"]);
      expect(parseStreamJson('{"code": "function() { return 1; }')).toEqual({
        code: "function() { return 1; }"
      });
      expect(parseStreamJson('{"regex": "[0-9]')).toEqual({ regex: "[0-9]" });
      expect(parseStreamJson('{"template": "Hello {name}')).toEqual({
        template: "Hello {name}"
      });

      // Missing quotes before commas and array brackets still heal cleanly
      expect(parseStreamJson('{"name":"raj, "age": 25, "hobby": ["]}')).toEqual({
        name: "raj",
        age: 25,
        hobby: [""]
      });
      expect(parseStreamJson('{"name":"raj, "age": 25, "hobby":["cricket, "racing"')).toEqual({
        name: "raj",
        age: 25,
        hobby: ["cricket", "racing"]
      });
      expect(parseStreamJson('{"name"')).toEqual({});
    });
  });

  describe("8. Deeply Nested Structures & Unicode/Emojis", () => {
    it("repairs 8 levels of nested arrays and objects safely", () => {
      const input = '{"l1": {"l2": [{"l3": {"l4": [{"l5": {"l6": [{"l7": {"target": "deep';
      expect(parseStreamJson(input)).toEqual({
        l1: {
          l2: [
            {
              l3: {
                l4: [
                  {
                    l5: {
                      l6: [
                        {
                          l7: {
                            target: "deep"
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          ]
        }
      });
    });

    it("preserves non-Latin scripts, emojis, and unicode symbols", () => {
      const input = '{"rocket": "🚀", "japanese": "こんにちは世界", "arabic": "مرحبا بالعالم", "symbols": "§±¶';
      expect(parseStreamJson(input)).toEqual({
        rocket: "🚀",
        japanese: "こんにちは世界",
        arabic: "مرحبا بالعالم",
        symbols: "§±¶"
      });
    });
  });

  describe("9. Character-by-Character Slicing Stress Test (Fuzzing)", () => {
    it("survives token-by-token slicing without throwing any unhandled exceptions", () => {
      const fullJson = JSON.stringify({
        agent: "Claude-3.5-Sonnet",
        version: "v2.0",
        active: true,
        metrics: {
          accuracy: 99.4,
          tokens: 2840,
          latencyMs: 14.8
        },
        tools: ["search", "calculator", "evaluator"],
        nested: {
          flags: [true, false, null]
        }
      });

      // Wrap in markdown to test full realistic stream
      const wrappedPayload = `\`\`\`json\n${fullJson}\n\`\`\``;

      // Slice character by character from length 1 to length N
      for (let i = 1; i <= wrappedPayload.length; i++) {
        const slice = wrappedPayload.slice(0, i);
        expect(() => {
          const parsed = parseStreamJson(slice);
          // Result must either be a valid JS object/array or null
          expect(parsed === null || typeof parsed === "object").toBe(true);
        }).not.toThrow();
      }
    });
  });
});

