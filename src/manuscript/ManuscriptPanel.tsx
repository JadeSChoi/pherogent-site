import { useRef, useState, type ChangeEvent } from "react";
import { Button, Dialog } from "../ui";
import {
  SECTION_LIMIT,
  defaultManuscript,
  manuscriptFromText,
  manuscriptMarkdown,
  manuscriptWordCount,
  withManuscriptUpdate,
  withSectionAdded,
  withSectionRemoved,
  withSectionUpdate,
  type Manuscript,
  type Project,
  type ReviewSentence,
  type Section,
} from "../storage/workspace";
import { isReviewStale, reviewFor, withReviewPrepared } from "../review/review";
import { evidenceTrailMarkdown } from "../review/evidenceTrail";
import { proofSegments } from "../review/proofSegments";
import { ReviewMargin } from "../review/ReviewMargin";
import "../review/review.css";
import "./manuscript.css";

type ManuscriptPanelProps = {
  project: Project;
  onProjectChange: (next: Project) => void;
};

const hasWriting = (manuscript: Manuscript) =>
  manuscript.sections.some((section) => section.heading.trim() || section.text.trim());

/** Rows that track the text so the page flows instead of scrolling boxes. */
const rowsFor = (text: string) =>
  Math.min(40, Math.max(3, text.split("\n").length + 1));

const sentenceState = (sentence: ReviewSentence): string =>
  sentence.decision?.type ?? "unchecked";

/**
 * The Manuscript as the Folio proof-sheet (issue #21): the document in a
 * serif reading column with the evidence review beside it as margin
 * notes. A Section with a current review pass renders as proof text —
 * each prepared sentence a span underlined by its evidence state — and
 * switches back to its editable field on request or when its pass goes
 * stale. All review behavior is the #9 flow unchanged, relocated.
 */
