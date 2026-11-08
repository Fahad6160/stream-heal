// Direct test: Importing the compiled production build from ./dist/index.mjs
import { parseStreamJson, repairJson, StreamHealer, healAsyncIterable } from "./dist/index.mjs";

console.log("==================================================");
console.log("🚀 Testing compiled library: ./dist/index.mjs");
console.log("==================================================");

// 1. Basic parseStreamJson
const partialChunk = '```json\n{"status": "running", "tags": ["ai", "str';
console.log("\n1. Testing parseStreamJson() with partial chunk:");
const result = parseStreamJson(partialChunk);
console.log("Output:", result);
if (result && result.status === "running" && result.tags[1] === "str") {
  console.log("✅ parseStreamJson passed!");
} else {
  throw new Error("parseStreamJson basic test failed!");
}

// 2. Production Edge Cases
console.log("\n2. Testing In-Depth Production Edge Cases:");

// Edge Case A: Incomplete Unicode escape sequences
const unicodePartial = '{"char": "\\u004';
const unicodeResult = parseStreamJson(unicodePartial);
console.log("A. Truncated Unicode Escape ->", unicodeResult);
if (unicodeResult && unicodeResult.char === "") {
  console.log("✅ Incomplete Unicode escape healed safely!");
} else {
  throw new Error("Failed incomplete unicode test");
}

// Edge Case B: Python-style constants emitted by models (True, False, None)
const pythonOutput = '{"active": True, "deleted": False, "meta": None}';
const pythonResult = parseStreamJson(pythonOutput);
console.log("B. Python Constants (True/False/None) ->", pythonResult);
if (pythonResult && pythonResult.active === true && pythonResult.deleted === false && pythonResult.meta === null) {
  console.log("✅ Python constants normalized to valid JSON!");
} else {
  throw new Error("Failed python constants normalization");
}

// Edge Case C: Numbers with trailing decimal and exponents
const numberPartial = '{"float": 99., "exponent": 1.4e+, "count": -';
const numberResult = parseStreamJson(numberPartial);
console.log("C. Incomplete Float & Exponent ->", numberResult);
if (numberResult && numberResult.float === 99.0 && numberResult.exponent === 1.4 && numberResult.count === 0) {
  console.log("✅ Incomplete numbers and exponents healed safely!");
} else {
  throw new Error("Failed number healing test");
}

// Edge Case D: Missing commas between properties
const missingComma = '{"first": "Alex" "second": "Jordan" "nested": {} "arr": []}';
const missingCommaResult = parseStreamJson(missingComma);
console.log("D. Missing Commas ->", missingCommaResult);
if (missingCommaResult && missingCommaResult.first === "Alex" && missingCommaResult.second === "Jordan") {
  console.log("✅ Auto-inserted missing commas between properties!");
} else {
  throw new Error("Failed missing commas test");
}

// Edge Case E: Stripping line and block comments
const commentsJson = '{\n  // single line comment\n  "api": "v1",\n  /* block comment */\n  "port": 8080\n}';
const commentsResult = parseStreamJson(commentsJson);
console.log("E. Comments Stripping ->", commentsResult);
if (commentsResult && commentsResult.api === "v1" && commentsResult.port === 8080) {
  console.log("✅ Line and block comments cleanly stripped!");
} else {
  throw new Error("Failed comments stripping test");
}

// Edge Case F: Unclosed quote before comma and unclosed quote inside array
const userProblemInput = '{"name":"raj, "age": 25, "hobby": ["]}';
const userProblemResult = parseStreamJson(userProblemInput);
console.log("F. Missing quote before comma & unclosed array quote ->", userProblemResult);
if (userProblemResult && userProblemResult.name === "raj" && userProblemResult.age === 25 && Array.isArray(userProblemResult.hobby)) {
  console.log("✅ Healed missing quote before comma and unclosed array quote!");
} else {
  throw new Error("Failed user test string repair");
}

// Edge Case G: Missing quote between array elements
const arrayMissingQuote = '{"name":"raj, "age": 25, "hobby":["cricket, "racing"';
const arrayMissingResult = parseStreamJson(arrayMissingQuote);
console.log("G. Missing quote between array elements ->", arrayMissingResult);
if (arrayMissingResult && arrayMissingResult.hobby && arrayMissingResult.hobby[0] === "cricket" && arrayMissingResult.hobby[1] === "racing") {
  console.log("✅ Healed missing quotes between array elements!");
} else {
  throw new Error("Failed array missing quote test");
}

// Edge Case H: Systemic sanitization (single quotes, leading dot, unquoted word)
const systemicInput = "{'name': 'raj', 'bio': \"Dr. O'Connor\", 'price': .50, 'status': active}";
const systemicResult = parseStreamJson(systemicInput);
console.log("H. Systemic Pre-Sanitization ->", systemicResult);
if (systemicResult && systemicResult.name === "raj" && systemicResult.bio === "Dr. O'Connor" && systemicResult.price === 0.5 && systemicResult.status === "active") {
  console.log("✅ Healed single quotes, leading decimals, and unquoted words!");
} else {
  throw new Error("Failed systemic sanitization test");
}

// Edge Case I: Strict Streaming Integrity (Literal braces inside unclosed strings preserved)
const streamCutWithBrace = '{"code": "function() { return 1; }';
const streamCutResult = parseStreamJson(streamCutWithBrace);
console.log("I. Stream cut with code braces ->", streamCutResult);
if (streamCutResult && streamCutResult.code === "function() { return 1; }") {
  console.log("✅ Code brackets & template braces preserved without truncation!");
} else {
  throw new Error("Failed code braces preservation test");
}

// 3. Character-by-character Slicing Stress Test (Fuzzing)
console.log("\n3. Character-by-character Slicing Stress Test (Fuzzing):");
const complexSample = JSON.stringify({
  model: "claude-3-5-sonnet",
  version: 2.1,
  active: true,
  items: ["rag", "vectors", { deep: true }],
  confidence: 99.4
});
const wrapped = `\`\`\`json\n${complexSample}\n\`\`\``;

for (let i = 1; i <= wrapped.length; i++) {
  const slice = wrapped.slice(0, i);
  try {
    const res = parseStreamJson(slice);
    if (res !== null && typeof res !== "object") {
      throw new Error(`Invalid non-object return at step ${i}`);
    }
  } catch (err) {
    throw new Error(`CRASH at character ${i}: "${slice}" -> ${err.message}`);
  }
}
console.log(`✅ Fuzzed all ${wrapped.length} character slices with 0 crashes!`);

// 4. StreamHealer & async generator
console.log("\n4. Testing StreamHealer state machine & AsyncIterable:");
const healer = new StreamHealer();
healer.push('{"title": "Prod');
healer.push('-Ready", "ready": tr');
healer.push('ue}');
console.log("Final StreamHealer State ->", healer.finish());

async function* tokenStream() {
  yield '{"metrics": {"ops": 18000';
  yield '0, "latencyUs": 5.';
  yield '56}}';
}

for await (const state of healAsyncIterable(tokenStream())) {
  console.log("Async chunk ->", state);
}

console.log("\n==================================================");
console.log("🎉 ALL PRODUCTION EDGE CASES PASSED WITH 0 CRASHES!");
console.log("==================================================");
