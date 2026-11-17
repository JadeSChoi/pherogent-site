import { useRef, useState, type ChangeEvent } from "react";
import { Button, Dialog, Panel, TextArea, TextInput } from "../ui";
import {
  MANUSCRIPT_LIMIT,
  emptyManuscript,
  manuscriptMarkdown,
  withManuscriptUpdate,
  type Project,
} from "../storage/workspace";
import "./manuscript.css";

type ManuscriptPanelProps = {
  project: Project;
  onProjectChange: (next: Project) => void;
};

export function ManuscriptPanel({ project, onProjectChange }: ManuscriptPanelProps) {
  const [importError, setImportError] = useState<string>();
  const [pendingImport, setPendingImport] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  // The freshest project across the await in readImport: committing a stale
  // snapshot there would silently undo edits made while the file was read.
  const latest = useRef(project);
  latest.current = project;
  const manuscript = project.manuscript ?? emptyManuscript();

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
    if (text.length > MANUSCRIPT_LIMIT) {
      setImportError(
        `Import up to ${MANUSCRIPT_LIMIT.toLocaleString("en-US")} characters at a time. Nothing was changed.`,
      );
      return;
    }
    const current = latest.current;
    if (current.id !== project.id) {
      setImportError("Import cancelled because you switched projects. Nothing was changed.");
      return;
    }
    if ((current.manuscript ?? emptyManuscript()).text.trim()) {
      setPendingImport(text);
    } else {
      onProjectChange(withManuscriptUpdate(current, { text }));
    }
  };

  const confirmImport = () => {
    if (pendingImport !== undefined) {
      onProjectChange(withManuscriptUpdate(latest.current, { text: pendingImport }));
    }
    setPendingImport(undefined);
  };

  return (
    <Panel title="Manuscript">
      <p className="manuscript-hint">
        The one manuscript of {project.name}. Saved in this browser as you type.
      </p>
      <div className="manuscript-fields">
        <TextInput
          label="Document title"
          maxLength={180}
          value={manuscript.title}
          placeholder={project.name}
          onChange={(event) =>
            onProjectChange(
              withManuscriptUpdate(project, { title: event.currentTarget.value }),
            )
          }
        />
        <TextArea
          label="Manuscript text"
          rows={12}
          maxLength={MANUSCRIPT_LIMIT}
          placeholder="Start writing, paste a draft, or import a text file…"
          value={manuscript.text}
          onChange={(event) =>
            onProjectChange(
              withManuscriptUpdate(project, { text: event.currentTarget.value }),
            )
          }
        />
      </div>
      <div className="manuscript-actions">
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
          Your manuscript contains writing. Importing replaces it with the
          file&rsquo;s text. Export the manuscript first if you want to keep a
          separate copy.
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
