import { useState } from "react";
import { Button, Dialog, Select, TextArea } from "../ui";
import {
  defaultManuscript,
  type DecisionType,
  type Project,
  type ReviewSentence,
} from "../storage/workspace";
import {
  approvalText,
  canDecide,
  isReviewStale,
  keepOriginal,
  keywordOverlap,
  quoteMatches,
  recordDecision,
  reviewFor,
  sourceTextFor,
  undoDecision,
  withSentencePatch,
} from "./review";
import "./review.css";

type ReviewMarginProps = {
  project: Project;
  onProjectChange: (next: Project) => void;
  /** The sentence whose note is open for review; owned by the page. */
  selectedId?: string;
};

const ASSESSMENT_LABELS = [
  ["unreviewed", "Not yet assessed"],
  ["supports", "Supports this wording"],
  ["partial", "Needs narrower wording"],
  ["conflicting", "Conflicts with this sentence"],
  ["unsupported", "Cannot verify from this source"],
] as const;

const decideLabel = (sentence: ReviewSentence): string =>
  sentence.assessment === "supports"
    ? "Approve citation"
    : sentence.assessment === "partial"
      ? "Apply wording + citation"
      : sentence.assessment === "unreviewed"
        ? "Record your decision"
        : "Save review finding";

/** All copy and evidence-state color for each decision type, in one place.
 * State maps to the evidence colors: ok / warn / bad only (ADR 0003). */
const DECISION_COPY: Record<
  DecisionType,
  {
    state: "ok" | "warn" | "bad";
    note: string;
    heading: string;
    detail: (revised: boolean) => string;
  }
> = {
  approve: {
    state: "ok",
    note: "Approved",
    heading: "Approved by author",
    detail: (revised) =>
      revised
        ? "You approved revised wording and its citation."
        : "You approved this citation. The original wording is unchanged.",
  },
  keep: {
    state: "warn",
    note: "Original kept",
    heading: "Original wording kept",
    detail: () => "Your wording remains. The evidence concern is unresolved.",
  },
  flag: {
    state: "bad",
    note: "Concern recorded",
    heading: "Review finding recorded",
    detail: () => "This sentence stays unresolved; no citation was inserted.",
  },
};

function DecisionNote({
  sentence,
  onUndo,
}: {
  sentence: ReviewSentence;
  onUndo: () => void;
}) {
  const decision = sentence.decision!;
  const copy = DECISION_COPY[decision.type];
  return (
    <div className={`review-decision review-decision-${copy.state}`} role="status">
      <p className="review-decision-heading">{copy.heading}</p>
      <p className="review-decision-detail">
        {copy.detail(decision.before !== decision.after)}
        {decision.lowOverlapAcknowledged &&
          " You acknowledged a low keyword overlap warning."}
      </p>
      {sentence.contextChanged && (
        <p className="review-context-note">
          Context changed since this decision — re-read the surrounding
          wording before relying on it. Nothing is reset.
        </p>
      )}
      <Button onClick={onUndo}>Undo decision</Button>
    </div>
  );
}

/**
 * The evidence margin beside the proof-sheet: one note per decided
 * sentence, and the full author-led review controls for the selected
 * undecided sentence. The whole #9 flow lives here — no step of it makes
 * any network or AI call, and nothing is approved until the author
 * approves it.
 */
