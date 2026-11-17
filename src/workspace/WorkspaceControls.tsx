import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button, Dialog, Panel, Select, TextArea, TextInput } from "../ui";
import { exportBackup, importBackup } from "../storage/backup";
import { loadWorkspace, saveWorkspace } from "../storage/local";
import { createProject, type Workspace } from "../storage/workspace";
import "./workspace.css";

export function WorkspaceControls() {
  const [workspace, setWorkspace] = useState<Workspace>(() =>
    loadWorkspace(localStorage),
  );
  const [saved, setSaved] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [importError, setImportError] = useState<string>();
  const [pendingImport, setPendingImport] = useState<Workspace>();
  const fileInput = useRef<HTMLInputElement>(null);

  const active =
    workspace.projects.find((p) => p.id === workspace.activeProjectId) ??
    workspace.projects[0];

  const commitWorkspace = (next: Workspace) => {
    setWorkspace(next);
    setSaved(saveWorkspace(localStorage, next));
  };

  const closeNewProject = () => {
    setNewProjectOpen(false);
    setNameError(undefined);
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setNameError("Give your project a name.");
      return;
    }
    const project = createProject(name, String(data.get("question") ?? "").trim());
    commitWorkspace({
      ...workspace,
      activeProjectId: project.id,
      projects: [...workspace.projects, project],
    });
    closeNewProject();
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([exportBackup(workspace)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pherogent-workspace-backup.json";
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
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("The file could not be read.");
      return;
    }
    const result = importBackup(text);
    if (!result.ok) {
      setImportError(result.reason + " Nothing was changed.");
      return;
    }
    setPendingImport(result.workspace);
  };

  const confirmImport = () => {
    if (pendingImport) commitWorkspace(pendingImport);
    setPendingImport(undefined);
  };

  return (
    <Panel title="Projects">
      <h2 className="workspace-project-name">{active.name}</h2>
      {active.question && <p className="workspace-question">{active.question}</p>}
      <div className="workspace-switcher">
        <Select
          label="Project"
          value={active.id}
          onChange={(event) =>
            commitWorkspace({ ...workspace, activeProjectId: event.currentTarget.value })
          }
        >
          {workspace.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="workspace-actions">
        <Button variant="primary" onClick={() => setNewProjectOpen(true)}>
          New project
        </Button>
        <Button onClick={download}>Export backup</Button>
        <Button onClick={() => fileInput.current?.click()}>Import backup</Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Import backup file"
        onChange={readImport}
        hidden
      />
      {importError && (
        <p className="workspace-import-error" role="alert">
          {importError}
        </p>
      )}
      <p className="workspace-status" role="status">
        {saved
          ? "Saved in this browser."
          : "Storage unavailable — export your work before closing."}
      </p>

      <Dialog open={newProjectOpen} onClose={closeNewProject} title="New research project">
        <form className="workspace-form" onSubmit={create}>
          <TextInput label="Project name" name="name" maxLength={180} error={nameError} />
          <TextArea
            label="Research question"
            name="question"
            rows={3}
            maxLength={2000}
            hint="Optional — what would you like to investigate?"
          />
          <div className="workspace-dialog-actions">
            <Button variant="primary" type="submit">
              Create project
            </Button>
            <Button onClick={closeNewProject}>Cancel</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={pendingImport !== undefined}
        onClose={() => setPendingImport(undefined)}
        title="Restore from backup?"
      >
        <p>
          This replaces your current {workspace.projects.length}{" "}
          {workspace.projects.length === 1 ? "project" : "projects"} with the{" "}
          {pendingImport?.projects.length ?? 0} in the backup. Export first if
          you want to keep a copy of what is here now.
        </p>
        <div className="workspace-dialog-actions">
          <Button variant="primary" onClick={confirmImport}>
            Replace workspace
          </Button>
          <Button onClick={() => setPendingImport(undefined)}>Cancel</Button>
        </div>
      </Dialog>
    </Panel>
  );
}
