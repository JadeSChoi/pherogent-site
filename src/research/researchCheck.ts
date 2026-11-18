/**
 * The client side of the consented Research check (issue #14): building the
 * exact freeform question request, running it against the Worker's
 * /api/check-claim route, and mapping the server's verified result into the
 * research note the author reviews. Nothing in this module sends anything by
 * itself — a request leaves only through runResearchCheck, which the UI
 * calls strictly after the author consents on a preview of outgoingBody.
 */

import { AiRunError, runAiRoute } from "../api/aiRun";
import type { Paper } from "../library/europePmc";
import type { AiLabel, Project } from "../storage/workspace";
import { AI_LABELS, withNotebookUpdate, withSavedSource } from "../storage/workspace";

// The access read and the error class are shared by every consented AI
// surface; re-exported here so this module stays the one import for the
// Research check flow.
export { readCheckAccess, type CheckAccess } from "../api/access";
export { AiRunError as ResearchCheckError };

/** The server's bound on the research question, in characters. */
export const MAX_QUESTION_CHARACTERS = 2000;

/**
 * The exact payload POSTed to /api/check-claim after consent. Exactly these
 * fields: the server rejects unknown fields, and a claim field would turn
 * the run into a bound Evidence check instead of a freeform search.
 */
export type ResearchRequest = {
  requestId: string;
  consent: true;
  question: string;
};

/** Why a check cannot be built from this question, or null when it can.
 * Mirrors the server's own validation so nothing is sent just to fail. */
export function questionBlockedReason(question: string): string | null {
  if (!question.trim()) {
    return "Enter the research question to investigate.";
  }
  if (question.trim().length > MAX_QUESTION_CHARACTERS) {
    return "Keep the question within the 2,000-character check limit.";
  }
  return null;
}

/** The freeform Research check envelope: the trimmed question under a fresh
 * request id so the ledger reserves each run once. */
export function buildResearchRequest(question: string): ResearchRequest {
  return {
    requestId: crypto.randomUUID(),
    consent: true,
    question: question.trim(),
  };
}

/** The exact bytes runResearchCheck sends: what the consent preview shows
 * is this string, not a paraphrase of it. */
export function outgoingBody(request: ResearchRequest): string {
  return JSON.stringify(request, null, 2);
}

/**
 * POSTs the previewed request to /api/check-claim through the shared NDJSON
 * run client. Only outgoingBody(request) crosses the wire.
 */
export function runResearchCheck(
  request: ResearchRequest,
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
    subject: "Research check",
    failureCode: "research_failed",
    fetchImpl,
    signal,
    onStep,
  });
}

/** One evidence card of a research note: the AI's reading of one paper with
 * its server-verified quote. A suggestion awaiting the author, never a
 * decision. */
export type ResearchCard = {
  paperId: string;
  /** The specific claim the card assesses, as the model phrased it. */
  claim: string;
  label: AiLabel;
  /** The exact passage the server verified verbatim in text it fetched. */
  quote: string;
  location: string;
  coverage: string;
  studyType: string;
  population: string;
  mismatchNotes: string[];
  suggestedWording: string | null;
  reason: string;
};

/**
 * One completed Research check as the author reviews it: the AI research
 * note (summary), the evidence cards whose quotes the server verified, and
 * the papers inspected. Nothing in a note is saved anywhere until the
 * author explicitly saves findings or sources.
 */
export type ResearchNote = {
  at: string;
  runId: string | null;
  question: string;
  summary: {
    established: string[];
    uncertain: string[];
    nextQuestions: string[];
  };
  cards: ResearchCard[];
  papers: Paper[];
};

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((item): item is string => typeof item === "string") : [];

const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** The id shapes the Library and the server both resolve. */
const SAFE_ID = /^(?:MED:[1-9][0-9]{0,15}|PMC:PMC[1-9][0-9]{0,15})$/;

/** Only the server's own Europe PMC article links are kept on saved papers. */
function safeUrl(x: unknown): string {
  if (typeof x !== "string") return "";
  try {
    const url = new URL(x);
    return url.protocol === "https:" && url.hostname === "europepmc.org" ? x : "";
  } catch {
    return "";
  }
}

/** A server paper mapped down to the Library's own Paper shape — retrieval
 * fields like sourceText never reach the workspace — or null when its id,
 * title, or link is not one the Library can hold. */
function paperFromResult(x: unknown): Paper | null {
  if (!isRecord(x)) return null;
  if (typeof x.id !== "string" || !SAFE_ID.test(x.id)) return null;
  if (typeof x.title !== "string" || !x.title) return null;
  const url = safeUrl(x.url);
  if (!url) return null;
  return {
    id: x.id,
    source: str(x.source),
    title: x.title,
    authors: strings(x.authors),
    year: typeof x.year === "number" && Number.isFinite(x.year) ? x.year : null,
    journal: str(x.journal),
    doi: str(x.doi),
    pmid: str(x.pmid),
    pmcid: str(x.pmcid),
    url,
    abstract: str(x.abstract),
    openAccess: x.openAccess === true,
  };
}

