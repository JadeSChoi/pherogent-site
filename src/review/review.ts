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
  type Project,
  type Review,
  type ReviewSentence,
} from "../storage/workspace";

/** One pass reviews at most this many sentences: a bound on the pass, not
 * on the document (ADR 0004 forbids small document-level limits). */
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
      if (sentences.length === REVIEW_SENTENCE_LIMIT) return sentences;
    }
  }
  return sentences;
}

/** The Section the review pass was prepared from, if it still exists. */
function reviewSection(project: Project) {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  return manuscript.sections.find((section) => section.id === project.review?.sectionId);
}

/**
 * A pass is stale once the section text no longer matches what it was
 * prepared from. A stale pass blocks every review action: previous
 * decisions and working state never apply automatically to changed text.
 */
export function isReviewStale(project: Project): boolean {
  if (!project.review) return false;
  return reviewSection(project)?.text !== project.review.baseText;
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
  const review = project.review;
  if (!review || isReviewStale(project)) return project;
  const sentence = review.sentences.find((candidate) => candidate.id === sentenceId);
  if (!sentence || sentence.decision) return project;
  return {
    ...project,
    review: {
      ...review,
      sentences: review.sentences.map((candidate) =>
        candidate.id === sentenceId ? { ...candidate, ...patch } : candidate,
      ),
    },
  };
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
  if (sentence.decision || isReviewStale(project)) return false;
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

/**
 * Replaces one sentence's wording in the section text and the review pass
 * together: the section is spliced at the sentence's offsets, later
 * sentences shift with the change, and baseText moves with the section so
 * the pass stays current.
 */
function withWordingReplaced(
  project: Project,
  target: ReviewSentence,
  nextText: string,
  decision: Decision | null,
): Project {
  const review = project.review!;
  const changed = nextText !== target.text;
  const delta = nextText.length - (target.end - target.start);
  const manuscript = project.manuscript ?? defaultManuscript(project);
  const section = manuscript.sections.find((s) => s.id === review.sectionId)!;
  const text = changed
    ? section.text.slice(0, target.start) + nextText + section.text.slice(target.end)
    : section.text;
  const sentences = review.sentences.map((sentence) => {
    if (sentence.id === target.id) {
      return { ...sentence, text: nextText, end: target.start + nextText.length, decision };
    }
    if (changed && sentence.start >= target.end) {
      return { ...sentence, start: sentence.start + delta, end: sentence.end + delta };
    }
    return sentence;
  });
  return {
    ...project,
    manuscript: {
      ...manuscript,
      sections: manuscript.sections.map((s) =>
        s.id === section.id ? { ...s, text } : s,
      ),
    },
    review: { ...review, baseText: text, sentences },
  };
}

/** Records the author's decision, applying its wording to the section. */
function withDecision(
  project: Project,
  target: ReviewSentence,
  outcome: Pick<Decision, "type" | "after" | "paperId" | "lowOverlapAcknowledged">,
): Project {
  const decision: Decision = {
    ...outcome,
    before: target.text,
    assessment: target.assessment,
    quote: target.quote,
    note: target.note,
    at: new Date().toISOString(),
  };
  return withWordingReplaced(project, target, decision.after, decision);
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
  const sentence = project.review?.sentences.find((s) => s.id === sentenceId);
  if (!sentence || !canDecide(project, sentence)) {
    return { project, outcome: "blocked" };
  }
  if (sentence.assessment === "conflicting" || sentence.assessment === "unsupported") {
    return {
      project: withDecision(project, sentence, {
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
    project: withDecision(project, sentence, {
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
  const sentence = project.review?.sentences.find((s) => s.id === sentenceId);
  if (!sentence || sentence.decision || isReviewStale(project)) return project;
  return withDecision(project, sentence, {
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
  const sentence = project.review?.sentences.find((s) => s.id === sentenceId);
  const decision = sentence?.decision;
  if (!sentence || !decision || isReviewStale(project)) return project;
  return withWordingReplaced(project, sentence, decision.before, null);
}

export type PrepareOutcome = "prepared" | "no_sentences" | "no_section";

/**
 * Prepares one Section's sentences for review, replacing any existing
 * pass. Decisions never carry over — a new pass starts undecided.
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
  const previous = project.review?.sectionId === sectionId ? project.review.sentences : [];
  const used = new Set<string>();
  const sentences: ReviewSentence[] = found.map((candidate) => {
    // An unchanged sentence keeps its identity and, when still undecided,
    // its working review state. A decision never carries over: a new pass
    // starts undecided.
    const matches = previous.filter((p) => p.text === candidate.text && !used.has(p.id));
    const prior = matches.length === 1 ? matches[0] : null;
    if (prior) used.add(prior.id);
    const working = prior && !prior.decision ? prior : null;
    return {
      id: prior?.id ?? newSentenceId(),
      text: candidate.text,
      start: candidate.start,
      end: candidate.end,
      paperId: working?.paperId ?? null,
      quote: working?.quote ?? "",
      assessment: working?.assessment ?? "unreviewed",
      revision: working?.revision ?? "",
      note: working?.note ?? "",
      decision: null,
    };
  });
  const review: Review = { sectionId, baseText: section.text, sentences };
  return { project: { ...project, review }, outcome: "prepared" };
}
