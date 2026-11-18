import { useRef, useState } from "react";
import { Button, Dialog } from "../ui";
import type {
  AiLabel,
  EvidenceCheck,
  Project,
  ReviewSentence,
} from "../storage/workspace";
import {
  MAX_CHECK_SOURCES,
  buildCheckRequest,
  checkBlockedReason,
  checkableSources,
  evidenceCheckFromResult,
  outgoingBody,
  readCheckAccess,
  runEvidenceCheck,
  type CheckAccess,
  type CheckRequest,
} from "./evidenceCheck";
import { withEvidenceCheckRecorded } from "./review";

const LABEL_COPY: Record<AiLabel, string> = {
  supports: "Suggests this source supports the sentence",
  partial: "Suggests partial support — narrower wording proposed",
  unsupported: "Suggests this source does not establish the sentence",
  contradicts: "Suggests this source conflicts with the sentence",
};

/**
 * The AI-suggestion and code-check records of one stored Evidence check,
 * with the author-decision record beside them: the three records stay
 * visibly distinct (issue #10). Suggestions change nothing by themselves;
 * the only way one reaches the manuscript is the author's own decision.
 */
export function EvidenceCheckRecords({
  check,
  decided,
  onUseWording,
}: {
  check: EvidenceCheck;
  /** Whether the sentence already carries the author's decision record. */
  decided: boolean;
  /** Author action copying a suggestion into the proposed wording, which
   * also opens that card's source for the author's own inspection. */
  onUseWording?: (wording: string, paperId: string) => void;
}) {
  return (
    <div className="evidence-check-records">
      {check.cards.length === 0 && (
        <p className="review-margin-hint">
          No evidence card survived the server&rsquo;s checks for this sentence.
          That is a verification gap, not evidence against the sentence.
        </p>
      )}
      {check.cards.map((card) => (
        <div key={card.paperId} className="evidence-check-card">
          <div className="evidence-record">
            <p className="evidence-record-kicker">AI suggestion</p>
            <p className="evidence-record-headline">{LABEL_COPY[card.suggestion.label]}</p>
            <p className="evidence-record-detail">{card.suggestion.reason}</p>
            {card.suggestion.mismatchNotes.map((note) => (
              <p key={note} className="evidence-record-detail">
                {note}
              </p>
            ))}
            <p className="evidence-record-meta">
              {card.suggestion.studyType} · {card.suggestion.population} · unverified
              model text awaiting your decision
            </p>
            {card.suggestion.suggestedWording && (
              <>
                <p className="evidence-record-wording">
                  {card.suggestion.suggestedWording}
                </p>
                {onUseWording && (
                  <Button
                    onClick={() =>
                      onUseWording(card.suggestion.suggestedWording!, card.paperId)
                    }
                  >
                    Use as proposed wording
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="evidence-record">
            <p className="evidence-record-kicker">Code check</p>
            <blockquote className="review-source-text">{card.check.quote}</blockquote>
            <p className="evidence-record-detail">
              The server fetched {card.paperId} itself and verified this quote
              appears verbatim in {card.check.location}. A text match, not a
              scientific judgment.
            </p>
            <p className="evidence-record-meta">{card.check.coverage}</p>
            {card.check.designAdjusted && (
              <p className="evidence-record-detail">
                The study-design rule overrode the model&rsquo;s label: these
                observations cannot establish the sentence&rsquo;s inference.
              </p>
            )}
          </div>
          {!decided && (
            <div className="evidence-record">
              <p className="evidence-record-kicker">Author decision</p>
              <p className="evidence-record-detail">
                No decision has been recorded. The suggestion changes nothing
                until you assess the evidence and decide below.
              </p>
            </div>
          )}
        </div>
      ))}
      {check.unavailablePaperIds.length > 0 && (
        <p className="review-margin-hint">
          Not retrieved: {check.unavailablePaperIds.join(", ")}. Nothing was
          substituted for them.
        </p>
      )}
      {check.notes.map((note) => (
        <p key={note} className="review-margin-hint">
          {note}
        </p>
      ))}
    </div>
  );
}

type EvidenceCheckPanelProps = {
  project: Project;
  sentence: ReviewSentence;
  onProjectChange: (next: Project) => void;
  /** Author action copying a suggestion into the proposed wording. */
  onUseWording: (wording: string, paperId: string) => void;
};

/**
 * The consented AI Evidence check for one undecided prepared sentence:
 * the author explicitly selects saved sources, previews the exact outgoing
 * request, and only their consent sends it. The server fetches all source
 * text itself — no paper text leaves the browser.
 */
export function EvidenceCheckPanel({
  project,
  sentence,
  onProjectChange,
  onUseWording,
}: EvidenceCheckPanelProps) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [preview, setPreview] = useState<{ request: CheckRequest; body: string }>();
  const [access, setAccess] = useState<CheckAccess>();
  const [runStep, setRunStep] = useState<string>();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string>();
  // The freshest project across the run's await: committing a stale
  // snapshot would silently undo edits made while the stream was open.
  const latest = useRef(project);
  latest.current = project;

  const sources = checkableSources(project);

  const toggle = (paperId: string) =>
    setSelected((current) =>
      current.includes(paperId)
        ? current.filter((id) => id !== paperId)
        : [...current, paperId],
    );

  const openPreview = () => {
    const reason = checkBlockedReason(sentence, [...selected]);
    if (reason) {
      setNotice(reason);
      return;
    }
    setNotice(undefined);
    const request = buildCheckRequest(sentence, [...selected]);
    setPreview({ request, body: outgoingBody(request) });
    setAccess(undefined);
    void readCheckAccess().then(setAccess);
  };

  const consent = async () => {
    if (!preview) return;
    const { request } = preview;
    setPreview(undefined);
    setRunning(true);
    setRunStep(undefined);
    setNotice(undefined);
    try {
      const { runId, result } = await runEvidenceCheck(request, {
        onStep: setRunStep,
      });
      const check = evidenceCheckFromResult(request, result, {
        runId,
        at: new Date().toISOString(),
      });
      onProjectChange(withEvidenceCheckRecorded(latest.current, sentence.id, check));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The AI check could not finish safely.",
      );
    } finally {
      setRunning(false);
      setRunStep(undefined);
    }
  };

  return (
    <div className="evidence-check">
      <p className="review-margin-label">AI Evidence check</p>
      {sources.length === 0 ? (
        <p className="review-margin-hint">
          Save a Europe PMC source in the Library to run an AI check; the
          server resolves selected sources by their MED or PMC ids.
        </p>
      ) : (
        <fieldset className="evidence-check-sources">
          <legend className="review-margin-hint">
            Select up to {MAX_CHECK_SOURCES} saved sources. Only the sentence
            and these ids are sent; the server fetches the papers itself.
          </legend>
          {sources.map((source) => (
            <label key={source.paper.id} className="evidence-check-source">
              <input
                type="checkbox"
                checked={selected.includes(source.paper.id)}
                disabled={
                  !selected.includes(source.paper.id) &&
                  selected.length >= MAX_CHECK_SOURCES
                }
                onChange={() => toggle(source.paper.id)}
              />{" "}
              {source.paper.title}
            </label>
          ))}
        </fieldset>
      )}
      {running ? (
        <p className="review-margin-hint" role="status">
          Checking… {runStep ?? "Starting the consented run."} No automatic
          retries are made.
        </p>
      ) : (
        sources.length > 0 && (
          <div className="review-actions">
            <Button onClick={openPreview}>Preview AI check</Button>
          </div>
        )
      )}
      {notice && (
        <p className="review-notice" role="status">
          {notice}
        </p>
      )}
      {sentence.evidenceCheck && !running && (
        <EvidenceCheckRecords
          check={sentence.evidenceCheck}
          decided={false}
          onUseWording={onUseWording}
        />
      )}

      <Dialog
        open={preview !== undefined}
        onClose={() => setPreview(undefined)}
        title="Consent to send this to the AI provider?"
      >
        {preview && (
          <div className="evidence-check-consent">
            <p>
              None of this content has been sent — opening this preview only
              asked the server whether a run is allowed. On consent, exactly
              this content goes to this site&rsquo;s server, which reserves
              spending in the shared ledger, forwards the sentence to the AI
              provider, and fetches the selected sources&rsquo; text itself:
            </p>
            <pre className="evidence-check-outgoing">{preview.body}</pre>
            <p className="review-margin-hint" role="status">
              {access === undefined
                ? "Checking whether this deployment accepts a run…"
                : access.message}
            </p>
            <div className="review-actions">
              <Button onClick={() => setPreview(undefined)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={access === undefined || !access.canRun}
                onClick={() => void consent()}
              >
                Consent and send
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
