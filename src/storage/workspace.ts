/**
 * The browser-local workspace model (ADR-0002): every Project the author
 * works on, with one of them active. Persisted as JSON in browser storage
 * and exported verbatim as the backup format.
 */

export type Project = {
  id: string;
  name: string;
  /** The research question; empty string when the author has not set one. */
  question: string;
  createdAt: string;
  /**
   * The untouched project payload from an imported legacy v2 backup
   * (draft, research, papers, logs). Preserved so later features can port
   * it; never read by the current UI.
   */
  legacy?: unknown;
};

export type Workspace = {
  version: 3;
  activeProjectId: string;
  projects: Project[];
  /**
   * Workspace-level material carried over from a v2 backup or a corrupted
   * local store, kept so an export never loses it.
   */
  recovered?: {
    legacy?: unknown;
    recovery?: unknown;
    projectRecovery?: unknown;
  };
};

export function createProject(name: string, question = ""): Project {
  return {
    id: `project-${crypto.randomUUID()}`,
    name,
    question,
    createdAt: new Date().toISOString(),
  };
}

export function createWorkspace(): Workspace {
  const first = createProject("Untitled project");
  return { version: 3, activeProjectId: first.id, projects: [first] };
}
