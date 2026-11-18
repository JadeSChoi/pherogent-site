/**
 * The one NDJSON run client for the Worker's paid AI routes (/api/check-claim,
 * /api/agent/chat). Both routes share the same stream shape — start, step,
 * usage, then one terminal result or error event — so both consented surfaces
 * share this reader. Nothing here builds or sends content by itself: callers
 * pass the exact previewed body, and only that string crosses the wire.
 */

import { apiFetch } from "./ownerKey";

export class AiRunError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AiRunError";
    this.code = code;
  }
}

type RunOptions = {
  /** Names the run in error copy, e.g. "AI check" or "AI reply". */
  subject: string;
  /** The error code when a refusal or error event carries none. */
  failureCode: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Called with each progress step's detail line as the server reports it. */
  onStep?: (detail: string) => void;
};

type StreamEvent = {
  type?: string;
  runId?: string;
  step?: { detail?: string };
  result?: Record<string, unknown>;
  error?: { code?: string; message?: string };
};

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

function codedError(value: unknown, fallback: string, subject: string): AiRunError {
  const error = isRecord(value) ? value : {};
  return new AiRunError(
    typeof error.code === "string" && error.code ? error.code : fallback,
    typeof error.message === "string" && error.message
      ? error.message
      : `The ${subject} could not finish safely.`,
  );
}

/**
 * POSTs the previewed body to the route and reads the NDJSON stream
 * incrementally to its terminal result or error event, reporting progress
 * steps as they arrive. A stream that ends without a terminal event is an
 * interruption, never a result.
 */
export async function runAiRoute(
  path: string,
  body: string,
  { subject, failureCode, fetchImpl = apiFetch, signal, onStep }: RunOptions,
): Promise<{ runId: string | null; result: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal,
    });
  } catch {
    throw new AiRunError(
      "connection_failed",
      `The ${subject} request could not be sent. Check the connection and try again with a new preview.`,
    );
  }
  // A refusal before any run starts arrives as one JSON error object.
  if (!response.ok) {
    let refusal: unknown;
    try {
      refusal = JSON.parse(await response.text());
    } catch {
      throw new AiRunError(failureCode, `The ${subject} was refused before it started.`);
    }
    throw codedError(isRecord(refusal) ? refusal.error : undefined, failureCode, subject);
  }
  const interrupted = () =>
    new AiRunError(
      "stream_interrupted",
      `The ${subject} stream ended before a result arrived. Its allowance may remain reserved; no result was invented.`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw interrupted();
  const decoder = new TextDecoder();
  let buffer = "";
  let runId: string | null = null;
  const handle = (line: string): { result: Record<string, unknown> } | undefined => {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      return;
    }
    if (event.type === "start" && typeof event.runId === "string") runId = event.runId;
    if (event.type === "step" && typeof event.step?.detail === "string") {
      onStep?.(event.step.detail);
    }
    if (event.type === "result" && isRecord(event.result)) return { result: event.result };
    if (event.type === "error") throw codedError(event.error, failureCode, subject);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const terminal = handle(line);
        if (terminal) return { runId, result: terminal.result };
      }
      if (done) break;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  throw interrupted();
}
