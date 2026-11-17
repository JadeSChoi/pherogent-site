import type { Project, Workspace } from "./workspace";

export type ImportResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: string };

export function exportBackup(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2);
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);

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
  return {
    id,
    name: typeof draft.title === "string" && draft.title ? draft.title : "Untitled project",
    question: typeof research.question === "string" ? research.question : "",
    createdAt:
      typeof meta.createdAt === "string" ? meta.createdAt : new Date().toISOString(),
    legacy: payload,
  };
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
