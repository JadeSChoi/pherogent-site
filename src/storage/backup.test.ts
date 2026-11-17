import { describe, expect, it } from "vitest";
import { exportBackup, importBackup } from "./backup";
import { createProject, createWorkspace, withSavedSource, withSourceUpdate } from "./workspace";
import v2MultiProject from "./fixtures/v2-multi-project.json";
import v2WithRecovery from "./fixtures/v2-with-recovery.json";

const text = (fixture: unknown) => JSON.stringify(fixture);

describe("importBackup", () => {
  it("rejects text that is not JSON", () => {
    const result = importBackup("not json {");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/JSON/i);
  });

  it("restores a workspace from the app's own export", () => {
    const workspace = createWorkspace();
    const second = createProject("Axolotl regeneration", "How do axolotls regrow limbs?");
    workspace.projects.push(second);
    workspace.activeProjectId = second.id;

    const result = importBackup(exportBackup(workspace));

    expect(result).toEqual({ ok: true, workspace });
  });

  it("imports a v2 backup with its Projects intact, active project first", () => {
    const result = importBackup(text(v2MultiProject));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { workspace } = result;
    expect(workspace.projects.map((p) => [p.id, p.name, p.question])).toEqual([
      [
        "project-main",
        "Coral bleaching thresholds",
        "At what invented temperature threshold does fixture coral bleach?",
      ],
      [
        "project-aaaa11-bbbbbb",
        "Axolotl limb regeneration",
        "Which signals initiate blastema formation in axolotls?",
      ],
      [
        "project-cccc22-dddddd",
        "Cellular Blockchain · Reversal",
        "Can the sample question be answered with sample evidence?",
      ],
    ]);
    expect(workspace.activeProjectId).toBe("project-main");
    expect(workspace.projects[1].createdAt).toBe("2026-02-10T09:30:00.000Z");
  });

  it("preserves each v2 project's full payload under legacy", () => {
    const result = importBackup(text(v2MultiProject));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [main, axolotl] = result.workspace.projects;
    // The active v2 project is flattened into top-level state; its payload
    // must be reassembled so nothing from the backup is dropped.
    expect(main.legacy).toMatchObject({
      id: "project-main",
      draft: { title: "Coral bleaching thresholds" },
      papers: { "MED:00000001": { title: "A made-up study of imaginary reefs" } },
      logs: [{ type: "Source saved" }],
    });
    expect(axolotl.legacy).toMatchObject({
      id: "project-aaaa11-bbbbbb",
      research: { savedSources: ["MED:00000002"] },
    });
  });

  it("imports a v2 backup carrying legacy and recovery fields without losing them", () => {
    const result = importBackup(text(v2WithRecovery));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { workspace } = result;
    expect(workspace.projects.map((p) => p.id)).toEqual([
      "project-main",
      "project-eeee33-ffffff",
    ]);
    expect(workspace.recovered).toMatchObject({
      legacy: { version: 1, title: "Recovered fictional manuscript" },
      recovery: expect.stringContaining("unparseable earlier save"),
    });
    // Both the backup's own projectRecovery entry and the damaged entry in
    // projects[] are moved aside rather than dropped.
    expect(workspace.recovered?.projectRecovery).toEqual([
      { id: 42, note: "an earlier invalid project entry" },
      { meta: "this entry is damaged and has no id" },
    ]);
  });

  it("rejects malformed backups with a reason", () => {
    for (const bad of [
      "[]",
      "null",
      '"a string"',
      "{}",
      '{"version": 1}',
      // version 2 alone is not a v2 export: the legacy app always writes
      // draft, research, papers, and logs into every backup.
      '{"version": 2}',
      '{"version": 2, "draft": "not a record", "research": {}, "papers": {}, "logs": []}',
      '{"version": 2, "draft": {"title": "x"}, "research": {}, "papers": {}, "logs": [], "projects": "nope"}',
      '{"version": 3, "projects": []}',
      '{"version": 3, "projects": [{"id": "p-1"}]}',
      '{"version": 3, "projects": "nope"}',
    ]) {
      const result = importBackup(bad);
      expect(result.ok, `should reject ${bad}`).toBe(false);
      if (!result.ok) expect(result.reason).toBeTruthy();
    }
  });
});

describe("saved sources in backups", () => {
  const paper = {
    id: "MED:33268865",
    source: "MED",
    title: "Reprogramming to recover youthful epigenetic information and restore vision.",
    authors: ["Lu Y", "Brommer B", "Tian X"],
    year: 2020,
    journal: "Nature",
    doi: "10.1038/s41586-020-2975-4",
    pmid: "33268865",
    pmcid: "PMC7752134",
    url: "https://europepmc.org/article/MED/33268865",
    abstract: "Ectopic expression of Oct4, Sox2 and Klf4 genes…",
    openAccess: true,
  };

  it("round-trips a project's saved sources through export and import", () => {
    const workspace = createWorkspace();
    workspace.projects[0] = withSavedSource(workspace.projects[0], paper);
    workspace.projects[0] = withSourceUpdate(workspace.projects[0], paper.id, {
      note: "Mouse model; clinical generalization needs separate evidence.",
      status: "useful",
    });

    const result = importBackup(exportBackup(workspace));

    expect(result).toEqual({ ok: true, workspace });
  });

  it("drops unreadable saved-source entries instead of rejecting the backup", () => {
    const workspace = createWorkspace();
    workspace.projects[0] = withSavedSource(workspace.projects[0], paper);
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].sources.push({ broken: true }, null, { paper: { id: 7 } });

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.projects[0].sources).toHaveLength(1);
    expect(result.workspace.projects[0].sources?.[0].paper.id).toBe(paper.id);
  });

  it("normalizes an unknown reading status to to-read", () => {
    const workspace = createWorkspace();
    workspace.projects[0] = withSavedSource(workspace.projects[0], paper);
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].sources[0].status = "excellent";

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.projects[0].sources?.[0].status).toBe("to-read");
  });
});

describe("imported source links", () => {
  it("drops a non-web paper url instead of importing it", () => {
    const workspace = createWorkspace();
    workspace.projects[0] = withSavedSource(workspace.projects[0], {
      id: "MED:1",
      source: "MED",
      title: "A paper",
      authors: [],
      year: null,
      journal: "",
      doi: "",
      pmid: "1",
      pmcid: "",
      url: "https://europepmc.org/article/MED/1",
      abstract: "",
      openAccess: false,
    });
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].sources[0].paper.url = "javascript:alert(1)";

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.projects[0].sources?.[0].paper.url).toBe("");
  });
});
