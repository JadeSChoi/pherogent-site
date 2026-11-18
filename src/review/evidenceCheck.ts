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
import { AiRunError, runAiRoute } from "../api/aiRun";

// The access read and the error class are shared by every consented AI
// surface now (issue #12); re-exported here so this module stays the one
// import for the Evidence check flow.
export { readCheckAccess, type CheckAccess } from "../api/access";
export { AiRunError as EvidenceCheckError };

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

/**
 * POSTs the previewed request to /api/check-claim through the shared NDJSON
 * run client. Only outgoingBody(request) crosses the wire.
 */
export function runEvidenceCheck(
  request: CheckRequest,
  {
    fetchImpl,
    signal,
    onStep,
  }: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    /** Called with each progress step's detail line as the server reports it. */
    onStep?: (detail: string) => void;
  } = {},
): Promise<{ runId: string | null; result: Record<string, unknown> }> {
  return runAiRoute("/api/check-claim", outgoingBody(request), {
    subject: "AI check",
    failureCode: "check_failed",
    fetchImpl,
    signal,
    onStep,
  });
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

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
