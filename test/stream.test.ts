import { describe, it, expect } from "vitest";
import { StreamHealer, healAsyncIterable } from "../src/core/stream";

describe("StreamHealer", () => {
  it("incrementally accumulates tokens and provides valid partial objects at every step", () => {
    const healer = new StreamHealer<{ name: string; age: number; skills: string[] }>();

    // Token 1
    let state = healer.push('{"name": "Al');
    expect(state).toEqual({ name: "Al" });

    // Token 2
    state = healer.push('ex", "age": 28');
    expect(state).toEqual({ name: "Alex", age: 28 });

    // Token 3
    state = healer.push(', "skills": ["TypeScript", "Re');
    expect(state).toEqual({
      name: "Alex",
      age: 28,
      skills: ["TypeScript", "Re"]
    });

    // Token 4
    state = healer.push('act"]}');
    expect(state).toEqual({
      name: "Alex",
      age: 28,
      skills: ["TypeScript", "React"]
    });

    const finalResult = healer.finish();
    expect(finalResult).toEqual({
      name: "Alex",
      age: 28,
      skills: ["TypeScript", "React"]
    });
  });

  it("handles reset for stream reuse", () => {
    const healer = new StreamHealer<{ test: number }>();
    healer.push('{"test": 1}');
    expect(healer.getLatest()).toEqual({ test: 1 });

    healer.reset();
    expect(healer.getLatest()).toBeNull();
    expect(healer.getRawBuffer()).toBe("");
  });
});

describe("healAsyncIterable", () => {
  it("yields progressively healed values from an async generator", async () => {
    async function* mockLlmTokens() {
      yield '{"status": "run';
      yield 'ning", "progress": 5';
      yield '0, "complete": fal';
      yield 'se}';
    }

    const collected: unknown[] = [];
    for await (const partial of healAsyncIterable(mockLlmTokens())) {
      collected.push(partial);
    }

    expect(collected.length).toBeGreaterThanOrEqual(4);
    expect(collected[0]).toEqual({ status: "run" });
    expect(collected[collected.length - 1]).toEqual({
      status: "running",
      progress: 50,
      complete: false
    });
  });
});

