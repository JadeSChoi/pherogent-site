import { useEffect, useState } from "react";
import { Library } from "./library/Library";
import { ManuscriptPanel } from "./manuscript/ManuscriptPanel";
import { NotebookPanel } from "./notebook/NotebookPanel";
import { Panel } from "./ui";
import { WorkspaceControls } from "./workspace/WorkspaceControls";
import { useWorkspace } from "./workspace/useWorkspace";

type Status = {
  ok: boolean;
  service: string;
  schemaVersion: string;
};

export function App() {
  const { workspace, activeProject, saved, commit, commitProject } =
    useWorkspace();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`);
        return response.json() as Promise<Status>;
      })
      .then(setStatus)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  return (
    <main style={{ margin: "var(--space-7) auto", maxWidth: "40rem", padding: "0 var(--space-4)" }}>
      <h1>Pherogent</h1>
      <p>Evidence-first workspace for bio researchers. Rebuild in progress.</p>
      <WorkspaceControls
        workspace={workspace}
        activeProject={activeProject}
        saved={saved}
        onCommit={commit}
      />
      <Library project={activeProject} onProjectChange={commitProject} />
      <NotebookPanel project={activeProject} onProjectChange={commitProject} />
      <ManuscriptPanel project={activeProject} onProjectChange={commitProject} />
      <Panel title="API status">
        {error ? (
          <p role="alert">Status check failed: {error}</p>
        ) : status ? (
          <p>
            {status.service} is {status.ok ? "up" : "down"}, schema {status.schemaVersion}
          </p>
        ) : (
          <p>Checking…</p>
        )}
      </Panel>
    </main>
  );
}
