/**
 * The integrity layer over Evidence checks (issue #11): source
 * fingerprinting, the needs-rechecking state of a recorded check, reopening
 * an unchanged logged run, and the evidence-trail Markdown export. Every
 * function here is pure and local — nothing in this module makes a network
 * or model call, and nothing here decides or approves anything.
 */

import type { Paper } from "../library/europePmc";
import type {
  AiLabel,
  EvidenceCheck,
  EvidenceRun,
  Project,
  ReviewSentence,
} from "../storage/workspace";

/**
 * The fingerprint of a saved source's paper record: its text and metadata,
 * not the author's reading note or status — those are reading state, and
 * changing them does not invalidate a check.
 */
export function sourceFingerprint(paper: Paper): string {
  return JSON.stringify([
    paper.id,
    paper.source,
    paper.title,
    paper.authors,
    paper.year,
    paper.journal,
    paper.doi,
    paper.pmid,
    paper.pmcid,
    paper.url,
    paper.abstract,
    paper.openAccess,
  ]);
}

/** The saved source's paper record for one cited id, if the Library holds it. */
function savedPaper(project: Project, paperId: string): Paper | undefined {
  return project.sources?.find((source) => source.paper.id === paperId)?.paper;
}

/** Whether a stored check and a logged run are the same recorded run. */
export function sameRun(check: EvidenceCheck, other: EvidenceCheck): boolean {
  return (
    check.runId === other.runId &&
    check.at === other.at &&
    check.sentenceText === other.sentenceText
  );
}

/** Whether a recorded check still describes what it checked, with the
 * reason. Not fresh means needs rechecking — a text-level integrity state,
 * never a scientific judgment. */
export type CheckFreshness = {
  fresh: boolean;
  reason: string;
};

/**
 * The needs-rechecking state of the check recorded on one prepared
 * sentence (issue #11): the check needs rechecking once the sentence's
 * text no longer matches what was checked — unless the author's own
 * decision approved a revision of exactly the checked wording — and once
 * any cited saved source's text or metadata changed, or the source left
 * the Library. Null when the sentence carries no check.
 */
export function checkFreshness(
  project: Project,
  sentence: ReviewSentence,
): CheckFreshness | null {
  const check = sentence.evidenceCheck;
  if (!check) return null;
  const approvedRevision =
    sentence.decision !== null &&
    sentence.decision.before === check.sentenceText &&
    sentence.decision.after === sentence.text;
  if (sentence.text !== check.sentenceText && !approvedRevision) {
    return {
      fresh: false,
      reason:
        "The sentence changed after this check; its records describe the earlier wording.",
    };
  }
  const sourceReason = sourceRecheckReason(project, check);
  if (sourceReason) return { fresh: false, reason: sourceReason };
  return {
    fresh: true,
    reason: approvedRevision
      ? "You approved a revision after this check; its records describe the wording it checked."
      : "The sentence and its checked sources are unchanged since this run.",
  };
}

/** Why a check's cited sources mean it needs rechecking — a source no
 * longer matching its recorded fingerprint — or null while every one is
 * unchanged. */
function sourceRecheckReason(project: Project, check: EvidenceCheck): string | null {
  if (!check.sourceSnapshots) {
    return "This check was recorded before source-change tracking, so its sources cannot be confirmed unchanged.";
  }
  for (const id of check.citedPaperIds) {
    const paper = savedPaper(project, id);
    if (!paper) return `A checked source (${id}) is no longer in the Library.`;
    if (sourceFingerprint(paper) !== check.sourceSnapshots[id]) {
      return `A checked source's text or metadata changed after this check (${id}).`;
    }
  }
  return null;
}

/**
 * The latest logged run that still answers for this sentence and source
 * selection (issue #11): same sentence text, same cited sources, and every
 * cited source unchanged since the run. Reopening it re-attaches a record —
 * no model call is made and nothing is spent. Null when no logged run
 * matches.
 */
export function reopenableCheck(
  project: Project,
  sentence: ReviewSentence,
  selectedPaperIds: string[],
): EvidenceCheck | null {
  const wanted = JSON.stringify([...selectedPaperIds].sort());
  for (const run of [...(project.evidenceRuns ?? [])].reverse()) {
    if (run.sentenceText !== sentence.text) continue;
    if (JSON.stringify([...run.citedPaperIds].sort()) !== wanted) continue;
    const { sectionId: _sectionId, sentenceId: _sentenceId, ...check } = run;
    if (sourceRecheckReason(project, check)) continue;
    return check;
  }
  return null;
}

/** Fingerprints of the cited saved sources as the Library holds them now;
 * a source missing from the Library has no entry. */
export function snapshotSources(
  project: Project,
  citedPaperIds: string[],
): Record<string, string> {
  const snapshots: Record<string, string> = {};
  for (const id of citedPaperIds) {
    const paper = savedPaper(project, id);
    if (paper) snapshots[id] = sourceFingerprint(paper);
  }
  return snapshots;
}

const AI_LABEL_TEXT: Record<AiLabel, string> = {
  supports: "Supports",
  partial: "Partly supports",
  unsupported: "Not established",
  contradicts: "Contradicts",
};

