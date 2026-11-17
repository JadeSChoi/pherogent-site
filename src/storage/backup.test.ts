import { describe, expect, it } from "vitest";
import { exportBackup, importBackup } from "./backup";
import { createProject, createWorkspace, withManuscriptUpdate, withNotebookUpdate, withSavedSource, withSectionUpdate, withSourceUpdate } from "./workspace";
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

describe("notebook and manuscript in backups", () => {
  it("round-trips the notebook and sectioned manuscript through export and import", () => {
    const workspace = createWorkspace();
    workspace.projects[0] = withNotebookUpdate(workspace.projects[0], {
      findings: "OSK restores vision in mice.",
      nextExperiment: "Test in aged primates.",
    });
    workspace.projects[0] = withManuscriptUpdate(workspace.projects[0], {
      title: "Reprogramming draft",
    });
    workspace.projects[0] = withSectionUpdate(
      workspace.projects[0],
      workspace.projects[0].manuscript!.sections[0].id,
      { heading: "Introduction", text: "First paragraph." },
    );

    const result = importBackup(exportBackup(workspace));

    expect(result).toEqual({ ok: true, workspace });
  });

  it("migrates a pre-section v3 string manuscript into sections", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].manuscript = {
      title: "Reprogramming draft",
      text: "Opening paragraph.\n\n## Methods\n\nWe measured things.",
    };

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manuscript = result.workspace.projects[0].manuscript;
    expect(manuscript?.title).toBe("Reprogramming draft");
    expect(manuscript?.sections.map((s) => [s.heading, s.text])).toEqual([
      ["", "Opening paragraph."],
      ["Methods", "We measured things."],
    ]);
  });

  it("keeps a v3 text's leading # line as text instead of dropping it", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].manuscript = {
      title: "Stored title",
      text: "# A pasted markdown heading\n\nOpening paragraph.",
    };

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manuscript = result.workspace.projects[0].manuscript;
    expect(manuscript?.title).toBe("Stored title");
    expect(manuscript?.sections[0].text).toBe(
      "# A pasted markdown heading\n\nOpening paragraph.",
    );
  });

  it("splits an oversized restored section instead of keeping it unbounded", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace));
    const big = "z".repeat(50000);
    raw.projects[0].manuscript = {
      title: "",
      sections: [{ id: "section-big", heading: "Results", text: big }],
    };

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sections = result.workspace.projects[0].manuscript!.sections;
    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0].id).toBe("section-big");
    expect(sections[0].heading).toBe("Results");
    expect(sections.every((s) => s.text.length <= 20000)).toBe(true);
    expect(sections.map((s) => s.text).join("")).toBe(big);
  });

  it("ports a v2 backup's draft into the sectioned manuscript", () => {
    const result = importBackup(text(v2MultiProject));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const main = result.workspace.projects[0];
    expect(main.manuscript?.title).toBe("Coral bleaching thresholds");
    expect(main.manuscript?.sections.map((s) => [s.heading, s.text])).toEqual([
      ["", "A fully invented paragraph about fixture reefs."],
    ]);
    // The full v2 payload stays parked under legacy regardless.
    expect(main.legacy).toBeTruthy();
  });

  it("restores a damaged notebook to safe empty fields instead of rejecting", () => {
    const workspace = createWorkspace();
    workspace.projects[0] = withNotebookUpdate(workspace.projects[0], {
      findings: "Keep me.",
    });
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].notebook.limitations = 42;
    raw.projects[0].manuscript = "not an object";

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const project = result.workspace.projects[0];
    expect(project.notebook?.findings).toBe("Keep me.");
    expect(project.notebook?.limitations).toBe("");
    expect(project.manuscript).toBeUndefined();
  });
});
