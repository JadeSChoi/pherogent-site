/**
 * The client side of the consented AI Evidence check (issue #10): building
 * the exact outgoing Evidence check request, running it against the
 * Worker's /api/check-claim route, and mapping the server's verified
 * result into the stored EvidenceCheck record. Nothing in this module
 * sends anything by itself — a request leaves only through
 * runEvidenceCheck, which the UI calls strictly after the author consents
 * on a preview of outgoingBody.
 */

import type {
  AiLabel,
  EvidenceCheck,
  EvidenceCheckCard,
  Project,
  ReviewSentence,
  SavedSource,
} from "../storage/workspace";
import { AI_LABELS } from "../storage/workspace";
import { apiFetch } from "../api/ownerKey";

/** The server accepts at most three explicitly selected sources per check. */
export const MAX_CHECK_SOURCES = 3;

/** The server's bound on the checked sentence, in characters. */
const MAX_SENTENCE_CHARACTERS = 2000;

/** The id shapes the server resolves against Europe PMC itself; it never
 * reads paper text from the browser. */
const CITED_ID = /^(?:MED:[1-9][0-9]{0,15}|PMC:PMC[1-9][0-9]{0,15})$/;

/** The exact payload POSTed to /api/check-claim after consent. */
export type CheckRequest = {
  requestId: string;
  consent: true;
  question: string;
  claim: { id: string; text: string };
  citedPaperIds: string[];
  studyDesign: true;
};

export class EvidenceCheckError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EvidenceCheckError";
    this.code = code;
  }
}

/** Saved sources whose ids the server can resolve as cited sources. */
export function checkableSources(project: Project): SavedSource[] {
  return (project.sources ?? []).filter((source) => CITED_ID.test(source.paper.id));
}

/** Why a check cannot be built from this selection, or null when it can.
 * Mirrors the server's own validation so nothing is sent just to fail. */
export function checkBlockedReason(
  sentence: ReviewSentence,
  paperIds: string[],
): string | null {
  if (!paperIds.length) {
    return "Select at least one saved source to check against.";
  }
  if (paperIds.length > MAX_CHECK_SOURCES) {
    return "Select at most three sources per check.";
  }
  if (sentence.text.length > MAX_SENTENCE_CHARACTERS) {
    return "This sentence is longer than the 2,000-character check limit. Split it in the manuscript first.";
  }
  return null;
}

/**
 * The Evidence check envelope for one prepared sentence: the unchanged
 * sentence text as both question and claim (the server route's existing
 * wire contract), the author's selected source ids, and a fresh request
 * id so the ledger reserves each run once.
 */
export function buildCheckRequest(
  sentence: ReviewSentence,
  paperIds: string[],
): CheckRequest {
  return {
    requestId: crypto.randomUUID(),
    consent: true,
    question: sentence.text,
    claim: { id: sentence.id, text: sentence.text },
    citedPaperIds: [...paperIds],
    studyDesign: true,
  };
}

/** The exact bytes runEvidenceCheck sends: what the consent preview shows
 * is this string, not a paraphrase of it. */
export function outgoingBody(request: CheckRequest): string {
  return JSON.stringify(request, null, 2);
}

/** Whether this deployment will accept a run, with the server's message.
 * needsSignIn means the owner access key is the one thing missing;
 * signedIn means the saved key was accepted. */
export type CheckAccess = {
  canRun: boolean;
  message: string;
  needsSignIn: boolean;
  signedIn: boolean;
};

/** Whether the deployment will accept a run right now, with the server's
 * own message. The status call also establishes the visitor session the
 * check route requires, and — through apiFetch — carries the saved owner
 * key, so it doubles as the key's validity check. */
export async function readCheckAccess({
  fetchImpl = apiFetch,
}: { fetchImpl?: typeof fetch } = {}): Promise<CheckAccess> {
  try {
    const response = await fetchImpl("/api/agent/status");
    const status = (await response.json()) as {
      canRun?: boolean;
      message?: string;
      needsSignIn?: boolean;
      signedIn?: boolean;
    };
    return {
      canRun: status.canRun === true,
      message:
        typeof status.message === "string" && status.message
          ? status.message
          : "The AI connection did not report a status message.",
      needsSignIn: status.needsSignIn === true,
      signedIn: status.signedIn === true,
    };
  } catch {
    return {
      canRun: false,
      message: "The AI connection could not be reached. No request was sent.",
      needsSignIn: false,
      signedIn: false,
    };
  }
}

