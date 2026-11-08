import { useState, useRef, useCallback, useEffect } from "react";
import { StreamHealer, StreamHealerOptions } from "../core/stream";

export interface UseStreamingJsonOptions<T> extends StreamHealerOptions {
  /**
   * Throttle UI re-renders in milliseconds to prevent React frame drops
   * during ultra-fast LLM streams (e.g., Groq, Cerebras).
   * Set to 0 to disable throttling.
   * @default 30
   */
  throttleMs?: number;

  /**
   * Initial data before the stream begins.
   */
  initialData?: Partial<T> | null;

  /**
   * Callback fired when stream finishes.
   */
  onComplete?: (finalData: Partial<T> | null) => void;
}

export interface UseStreamingJsonReturn<T> {
  /**
   * The current repaired, valid partial JSON object.
   */
  data: Partial<T> | null;

  /**
   * True if a stream is actively in progress.
   */
  isLoading: boolean;

  /**
   * True if the stream has cleanly completed.
   */
  isComplete: boolean;

  /**
   * Any stream error encountered.
   */
  error: Error | null;

  /**
   * The full unparsed raw text buffer accumulated so far.
   */
  rawText: string;

  /**
   * Manually push an incoming chunk into the stream.
   */
  feed: (chunk: string) => void;

  /**
   * Pipe an async iterable (e.g. OpenAI stream) directly into the hook.
   */
  pipe: (stream: AsyncIterable<string> | ReadableStream<Uint8Array | string>) => Promise<void>;

  /**
   * Manually signal that the stream has finished.
   */
  finish: () => void;

  /**
   * Resets the hook to its initial idle state.
   */
  reset: () => void;
}

/**
 * React hook for consuming streaming LLM JSON responses with zero-lag UI updates and auto-healing.
 *
 * @example
 * ```tsx
 * const { data, isLoading, pipe } = useStreamingJson<UserForm>();
 *
 * const handleSubmit = async () => {
 *   const response = await fetch('/api/ai');
 *   pipe(response.body!);
 * };
 *
 * return (
 *   <div>
 *     <h2>{data?.name || "Generating..."}</h2>
 *     <p>{data?.bio}</p>
 *   </div>
 * );
 * ```
 */
export function useStreamingJson<T = unknown>(
  options: UseStreamingJsonOptions<T> = {}
): UseStreamingJsonReturn<T> {
  const {
    throttleMs = 30,
    initialData = null,
    onComplete,
    onUpdate,
    onError,
    ...parserOptions
  } = options;

  const [data, setData] = useState<Partial<T> | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [rawText, setRawText] = useState("");

  const healerRef = useRef<StreamHealer<T> | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDataRef = useRef<Partial<T> | null>(initialData);

  // Initialize or re-create healer instance
  if (!healerRef.current) {
    healerRef.current = new StreamHealer<T>({
      ...parserOptions,
      onUpdate: (partial) => {
        onUpdate?.(partial);
      },
      onError: (err) => {
        setError(err);
        onError?.(err);
      }
    });
  }

  // Clean up pending timeouts on unmount
  useEffect(() => {
    return () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
      }
    };
  }, []);

  const scheduleRender = useCallback(
    (nextData: Partial<T> | null, raw: string) => {
      latestDataRef.current = nextData;
      setRawText(raw);

      if (throttleMs <= 0) {
        setData(nextData);
        return;
      }

      const now = performance.now();
      const timeSinceLast = now - lastRenderTimeRef.current;

      if (timeSinceLast >= throttleMs) {
        lastRenderTimeRef.current = now;
        setData(nextData);
      } else if (!pendingUpdateRef.current) {
        pendingUpdateRef.current = setTimeout(() => {
          lastRenderTimeRef.current = performance.now();
          setData(latestDataRef.current);
          pendingUpdateRef.current = null;
        }, throttleMs - timeSinceLast);
      }
    },
    [throttleMs]
  );

  const feed = useCallback(
    (chunk: string) => {
      if (!healerRef.current) return;
      setIsLoading(true);
      const repaired = healerRef.current.push(chunk);
      scheduleRender(repaired, healerRef.current.getRawBuffer());
    },
    [scheduleRender]
  );

  const finish = useCallback(() => {
    if (!healerRef.current) return;
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }

    const finalResult = healerRef.current.finish();
    setData(finalResult);
    setRawText(healerRef.current.getRawBuffer());
    setIsLoading(false);
    setIsComplete(true);
    onComplete?.(finalResult);
  }, [onComplete]);

  const reset = useCallback(() => {
    if (pendingUpdateRef.current) {
      clearTimeout(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
    healerRef.current?.reset();
    setData(initialData);
    setRawText("");
    setIsLoading(false);
    setIsComplete(false);
    setError(null);
  }, [initialData]);

  const pipe = useCallback(
    async (stream: AsyncIterable<string> | ReadableStream<Uint8Array | string>) => {
      reset();
      setIsLoading(true);

      try {
        if ("getReader" in stream) {
          // It's a Web ReadableStream
          const reader = (stream as ReadableStream).getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const textChunk = typeof value === "string" ? value : decoder.decode(value, { stream: true });
            feed(textChunk);
          }
        } else {
          // It's an AsyncIterable
          for await (const chunk of stream as AsyncIterable<string>) {
            feed(chunk);
          }
        }
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        onError?.(errorObj);
      } finally {
        finish();
      }
    },
    [feed, finish, reset, onError]
  );

  return {
    data,
    isLoading,
    isComplete,
    error,
    rawText,
    feed,
    pipe,
    finish,
    reset
  };
}