export function ReviewMargin({
  project,
  onProjectChange,
  selectedId,
}: ReviewMarginProps) {
  const [acknowledging, setAcknowledging] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const sections = (project.manuscript ?? defaultManuscript(project)).sections;
  const sources = project.sources ?? [];

  const decide = (sentenceId: string, acknowledgedLowOverlap = false) => {
    const result = recordDecision(project, sentenceId, { acknowledgedLowOverlap });
    if (result.outcome === "needs_acknowledgment") {
      setAcknowledging(sentenceId);
      return;
    }
    setAcknowledging(undefined);
    if (result.outcome === "blocked") {
      // Only the acknowledgment confirm can land here: the sentence or
      // evidence changed under the open dialog.
      if (acknowledgedLowOverlap) {
        setNotice("The sentence or evidence changed. Review it again before deciding.");
      }
      return;
    }
    setNotice(undefined);
    onProjectChange(result.project);
  };

  const passes = sections
    .map((section, index) => ({
      section,
      label: section.heading || `Section ${index + 1}`,
      pass: reviewFor(project, section.id),
      stale: isReviewStale(project, section.id),
    }))
    .filter((entry) => entry.pass && !entry.stale);

  const allSentences = passes.flatMap((entry) => entry.pass!.sentences);
  const acknowledgingSentence = allSentences.find((s) => s.id === acknowledging);
  const acknowledgingOverlap = acknowledgingSentence
    ? keywordOverlap(approvalText(acknowledgingSentence), acknowledgingSentence.quote)
    : undefined;

  return (
    <div className="review-margin">
      <p className="review-margin-hint">
        Quote matching and keyword overlap are plain text checks — no AI runs
        here, and nothing is approved until you approve it.
      </p>
      {notice && (
        <p className="review-notice" role="status">
          {notice}
        </p>
      )}
      {passes.length === 0 && (
        <p className="review-margin-hint">
          Prepare a section&rsquo;s sentences to review them against your
          saved sources here.
        </p>
      )}
      {passes.map((entry) => (
        <div key={entry.section.id} className="review-margin-group">
          {passes.length > 1 && (
            <p className="review-margin-label">{entry.label}</p>
          )}
          {entry.pass!.sentences.map((sentence) => {
            if (sentence.decision) {
              return (
                <DecisionNote
                  key={sentence.id}
                  sentence={sentence}
                  onUndo={() => onProjectChange(undoDecision(project, sentence.id))}
                />
              );
            }
            if (sentence.id !== selectedId) return null;
            return (
              <SentenceEditor
                key={sentence.id}
                project={project}
                sentence={sentence}
                sources={sources}
                onProjectChange={onProjectChange}
                onDecide={() => decide(sentence.id)}
              />
            );
          })}
        </div>
      ))}

      <Dialog
        open={acknowledging !== undefined}
        onClose={() => setAcknowledging(undefined)}
        title="Check this passage before approving"
      >
        {acknowledgingSentence && acknowledgingOverlap && (
          <div className="review-ack">
            <p>
              <strong>Low keyword overlap:</strong>{" "}
              {acknowledgingOverlap.shared.length} of{" "}
              {acknowledgingOverlap.sentenceTerms.length} sentence keywords
              appear in the passage. This is a word check, not a scientific
              judgment.
            </p>
            <p className="review-ack-sentence">
              {approvalText(acknowledgingSentence)}
            </p>
            <blockquote className="review-source-text">
              {acknowledgingSentence.quote}
            </blockquote>
            <p>
              Synonyms can cause false warnings, and matching words do not
              establish support. Inspect the context before deciding.
            </p>
            <div className="review-actions">
              <Button onClick={() => setAcknowledging(undefined)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => decide(acknowledgingSentence.id, true)}
              >
                Approve despite warning
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function SentenceEditor({
  project,
  sentence,
  sources,
  onProjectChange,
  onDecide,
}: {
  project: Project;
  sentence: ReviewSentence;
  sources: NonNullable<Project["sources"]>;
  onProjectChange: (next: Project) => void;
  onDecide: () => void;
}) {
  const patch = (changes: Parameters<typeof withSentencePatch>[2]) =>
    onProjectChange(withSentencePatch(project, sentence.id, changes));
  const sourceText = sourceTextFor(project, sentence.paperId);
  const matched = quoteMatches(sentence.quote, sourceText);

  return (
    <div className="review-margin-editor">
      <Select
        label="Source to check against"
        value={sentence.paperId ?? ""}
        hint={
          sources.length
            ? undefined
            : "Save a source in the Library first; the review checks your pasted passage against its text."
        }
        onChange={(event) => patch({ paperId: event.currentTarget.value || null })}
      >
        <option value="">Choose a saved source</option>
        {sources.map((source) => (
          <option key={source.paper.id} value={source.paper.id}>
            {source.paper.title}
          </option>
        ))}
      </Select>

      {sentence.paperId && (
        <>
          {sourceText ? (
            <blockquote className="review-source-text">{sourceText}</blockquote>
          ) : (
            <p className="review-notice">
              This record carries no abstract text, so a passage cannot be
              checked against it here.
            </p>
          )}
          <TextArea
            label="Evidence passage"
            rows={3}
            maxLength={2000}
            value={sentence.quote}
            placeholder="Copy a relevant passage from the source text above"
            onChange={(event) => patch({ quote: event.currentTarget.value })}
          />
          <p
            className={`review-match${matched ? " review-match-found" : ""}`}
            role="status"
          >
            {matched
              ? "Passage found in the source text. This checks the text, not scientific support."
              : "Paste an exact passage from the source text to enable approval."}
          </p>
          <Select
            label="Your assessment"
            value={sentence.assessment}
            onChange={(event) =>
              patch({
                assessment: event.currentTarget.value as ReviewSentence["assessment"],
              })
            }
          >
            {ASSESSMENT_LABELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <TextArea
            label="Proposed wording, if a revision is needed"
            rows={3}
            maxLength={3000}
            value={sentence.revision}
            onChange={(event) => patch({ revision: event.currentTarget.value })}
          />
          <TextArea
            label="Reason or limitation"
            rows={2}
            maxLength={1500}
            value={sentence.note}
            placeholder="Population, study design, outcome or limitation"
            onChange={(event) => patch({ note: event.currentTarget.value })}
          />
        </>
      )}
      {/* Both actions appear once a source is under inspection, matching
          the #9 panel exactly (relayout, not redesign). */}
      {sentence.paperId && (
        <div className="review-actions">
          <Button
            variant="primary"
            disabled={!canDecide(project, sentence)}
            onClick={onDecide}
          >
            {decideLabel(sentence)}
          </Button>
          <Button onClick={() => onProjectChange(keepOriginal(project, sentence.id))}>
            Keep original
          </Button>
        </div>
      )}
    </div>
  );
}
