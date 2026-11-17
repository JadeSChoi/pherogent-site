import type { Paper } from "../library/europePmc";
import {
  ASSESSMENTS,
  DECISION_TYPES,
  READING_STATUSES,
  createSection,
  sectionsFromText,
  splitSection,
  type Assessment,
  type Decision,
  type DecisionType,
  type Manuscript,
  type Notebook,
  type Project,
  type ReadingStatus,
  type Review,
  type ReviewSentence,
  type SavedSource,
  type Section,
  type Workspace,
} from "./workspace";

export type ImportResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: string };

export function exportBackup(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2);
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** Backups are author-supplied files; only keep a link that is a web URL. */
function webUrl(x: unknown): string {
  if (typeof x !== "string") return "";
  try {
    const url = new URL(x);
    return url.protocol === "https:" || url.protocol === "http:" ? x : "";
  } catch {
    return "";
  }
}

function parsePaper(x: unknown): Paper | null {
  if (!isRecord(x) || typeof x.id !== "string" || !x.id || typeof x.title !== "string" || !x.title) {
    return null;
  }
  return {
    id: x.id,
    source: str(x.source),
    title: x.title,
    authors: Array.isArray(x.authors) ? x.authors.filter((a): a is string => typeof a === "string") : [],
    year: typeof x.year === "number" && Number.isFinite(x.year) ? x.year : null,
    journal: str(x.journal),
    doi: str(x.doi),
    pmid: str(x.pmid),
    pmcid: str(x.pmcid),
    url: webUrl(x.url),
    abstract: str(x.abstract),
    openAccess: x.openAccess === true,
  };
}

/** An unreadable entry yields null and is dropped; a damaged source must not
 * take the rest of the backup down with it. */
function parseSavedSource(x: unknown): SavedSource | null {
  if (!isRecord(x)) return null;
  const paper = parsePaper(x.paper);
  if (!paper) return null;
  return {
    paper,
    note: str(x.note),
    status: READING_STATUSES.includes(x.status as ReadingStatus)
      ? (x.status as ReadingStatus)
      : "to-read",
    savedAt: str(x.savedAt),
  };
}

/** Unreadable fields fall back to empty strings; prose must survive import. */
function parseNotebook(x: unknown): Notebook | null {
  if (!isRecord(x)) return null;
  return {
    findings: str(x.findings),
    limitations: str(x.limitations),
    hypothesis: str(x.hypothesis),
    nextExperiment: str(x.nextExperiment),
  };
}

function parseSection(x: unknown): Section | null {
  if (!isRecord(x)) return null;
  return {
    id: typeof x.id === "string" && x.id ? x.id : createSection().id,
    heading: str(x.heading),
    text: str(x.text),
  };
}

function parseManuscript(x: unknown): Manuscript | null {
  if (!isRecord(x)) return null;
  if (Array.isArray(x.sections)) {
    const sections = x.sections
      .map(parseSection)
      .filter((section): section is Section => section !== null)
      // An oversized stored section splits rather than staying unbounded.
      .flatMap(splitSection);
    return { title: str(x.title), sections: sections.length ? sections : [createSection()] };
  }
  // A pre-section (issue #8 era) v3 manuscript: one string, split per ADR
  // 0004. sectionsFromText keeps a leading `# ` line as body text — the
  // stored title wins, and no line may vanish in migration.
  return { title: str(x.title), sections: sectionsFromText(str(x.text)) };
}

const assessment = (x: unknown): Assessment =>
  ASSESSMENTS.includes(x as Assessment) ? (x as Assessment) : "unreviewed";

const nullableId = (x: unknown): string | null =>
  typeof x === "string" && x ? x : null;

