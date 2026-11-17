/**
 * The browser-local workspace model (ADR-0002): every Project the author
 * works on, with one of them active. Persisted as JSON in browser storage
 * and exported verbatim as the backup format.
 */

import type { Paper } from "../library/europePmc";

/** Where the author stands with a saved source. Reading state, not approval. */
export type ReadingStatus = "to-read" | "useful" | "conflicting";

export const READING_STATUSES: readonly ReadingStatus[] = [
  "to-read",
  "useful",
  "conflicting",
];

/**
 * A paper the author saved to a Project for later reading. Saving is a
 * research bookmark only — it never approves the paper as a citation or
 * attaches it to any sentence.
 */
export type SavedSource = {
  paper: Paper;
  note: string;
  status: ReadingStatus;
  savedAt: string;
};

/**
 * The author's working notes for a Project. Hypotheses and next experiments
 * are deliberately separate fields from findings: they are not findings.
 */
export type Notebook = {
  findings: string;
  limitations: string;
  hypothesis: string;
  nextExperiment: string;
};

/** The one canonical manuscript of a Project. */
export type Manuscript = {
  /** The document title; the project name stands in when empty. */
  title: string;
  text: string;
};

/** The manuscript size cap carried over from the legacy workspace. */
export const MANUSCRIPT_LIMIT = 12000;

export const emptyNotebook = (): Notebook => ({
  findings: "",
  limitations: "",
  hypothesis: "",
  nextExperiment: "",
});

export const emptyManuscript = (): Manuscript => ({ title: "", text: "" });

export type Project = {
  id: string;
  name: string;
  /** The research question; empty string when the author has not set one. */
  question: string;
  createdAt: string;
  /** Saved sources; absent on projects created before the Library existed. */
  sources?: SavedSource[];
  /** Absent on projects created before the Notebook existed. */
  notebook?: Notebook;
  /** Absent on projects created before the Manuscript existed. */
  manuscript?: Manuscript;
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

/**
 * Saves a paper to the project. Saving the same paper again keeps the
 * existing note, status, and originally saved metadata.
 */
export function withSavedSource(project: Project, paper: Paper): Project {
  const sources = project.sources ?? [];
  if (sources.some((source) => source.paper.id === paper.id)) return project;
  return {
    ...project,
    sources: [
      ...sources,
      { paper, note: "", status: "to-read", savedAt: new Date().toISOString() },
    ],
  };
}

/** Updates the note and/or reading status of one saved source. */
export function withSourceUpdate(
  project: Project,
  paperId: string,
  patch: Partial<Pick<SavedSource, "note" | "status">>,
): Project {
  if (!project.sources?.some((source) => source.paper.id === paperId)) {
    return project;
  }
  return {
    ...project,
    sources: project.sources.map((source) =>
      source.paper.id === paperId ? { ...source, ...patch } : source,
    ),
  };
}

export function withNotebookUpdate(
  project: Project,
  patch: Partial<Notebook>,
): Project {
  return { ...project, notebook: { ...(project.notebook ?? emptyNotebook()), ...patch } };
}

export function withManuscriptUpdate(
  project: Project,
  patch: Partial<Manuscript>,
): Project {
  return {
    ...project,
    manuscript: { ...(project.manuscript ?? emptyManuscript()), ...patch },
  };
}

/** The Markdown document the manuscript export downloads. */
export function manuscriptMarkdown(project: Project): string {
  const manuscript = project.manuscript ?? emptyManuscript();
  return `# ${manuscript.title || project.name}\n\n${manuscript.text}\n`;
}

export type AppendOutcome = "appended" | "empty" | "duplicate" | "too_long";

/**
 * Appends the notebook's findings and limitations to the manuscript as
 * Markdown sections. Existing manuscript text is never altered or replaced:
 * the only possible change is new text after it. Hypotheses and next
 * experiments stay in the notebook — they are not findings.
 */
export function appendNotebookToManuscript(project: Project): {
  project: Project;
  outcome: AppendOutcome;
} {
  const notebook = project.notebook ?? emptyNotebook();
  const addition = [
    notebook.findings && "## Findings notes\n\n" + notebook.findings,
    notebook.limitations && "## Limitations\n\n" + notebook.limitations,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!addition) return { project, outcome: "empty" };
  const manuscript = project.manuscript ?? emptyManuscript();
  if (manuscript.text.includes(addition)) return { project, outcome: "duplicate" };
  const text = [manuscript.text, addition].filter(Boolean).join("\n\n");
  if (text.length > MANUSCRIPT_LIMIT) return { project, outcome: "too_long" };
  return {
    project: withManuscriptUpdate(project, { text }),
    outcome: "appended",
  };
}

export function createWorkspace(): Workspace {
  const first = createProject("Untitled project");
  return { version: 3, activeProjectId: first.id, projects: [first] };
}
