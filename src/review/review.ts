/**
 * The no-AI evidence review loop: preparing Manuscript sentences for
 * review, code-only quote matching against a saved source's text, the
 * author's assessment, and explicit decisions with undo. Every function
 * here is pure and local — no step of this flow makes any network or AI
 * call.
 */

import {
  defaultManuscript,
  type Decision,
  type EvidenceCheck,
  type NeighborTexts,
  type Project,
  type Review,
  type ReviewSentence,
} from "../storage/workspace";

/** One pass opens at most this many undecided sentences: a bound on the
 * pass, not on the document (ADR 0004 forbids small document-level
 * limits). Carried decided sentences ride along for free, so repeated
 * preparation walks the whole Section in batches (ADR 0005). */
export const REVIEW_SENTENCE_LIMIT = 5;

/** Fragments shorter than this are not reviewable sentences. */
const MIN_SENTENCE_LENGTH = 15;

const newSentenceId = () => `sentence-${crypto.randomUUID()}`;

/**
 * The code-only quote match: the pasted passage must appear verbatim in
 * the source text, tolerating only whitespace differences. This checks
 * text, not scientific support.
 */
export function quoteMatches(quote: string, sourceText: string): boolean {
  const collapse = (text: string) => text.trim().replace(/\s+/g, " ");
  const passage = collapse(quote);
  return !!passage && collapse(sourceText).includes(passage);
}

// A lexical convenience only: these terms neither assess support nor
// invoke AI. Ported from the legacy word check.
const STOP_WORDS = new Set(
  (
    "what which who whom whose where when why how whether far take us a an the and or but if then than so as at by for from in into of on onto to with without within through during before after over under between among about is are was were be been being can could may might must should would will do does did has have had it its this that these those they their we our you your i my not no also very more most less much many some such any all each both other show shows showed shown found find suggests suggest suggested suggestive demonstrate demonstrates demonstrated report reports reported study studies result results evidence significantly significant associated association"
  ).split(" "),
);

function keywordTerms(text: string): string[] {
  return [
    ...new Set(
      (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
        (term) =>
          term.length > 1 && !STOP_WORDS.has(term) && !/^[\p{N}]+$/u.test(term),
      ),
    ),
  ];
}

export type KeywordOverlap = {
  /** True when the passage shares few or no keywords with the wording. A
   * word check, not a scientific judgment: synonyms can trigger it and
   * matching words do not prove support. */
  low: boolean;
  shared: string[];
  sentenceTerms: string[];
};

/** Keyword overlap between the wording to approve and the pasted passage. */
export function keywordOverlap(sentence: string, quote: string): KeywordOverlap {
  const sentenceTerms = keywordTerms(sentence);
  const singular = (term: string) =>
    term.length > 4 && term.endsWith("s") && !/(ss|us|is)$/.test(term)
      ? term.slice(0, -1)
      : term;
  const available = new Set(keywordTerms(quote).map(singular));
  const shared = sentenceTerms.filter((term) => available.has(singular(term)));
  const low =
    sentenceTerms.length > 0 &&
    (shared.length === 0 ||
      (sentenceTerms.length >= 5 && shared.length / sentenceTerms.length < 0.2));
  return { low, shared, sentenceTerms };
}

/**
 * Splits section text into reviewable sentences with their offsets.
 * Heading lines (starting with #) are skipped; so are fragments shorter
 * than MIN_SENTENCE_LENGTH. Text splitting only: no scientific assessment.
 */
function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const sentences: { text: string; start: number; end: number }[] = [];
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const line of text.matchAll(/[^\n]+/g)) {
    if (line[0].trim().startsWith("#")) continue;
    for (const part of segmenter.segment(line[0])) {
      const trimmed = part.segment.trim();
      if (trimmed.length < MIN_SENTENCE_LENGTH) continue;
      const start = line.index + part.index + part.segment.indexOf(trimmed);
      sentences.push({ text: trimmed, start, end: start + trimmed.length });
    }
  }
  return sentences;
}

/** The pass prepared for one Section, if any (ADR 0006: at most one). */
export function reviewFor(project: Project, sectionId: string): Review | undefined {
  return project.reviews?.find((pass) => pass.sectionId === sectionId);
}

/** The pass holding one sentence; sentence ids are unique across passes. */
function passWithSentence(project: Project, sentenceId: string): Review | undefined {
  return project.reviews?.find((pass) =>
    pass.sentences.some((sentence) => sentence.id === sentenceId),
  );
}