type RunOptions = {
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

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

function codedError(value: unknown, fallback: string): EvidenceCheckError {
  const error = isRecord(value) ? value : {};
  return new EvidenceCheckError(
    typeof error.code === "string" && error.code ? error.code : fallback,
    typeof error.message === "string" && error.message
      ? error.message
      : "The AI check could not finish safely.",
  );
}

/**
 * POSTs the previewed request to /api/check-claim and reads the NDJSON
 * stream incrementally to its terminal result or error event, reporting
 * progress steps as they arrive. Only outgoingBody(request) crosses the
 * wire; a stream that ends without a terminal event is an interruption,
 * never a result.
 */
export async function runEvidenceCheck(
  request: CheckRequest,
  { fetchImpl = apiFetch, signal, onStep }: RunOptions = {},
): Promise<{ runId: string | null; result: Record<string, unknown> }> {
  let response: Response;
  try {
    response = await fetchImpl("/api/check-claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: outgoingBody(request),
      signal,
    });
  } catch {
    throw new EvidenceCheckError(
      "connection_failed",
      "The AI check request could not be sent. Check the connection and try again with a new preview.",
    );
  }
  // A refusal before any run starts arrives as one JSON error object.
  if (!response.ok) {
    let refusal: unknown;
    try {
      refusal = JSON.parse(await response.text());
    } catch {
      throw new EvidenceCheckError(
        "check_failed",
        "The AI check was refused before it started.",
      );
    }
    throw codedError(isRecord(refusal) ? refusal.error : undefined, "check_failed");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new EvidenceCheckError(
      "stream_interrupted",
      "The AI check stream ended before a result arrived. Its allowance may remain reserved; no result was invented.",
    );
  }
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
    if (event.type === "error") throw codedError(event.error, "check_failed");
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
  throw new EvidenceCheckError(
    "stream_interrupted",
    "The AI check stream ended before a result arrived. Its allowance may remain reserved; no result was invented.",
  );
}

const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((item): item is string => typeof item === "string") : [];

const str = (x: unknown): string => (typeof x === "string" ? x : "");

/**
 * Maps the server's verified result into the stored record pair per source:
 * the AI suggestion and the code check. Cards for another claim or without
 * a server-verified quote are dropped here as well — defense in depth over
 * the server's own discards, never a replacement for them.
 */
export function evidenceCheckFromResult(
  request: CheckRequest,
  result: Record<string, unknown>,
  { runId, at }: { runId: string | null; at: string },
): EvidenceCheck {
  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  const cards: EvidenceCheckCard[] = [];
  for (const candidate of evidence) {
    if (!isRecord(candidate)) continue;
    if (candidate.claimId !== request.claim.id) continue;
    if (candidate.quoteVerified !== true) continue;
    if (typeof candidate.paperId !== "string" || !candidate.paperId) continue;
    if (!AI_LABELS.includes(candidate.label as AiLabel)) continue;
    const design = isRecord(candidate.designCheck) ? candidate.designCheck : undefined;
    cards.push({
      paperId: candidate.paperId,
      suggestion: {
        label: candidate.label as AiLabel,
        suggestedWording:
          typeof candidate.suggestedWording === "string" && candidate.suggestedWording
            ? candidate.suggestedWording
            : null,
        reason: str(candidate.reason),
        mismatchNotes: strings(candidate.mismatchNotes),
        studyType: str(candidate.studyType),
        population: str(candidate.population),
      },
      check: {
        quoteVerified: true,
        quote: str(candidate.quote),
        location: str(candidate.location),
        coverage: str(candidate.coverage),
        designAdjusted: design?.adjusted === true,
      },
    });
  }
  const scope = isRecord(result.scope) ? result.scope : {};
  const summary = isRecord(result.summary) ? result.summary : {};
  return {
    at,
    runId,
    sentenceText: request.claim.text,
    citedPaperIds: [...request.citedPaperIds],
    cards,
    unavailablePaperIds: strings(scope.unavailablePaperIds),
    notes: strings(summary.uncertain),
  };
}
