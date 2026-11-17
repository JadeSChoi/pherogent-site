import { useEffect, useRef, useState } from "react";
import { loadWorkspace, saveWorkspace } from "../storage/local";
import { createWriteScheduler, type WriteScheduler } from "../storage/scheduler";
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

const SAVE_INTERVAL_MS = 1000;

/**
 * Owns the browser-local workspace for the whole app: one load, one writer.
 * Writes are throttled (ADR 0004) — immediate on the first change, then at
 * most one per second during bursts such as typing — and flushed on
 * page-hide so a trailing write is never lost.
 */
export function useWorkspace(): WorkspaceState {
  const [workspace, setWorkspace] = useState<Workspace>(() =>
    loadWorkspace(localStorage),
  );
  const [saved, setSaved] = useState(true);
  const latest = useRef(workspace);
  const scheduler = useRef<WriteScheduler | null>(null);
  scheduler.current ??= createWriteScheduler(() => {
    setSaved(saveWorkspace(localStorage, latest.current));
  }, SAVE_INTERVAL_MS);

  useEffect(() => {
    const flush = () => scheduler.current?.flush();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  const commit = (next: Workspace) => {
    latest.current = next;
    setWorkspace(next);
    scheduler.current?.schedule();
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
