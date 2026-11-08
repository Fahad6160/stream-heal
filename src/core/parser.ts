/**
 * stream-heal: Zero-dependency, fault-tolerant streaming JSON parser and auto-healer
 * Production-hardened against all real-world LLM streaming edge cases.
 */

export interface ParseOptions {
  /**
   * If true, automatically strips markdown code fences (e.g. ```json ... ```)
   * and ignores conversational preambles/postambles from LLMs.
   * @default true
   */
  stripMarkdown?: boolean;

  /**
   * Fallback value if the JSON cannot be parsed at all yet (e.g., empty stream).
   * @default null
   */
  fallback?: unknown;

  /**
   * If true, throws a SyntaxError if healing fails, instead of returning the fallback.
   * @default false
   */
  strict?: boolean;
}

export interface RepairOptions {
  /**
   * Strip markdown wrappers like ```json ... ```
   * @default true
   */
  stripMarkdown?: boolean;
}

/**
 * Extracts and sanitizes the core JSON text from an LLM response stream,
 * stripping markdown codeblock indicators and conversational fluff.
 */
export function extractJsonCandidate(text: string, stripMarkdown = true): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim();

  if (!stripMarkdown) {
    return cleaned;
  }

  // Handle markdown code blocks e.g. ```json \n { ... } \n ```
  const fenceStart = cleaned.indexOf("```");
  if (fenceStart !== -1) {
    // Find the end of the opening fence line (e.g. ```json\n)
    const newlineAfterFence = cleaned.indexOf("\n", fenceStart);
    if (newlineAfterFence !== -1) {
      cleaned = cleaned.slice(newlineAfterFence + 1);
    } else {
      // Stream just started with ```json and no newline yet
      return "";
    }

    // If there is a closing fence ```, strip everything from it
    const fenceEnd = cleaned.lastIndexOf("```");
    if (fenceEnd !== -1) {
      cleaned = cleaned.slice(0, fenceEnd);
    }
  }

  // Find the first opening bracket '{' or '['
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  let startIndex = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIndex = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  if (startIndex === -1) {
    return "";
  }

  return cleaned.slice(startIndex).trim();
}

/**
 * Strips JS/C-style single-line and multi-line comments outside of strings.
 */
