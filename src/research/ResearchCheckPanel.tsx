import { useState } from "react";
import { Button, Dialog, Panel, TextArea } from "../ui";
import { ConsentAccess } from "../api/ConsentAccess";
import type { AiLabel, Project } from "../storage/workspace";
import {
  buildResearchRequest,
  outgoingBody,
  questionBlockedReason,
  readCheckAccess,
  type CheckAccess,
  type ResearchNote,
  type ResearchRequest,
} from "./researchCheck";
import type { ResearchCheckRunState } from "./useResearchCheckRun";
import "./research.css";

const LABEL_COPY: Record<AiLabel, string> = {
  supports: "Suggests this source supports the claim",
  partial: "Suggests partial support — narrower wording proposed",
  unsupported: "Suggests this source does not establish the claim",
  contradicts: "Suggests this source conflicts with the claim",
};

/**
 * The completed note as the author reviews it: the AI research note's three
 * summary groups, one card per verified source, and the sources inspected.
 * Everything here is an AI suggestion awaiting the author; the only way any
 * of it reaches the Project is the explicit save actions beside it.
 */
function ResearchNoteView({ note }: { note: ResearchNote }) {
  const groups: [string, string[]][] = [
    ["Findings suggested by AI", note.summary.established],
    ["Uncertainty & limitations", note.summary.uncertain],
    ["Next questions", note.summary.nextQuestions],
  ];
  return (
    <div className="research-note">
      <h3 className="research-note-title">AI research note</h3>
      <p className="research-note-kicker">
        Author review required — model assessments of a bounded search, not
        validated findings. Nothing below is saved without your action.
      </p>
      {groups.map(([heading, items]) => (
        <div key={heading} className="research-note-group">
          <p className="review-margin-label">{heading}</p>
          {items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="review-margin-hint">None recorded by this run.</p>
          )}
        </div>
      ))}
      <p className="review-margin-label">Evidence cards</p>
      {note.cards.length === 0 && (
        <p className="review-margin-hint">
          No evidence card survived the server&rsquo;s checks for this
          question. That is a verification gap, not evidence against it.
        </p>
      )}
      {note.cards.map((card) => {
        const paper = note.papers.find((candidate) => candidate.id === card.paperId);
        return (
          <div key={card.paperId} className="research-card">
            <p className="research-card-headline">{LABEL_COPY[card.label]}</p>
            <p className="research-card-detail">{card.claim}</p>
            <blockquote className="research-card-quote">{card.quote}</blockquote>
            <p className="research-card-detail">
              The server fetched {card.paperId} itself and verified this quote
              appears verbatim in {card.location || "the retrieved text"}. A
              text match, not a scientific judgment.
            </p>
            <p className="research-card-detail">{card.reason}</p>
            {card.mismatchNotes.map((item) => (
              <p key={item} className="research-card-detail">
                {item}
              </p>
            ))}
            {card.suggestedWording && (
              <p className="research-card-wording">{card.suggestedWording}</p>
            )}
            <p className="research-card-meta">
              {[
                paper &&
                  [paper.title, paper.journal, paper.year].filter(Boolean).join(" · "),
                card.studyType,
                card.population,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="research-card-meta">
              {card.coverage} Checked by AI, waiting for your review.
              {paper && (
                <>
                  {" "}
                  <a href={paper.url} target="_blank" rel="noreferrer noopener">
                    Open source
                  </a>
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

type ResearchCheckPanelProps = {
  /** The active Project: a new run starts from (and saves into) it. */
  project: Project;
  /** The shell-owned run, so an open run survives navigation. */
  runState: ResearchCheckRunState;
};

/**
 * The consented Research check (issue #14): one freeform question, previewed
 * as the exact outgoing request, sent only on consent, streamed as genuine
 * server progress, and rendered as a research note with code-verified
 * evidence cards. Findings and sources reach the Project only through the
 * explicit save actions.
 */
export function ResearchCheckPanel({ project, runState }: ResearchCheckPanelProps) {
  const [question, setQuestion] = useState(project.question);
  const [preview, setPreview] = useState<{ request: ResearchRequest; body: string }>();
  const [access, setAccess] = useState<CheckAccess>();
  const [notice, setNotice] = useState<string>();
  const [saveNotice, setSaveNotice] = useState<string>();
  const { run } = runState;

  const openPreview = () => {
    const reason = questionBlockedReason(question);
    if (reason) {
      setNotice(reason);
      return;
    }
    setNotice(undefined);
    const request = buildResearchRequest(question);
    setPreview({ request, body: outgoingBody(request) });
    setAccess(undefined);
    void readCheckAccess().then(setAccess);
  };

  const consent = () => {
    if (!preview) return;
    const { request } = preview;
    setPreview(undefined);
    setSaveNotice(undefined);
    void runState.start(project.id, request);
  };

  const saveFindings = () => {
    const outcome = runState.saveFindings();
    setSaveNotice(
      outcome === "saved"
        ? "Findings saved to the notebook, labeled as AI suggestions."
        : outcome === "duplicate"
          ? "These findings are already in the notebook."
          : outcome === "too_long"
            ? "The notebook findings field has no room for this note. Trim it first."
            : undefined,
    );
  };

  const saveSources = () => {
    const added = runState.saveSources();
    if (added === null) return;
    setSaveNotice(
      added > 0
        ? `${added} source${added === 1 ? "" : "s"} saved to the Library, marked to read.`
        : "All of this note's sources were already in the Library.",
    );
  };

  return (
    <Panel title="Research check">
      <div className="research-check">
        <p className="review-margin-hint">
          One consented question runs a bounded Research check over Europe
          PMC: at most three model calls and ten papers, with every quote
          verified by code against text the server fetched itself. Findings
          and sources reach this Project only when you save them below.
        </p>
        <TextArea
          label="Research question"
          rows={3}
          value={question}
          hint="One question or a short paragraph, at most 2,000 characters. Only this text is sent; your manuscript is not."
          onChange={(event) => setQuestion(event.currentTarget.value)}
        />
        <div className="review-actions">
          <Button onClick={openPreview} disabled={run?.running === true}>
            Preview Research check
          </Button>
        </div>
        {notice && (
          <p className="review-notice" role="status">
            {notice}
          </p>
        )}
        {run && (
          <>
            {run.running && (
              <p className="review-margin-hint" role="status">
                Checking… {run.steps.at(-1) ?? "Starting the consented run."} No
                automatic retries are made.
              </p>
            )}
            {run.steps.length > 0 && (
              <ol className="research-steps" aria-label="Run progress">
                {run.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            )}
            {run.notice && (
              <p className="review-notice" role="status">
                {run.notice}
              </p>
            )}
            {run.note && (
              <>
                <ResearchNoteView note={run.note} />
                <div className="review-actions">
                  <Button onClick={saveFindings}>Save findings to notebook</Button>
                  <Button onClick={saveSources} disabled={run.note.papers.length === 0}>
                    Save sources to library
                  </Button>
                  <Button
                    onClick={() => {
                      runState.dismiss();
                      setSaveNotice(undefined);
                    }}
                  >
                    Dismiss note
                  </Button>
                </div>
              </>
            )}
            {saveNotice && (
              <p className="review-notice" role="status">
                {saveNotice}
              </p>
            )}
          </>
        )}
      </div>

      <Dialog
        open={preview !== undefined}
        onClose={() => setPreview(undefined)}
        title="Consent to send this to the AI provider?"
      >
        {preview && (
          <div className="research-check-consent">
            <p>
              None of this content has been sent — opening this preview only
              asked the server whether a run is allowed. On consent, exactly
              this content goes to this site&rsquo;s server, which reserves
              spending in the shared ledger, forwards the question to the AI
              provider, and sends the resulting search queries to Europe PMC.
              Your manuscript is not sent:
            </p>
            <pre className="research-check-outgoing">{preview.body}</pre>
            <ConsentAccess access={access} onAccess={setAccess} />
            <div className="review-actions">
              <Button onClick={() => setPreview(undefined)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={access === undefined || !access.canRun}
                onClick={consent}
              >
                Consent and send
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Panel>
  );
}