/** The run's attached sentence: the prepared sentence whose current check
 * is this run, if any pass still carries it. */
function attachedSentence(
  project: Project,
  run: EvidenceRun,
): { sentence: ReviewSentence; sectionId: string; passStale: boolean } | null {
  for (const pass of project.reviews ?? []) {
    const sentence = pass.sentences.find(
      (candidate) => candidate.evidenceCheck && sameRun(candidate.evidenceCheck, run),
    );
    if (!sentence) continue;
    const section = project.manuscript?.sections.find(
      (candidate) => candidate.id === pass.sectionId,
    );
    return {
      sentence,
      sectionId: pass.sectionId,
      passStale: section?.text !== pass.baseText,
    };
  }
  return null;
}

/** The status and author-decision lines of one logged run. */
function runStanding(project: Project, run: EvidenceRun): string[] {
  const attached = attachedSentence(project, run);
  if (!attached) {
    return [
      "Status: Needs rechecking — no current prepared sentence carries this run: the sentence changed, its Section was re-prepared, or a later run replaced it.",
    ];
  }
  if (attached.passStale) {
    return [
      "Status: Needs rechecking — the Section's text changed after this check; prepare its sentences again.",
    ];
  }
  const freshness = checkFreshness(project, attached.sentence);
  if (!freshness || !freshness.fresh) {
    return [
      `Status: Needs rechecking — ${freshness?.reason ?? "the check is no longer attached."}`,
    ];
  }
  const decision = attached.sentence.decision;
  const decisionLine = !decision
    ? "Author decision: Awaiting the author's decision."
    : decision.type === "approve"
      ? `Author decision: Approved by author at ${decision.at}` +
        (decision.before !== decision.after
          ? " — a revised wording and its citation."
          : " — the citation for the unchanged wording."
        )
      : decision.type === "keep"
        ? `Author decision: Original wording kept at ${decision.at}; the evidence concern stays unresolved.`
        : `Author decision: Review finding recorded at ${decision.at}; no citation was inserted.`;
  return [`Status: Current — ${freshness.reason}`, decisionLine];
}

/** The per-source outcome lines of one logged run: every selected source
 * is accounted for — matched, not retrieved, or checked without a
 * surviving card. */
function sourceOutcomeLines(project: Project, run: EvidenceRun): string[] {
  return run.citedPaperIds.map((id) => {
    const title = savedPaper(project, id)?.title;
    const name = title ? `${id} (${title})` : id;
    const card = run.cards.find((candidate) => candidate.paperId === id);
    if (card) {
      return (
        `- ${name} — Quote matched in source. AI suggested: ${AI_LABEL_TEXT[card.suggestion.label]}.` +
        (card.check.designAdjusted
          ? " The study-design rule overrode the model's label."
          : "")
      );
    }
    if (run.unavailablePaperIds.includes(id)) {
      return `- ${name} — Not retrieved; nothing was substituted.`;
    }
    return `- ${name} — No evidence card survived the server's checks; the sentence was not assessed against this source.`;
  });
}

/** One logged run as a Markdown block: provenance, standing, per-source
 * outcomes, and the recorded cards. */
function runMarkdown(project: Project, run: EvidenceRun): string {
  const cards = run.cards.map((card) =>
    [
      `### ${card.paperId} — ${AI_LABEL_TEXT[card.suggestion.label]} (AI suggestion)`,
      `> ${card.check.quote}`,
      `Verified verbatim by the server in ${card.check.location}. ${card.check.coverage}`,
      `Reason: ${card.suggestion.reason}`,
      ...(card.suggestion.suggestedWording
        ? [`Suggested wording: ${card.suggestion.suggestedWording}`]
        : []),
      ...card.suggestion.mismatchNotes.map((note) => `Mismatch note: ${note}`),
    ].join("\n\n"),
  );
  return [
    `## Run ${run.runId ?? "(no run id reported)"} · ${run.at}`,
    `Sentence checked: ${run.sentenceText}`,
    ...runStanding(project, run),
    ["Source outcomes:", ...sourceOutcomeLines(project, run)].join("\n"),
    ...cards,
    ...run.notes.map((note) => `Note: ${note}`),
  ].join("\n\n");
}

/**
 * The evidence-trail Markdown export (issue #11): every consented Evidence
 * check run ever recorded in this Project, in order, with its provenance
 * (run id, time, the exact sentence sent), its per-source outcomes, and
 * whether it is current or needs rechecking. The trail reports; it never
 * validates — an AI suggestion stays an unverified suggestion here too.
 */
export function evidenceTrailMarkdown(project: Project): string {
  const header = [
    `# Evidence trail — ${project.name}`,
    "AI suggestions require author review. A quote match is a text check, not scientific validation. Checks cover only the recorded sentence and the selected sources.",
  ].join("\n\n");
  const runs = project.evidenceRuns ?? [];
  if (!runs.length) {
    return `${header}\n\nNo consented Evidence check runs are recorded.\n`;
  }
  return (
    [header, ...runs.map((run) => runMarkdown(project, run))].join("\n\n") + "\n"
  );
}
