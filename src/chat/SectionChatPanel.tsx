import { useState } from "react";
import { ConsentAccess } from "../api/ConsentAccess";
import { readCheckAccess, type CheckAccess } from "../api/access";
import type { Project } from "../storage/workspace";
import { Button, TextArea, TextInput } from "../ui";
import { Dialog } from "../ui";
import { withPreparedExample } from "./prepared";
import {
  appendDraftToManuscript,
  buildChatRequest,
  chatContext,
  conversationFor,
  messageBlockedReason,
  outgoingChatBody,
  withActiveStage,
  withContextEdited,
  withDraftApplied,
  withDraftEdited,
  withDraftReviewed,
  type ChatRequest,
} from "./sectionChat";
import { CHAT_SECTIONS, STAGE_GROUPS, sectionFor, type ChatStage } from "./stages";
import type { SectionChatRuns } from "./useSectionChatRuns";
import "./chat.css";

const APPEND_COPY: Record<string, string> = {
  appended: "Added to the Manuscript as a new section — nothing existing was replaced.",
  duplicate: "This exact section is already in the Manuscript; nothing was added.",
  too_long:
    "This draft would push the Manuscript past its size guard. Shorten it before adding a copy.",
  empty: "There is no draft text to add yet.",
  not_reviewed: "Mark the draft reviewed before adding a copy to the Manuscript.",
};

/** The picker's progress note for one section — author progress, not an
 * evidence state, so it carries no color. */
function sectionStatus(project: Project, stage: ChatStage): string {
  const { draft, messages } = conversationFor(project, stage);
  if (draft.reviewed) return "Reviewed";
  if (draft.body) return "Draft";
  if (messages.length) return "In conversation";
  return "Not started";
}

type SectionChatPanelProps = {
  project: Project;
  onProjectChange: (next: Project) => void;
  /** The shell-owned run state, so an open run survives navigation. */
  runs: SectionChatRuns;
};

/**
 * The Section chat surface (issue #12): one picker over the eleven sections,
 * each keeping its own conversation, working draft, and context note per
 * Project. The server derives the role from the section id; nothing is sent
 * without consent on the exact outgoing message and bounded context.
 */
