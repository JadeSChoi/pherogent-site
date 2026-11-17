import { useRef, useState, type ChangeEvent } from "react";
import { Button, Dialog, Panel } from "../ui";
import {
  SECTION_LIMIT,
  defaultManuscript,
  manuscriptFromText,
  manuscriptMarkdown,
  withManuscriptUpdate,
  withSectionAdded,
  withSectionRemoved,
  withSectionUpdate,
  type Manuscript,
  type Project,
} from "../storage/workspace";
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

export function ManuscriptPanel({ project, onProjectChange }: ManuscriptPanelProps) {
  const [importError, setImportError] = useState<string>();
  const [pendingImport, setPendingImport] = useState<Manuscript>();
  const fileInput = useRef<HTMLInputElement>(null);
  // The freshest project across the await in readImport: committing a stale
  // snapshot there would silently undo edits made while the file was read.
  const latest = useRef(project);
  latest.current = project;
  const manuscript = project.manuscript ?? defaultManuscript(project);

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([manuscriptMarkdown(project)], { type: "text/markdown" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pherogent-manuscript.md";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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

  return (
    <Panel title="Manuscript">
      <p className="manuscript-hint">
        The one manuscript of {project.name}, written in sections that read as
        one document. Saved in this browser as you write.
      </p>
      <div className="manuscript-doc">
        <input
          className="manuscript-title"
          aria-label="Document title"
          maxLength={180}
          value={manuscript.title}
          placeholder={project.name}
          onChange={(event) =>
            onProjectChange(
              withManuscriptUpdate(project, { title: event.currentTarget.value }),
            )
          }
        />
        {manuscript.sections.map((section, index) => (
          <div key={section.id} className="manuscript-section">
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
            <textarea
              className="manuscript-text"
              aria-label={`Section ${index + 1} text`}
              maxLength={SECTION_LIMIT}
              rows={rowsFor(section.text)}
              value={section.text}
              placeholder={
                index === 0 ? "Start writing, paste a draft, or import a text file…" : "Write this section…"
              }
              onChange={(event) =>
                onProjectChange(
                  withSectionUpdate(project, section.id, {
                    text: event.currentTarget.value,
                  }),
                )
              }
            />
            {!section.heading && !section.text && manuscript.sections.length > 1 && (
              <Button
                className="manuscript-remove"
                aria-label={`Remove section ${index + 1}`}
                onClick={() => onProjectChange(withSectionRemoved(project, section.id))}
              >
                Remove empty section
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="manuscript-actions">
        <Button onClick={() => onProjectChange(withSectionAdded(project))}>
          Add section
        </Button>
        <Button onClick={download}>Export manuscript (.md)</Button>
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
    </Panel>
  );
}