function parseDecision(x: unknown): Decision | null {
  if (!isRecord(x)) return null;
  // A decision is the author's record; one with no recognizable type or
  // wording is not reconstructible and must not resurface as approved.
  if (
    !DECISION_TYPES.includes(x.type as DecisionType) ||
    typeof x.before !== "string" ||
    typeof x.after !== "string"
  ) {
    return null;
  }
  return {
    type: x.type as DecisionType,
    before: x.before,
    after: x.after,
    paperId: nullableId(x.paperId),
    assessment: assessment(x.assessment),
    quote: str(x.quote),
    note: str(x.note),
    at: str(x.at),
    lowOverlapAcknowledged: x.lowOverlapAcknowledged === true,
  };
}

function parseReviewSentence(x: unknown): ReviewSentence | null {
  if (!isRecord(x)) return null;
  const { id, text, start, end } = x;
  // The offsets anchor wording changes in the section text; a sentence
  // whose anchors are unreadable cannot be safely acted on.
  if (
    typeof id !== "string" ||
    !id ||
    typeof text !== "string" ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    (start as number) < 0 ||
    (end as number) < (start as number)
  ) {
    return null;
  }
  return {
    id,
    text,
    start: start as number,
    end: end as number,
    paperId: nullableId(x.paperId),
    quote: str(x.quote),
    assessment: assessment(x.assessment),
    revision: str(x.revision),
    note: str(x.note),
    decision: parseDecision(x.decision),
  };
}

/** A review pass is re-derivable by preparing again, so an unreadable one
 * is dropped as a whole rather than half-restored. */
function parseReview(x: unknown): Review | null {
  if (!isRecord(x)) return null;
  if (typeof x.sectionId !== "string" || !x.sectionId) return null;
  if (typeof x.baseText !== "string" || !Array.isArray(x.sentences)) return null;
  const baseText = x.baseText;
  const sentences = x.sentences.map(parseReviewSentence);
  if (
    sentences.some(
      // Decisions splice section text at these offsets, so a sentence
      // that is not baseText at its own offsets would corrupt the
      // Manuscript if acted on.
      (sentence) =>
        sentence === null ||
        sentence.end > baseText.length ||
        baseText.slice(sentence.start, sentence.end) !== sentence.text,
    )
  ) {
    return null;
  }
  return {
    sectionId: x.sectionId,
    baseText,
    sentences: sentences as ReviewSentence[],
  };
}

function parseProject(x: unknown): Project | null {
  if (!isRecord(x)) return null;
  const { id, name, question, createdAt } = x;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    typeof name !== "string" ||
    typeof question !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  const project: Project = { id, name, question, createdAt };
  if (Array.isArray(x.sources)) {
    project.sources = x.sources
      .map(parseSavedSource)
      .filter((source): source is SavedSource => source !== null);
  }
  const notebook = parseNotebook(x.notebook);
  if (notebook) project.notebook = notebook;
  const manuscript = parseManuscript(x.manuscript);
  if (manuscript) project.manuscript = manuscript;
  const review = parseReview(x.review);
  if (review) project.review = review;
  if ("legacy" in x) project.legacy = x.legacy;
  return project;
}

function parseV3(data: Record<string, unknown>): ImportResult {
  if (!Array.isArray(data.projects) || data.projects.length === 0) {
    return { ok: false, reason: "The backup contains no projects." };
  }
  const projects: Project[] = [];
  for (const entry of data.projects) {
    const project = parseProject(entry);
    if (!project) return { ok: false, reason: "The backup contains an invalid project." };
    if (projects.some((p) => p.id === project.id)) {
      return { ok: false, reason: "The backup contains duplicate project ids." };
    }
    projects.push(project);
  }
  const activeProjectId =
    typeof data.activeProjectId === "string" &&
    projects.some((p) => p.id === data.activeProjectId)
      ? data.activeProjectId
      : projects[0].id;
  const workspace: Workspace = { version: 3, activeProjectId, projects };
  if (isRecord(data.recovered)) workspace.recovered = data.recovered;
  return { ok: true, workspace };
}