export function ManuscriptPanel({ project, onProjectChange }: ManuscriptPanelProps) {
  const [importError, setImportError] = useState<string>();
  const [pendingImport, setPendingImport] = useState<Manuscript>();
  const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>();
  const [prepareNotice, setPrepareNotice] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  // The freshest project across the await in readImport: committing a stale
  // snapshot there would silently undo edits made while the file was read.
  const latest = useRef(project);
  latest.current = project;
  const manuscript = project.manuscript ?? defaultManuscript(project);

  const downloadMarkdown = (filename: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const download = () =>
    downloadMarkdown("pherogent-manuscript.md", manuscriptMarkdown(project));

  // The evidence-trail export (issue #11): every consented Evidence check
  // run with its per-source outcomes and provenance, built entirely from
  // the stored run log — exporting makes no network or model call.
  const downloadTrail = () =>
    downloadMarkdown("pherogent-evidence-trail.md", evidenceTrailMarkdown(project));

  const applyImport = (imported: Manuscript) => {
    const current = latest.current;
    const title =
      imported.title || (current.manuscript ?? defaultManuscript(current)).title;
    onProjectChange({
      ...current,
      manuscript: { title, sections: imported.sections },
    });
  };

  const readImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setImportError(undefined);
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 100000) {
      setImportError("Choose a .txt or .md file smaller than 100 KB. Nothing was changed.");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("The file could not be read. Nothing was changed.");
      return;
    }
    const current = latest.current;
    if (current.id !== project.id) {
      setImportError("Import cancelled because you switched projects. Nothing was changed.");
      return;
    }
    const imported = manuscriptFromText(text);
    if (hasWriting(current.manuscript ?? defaultManuscript(current))) {
      setPendingImport(imported);
    } else {
      applyImport(imported);
    }
  };

  const confirmImport = () => {
    if (pendingImport) applyImport(pendingImport);
    setPendingImport(undefined);
  };

  const setEditing = (sectionId: string, editing: boolean) => {
    setEditingIds((current) => {
      const next = new Set(current);
      if (editing) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  };

  const prepare = (section: Section) => {
    const { project: next, outcome } = withReviewPrepared(project, section.id);
    if (outcome === "prepared") {
      onProjectChange(next);
      setSelectedId(reviewFor(next, section.id)!.sentences[0].id);
      setEditing(section.id, false);
      setPrepareNotice(undefined);
    } else {
      setPrepareNotice(
        "This section has no reviewable sentence yet. Write a complete sentence of at least 15 characters first.",
      );
    }
  };

  /** One lookup per section: its pass, whether that pass is stale, and
   * whether it currently renders as proof text. */
  const passState = (section: Section) => {
    const pass = reviewFor(project, section.id);
    const stale = !!pass && isReviewStale(project, section.id);
    const proof = pass && !stale && !editingIds.has(section.id) ? pass : undefined;
    return { pass, stale, proof };
  };

  // The margin's open editor: the chosen sentence while it is undecided,
  // otherwise the first undecided sentence in document order — so after a
  // decision the next sentence opens by itself, as the #9 panel did.
  const undecidedIds = manuscript.sections.flatMap(
    (section) =>
      passState(section).proof?.sentences.filter((s) => !s.decision).map((s) => s.id) ??
      [],
  );
  const activeId =
    selectedId && undecidedIds.includes(selectedId) ? selectedId : undecidedIds[0];

  /** The page's one primary action: open the next sentence to check, or
   * prepare the next Section (or batch) that has something to review. */
  const checkNext = () => {
    if (undecidedIds.length) {
      setSelectedId(undecidedIds[0]);
      return;
    }
    const candidate = manuscript.sections.find((section) => {
      if (!section.text.trim()) return false;
      const { proof } = passState(section);
      return !proof || proof.sentences.every((sentence) => sentence.decision);
    });
    if (candidate) prepare(candidate);
  };

  const words = manuscriptWordCount(project);
  const sectionCount = manuscript.sections.length;

  return (
    <div className="manuscript-page">
      <div className="proof-doc">
        <div className="manuscript-doc">
          {/* A textarea so a long title wraps in the reading column the way
              the proof-sheet's heading does; newlines are stripped. */}
          <textarea
            className="manuscript-title"
            aria-label="Document title"
            maxLength={180}
            rows={1}
            value={manuscript.title}
            placeholder={project.name}
            onChange={(event) =>
              onProjectChange(
                withManuscriptUpdate(project, {
                  title: event.currentTarget.value.replace(/\n/g, " "),
                }),
              )
            }
          />
          <div className="manuscript-doc-sub-row">
            <p className="manuscript-doc-sub">
              {words === 1 ? "1 word" : `${words.toLocaleString()} words`} across{" "}
              {sectionCount === 1 ? "1 section" : `${sectionCount} sections`}, saved
              in this browser as you write
            </p>
            <Button variant="primary" onClick={checkNext}>
              Check next sentence
            </Button>
          </div>
          {manuscript.sections.map((section, index) => {
            const { stale, proof } = passState(section);
            return (
              <div key={section.id} className="manuscript-section">
                {/* The reading view shows no empty heading field; add a
                    heading from the section's edit view. */}
                {(!proof || section.heading) && (
                  <input
                    className="manuscript-heading"
                    aria-label={`Section ${index + 1} heading`}
                    maxLength={300}
                    value={section.heading}
                    placeholder={index === 0 ? "Heading (optional)" : "Section heading"}
                    onChange={(event) =>
                      onProjectChange(
                        withSectionUpdate(project, section.id, {
                          heading: event.currentTarget.value,
                        }),
                      )
                    }
                  />
                )}
                {proof ? (
                  <>
                    <p className="proof-section-text">
                      {proofSegments(proof.baseText, proof.sentences).map(
                        (segment, at) =>
                          segment.kind === "text" ? (
                            <span key={at}>{segment.text}</span>
                          ) : (
                            <button
                              key={segment.sentence.id}
                              type="button"
                              className={`proof-s proof-s-${sentenceState(segment.sentence)}`}
                              aria-pressed={segment.sentence.id === activeId}
                              onClick={() => setSelectedId(segment.sentence.id)}
                            >
                              {segment.sentence.text}
                            </button>
                          ),
                      )}
                    </p>
                    <div className="proof-section-actions">
                      <Button variant="link" onClick={() => setEditing(section.id, true)}>
                        Edit text
                      </Button>
                      {/* Re-preparing walks the Section in batches (ADR
                          0005): decisions on unchanged sentences carry
                          over and the next undecided sentences open. */}
                      <Button variant="link" onClick={() => prepare(section)}>
                        Prepare sentences for review
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <textarea
                      className="manuscript-text"
                      aria-label={`Section ${index + 1} text`}
                      maxLength={SECTION_LIMIT}
                      rows={rowsFor(section.text)}
                      value={section.text}
                      placeholder={
                        index === 0
                          ? "Start writing, paste a draft, or import a text file…"
                          : "Write this section…"
                      }
                      onChange={(event) =>
                        onProjectChange(
                          withSectionUpdate(project, section.id, {
                            text: event.currentTarget.value,
                          }),
                        )
                      }
                    />
                    {stale && (
                      <p className="review-stale" role="status">
                        The section changed since its sentences were prepared.
                        Earlier decisions do not apply automatically — prepare
                        the sentences again to continue.
                      </p>
                    )}
                    <div className="proof-section-actions">
                      {section.text.trim() && (
                        <Button variant="link" onClick={() => prepare(section)}>
                          Prepare sentences for review
                        </Button>
                      )}
                      {!section.heading && !section.text && manuscript.sections.length > 1 && (
                        <Button
                          variant="link"
                          aria-label={`Remove section ${index + 1}`}
                          onClick={() =>
                            onProjectChange(withSectionRemoved(project, section.id))
                          }
                        >
                          Remove empty section
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {prepareNotice && (
            <p className="review-notice" role="status">
              {prepareNotice}
            </p>
          )}
        </div>
        <aside className="proof-margin" aria-label="Evidence review">
          <ReviewMargin
            project={project}
            onProjectChange={onProjectChange}
            selectedId={activeId}
          />
        </aside>
      </div>
      {/* Document chores sit below the reading flow. */}
      <div className="manuscript-actions">
        <Button onClick={() => onProjectChange(withSectionAdded(project))}>
          Add section
        </Button>
        <Button onClick={download}>Export manuscript (.md)</Button>
        <Button onClick={downloadTrail}>Export evidence trail (.md)</Button>
        <Button onClick={() => fileInput.current?.click()}>Import .txt or .md</Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        aria-label="Import manuscript file"
        onChange={readImport}
        hidden
      />
      {importError && (
        <p className="manuscript-import-error" role="alert">
          {importError}
        </p>
      )}

      <Dialog
        open={pendingImport !== undefined}
        onClose={() => setPendingImport(undefined)}
        title="Replace the manuscript text?"
      >
        <p>
          Your manuscript contains writing. Importing replaces its sections
          with the file&rsquo;s text. Export the manuscript first if you want
          to keep a separate copy.
        </p>
        <div className="manuscript-dialog-actions">
          <Button onClick={download}>Export current manuscript</Button>
          <Button variant="primary" onClick={confirmImport}>
            Replace manuscript text
          </Button>
          <Button onClick={() => setPendingImport(undefined)}>Cancel</Button>
        </div>
      </Dialog>
    </div>
  );
}
