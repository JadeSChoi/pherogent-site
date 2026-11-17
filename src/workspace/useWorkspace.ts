import { useState } from "react";
import { loadWorkspace, saveWorkspace } from "../storage/local";
import type { Project, Workspace } from "../storage/workspace";

export type WorkspaceState = {
  workspace: Workspace;
  /** The Project every project-scoped surface works on. */
  activeProject: Project;
  /** False when browser storage rejected the last write. */
  saved: boolean;
  commit: (next: Workspace) => void;
  /** Replaces one project (matched by id) and commits the workspace. */
  commitProject: (next: Project) => void;
};

/** Owns the browser-local workspace for the whole app: one load, one writer. */
export function useWorkspace(): WorkspaceState {
  const [workspace, setWorkspace] = useState<Workspace>(() =>
    loadWorkspace(localStorage),
  );
  const [saved, setSaved] = useState(true);

  const commit = (next: Workspace) => {
    setWorkspace(next);
    setSaved(saveWorkspace(localStorage, next));
  };

  const activeProject =
    workspace.projects.find((p) => p.id === workspace.activeProjectId) ??
    workspace.projects[0];

  const commitProject = (next: Project) =>
    commit({
      ...workspace,
      projects: workspace.projects.map((p) => (p.id === next.id ? next : p)),
    });

  return { workspace, activeProject, saved, commit, commitProject };
}