/**
 * Reads one project out of a legacy v2 backup. The v2 project name lives in
 * draft.title and the research question in research.question; the whole v2
 * payload is kept under `legacy` so nothing from the backup is dropped.
 */
function projectFromV2(payload: Record<string, unknown>): Project | null {
  const id = payload.id;
  if (typeof id !== "string" || id.length === 0) return null;
  const draft = isRecord(payload.draft) ? payload.draft : {};
  const research = isRecord(payload.research) ? payload.research : {};
  const meta = isRecord(payload.meta) ? payload.meta : {};
  const project: Project = {
    id,
    name: typeof draft.title === "string" && draft.title ? draft.title : "Untitled project",
    question: typeof research.question === "string" ? research.question : "",
    createdAt:
      typeof meta.createdAt === "string" ? meta.createdAt : new Date().toISOString(),
    legacy: payload,
  };
  // Port the v2 draft into the sectioned Manuscript (ADR 0004); the whole v2
  // payload stays parked under legacy regardless, so nothing is dropped.
  const draftTitle = str(draft.title);
  const draftText = str(draft.text);
  if (draftTitle || draftText.trim()) {
    project.manuscript = {
      title: draftTitle,
      sections: sectionsFromText(draftText),
    };
  }
  return project;
}

function parseV2(data: Record<string, unknown>): ImportResult {
  // The legacy app writes draft, research, papers, and logs into every
  // backup; an object with version 2 but without that shape is not a v2
  // export, and importing it would silently yield an empty workspace.
  if (
    !isRecord(data.draft) ||
    typeof data.draft.title !== "string" ||
    !isRecord(data.research) ||
    !isRecord(data.papers) ||
    !Array.isArray(data.logs) ||
    (data.projects != null && !Array.isArray(data.projects))
  ) {
    return { ok: false, reason: "The file is not a complete v2 workspace backup." };
  }
  // v2 keeps the active project flattened into top-level state; reassemble
  // it into the same shape as the entries of data.projects.
  const activeId =
    typeof data.activeProjectId === "string" && data.activeProjectId
      ? data.activeProjectId
      : "project-main";
  const selected = isRecord(data.selected) ? data.selected : {};
  const active = projectFromV2({
    id: activeId,
    meta: data.projectMeta,
    draft: data.draft,
    research: data.research,
    papers: data.papers,
    logs: data.logs,
    selectedDraft: selected.draft ?? null,
  });
  if (!active) return { ok: false, reason: "The backup's active project is invalid." };

  const projects: Project[] = [active];
  // v2 itself moves unreadable project entries aside instead of dropping
  // them; do the same so a partly damaged backup still imports losslessly.
  const projectRecovery: unknown[] = Array.isArray(data.projectRecovery)
    ? [...data.projectRecovery]
    : [];
  const entries = Array.isArray(data.projects) ? data.projects : [];
  for (const entry of entries) {
    const project = isRecord(entry) ? projectFromV2(entry) : null;
    if (!project || projects.some((p) => p.id === project.id)) {
      projectRecovery.push(entry);
      continue;
    }
    projects.push(project);
  }

  const workspace: Workspace = { version: 3, activeProjectId: activeId, projects };
  const recovered: NonNullable<Workspace["recovered"]> = {};
  if (data.legacy != null) recovered.legacy = data.legacy;
  if (data.recovery != null) recovered.recovery = data.recovery;
  if (projectRecovery.length) recovered.projectRecovery = projectRecovery;
  if (Object.keys(recovered).length) workspace.recovered = recovered;
  return { ok: true, workspace };
}

export function importBackup(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "The file is not valid JSON." };
  }
  if (!isRecord(data)) {
    return { ok: false, reason: "The file is not a Pherogent backup." };
  }
  if (data.version === 3) return parseV3(data);
  if (data.version === 2) return parseV2(data);
  return { ok: false, reason: "Not a recognized backup." };
}
