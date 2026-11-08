import { repairJson, parseStreamJson } from "../src/core/parser";

const sampleChunks = [
  '```json\n{"project": "stream-heal',
  '", "version": "1.0.0',
  '", "active": tr',
  'ue, "metrics": {"tokens": 1250, "latencyMs": 42.',
  '5, "models": ["gpt-4o", "claude-3-5-sonnet", "gemini-1.5-pro',
  '"]}, "features": [{"name": "Zero-dep',
  '", "speed": "ultra-fast',
  '"}], "complete": fa',
  'lse}'
];

function runBenchmark() {
  console.log("=================================================");
  console.log("🚀 stream-heal Streaming Repair & Parse Benchmark");
  console.log("=================================================");

  const iterations = 50_000;
  let accumulated = "";

  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const chunk = sampleChunks[i % sampleChunks.length];
    if (i % sampleChunks.length === 0) {
      accumulated = "";
    }
    accumulated += chunk;
    parseStreamJson(accumulated);
  }

  const durationMs = performance.now() - start;
  const opsPerSec = Math.round((iterations / (durationMs / 1000)));
  const avgTimePerOpUs = ((durationMs / iterations) * 1000).toFixed(2);

  console.log(`Total operations: ${iterations.toLocaleString()}`);
  console.log(`Total duration:   ${durationMs.toFixed(2)} ms`);
  console.log(`Average latency:  ${avgTimePerOpUs} µs per chunk`);
  console.log(`Throughput:       ${opsPerSec.toLocaleString()} ops/sec`);
  console.log("=================================================");
  console.log("✅ Benchmark finished with 0 crashes.");
}

runBenchmark();

