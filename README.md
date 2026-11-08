# 🩹 stream-heal

> **Zero-dependency, fault-tolerant streaming JSON parser and auto-healer for LLM outputs and generative UI.**

[![npm version](https://img.shields.io/npm/v/stream-heal.svg?style=flat-square)](https://www.npmjs.com/package/stream-heal)
[![bundle size](https://img.shields.io/bundlephobia/minzip/stream-heal?style=flat-square)](https://bundlephobia.com/package/stream-heal)
[![license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-success.svg?style=flat-square)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?style=flat-square)](tsconfig.json)

---

### 💡 The 5-Second Mental Model

> **Think of `stream-heal` as `JSON.parse()`, but built for streaming AI.**  
> When an LLM outputs JSON token-by-token, standard `JSON.parse()` crashes on every single chunk with `SyntaxError: Unexpected end of JSON`.  
> `stream-heal` fixes the brackets, strings, and commas on the fly so your app gets a **clean, valid JavaScript object at every single frame**.

---

## ⚡ The Problem

When OpenAI, Claude, Gemini, or Ollama streams JSON, each chunk arrives half-finished:

```json
{"user": {"name": "Alex", "skills": ["TypeScript", "Re
```

If you call `JSON.parse()` on this, your app crashes:
```
💥 SyntaxError: Unexpected end of JSON input
```

Most developers either:
1. Wait 5 to 10 seconds for the entire stream to finish (ruining the fast AI experience).
2. Write messy regex hacks that freeze the user's browser.

---

## ✨ The Solution

`stream-heal` auto-heals incomplete tokens **in 5.5 microseconds** with **0 external dependencies** and a **sub-2kB** footprint.

```ts
import { parseStreamJson } from "stream-heal";

// Incomplete chunk while the AI is still typing:
const chunk = '{"name": "Alex", "active": tr';

const data = parseStreamJson(chunk);
console.log(data);
// Output: { name: "Alex", active: true }  <-- Valid, safe, never crashes!
```

---

## 🛠️ What `stream-heal` Fixes Automatically

| What the AI outputs mid-stream | What `stream-heal` produces |
| :--- | :--- |
| **Unclosed strings:** `{"title": "AI Roadmap` | `{"title": "AI Roadmap"}` |
| **Missing quotes in arrays:** `["cricket, "racing"` | `["cricket", "racing"]` |
| **Markdown wrappers:** ` ```json\n{"id": 1}\n``` ` | `{"id": 1}` |
| **Partial booleans/null:** `{"flag": tr` | `{"flag": true}` |
| **Trailing decimals:** `{"price": 49.` | `{"price": 49.0}` |
| **Leading decimals:** `{"price": .50}` | `{"price": 0.50}` |
| **Dangling commas:** `{"items": [1, 2, ]` | `{"items": [1, 2]}` |
| **Missing commas:** `{"a": 1 "b": 2}` | `{"a": 1, "b": 2}` |
| **Single quotes:** `{'name': 'raj'}` | `{"name": "raj"}` |
| **Python casing:** `{"active": True, "data": None}` | `{"active": true, "data": null}` |
| **Unquoted values:** `{"status": active}` | `{"status": "active"}` |
| **Code & template strings:** `{"code": "if (x) { run(); }` | `{"code": "if (x) { run(); }"}` (preserves braces & regexes without flicker) |

---

## 📦 Installation

```bash
npm install stream-heal
# or
pnpm add stream-heal
# or
yarn add stream-heal
```

---

## 🚀 Quick Start

### 1. Simple One-Liner Stream Parsing

```ts
import { parseStreamJson } from "stream-heal";

// Incomplete JSON from an LLM stream:
const chunk = '{"title": "AI Roadmap", "tags": ["agent", "web';

const data = parseStreamJson<{ title: string; tags: string[] }>(chunk);
console.log(data);
// Output: { title: "AI Roadmap", tags: ["agent", "web"] }
```

---

### 2. Stream with OpenAI / Anthropic / Ollama

```ts
import { healAsyncIterable } from "stream-heal";
import OpenAI from "openai";

const openai = new OpenAI();

const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Generate project stats in JSON" }],
  stream: true,
  response_format: { type: "json_object" }
});

async function* tokenGenerator() {
  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content || "";
  }
}

// Consumes the stream token-by-token with zero crashes:
for await (const partial of healAsyncIterable<ProjectStats>(tokenGenerator())) {
  console.log("Current state:", partial);
}
```

---

### 3. React Hook with Built-in Throttling (`stream-heal/react`)

Prevent UI freezes during high-speed streams (e.g., Groq, Cerebras, 100+ tokens/sec) using automatic frame batching:

```tsx
import React from "react";
import { useStreamingJson } from "stream-heal/react";

interface ProductCard {
  name: string;
  price: number;
  features: string[];
}

export function LiveProductCard() {
  const { data, isLoading, pipe } = useStreamingJson<ProductCard>({
    throttleMs: 30 // Updates smoothly at ~33fps
  });

  const handleGenerate = async () => {
    const response = await fetch("/api/generate");
    if (response.body) {
      pipe(response.body); // Directly pipe Fetch response stream!
    }
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={isLoading}>
        {isLoading ? "Streaming..." : "Generate Product"}
      </button>

      <h2>{data?.name || "Generating title..."}</h2>
      <p>Price: ${data?.price ?? "--"}</p>
      <ul>
        {data?.features?.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 4. Web Standard TransformStream (Edge / Cloudflare / Node)

```ts
import { createHealTransformStream } from "stream-heal";

const response = await fetch("https://api.example.com/llm-stream");

const healedJsonStream = response.body
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(createHealTransformStream<MyData>());
```

---

## 📊 Real Benchmarks

Benchmarked on **50,000 partial chunks** simulating token-by-token LLM generation:

| Metric | Result |
| :--- | :--- |
| **Average Latency** | **5.56 µs** (microseconds!) per chunk |
| **Throughput** | **~180,000 ops / sec** |
| **Total Test Operations** | 50,000 operations in 278 ms |
| **Crashes / Errors** | **0** (100% fault-tolerant) |
| **Bundle Size** | **< 2 kB** minzipped |
| **Dependencies** | **0** |

---

## 🛠️ API Reference

### `parseStreamJson<T>(input: string, options?: ParseOptions): Partial<T> | null`
Parses and auto-heals an incomplete JSON string into a strongly-typed partial object.

### `repairJson(input: string, options?: RepairOptions): string`
Returns the repaired raw JSON string ready for `JSON.parse()`.

### `createStreamHealer<T>(options?: StreamHealerOptions): StreamHealer<T>`
Creates an incremental, stateful stream tracker.

### `useStreamingJson<T>(options?: UseStreamingJsonOptions<T>)`
React hook providing `{ data, isLoading, isComplete, pipe, feed, reset }`.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

```bash
# Clone the repository
git clone https://github.com/Fahad6160/stream-heal.git

# Install dependencies
npm install

# Run test suite
npm test

# Run benchmark
npm run bench
```

---

## 📄 License

MIT © 2026 [Fahad Shaikh](https://github.com/Fahad6160). Built for the modern AI web developer.

