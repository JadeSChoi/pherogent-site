import { useState } from "react";
import { Button, Dialog, Panel, Select, TextArea } from "../ui";
import {
  defaultManuscript,
  type DecisionType,
  type Project,
  type ReviewSentence,
} from "../storage/workspace";
import {
  canDecide,
  approvalText,
  isReviewStale,
  keepOriginal,
  keywordOverlap,
  quoteMatches,
  recordDecision,
  sourceTextFor,
  undoDecision,
  withReviewPrepared,
  withSentencePatch,
  REVIEW_SENTENCE_LIMIT,
} from "./review";
import "./review.css";

type ReviewPanelProps = {
  project: Project;
  onProjectChange: (next: Project) => void;
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

const queueNote = (
  sentence: ReviewSentence,
): { text: string; state: "ok" | "warn" | "bad" | "none" } =>
  sentence.decision
    ? {
        text: DECISION_COPY[sentence.decision.type].note,
        state: DECISION_COPY[sentence.decision.type].state,
      }
    : { text: "Awaiting review", state: "none" };

function DecisionRecord({
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

export function ReviewPanel({ project, onProjectChange }: ReviewPanelProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const [sectionChoice, setSectionChoice] = useState<string>();
  const [acknowledging, setAcknowledging] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const sections = (project.manuscript ?? defaultManuscript(project)).sections;
  const review = project.review;
  const stale = isReviewStale(project);
  const sentences = review?.sentences ?? [];
  const selected =
    sentences.find((sentence) => sentence.id === selectedId) ??
    sentences.find((sentence) => !sentence.decision) ??
    sentences[0];
  const sources = project.sources ?? [];

  const chosenSection =
    sections.find((section) => section.id === (sectionChoice ?? review?.sectionId)) ??
    sections[0];

  const prepare = () => {
    const { project: next, outcome } = withReviewPrepared(project, chosenSection.id);
    if (outcome === "prepared") {
      onProjectChange(next);
      setSelectedId(next.review!.sentences[0].id);
      setNotice(undefined);
    } else {
      setNotice(
        "This section has no reviewable sentence yet. Write a complete sentence of at least 15 characters first.",
      );
    }
  };

  const patch = (changes: Parameters<typeof withSentencePatch>[2]) => {
    if (selected) onProjectChange(withSentencePatch(project, selected.id, changes));
  };

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

  const sourceText = selected ? sourceTextFor(project, selected.paperId) : "";
  const matched = selected ? quoteMatches(selected.quote, sourceText) : false;
  const acknowledgingSentence = sentences.find((s) => s.id === acknowledging);
  const acknowledgingOverlap = acknowledgingSentence
    ? keywordOverlap(approvalText(acknowledgingSentence), acknowledgingSentence.quote)
    : undefined;

  return (
    <Panel title="Evidence review">
      <p className="review-hint">
        Check your sentences against the sources you saved, one section at a
        time. Quote matching and keyword overlap are plain text checks — no AI
        runs here, and nothing is approved until you approve it.
      </p>

      <div className="review-prepare">
        <Select
          label="Section to review"
          value={chosenSection.id}
          onChange={(event) => setSectionChoice(event.currentTarget.value)}
        >
          {sections.map((section, index) => (
            <option key={section.id} value={section.id}>
              {section.heading || `Section ${index + 1}`}
            </option>
          ))}
        </Select>
        <Button variant="primary" onClick={prepare}>
          Prepare sentences for review
        </Button>
        <p className="review-prepare-note">
          Splits the section by text alone and opens up to{" "}
          {REVIEW_SENTENCE_LIMIT} undecided sentences per pass; decisions on
          unchanged sentences carry over. Prepare again to continue through
          the section. No scientific assessment is performed.
        </p>
      </div>
      {notice && (
        <p className="review-notice" role="status">
          {notice}
        </p>
      )}

      {review && stale && (
        <p className="review-stale" role="status">
          The section changed since these sentences were prepared. Earlier
          decisions do not apply automatically — prepare the sentences again
          to continue.
        </p>
      )}

      {review && !stale && (
        <>
          <ol className="review-queue" aria-label="Sentences under review">
            {sentences.map((sentence) => {
              const note = queueNote(sentence);
              return (
                <li key={sentence.id} className="review-queue-item">
                  <button
                    type="button"
                    className="review-sentence"
                    aria-pressed={sentence.id === selected?.id}
                    onClick={() => setSelectedId(sentence.id)}
                  >
                    {sentence.text}
                  </button>
                  <span className={`review-note review-note-${note.state}`}>
                    {note.text}
                  </span>
                  {sentence.contextChanged && (
                    <span className="review-note review-context-flag">
                      Context changed
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {selected && selected.decision && (
            <DecisionRecord
              sentence={selected}
              onUndo={() => onProjectChange(undoDecision(project, selected.id))}
            />
          )}

          {selected && !selected.decision && (
            <div className="review-detail">
              <Select
                label="Source to check against"
                value={selected.paperId ?? ""}
                hint={
                  sources.length
                    ? undefined
                    : "Save a source in the Library first; the review checks your pasted passage against its text."
                }
                onChange={(event) =>
                  patch({ paperId: event.currentTarget.value || null })
                }
              >
                <option value="">Choose a saved source</option>
                {sources.map((source) => (
                  <option key={source.paper.id} value={source.paper.id}>
                    {source.paper.title}
                  </option>
                ))}
              </Select>

              {selected.paperId && (
                <>
                  {sourceText ? (
                    <blockquote className="review-source-text">{sourceText}</blockquote>
                  ) : (
                    <p className="review-notice">
                      This record carries no abstract text, so a passage cannot
                      be checked against it here.
                    </p>
                  )}
                  <TextArea
                    label="Evidence passage"
                    rows={3}
                    maxLength={2000}
                    value={selected.quote}
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
                    value={selected.assessment}
                    onChange={(event) =>
                      patch({
                        assessment: event.currentTarget
                          .value as ReviewSentence["assessment"],
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
                    value={selected.revision}
                    onChange={(event) => patch({ revision: event.currentTarget.value })}
                  />
                  <TextArea
                    label="Reason or limitation"
                    rows={2}
                    maxLength={1500}
                    value={selected.note}
                    placeholder="Population, study design, outcome or limitation"
                    onChange={(event) => patch({ note: event.currentTarget.value })}
                  />
                  <div className="review-actions">
                    <Button
                      variant="primary"
                      disabled={!canDecide(project, selected)}
                      onClick={() => decide(selected.id)}
                    >
                      {decideLabel(selected)}
                    </Button>
                    <Button onClick={() => onProjectChange(keepOriginal(project, selected.id))}>
                      Keep original
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

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
    </Panel>
  );
}