function stripComments(input: string): string {
  let result = "";
  let inString = false;
  let isEscaped = false;
  const len = input.length;

  for (let i = 0; i < len; i++) {
    const char = input[i];

    if (inString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    // Single-line comment //
    if (char === "/" && i + 1 < len && input[i + 1] === "/") {
      const nextNewline = input.indexOf("\n", i + 2);
      if (nextNewline === -1) {
        break; // Remainder of input is a comment
      }
      i = nextNewline; // Skip to newline
      result += "\n";
      continue;
    }

    // Multi-line comment /* ... */
    if (char === "/" && i + 1 < len && input[i + 1] === "*") {
      const endComment = input.indexOf("*/", i + 2);
      if (endComment === -1) {
        break; // Unclosed block comment at stream tail
      }
      i = endComment + 1; // Skip past */
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Normalizes Python/JS single-quoted JSON (e.g. {'name': 'raj'}) to double quotes,
 * while carefully preserving apostrophes inside double-quoted strings (e.g. "O'Connor").
 */
function normalizeSingleQuotes(text: string): string {
  let result = "";
  let inDouble = false;
  let inSingle = false;
  let isEscaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (isEscaped) {
      result += char;
      isEscaped = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      isEscaped = true;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      result += char;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      result += '"';
      continue;
    }
    result += char;
  }
  return result;
}

/**
 * Repairs a truncated or malformed JSON string on the fly, producing a valid JSON string
 * that can be safely parsed by native JSON.parse().
 */
export function repairJson(input: string, options?: RepairOptions): string {
  const stripMarkdown = options?.stripMarkdown ?? true;
  let raw = extractJsonCandidate(input, stripMarkdown);

  if (!raw) {
    return "";
  }

  // Strip comments outside strings
  raw = stripComments(raw);

  // Normalize Python-style single quotes e.g. {'name': 'raj'} -> {"name": "raj"}
  raw = normalizeSingleQuotes(raw);

  // Fix numbers with leading dots e.g. {"price": .50} -> {"price": 0.50}
  raw = raw.replace(/([:,\\[]\s*)\.(\d+)/g, "$10.$2");

  // Fix numbers with leading plus e.g. {"count": +12} -> {"count": 12}
  raw = raw.replace(/([:,\\[]\s*)\+(\d+)/g, "$1$2");

  // Fix consecutive duplicate commas e.g. [1,, 2] -> [1, 2]
  raw = raw.replace(/,\s*,+/g, ",");

  // Fix empty colon before comma e.g. {"a": , "b": 1} -> {"a": null, "b": 1}
  raw = raw.replace(/:\s*,/g, ": null,");

  // Fix unquoted string values e.g. {"status": active, "role": admin} -> {"status": "active", "role": "admin"}
  raw = raw.replace(
    /:\s*([a-zA-Z_$][a-zA-Z0-9_$-]*)\s*(?=([,}\]]|$))/g,
    (_m, word) => {
      const lower = word.toLowerCase();
      if (
        lower === "true" ||
        lower === "false" ||
        lower === "null" ||
        word === "None" ||
        word === "NaN" ||
        word === "Infinity" ||
        /^t(r(u(e)?)?)?$/i.test(word) ||
        /^f(a(l(s(e)?)?)?)?$/i.test(word) ||
        /^n(u(l(l)?)?)?$/i.test(word)
      ) {
        return `: ${word}`;
      }
      return `: "${word}"`;
    }
  );

  // Fix unclosed quotes before comma and next key e.g. {"name":"raj, "age": 25} -> {"name":"raj", "age": 25}
  raw = raw.replace(/(:\s*"[^",\n\r]*),\s*("([a-zA-Z0-9_$]+)"\s*:)/g, '$1", $2');

  // Fix missing closing quotes in arrays e.g. ["cricket, "racing"] -> ["cricket", "racing"]
  raw = raw.replace(/(\[\s*(?:(?:"[^"]*",\s*)*))"([^",\n\r]*),\s*"/g, '$1"$2", "');

  // Fix stray quotes immediately preceding container closing e.g. ["] -> [""] or {"key": "} -> {"key": ""}
  raw = raw.replace(/\[\s*"\s*\]/g, '[""]');
  raw = raw.replace(/:\s*"\s*([}\]])/g, ': ""$1');

  const stack: Array<"{" | "["> = [];
  let inString = false;
  let isEscaped = false;
  let result = "";
  const len = raw.length;

  for (let i = 0; i < len; i++) {
    const char = raw[i];

    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        result += char;
        continue;
      }

      if (char === '"') {
        inString = false;
        result += char;
        continue;
      }

      // Handle all unescaped control characters in strings (ASCII < 32, forbidden by JSON spec)
      const code = char.charCodeAt(0);
      if (code < 32) {
        if (char === "\n") {
          result += "\\n";
        } else if (char === "\r") {
          result += "\\r";
        } else if (char === "\t") {
          result += "\\t";
        } else if (char === "\b") {
          result += "\\b";
        } else if (char === "\f") {
          result += "\\f";
        } else {
          result += "\\u" + code.toString(16).padStart(4, "0");
        }
        continue;
      }

      result += char;
      continue;
    }

    // --- NOT IN STRING ---

    if (char === '"') {
      // Check for missing comma before this string key/value if preceded by another value
      const trimmedSoFar = result.trimEnd();
      const lastChar = trimmedSoFar[trimmedSoFar.length - 1];
      if (
        lastChar === '"' ||
        lastChar === "}" ||
        lastChar === "]" ||
        lastChar === "e" || // from true
        lastChar === "l"    // from null
      ) {
        result = trimmedSoFar + ", ";
      }

      inString = true;
      result += char;
      continue;
    }

    if (char === "{" || char === "[") {
      // Check for missing comma before nested container
      const trimmedSoFar = result.trimEnd();
      const lastChar = trimmedSoFar[trimmedSoFar.length - 1];
      if (lastChar === "}" || lastChar === "]" || lastChar === '"') {
        result = trimmedSoFar + ", ";
      }

      stack.push(char);
      result += char;
      continue;
    }

    if (char === "}") {
      if (stack.length > 0 && stack[stack.length - 1] === "{") {
        stack.pop();
        result = result.replace(/,\s*$/, "");
        result += char;
        // If the root container has closed, stop to ignore trailing conversational postambles
        if (stack.length === 0) {
          break;
        }
      }
      continue;
    }

    if (char === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === "[") {
        stack.pop();
        result = result.replace(/,\s*$/, "");
        result += char;
        // If the root container has closed, stop to ignore trailing conversational postambles
        if (stack.length === 0) {
          break;
        }
      }
      continue;
    }

    result += char;
  }

  // --- STREAM REPAIR HEURISTICS ---

  // 1. If currently inside a string
  if (inString) {
    if (isEscaped) {
      // Remove trailing dangling backslash e.g. "path\": \"C:\\
      if (result.endsWith("\\")) {
        result = result.slice(0, -1);
      }
    }
    // Handle incomplete Unicode escape sequences at end of string e.g. \u, \u0, \u00, \u004
    result = result.replace(/\\u[0-9a-fA-F]{0,3}$/, "");

    // Close the unclosed string (preserves literal content like code brackets, regexes, math)
    result += '"';
  }

  // 2. Trim trailing whitespaces
  result = result.trimEnd();

  // 3. Normalize Python-style constants emitted by models: True, False, None, NaN, Infinity
  result = result.replace(/([:,\\[]\s*)True\b/g, "$1true");
  result = result.replace(/([:,\\[]\s*)False\b/g, "$1false");
  result = result.replace(/([:,\\[]\s*)None\b/g, "$1null");
  result = result.replace(/([:,\\[]\s*)NaN\b/g, "$1null");
  result = result.replace(/([:,\\[]\s*)Infinity\b/g, "$1null");
  result = result.replace(/([:,\\[]\s*)-Infinity\b/g, "$1null");

  // 4. Fix incomplete primitives at the end of the stream
  // Object values:
  result = result.replace(/:\s*t(r(u(e)?)?)?$/i, ": true");
  result = result.replace(/:\s*f(a(l(s(e)?)?)?)?$/i, ": false");
  result = result.replace(/:\s*n(u(l(l)?)?)?$/i, ": null");

  // Array items:
  result = result.replace(/([,[])\s*t(r(u(e)?)?)?$/i, "$1 true");
  result = result.replace(/([,[])\s*f(a(l(s(e)?)?)?)?$/i, "$1 false");
  result = result.replace(/([,[])\s*n(u(l(l)?)?)?$/i, "$1 null");

  // Fix incomplete numbers:
  // Decimals ending with dot e.g. "price": 12. -> 12.0
  result = result.replace(/:\s*(-?\d+)\.(?=\s*([,}\]]|$))/g, ": $1.0");
  result = result.replace(/([,[])\s*(-?\d+)\.(?=\s*([,}\]]|$))/g, "$1 $2.0");

  // Exponents in flight e.g. 1.2e, 1.2e+, 1.2e-
  result = result.replace(/:\s*(-?\d+(\.\d+)?)e[+-]?(?=\s*([,}\]]|$))/gi, ": $1");
  result = result.replace(/([,[])\s*(-?\d+(\.\d+)?)e[+-]?(?=\s*([,}\]]|$))/gi, "$1 $2");

  // Lone minus signs e.g. "count": - -> 0
  result = result.replace(/:\s*-(?=\s*([,}\]]|$))/g, ": 0");
  result = result.replace(/([,[])\s*-(?=\s*([,}\]]|$))/g, "$1 0");

  // 5. Clean trailing unfulfilled tokens
  // If result ends with a colon e.g. `{"key": `
  if (/:\s*$/.test(result)) {
    result += "null";
  }

  // If result ends with a trailing comma e.g. `[1, 2, ` or `{"a": 1, `
  result = result.replace(/,\s*$/, "");

  // Auto-quote unquoted keys emitted by open-source models e.g. {name: "Alex", count: 10}
  result = result.replace(/([{\\,]\s*)([a-zA-Z_$][a-zA-Z0-9_$-]*)\s*:/g, '$1"$2":');

  // If an object ended with an unfinished key without colon (e.g. `{"key"` or `{"key\"name"`)
  if (stack.length > 0 && stack[stack.length - 1] === "{") {
    const trailingKeyMatch =
      result.match(/,\s*"(?:[^"\\]|\\.)*"$/) ||
      result.match(/\{\s*"(?:[^"\\]|\\.)*"$/);
    if (trailingKeyMatch) {
      const matchStr = trailingKeyMatch[0];
      if (matchStr.startsWith("{")) {
        result = result.slice(0, result.length - matchStr.length + 1); // keep {
      } else {
        result = result.slice(0, result.length - matchStr.length);
      }
    }
  }

  // Re-clean trailing commas
  result = result.replace(/,\s*$/, "").trimEnd();

  // 6. Close all unclosed brackets/braces in reverse order
  while (stack.length > 0) {
    const openChar = stack.pop();
    result = result.replace(/,\s*$/, "").trimEnd();
    if (openChar === "{") {
      result += "}";
    } else if (openChar === "[") {
      result += "]";
    }
  }

  return result;
}

/**
 * Parses a streaming or partial JSON string into a strongly-typed JavaScript object.
 * Safe against incomplete chunks, never crashes, auto-repairs truncated streams.
 *
 * @example
 * ```ts
 * const partial = parseStreamJson<{ name: string; age: number }>('{"name": "Alex", "age": 2');
 * console.log(partial); // { name: "Alex", age: 2 }
 * ```
 */
export function parseStreamJson<T = unknown>(
  input: string,
  options?: ParseOptions
): Partial<T> | null {
  const fallback = (options?.fallback ?? null) as Partial<T> | null;

  if (!input || typeof input !== "string") {
    return fallback;
  }

  const repaired = repairJson(input, {
    stripMarkdown: options?.stripMarkdown ?? true
  });

  if (!repaired) {
    return fallback;
  }

  try {
    return JSON.parse(repaired) as Partial<T>;
  } catch (error) {
    if (options?.strict) {
      throw error;
    }
    return fallback;
  }
}
