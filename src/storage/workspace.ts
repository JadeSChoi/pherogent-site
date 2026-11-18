/**
 * The browser-local workspace model (ADR-0002): every Project the author
 * works on, with one of them active. Persisted as JSON in browser storage
 * and exported verbatim as the backup format.
 */

import type { Paper } from "../library/europePmc";
import type { ProjectChat } from "../chat/sectionChat";

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

/** Words across the manuscript's headings and text, for the rail count. */
export function manuscriptWordCount(project: Project): number {
  const manuscript = project.manuscript ?? defaultManuscript(project);
  return manuscript.sections.reduce(
    (total, section) =>
      total + (`${section.heading} ${section.text}`.match(/\S+/g)?.length ?? 0),
    0,
  );
}

export function manuscriptLength(manuscript: Manuscript): number {
  return manuscript.sections.reduce(
    (total, section) => total + section.heading.length + section.text.length,
    0,
  );
}

/** The author's reading of one reviewed sentence against one source. */
export type Assessment =
  | "unreviewed"
  | "supports"
  | "partial"
  | "conflicting"
  | "unsupported";

export const ASSESSMENTS: readonly Assessment[] = [
  "unreviewed",
  "supports",
  "partial",
  "conflicting",
  "unsupported",
];

export type DecisionType = "approve" | "keep" | "flag";

export const DECISION_TYPES: readonly DecisionType[] = ["approve", "keep", "flag"];

/** The texts of the sentences immediately before and after a reviewed
 * sentence; null where there is none. */
export type NeighborTexts = {
  previous: string | null;
  next: string | null;
};

/**
 * The author's explicit, recorded decision on one reviewed sentence.
 * Nothing writes one of these except an author action; nothing approves
 * automatically.
 */
export type Decision = {
  type: DecisionType;
  /** The sentence wording before and after the decision. */
  before: string;
  after: string;
  /** The approved citation; null when no citation was approved. */
  paperId: string | null;
  assessment: Assessment;
  quote: string;
  note: string;
  at: string;
  /** True when the author approved despite a low keyword overlap warning. */
  lowOverlapAcknowledged: boolean;
  /**
   * The neighboring sentences as they read when the decision was made:
   * the baseline for the context-changed note (ADR 0005). Null on
   * decisions recorded before the note existed, which keep their stored
   * flag instead.
   */
  neighbors: NeighborTexts | null;
};

/** The model's label for one sentence against one source. An unverified
 * suggestion, never a decision (see AVOID: verdict). */
export type AiLabel = "supports" | "partial" | "unsupported" | "contradicts";

export const AI_LABELS: readonly AiLabel[] = [
  "supports",
  "partial",
  "unsupported",
  "contradicts",
];

/**
 * Record one of three in an Evidence check: the AI's unverified reading of
 * the sentence against one source. Waiting on the author; approves nothing.
 */
export type AiSuggestion = {
  label: AiLabel;
  /** A narrower rewrite the model proposed; null when it proposed none. */
  suggestedWording: string | null;
  reason: string;
  mismatchNotes: string[];
  studyType: string;
  population: string;
};

/**
 * Record two of three in an Evidence check: what the server's code verified
 * about the suggestion. Text checks only, no scientific judgment.
 */
export type CodeCheck = {
  /** The server matched the quote verbatim in text it fetched itself. */
  quoteVerified: boolean;
  quote: string;
  /** Where in the source the quoted passage sits (e.g. abstract excerpt). */
  location: string;
  /** How much of the source the check could read. */
  coverage: string;
  /** True when the study-design rule overrode the model's label. */
  designAdjusted: boolean;
};

/** One source's pair of records within an Evidence check run. */
export type EvidenceCheckCard = {
  paperId: string;
  suggestion: AiSuggestion;
  check: CodeCheck;
};

/**
 * One consented AI Evidence check run on one prepared sentence: the AI
 * suggestion and code check records per source. The author's decision — the
 * third record — stays separate on the sentence; nothing here decides.
 */
export type EvidenceCheck = {
  at: string;
  runId: string | null;
  /** The exact sentence text that was sent and checked. */
  sentenceText: string;
  /** The saved sources the author explicitly selected and consented to send. */
  citedPaperIds: string[];
  cards: EvidenceCheckCard[];
  /** Requested sources the server could not retrieve; none were substituted. */
  unavailablePaperIds: string[];
  /** The run's uncertainty notes, including discarded-card warnings. */
  notes: string[];
  /**
   * Fingerprint of each cited saved source's paper record as it stood when
   * the check was recorded, keyed by paper id (issue #11): the baseline the
   * needs-rechecking state compares against. Absent on checks recorded
   * before source-change tracking, which therefore read as needing
   * rechecking. A source missing from the Library at record time has no
   * entry.
   */
  sourceSnapshots?: Record<string, string>;
};

/**
 * One consented Evidence check run in the Project's append-only run log
 * (issue #11): the check as recorded plus where it attached. The log is the
 * durable evidence trail — later edits, re-preparations, and replacing runs
 * never remove or rewrite an entry.
 */
export type EvidenceRun = EvidenceCheck & {
  sectionId: string;
  sentenceId: string;
};

/** One Manuscript sentence prepared for evidence review, with the author's
 * working review state and, once made, their decision. */
export type ReviewSentence = {
  id: string;
  /** Current wording; tracks the section text through applied revisions. */
  text: string;
  /** Offsets of the sentence within the section text. */
  start: number;
  end: number;
  /** The saved source under inspection; null until the author picks one. */
  paperId: string | null;
  /** The passage the author pasted from the source. */
  quote: string;
  assessment: Assessment;
  /** Proposed replacement wording, used when the assessment is partial. */
  revision: string;
  note: string;
  /** The latest consented AI Evidence check run on this sentence, if any. */
  evidenceCheck: EvidenceCheck | null;
  decision: Decision | null;
  /**
   * True when a neighboring sentence's text changed after this sentence's
   * decision was made (ADR 0005): a quiet prompt to re-read, never a gate.
   * Sticky across passes; cleared when the decision is undone or re-made.
   */
  contextChanged: boolean;
};

/**
 * One review pass over one Section (ADR 0004: sentence preparation is
 * per-section; ADR 0006: each Section keeps its own pass). baseText is
 * the section text the pass was prepared from; when that section's text
 * differs the pass is stale and every action on it is blocked until the
 * author prepares that Section again — other Sections' passes are
 * untouched.
 */
export type Review = {
  sectionId: string;
  baseText: string;
  sentences: ReviewSentence[];
};

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
  /** The evidence review passes, at most one per Section (ADR 0006);
   * absent until sentences are first prepared. */
  reviews?: Review[];
  /** The append-only Evidence check run log (issue #11); absent until a
   * check first completes. */
  evidenceRuns?: EvidenceRun[];
  /** The Section chat state (issue #12); absent until the chat is used. */
  chat?: ProjectChat;
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