/**
 * Maps the server's verified result into the note the author reviews.
 * Cards without a server-verified quote or a recognized label are dropped
 * here as well — defense in depth over the server's own discards, never a
 * replacement for them. Nothing is invented for missing fields.
 */
export function researchNoteFromResult(
  request: ResearchRequest,
  result: Record<string, unknown>,
  { runId, at }: { runId: string | null; at: string },
): ResearchNote {
  const cards: ResearchCard[] = [];
  for (const candidate of Array.isArray(result.evidence) ? result.evidence : []) {
    if (!isRecord(candidate)) continue;
    if (candidate.quoteVerified !== true) continue;
    if (typeof candidate.paperId !== "string" || !candidate.paperId) continue;
    // One card per paper, like the server's own discards.
    if (cards.some((card) => card.paperId === candidate.paperId)) continue;
    if (!AI_LABELS.includes(candidate.label as AiLabel)) continue;
    cards.push({
      paperId: candidate.paperId,
      claim: str(candidate.claim),
      label: candidate.label as AiLabel,
      quote: str(candidate.quote),
      location: str(candidate.location),
      coverage: str(candidate.coverage),
      studyType: str(candidate.studyType),
      population: str(candidate.population),
      mismatchNotes: strings(candidate.mismatchNotes),
      suggestedWording:
        typeof candidate.suggestedWording === "string" && candidate.suggestedWording
          ? candidate.suggestedWording
          : null,
      reason: str(candidate.reason),
    });
  }
  const summary = isRecord(result.summary) ? result.summary : {};
  return {
    at,
    runId,
    question: request.question,
    summary: {
      established: strings(summary.established),
      uncertain: strings(summary.uncertain),
      nextQuestions: strings(summary.nextQuestions),
    },
    cards,
    papers: (Array.isArray(result.papers) ? result.papers : [])
      .map(paperFromResult)
      .filter((paper): paper is Paper => paper !== null),
  };
}

/** The cap on the notebook findings field after a save, matching the
 * Notebook's own editing bound. */
const FINDINGS_LIMIT = 20000;

const bulleted = (items: string[]): string =>
  (items.length ? items : ["None recorded by this run."])
    .map((item) => "- " + item)
    .join("\n");

/**
 * The Markdown block "Save findings to notebook" appends: the AI research
 * note labeled as AI suggestions throughout, with the sources inspected and
 * an explicit provenance footer. Never mistakable for the author's own
 * findings.
 */
export function researchFindingsMarkdown(note: ResearchNote): string {
  return [
    `### AI research check: ${note.question}`,
    "Findings suggested by AI",
    bulleted(note.summary.established),
    "Uncertainty & limitations",
    bulleted(note.summary.uncertain),
    "Next questions",
    bulleted(note.summary.nextQuestions),
    "Sources inspected:",
    bulleted(note.papers.map((paper) => `${paper.title} — ${paper.url}`)),
    "AI suggestions saved by the author. Not independently validated; no experiment ran.",
  ].join("\n\n");
}

export type FindingsSaveOutcome = "saved" | "duplicate" | "too_long";

/**
 * The author's explicit save of a note's findings into the Project
 * notebook: appends researchFindingsMarkdown to the findings field.
 * Saving the identical block twice is a no-op duplicate, and an append
 * that would overflow the notebook field changes nothing.
 */
export function withResearchFindingsSaved(
  project: Project,
  note: ResearchNote,
): { project: Project; outcome: FindingsSaveOutcome } {
  const block = researchFindingsMarkdown(note);
  const current = project.notebook?.findings ?? "";
  if (current.includes(block)) return { project, outcome: "duplicate" };
  const findings = current ? current + "\n\n" + block : block;
  if (findings.length > FINDINGS_LIMIT) return { project, outcome: "too_long" };
  return { project: withNotebookUpdate(project, { findings }), outcome: "saved" };
}

/**
 * The author's explicit save of a note's papers into the Project Library
 * as saved sources with a to-read status — never approved citations.
 * Papers already saved keep their reading note and status.
 */
export function withResearchSourcesSaved(
  project: Project,
  note: ResearchNote,
): { project: Project; added: number } {
  let next = project;
  let added = 0;
  for (const paper of note.papers) {
    const saved = withSavedSource(next, paper);
    if (saved !== next) added++;
    next = saved;
  }
  return { project: next, added };
}
