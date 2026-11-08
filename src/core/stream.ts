import { parseStreamJson, ParseOptions } from "./parser";

export interface StreamHealerOptions extends ParseOptions {
  /**
   * Callback fired whenever new valid partial JSON state is resolved.
   */
  onUpdate?: (partial: unknown) => void;
  /**
   * Callback fired if an unrecoverable syntax error occurs in strict mode.
   */
  onError?: (error: Error) => void;
}

/**
 * Stateful streaming controller for incrementally receiving chunks from LLMs.
 */
export class StreamHealer<T = unknown> {
  private buffer = "";
  private lastParsed: Partial<T> | null = null;
  private isCompleted = false;
  private options: StreamHealerOptions;

  constructor(options: StreamHealerOptions = {}) {
    this.options = options;
    this.lastParsed = (options.fallback ?? null) as Partial<T> | null;
  }

  /**
   * Appends an incremental text chunk to the stream and returns the latest repaired partial object.
   */
  public push(chunk: string): Partial<T> | null {
    if (this.isCompleted) {
      return this.lastParsed;
    }

    this.buffer += chunk;
    const parsed = parseStreamJson<T>(this.buffer, this.options);

    if (parsed !== null) {
      this.lastParsed = parsed;
      this.options.onUpdate?.(parsed);
    }

    return this.lastParsed;
  }

  /**
   * Signals that the stream has finished. Returns the final parsed object.
   */
  public finish(): Partial<T> | null {
    this.isCompleted = true;
    return this.lastParsed;
  }

  /**
   * Returns the raw accumulated string buffer so far.
   */
  public getRawBuffer(): string {
    return this.buffer;
  }

  /**
   * Returns the latest successfully repaired partial object.
   */
  public getLatest(): Partial<T> | null {
    return this.lastParsed;
  }

  /**
   * Resets the healer state for a new stream.
   */
  public reset(): void {
    this.buffer = "";
    this.lastParsed = (this.options.fallback ?? null) as Partial<T> | null;
    this.isCompleted = false;
  }
}

/**
 * Creates a stateful StreamHealer instance.
 */
export function createStreamHealer<T = unknown>(options?: StreamHealerOptions): StreamHealer<T> {
  return new StreamHealer<T>(options);
}

/**
 * Web Standard TransformStream compatible with Fetch API response.body.
 *
 * @example
 * ```ts
 * const response = await fetch('/api/llm-stream');
 * const jsonStream = response.body
 *   .pipeThrough(new TextDecoderStream())
 *   .pipeThrough(createHealTransformStream<MySchema>());
 * ```
 */
export function createHealTransformStream<T = unknown>(
  options?: StreamHealerOptions
): TransformStream<string, Partial<T>> {
  const healer = new StreamHealer<T>(options);

  return new TransformStream<string, Partial<T>>({
    transform(chunk, controller) {
      const repaired = healer.push(chunk);
      if (repaired !== null) {
        controller.enqueue(repaired);
      }
    },
    flush(controller) {
      const finalResult = healer.finish();
      if (finalResult !== null) {
        controller.enqueue(finalResult);
      }
    }
  });
}

/**
 * Consumes an AsyncIterable of string chunks (such as from OpenAI SDK, Anthropic, or Ollama)
 * and yields the repaired partial JSON objects in real-time.
 *
 * @example
 * ```ts
 * for await (const user of healAsyncIterable<User>(openaiStream)) {
 *   renderCard(user.name, user.bio);
 * }
 * ```
 */
export async function* healAsyncIterable<T = unknown>(
  stream: AsyncIterable<string>,
  options?: StreamHealerOptions
): AsyncGenerator<Partial<T>, void, unknown> {
  const healer = new StreamHealer<T>(options);

  for await (const chunk of stream) {
    const partial = healer.push(chunk);
    if (partial !== null) {
      yield partial;
    }
  }

  const finalObj = healer.finish();
  if (finalObj !== null) {
    yield finalObj;
  }
}

