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

/** One heading-and-text unit of the Manuscript (ADR 0004): the unit of
 * editing, size caps, and scoped checks. A heading-less section renders as
 * flowing preamble text. */
export type Section = {
  id: string;
  heading: string;
  text: string;
};

/** The one canonical manuscript of a Project, as ordered Sections. */
export type Manuscript = {
  /** The document title; the project name stands in when empty. */
  title: string;
  sections: Section[];
};

/** The per-section cap: the operational bound on every text pass (ADR 0004). */
export const SECTION_LIMIT = 20000;

/**
 * A corruption guard on the whole manuscript's character count, not a
 * writing target: no small document-level limit may return (ADR 0004).
 */
export const MANUSCRIPT_GUARD = 500000;

export const emptyNotebook = (): Notebook => ({
  findings: "",
  limitations: "",
  hypothesis: "",
  nextExperiment: "",
});

export function createSection(heading = "", text = ""): Section {
  return { id: `section-${crypto.randomUUID()}`, heading, text };
}

/** A fresh manuscript always has one section to write into. */
export const emptyManuscript = (): Manuscript => ({
  title: "",
  sections: [createSection()],
});

/**
 * The stand-in for projects stored before the Manuscript existed. The
 * section id derives from the project id so every render and update of the
 * not-yet-materialized manuscript agrees on the same section.
 */
export function defaultManuscript(project: Pick<Project, "id">): Manuscript {
  return { title: "", sections: [{ id: `section-${project.id}`, heading: "", text: "" }] };
}

export function manuscriptLength(manuscript: Manuscript): number {
  return manuscript.sections.reduce(
    (total, section) => total + section.heading.length + section.text.length,
    0,
  );
}

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
    manuscript: emptyManuscript(),
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
  patch: Partial<Pick<Manuscript, "title">>,
): Project {
  return {
    ...project,
    manuscript: { ...(project.manuscript ?? defaultManuscript(project)), ...patch },
  };
}

export function withSectionUpdate(
  project: Project,
  sectionId: string,
  patch: Partial<Pick<Section, "heading" | "text">>,
): Project {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  if (!manuscript.sections.some((section) => section.id === sectionId)) {
    return project;
  }
  return {
    ...project,
    manuscript: {
      ...manuscript,
      sections: manuscript.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      ),
    },
  };
}

export function withSectionAdded(project: Project): Project {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  return {
    ...project,
    manuscript: { ...manuscript, sections: [...manuscript.sections, createSection()] },
  };
}

export function withSectionRemoved(project: Project, sectionId: string): Project {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  const sections = manuscript.sections.filter((section) => section.id !== sectionId);
  return {
    ...project,
    manuscript: { ...manuscript, sections: orOneEmpty(sections) },
  };
}

/** The Markdown document the manuscript export downloads: sections joined
 * on `## heading`, a heading-less section as flowing text. */
export function manuscriptMarkdown(project: Project): string {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  const parts = manuscript.sections
    .map((section) =>
      [section.heading && `## ${section.heading}`, section.text]
        .filter(Boolean)
        .join("\n\n"),
    )
    .filter(Boolean);
  return [`# ${manuscript.title || project.name}`, ...parts].join("\n\n") + "\n";
}

const orOneEmpty = (sections: Section[]): Section[] =>
  sections.length ? sections : [createSection()];

/** Text in SECTION_LIMIT-sized pieces; always at least one piece. */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let at = 0; at === 0 || at < text.length; at += SECTION_LIMIT) {
    chunks.push(text.slice(at, at + SECTION_LIMIT));
  }
  return chunks;
}

/**
 * An over-cap section becomes the original (id kept) holding the first
 * SECTION_LIMIT characters plus heading-less continuation sections, so the
 * cap is enforced without dropping a single character.
 */
export function splitSection(section: Section): Section[] {
  if (section.text.length <= SECTION_LIMIT) return [section];
  const [first, ...rest] = chunkText(section.text);
  return [
    { ...section, text: first },
    ...rest.map((part) => createSection("", part)),
  ];
}

/**
 * Splits plain text or Markdown into capped sections: `## ` lines open
 * sections, text before the first heading is a heading-less preamble
 * section, and every other line — including `# ` lines — is body text.
 */
export function sectionsFromText(text: string): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let body: string[] = [];
  const close = () => {
    const content = body.join("\n").trim();
    if (heading || content) {
      sections.push(...splitSection(createSection(heading, content)));
    }
  };
  for (const line of text.split("\n")) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      close();
      heading = headingMatch[1].trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  close();
  return orOneEmpty(sections);
}

/**
 * Reads a standalone document into a manuscript: an optional leading `# `
 * line becomes the title, the rest becomes sections. The inverse of
 * manuscriptMarkdown, so an export re-imports losslessly. Backup migration
 * uses sectionsFromText directly, where a `# ` line must stay body text.
 */
export function manuscriptFromText(text: string): Manuscript {
  const lines = text.split("\n");
  let start = 0;
  let title = "";
  for (; start < lines.length; start++) {
    const line = lines[start];
    if (!line.trim()) continue;
    const titleMatch = line.match(/^# (.+)$/);
    if (titleMatch) {
      title = titleMatch[1].trim();
      start++;
    }
    break;
  }
  return { title, sections: sectionsFromText(lines.slice(start).join("\n")) };
}

export type AppendOutcome = "appended" | "empty" | "duplicate" | "too_long";

/**
 * Appends the notebook's findings and limitations to the manuscript, each
 * as its own new Section. Existing sections are never altered or replaced:
 * the only possible change is new sections after them. A duplicate is a
 * section with the same heading and text — identity, not substring search.
 * Hypotheses and next experiments stay in the notebook: not findings.
 */
export function appendNotebookToManuscript(project: Project): {
  project: Project;
  outcome: AppendOutcome;
} {
  const notebook = project.notebook ?? emptyNotebook();
  const candidates = [
    { heading: "Findings notes", text: notebook.findings },
    { heading: "Limitations", text: notebook.limitations },
  ].filter((candidate) => candidate.text);
  if (!candidates.length) return { project, outcome: "empty" };
  const manuscript = project.manuscript ?? defaultManuscript(project);
  const additions = candidates.filter(
    (candidate) =>
      !manuscript.sections.some(
        (section) =>
          section.heading === candidate.heading && section.text === candidate.text,
      ),
  );
  if (!additions.length) return { project, outcome: "duplicate" };
  const addedLength = additions.reduce(
    (total, { heading, text }) => total + heading.length + text.length,
    0,
  );
  if (
    additions.some(({ text }) => text.length > SECTION_LIMIT) ||
    manuscriptLength(manuscript) + addedLength > MANUSCRIPT_GUARD
  ) {
    return { project, outcome: "too_long" };
  }
  return {
    project: {
      ...project,
      manuscript: {
        ...manuscript,
        sections: [
          ...manuscript.sections,
          ...additions.map(({ heading, text }) => createSection(heading, text)),
        ],
      },
    },
    outcome: "appended",
  };
}

export function createWorkspace(): Workspace {
  const first = createProject("Untitled project");
  return { version: 3, activeProjectId: first.id, projects: [first] };
}
