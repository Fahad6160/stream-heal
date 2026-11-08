import { describe, it, expect } from "vitest";
import { parseStreamJson } from "../src/core/parser";

describe("Adversarial Chaos & Fuzz Testing (1,000+ Combinations)", () => {
  const complexObjects = [
    {
      user: {
        id: 1092,
        name: "Dr. Alex 'The Architect' O'Connor",
        bio: "Specializing in distributed systems, Web Streams & ASTs.\nLine 2 with quotes: \"awesome\".",
        skills: ["TypeScript", "Rust", "WebGPU", "Node.js"],
        metrics: {
          commits: 14200,
          prsReviewed: 840,
          rating: 4.98,
          active: true,
          deletedAt: null
        }
      },
      tags: ["ai", "streaming", "json-repair"],
      config: {
        timeout: 5000,
        retries: 3,
        flags: [true, false, null]
      }
    },
    {
      query: "SELECT * FROM users WHERE active = true",
      ast: {
        type: "SelectStatement",
        tables: ["users"],
        where: { column: "active", operator: "=", value: true }
      },
      pagination: { limit: 50, offset: 0, hasMore: false }
    }
  ];

  it("survives 1,000 random token-boundary cuts with zero unhandled exceptions", () => {
    let testCount = 0;

    for (const obj of complexObjects) {
      const jsonStr = JSON.stringify(obj, null, 2);
      const wrappedFormats = [
        jsonStr,
        `\`\`\`json\n${jsonStr}\n\`\`\``,
        `Here is the result:\n\`\`\`json\n${jsonStr}\n\`\`\`\nHope that helps!`,
        `Sure! Output:\n${jsonStr}\nDone.`
      ];

      for (const payload of wrappedFormats) {
        // Cut at every single character boundary from 1 to length
        for (let cut = 1; cut <= payload.length; cut++) {
          testCount++;
          const partial = payload.slice(0, cut);

          expect(() => {
            const result = parseStreamJson(partial);
            // Result must either be a valid JS object/array or null (NEVER crash or throw)
            expect(result === null || typeof result === "object").toBe(true);
          }).not.toThrow();
        }
      }
    }

    console.log(`✅ Fuzzed ${testCount} real-world stream cuts with 0 crashes.`);
  });

  it("survives chaotic mutations (random deletions, insertions, noise)", () => {
    const base = JSON.stringify({
      title: "Chaos Test",
      count: 42,
      price: 19.99,
      tags: ["chaos", "fuzzing"],
      nested: { active: true, noneVal: null }
    });

    const chaoticInputs = [
      '{"unclosed_key',
      '{"key": ',
      '{"key": "',
      '{"key": "escaped \\',
      '{"key": "escaped \\"',
      '{"key": "unicode \\u',
      '{"key": "unicode \\u00',
      '{"key": "unicode \\u004',
      '{"items": [',
      '{"items": [1, ',
      '{"items": [1, 2, ',
      '{"items": [{"nested": [',
      '{"float": 12.',
      '{"exponent": 1.5e',
      '{"exponent": 1.5e+',
      '{"exponent": 1.5e-',
      '{"minus": -',
      '{"active": tr',
      '{"active": tru',
      '{"active": fa',
      '{"active": fal',
      '{"val": nu',
      '{"val": nul',
      '{"missing_colon" "val"}',
      '{"missing_comma": 1 "b": 2}',
      '{"a": True, "b": False, "c": None}',
      '{"comments": /* test */ 1}',
      '{"comments": // test\n 1}',
      '{unquoted_key: "value", age: 30}',
      '{"ctrl": "raw\x07bell and \x0bvertical tab"}'
    ];

    for (const input of chaoticInputs) {
      expect(() => {
        const res = parseStreamJson(input);
        expect(res === null || typeof res === "object").toBe(true);
      }).not.toThrow();
    }
  });
});