/** A sentence and its owning pass, addressed by sentence id alone. */
function sentenceLookup(
  project: Project,
  sentenceId: string,
): { pass: Review; sentence: ReviewSentence } | undefined {
  const pass = passWithSentence(project, sentenceId);
  const sentence = pass?.sentences.find((s) => s.id === sentenceId);
  return pass && sentence ? { pass, sentence } : undefined;
}

function sectionOf(project: Project, pass: Review) {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  return manuscript.sections.find((section) => section.id === pass.sectionId);
}

/**
 * A pass is stale once its own Section's text no longer matches what it
 * was prepared from. A stale pass blocks every action on that pass —
 * decisions and working state never apply automatically to changed text —
 * while other Sections' passes stay untouched (ADR 0006).
 */
function isPassStale(project: Project, pass: Review): boolean {
  return sectionOf(project, pass)?.text !== pass.baseText;
}

/** Whether the pass prepared for this Section (if any) is stale. */
export function isReviewStale(project: Project, sectionId: string): boolean {
  const pass = reviewFor(project, sectionId);
  return !!pass && isPassStale(project, pass);
}

/** Replaces one Section's pass in the project's reviews. */
function withPassReplaced(project: Project, pass: Review): Project {
  return {
    ...project,
    reviews: (project.reviews ?? []).map((candidate) =>
      candidate.sectionId === pass.sectionId ? pass : candidate,
    ),
  };
}

export type SentencePatch = Partial<
  Pick<ReviewSentence, "paperId" | "quote" | "assessment" | "revision" | "note">
>;

/** Updates the author's working review state on one undecided sentence. */
export function withSentencePatch(
  project: Project,
  sentenceId: string,
  patch: SentencePatch,
): Project {
  const found = sentenceLookup(project, sentenceId);
  if (!found || isPassStale(project, found.pass)) return project;
  const { pass, sentence } = found;
  if (sentence.decision) return project;
  return withPassReplaced(project, {
    ...pass,
    sentences: pass.sentences.map((candidate) =>
      candidate.id === sentenceId ? { ...candidate, ...patch } : candidate,
    ),
  });
}

/**
 * Records a completed, consented AI Evidence check on one undecided
 * sentence of a current pass, replacing any earlier run. The check is the
 * AI-suggestion and code-check records only; it never touches the author's
 * working state or decision.
 */
export function withEvidenceCheckRecorded(
  project: Project,
  sentenceId: string,
  check: EvidenceCheck,
): Project {
  const found = sentenceLookup(project, sentenceId);
  if (!found || isPassStale(project, found.pass)) return project;
  const { pass, sentence } = found;
  if (sentence.decision) return project;
  return withPassReplaced(project, {
    ...pass,
    sentences: pass.sentences.map((candidate) =>
      candidate.id === sentenceId ? { ...candidate, evidenceCheck: check } : candidate,
    ),
  });
}

/** The wording a decision would approve: the revision when a partial
 * assessment proposes one, otherwise the sentence as it stands. */
export function approvalText(sentence: ReviewSentence): string {
  return sentence.assessment === "partial" && sentence.revision.trim()
    ? sentence.revision.trim()
    : sentence.text;
}

/** The text of the saved source a sentence is reviewed against. */
export function sourceTextFor(project: Project, paperId: string | null): string {
  return (
    project.sources?.find((source) => source.paper.id === paperId)?.paper.abstract ?? ""
  );
}

/**
 * Whether the author's input is complete enough to record a decision:
 * an inspected saved source, an assessment, and — for supports/partial —
 * a quote-matched passage (plus a revision for partial). Completeness
 * only; the decision itself is always a separate, explicit action.
 */
export function canDecide(project: Project, sentence: ReviewSentence): boolean {
  const pass = passWithSentence(project, sentence.id);
  if (!pass || sentence.decision || isPassStale(project, pass)) return false;
  if (sentence.assessment === "unreviewed") return false;
  if (!sentence.paperId || !project.sources?.some((s) => s.paper.id === sentence.paperId)) {
    return false;
  }
  if (sentence.assessment === "supports" || sentence.assessment === "partial") {
    if (!quoteMatches(sentence.quote, sourceTextFor(project, sentence.paperId))) {
      return false;
    }
    if (sentence.assessment === "partial" && !sentence.revision.trim()) return false;
  }
  return true;
}

const neighborsAt = (
  split: { text: string; start: number }[],
  start: number,
): NeighborTexts | null => {
  const at = split.findIndex((sentence) => sentence.start === start);
  if (at === -1) return null;
  return { previous: split[at - 1]?.text ?? null, next: split[at + 1]?.text ?? null };
};