export function SectionChatPanel({
  project,
  onProjectChange,
  runs,
}: SectionChatPanelProps) {
  const stage = project.chat?.activeStage ?? "organizer";
  const section = sectionFor(stage);
  const conversation = conversationFor(project, stage);
  // Unsent composer text, keyed by Project and section so neither kind of
  // switching leaks a message into another conversation.
  const [composers, setComposers] = useState<Record<string, string>>({});
  const composerKey = `${project.id}/${stage}`;
  const composer = composers[composerKey] ?? "";
  const [preview, setPreview] = useState<{ request: ChatRequest; body: string }>();
  const [access, setAccess] = useState<CheckAccess>();
  const [flowNotice, setFlowNotice] = useState<string>();

  const pendingHere =
    runs.pending?.projectId === project.id && runs.pending?.stage === stage
      ? runs.pending
      : null;
  const noticeHere =
    runs.notice?.projectId === project.id && runs.notice?.stage === stage
      ? runs.notice
      : null;

  const pick = (next: ChatStage) => {
    setFlowNotice(undefined);
    onProjectChange(withActiveStage(project, next));
  };

  const openPreview = () => {
    const reason = messageBlockedReason(composer);
    if (reason) {
      setFlowNotice(reason);
      return;
    }
    setFlowNotice(undefined);
    const request = buildChatRequest(stage, composer, chatContext(project, stage).text);
    setPreview({ request, body: outgoingChatBody(request) });
    setAccess(undefined);
    void readCheckAccess().then(setAccess);
  };

  const consent = () => {
    if (!preview) return;
    const { request } = preview;
    setPreview(undefined);
    setComposers((current) => ({ ...current, [composerKey]: "" }));
    void runs.start(project, stage, request);
  };

  const applyDraft = (messageId: string) => {
    onProjectChange(withDraftApplied(project, stage, messageId));
    setFlowNotice(
      "Draft applied — the earlier version is preserved in its history, and the new text awaits your review.",
    );
  };

  const appendToManuscript = () => {
    const { project: next, outcome } = appendDraftToManuscript(project, stage);
    if (outcome === "appended") onProjectChange(next);
    setFlowNotice(APPEND_COPY[outcome]);
  };

  const { clipped } = chatContext(project, stage);
  const draft = conversation.draft;

  return (
    <div className="chat-surface">
      <nav className="chat-picker" aria-label="Sections">
        {STAGE_GROUPS.map((group) => (
          <div key={group} className="chat-picker-group">
            <p className="chat-picker-heading">{group}</p>
            {CHAT_SECTIONS.filter((entry) => entry.group === group).map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="chat-picker-item"
                aria-current={entry.id === stage ? "true" : undefined}
                onClick={() => pick(entry.id)}
              >
                <span className="chat-picker-label">{entry.label}</span>
                <span className="chat-picker-note">{sectionStatus(project, entry.id)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="chat-thread" aria-label="Conversation">
        <header className="chat-thread-head">
          <h2 className="chat-thread-title">{section.label}</h2>
          <p className="chat-thread-sub">
            {section.role} — {section.description} The reply is advice to review,
            never an edit to your work.
          </p>
        </header>

        {conversation.messages.length === 0 && (
          <p className="chat-empty">
            Nothing has been discussed in this section yet. Write below, or load
            the prepared example to see the flow without sending anything.
          </p>
        )}

        <ol className="chat-messages">
          {conversation.messages.map((entry) => (
            <li
              key={entry.id}
              className={`chat-message${entry.author === "ai" ? " chat-message-ai" : ""}`}
            >
              <span className="chat-speaker" aria-hidden="true">
                {entry.author === "author" ? "Author" : "AI"}
              </span>
              <div className="chat-message-body">
                <p className="chat-message-text">{entry.text}</p>
                {entry.author === "ai" && (
                  <p className="chat-message-meta">
                    {entry.kind === "prepared"
                      ? "Prepared example · no AI ran"
                      : "AI reply · author review required"}
                  </p>
                )}
                {entry.suggestedDraft && (
                  <div className="chat-suggestion">
                    <p className="chat-suggestion-title">
                      Proposed draft: {entry.suggestedDraft.title}
                    </p>
                    <p className="chat-suggestion-body">{entry.suggestedDraft.body}</p>
                    <Button onClick={() => applyDraft(entry.id)}>
                      Use as section draft
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {pendingHere && (
          <p className="chat-pending" role="status">
            Waiting for the reply… {pendingHere.step ?? "Starting the consented run."}{" "}
            It will land in this section even if you navigate away. No automatic
            retries are made.
          </p>
        )}
        {noticeHere && (
          <p className="review-notice" role="alert">
            {noticeHere.message}{" "}
            <Button variant="link" onClick={runs.dismissNotice}>
              Dismiss
            </Button>
          </p>
        )}

        <div className="chat-composer">
          <TextArea
            label="Message"
            rows={3}
            value={composer}
            hint="Sent only after you consent on a preview of the exact outgoing text."
            onChange={(event) =>
              setComposers({ ...composers, [composerKey]: event.currentTarget.value })
            }
          />
          <details className="chat-context">
            <summary>Context note for this section</summary>
            <TextArea
              label="Context note"
              rows={3}
              value={conversation.context}
              hint="Included with each send from this section, alongside the question, current draft, and recent conversation."
              onChange={(event) =>
                onProjectChange(withContextEdited(project, stage, event.currentTarget.value))
              }
            />
          </details>
          <div className="chat-composer-actions">
            <Button
              variant="primary"
              disabled={runs.pending !== null}
              onClick={openPreview}
            >
              Preview & send
            </Button>
            <Button
              onClick={() => {
                onProjectChange(withPreparedExample(project, stage));
                setFlowNotice(undefined);
              }}
            >
              Load the prepared example
            </Button>
          </div>
          <p className="chat-composer-hint">
            The prepared example is prewritten — loading it sends nothing and
            spends nothing.
          </p>
        </div>
        {flowNotice && (
          <p className="review-notice" role="status">
            {flowNotice}
          </p>
        )}
      </section>

      <aside className="chat-draft" aria-label="Working draft">
        <p className="chat-draft-label">Working draft</p>
        <TextInput
          label="Draft title"
          value={draft.title}
          onChange={(event) =>
            onProjectChange(withDraftEdited(project, stage, { title: event.currentTarget.value }))
          }
        />
        <TextArea
          label="Draft text"
          rows={10}
          value={draft.body}
          onChange={(event) =>
            onProjectChange(withDraftEdited(project, stage, { body: event.currentTarget.value }))
          }
        />
        <p className="chat-draft-meta">
          {draft.body
            ? `${draft.provenance} · ${draft.reviewed ? "Reviewed by you" : "Not yet reviewed"}`
            : "Nothing drafted yet. Apply a proposed draft or write directly."}
          {draft.history.length > 0 &&
            ` · ${draft.history.length} earlier ${
              draft.history.length === 1 ? "version" : "versions"
            } preserved`}
        </p>
        <div className="chat-draft-actions">
          <Button
            disabled={!draft.body || draft.reviewed}
            onClick={() => onProjectChange(withDraftReviewed(project, stage))}
          >
            Mark reviewed
          </Button>
          <Button disabled={!draft.reviewed} onClick={appendToManuscript}>
            Add a copy to Manuscript
          </Button>
        </div>
        <p className="chat-draft-hint">
          Adding appends a new Section to the Manuscript; existing text is never
          replaced. Any edit clears the reviewed mark.
        </p>
      </aside>

      <Dialog
        open={preview !== undefined}
        onClose={() => setPreview(undefined)}
        title={`Send to the ${section.role}?`}
      >
        {preview && (
          <div className="evidence-check-consent">
            <p>
              None of this content has been sent — opening this preview only
              asked the server whether a run is allowed. On consent, exactly
              this content goes to this site&rsquo;s server, which reserves
              spending in the shared ledger and forwards it to the AI provider.
              The server picks the {section.role}&rsquo;s role from the section
              id; this request carries no prompt, model, or budget.
            </p>
            <pre className="evidence-check-outgoing">{preview.body}</pre>
            <p className="review-margin-hint">
              Context: {preview.request.context.length.toLocaleString("en-US")}{" "}
              characters from this section only
              {clipped ? ", clipped to the 6,000-character bound" : ""}.
            </p>
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
    </div>
  );
}
