/**
 * Example: Using stream-heal with standard OpenAI streaming API
 */
import { healAsyncIterable } from "stream-heal";

interface GenerationResult {
  title: string;
  summary: string;
  keyPoints: string[];
  sentiment: "positive" | "neutral" | "negative";
}

// Simulating incoming streaming chunks from OpenAI / Anthropic / Gemini
async function* mockAIStream() {
  const tokens = [
    '```json\n{"title": "The Rise of ',
    'AI-First Architecture",\n',
    '"summary": "Modern web developers ',
    'are moving towards local and edge streaming models.",\n',
    '"keyPoints": ["Zero-dependency parsing", "Sub-millisecond latency',
    '", "Type-safe UI updates"],\n',
    '"sentiment": "posi',
    'tive"}'
  ];

  for (const token of tokens) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    yield token;
  }
}

async function run() {
  console.log("Starting LLM stream...\n");

  for await (const partial of healAsyncIterable<GenerationResult>(mockAIStream())) {
    // partial is always a valid JS object at every frame!
    console.clear();
    console.log("--- Real-time Repaired State ---");
    console.log("Title:      ", partial.title || "(typing...)");
    console.log("Summary:    ", partial.summary || "(typing...)");
    console.log("Key Points: ", partial.keyPoints?.join(", ") || "(typing...)");
    console.log("Sentiment:  ", partial.sentiment || "(typing...)");
  }

  console.log("\nStream complete! Zero crashes, zero JSON syntax errors.");
}

run();