/** The document neighbors of the sentence starting at `start`. */
const documentNeighbors = (sectionText: string, start: number): NeighborTexts | null =>
  neighborsAt(splitSentences(sectionText), start);

const neighborsDiffer = (
  baseline: NeighborTexts,
  current: NeighborTexts | null,
): boolean =>
  current !== null &&
  (baseline.previous !== current.previous || baseline.next !== current.next);

/**
 * Re-evaluates the context-changed note for every decided sentence
 * against its decision-time neighbor snapshot (ADR 0005), so an in-pass
 * wording change — or its undo — moves the note immediately. A decision
 * without a snapshot keeps its stored flag.
 */
function withContextNotesRefreshed(
  sentences: ReviewSentence[],
  sectionText: string,
  exceptId: string,
): ReviewSentence[] {
  const split = splitSentences(sectionText);
  return sentences.map((sentence) => {
    const baseline = sentence.decision?.neighbors;
    if (sentence.id === exceptId || !baseline) return sentence;
    return {
      ...sentence,
      contextChanged: neighborsDiffer(baseline, neighborsAt(split, sentence.start)),
    };
  });
}

/**
 * Replaces one sentence's wording in the section text and the review pass
 * together: the section is spliced at the sentence's offsets, later
 * sentences shift with the change, and baseText moves with the section so
 * the pass stays current.
 */
function withWordingReplaced(
  project: Project,
  pass: Review,
  target: ReviewSentence,
  nextText: string,
  decision: Decision | null,
): Project {
  const changed = nextText !== target.text;
  const delta = nextText.length - (target.end - target.start);
  const manuscript = project.manuscript ?? defaultManuscript(project);
  const section = manuscript.sections.find((s) => s.id === pass.sectionId)!;
  const text = changed
    ? section.text.slice(0, target.start) + nextText + section.text.slice(target.end)
    : section.text;
  const sentences = pass.sentences.map((sentence) => {
    if (sentence.id === target.id) {
      return {
        ...sentence,
        text: nextText,
        end: target.start + nextText.length,
        decision,
        // Deciding or undoing happens with the current context in view,
        // so either clears the context-changed note (ADR 0005).
        contextChanged: false,
      };
    }
    if (changed && sentence.start >= target.end) {
      return { ...sentence, start: sentence.start + delta, end: sentence.end + delta };
    }
    return sentence;
  });
  return {
    ...withPassReplaced(project, {
      ...pass,
      baseText: text,
      sentences: changed ? withContextNotesRefreshed(sentences, text, target.id) : sentences,
    }),
    manuscript: {
      ...manuscript,
      sections: manuscript.sections.map((s) =>
        s.id === section.id ? { ...s, text } : s,
      ),
    },
  };
}

/** Records the author's decision, applying its wording to the section. */
function withDecision(
  project: Project,
  pass: Review,
  target: ReviewSentence,
  outcome: Pick<Decision, "type" | "after" | "paperId" | "lowOverlapAcknowledged">,
): Project {
  const section = sectionOf(project, pass)!;
  const decision: Decision = {
    ...outcome,
    before: target.text,
    assessment: target.assessment,
    quote: target.quote,
    note: target.note,
    at: new Date().toISOString(),
    // The context the author decided in: the baseline the context-changed
    // note compares against (ADR 0005). Captured before any splice; a
    // decision only changes its own sentence, never its neighbors.
    neighbors: documentNeighbors(section.text, target.start),
  };
  return withWordingReplaced(project, pass, target, decision.after, decision);
}

export type DecisionOutcome =
  | "approved"
  | "finding_recorded"
  | "needs_acknowledgment"
  | "blocked";

/**
 * The author's explicit decision from their recorded assessment:
 * supports/partial approve the wording and citation; conflicting/
 * unsupported record a review finding without any citation. Low keyword
 * overlap between the approved wording and the quoted passage demands
 * explicit acknowledgment before an approval is recorded.
 */
export function recordDecision(
  project: Project,
  sentenceId: string,
  options: { acknowledgedLowOverlap?: boolean } = {},
): { project: Project; outcome: DecisionOutcome } {
  const found = sentenceLookup(project, sentenceId);
  if (!found || !canDecide(project, found.sentence)) {
    return { project, outcome: "blocked" };
  }
  const { pass, sentence } = found;
  if (sentence.assessment === "conflicting" || sentence.assessment === "unsupported") {
    return {
      project: withDecision(project, pass, sentence, {
        type: "flag",
        after: sentence.text,
        paperId: null,
        lowOverlapAcknowledged: false,
      }),
      outcome: "finding_recorded",
    };
  }
  const after = approvalText(sentence);
  const overlap = keywordOverlap(after, sentence.quote);
  if (overlap.low && !options.acknowledgedLowOverlap) {
    return { project, outcome: "needs_acknowledgment" };
  }
  return {
    project: withDecision(project, pass, sentence, {
      type: "approve",
      after,
      paperId: sentence.paperId,
      lowOverlapAcknowledged: overlap.low,
    }),
    outcome: "approved",
  };
}

/** Keeps the original wording; the evidence concern stays unresolved. */
export function keepOriginal(project: Project, sentenceId: string): Project {
  const found = sentenceLookup(project, sentenceId);
  if (!found || found.sentence.decision || isPassStale(project, found.pass)) {
    return project;
  }
  const { pass, sentence } = found;
  return withDecision(project, pass, sentence, {
    type: "keep",
    after: sentence.text,
    paperId: null,
    lowOverlapAcknowledged: false,
  });
}

/**
 * Undoes a decision: the sentence's prior wording returns to the section
 * text and the sentence reopens with its working review state intact.
 */
export function undoDecision(project: Project, sentenceId: string): Project {
  const found = sentenceLookup(project, sentenceId);
  const decision = found?.sentence.decision;
  if (!found || !decision || isPassStale(project, found.pass)) return project;
  return withWordingReplaced(project, found.pass, found.sentence, decision.before, null);
}

export type PrepareOutcome = "prepared" | "no_sentences" | "no_section";

const countByText = (texts: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
  return counts;
};

/**
 * Prepares one Section's sentences for review. A byte-identical, uniquely
 * matched sentence carries everything over, including its decision; the
 * pass then opens the next REVIEW_SENTENCE_LIMIT undecided sentences in
 * document order, so repeated preparation walks the whole Section (ADR
 * 0005). Changed, removed, or duplicated-text sentences still reset:
 * decisions never carry over to changed text.
 */
export function withReviewPrepared(
  project: Project,
  sectionId: string,
): { project: Project; outcome: PrepareOutcome } {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  const section = manuscript.sections.find((candidate) => candidate.id === sectionId);
  if (!section) return { project, outcome: "no_section" };
  const found = splitSentences(section.text);
  if (!found.length) return { project, outcome: "no_sentences" };
  const previous = reviewFor(project, sectionId)?.sentences ?? [];
  const foundCounts = countByText(found.map((candidate) => candidate.text));
  const previousCounts = countByText(previous.map((sentence) => sentence.text));
  const sentences: ReviewSentence[] = [];
  let undecided = 0;
  for (let at = 0; at < found.length; at++) {
    const candidate = found[at];
    // Unique on both sides, or no carry: attaching a decision to the
    // wrong duplicate would be worse than losing it (ADR 0005).
    const unique =
      foundCounts.get(candidate.text) === 1 && previousCounts.get(candidate.text) === 1;
    const prior = unique
      ? previous.find((sentence) => sentence.text === candidate.text)
      : undefined;
    const decision = prior?.decision ?? null;
    if (!decision) {
      if (undecided === REVIEW_SENTENCE_LIMIT) continue;
      undecided++;
    }
    sentences.push({
      id: prior?.id ?? newSentenceId(),
      text: candidate.text,
      start: candidate.start,
      end: candidate.end,
      paperId: prior?.paperId ?? null,
      quote: prior?.quote ?? "",
      assessment: prior?.assessment ?? "unreviewed",
      revision: prior?.revision ?? "",
      note: prior?.note ?? "",
      evidenceCheck: prior?.evidenceCheck ?? null,
      decision,
      // The note compares today's document neighbors against the ones
      // snapshotted when the decision was made (ADR 0005); a legacy
      // decision without a snapshot keeps its stored flag.
      contextChanged: decision
        ? decision.neighbors
          ? neighborsDiffer(decision.neighbors, {
              previous: found[at - 1]?.text ?? null,
              next: found[at + 1]?.text ?? null,
            })
          : prior!.contextChanged
        : false,
    });
  }
  const pass: Review = { sectionId, baseText: section.text, sentences };
  // Only this Section's pass is replaced; every other Section keeps its
  // pass and decisions untouched (ADR 0006).
  const others = (project.reviews ?? []).filter(
    (candidate) => candidate.sectionId !== sectionId,
  );
  return { project: { ...project, reviews: [...others, pass] }, outcome: "prepared" };
}
