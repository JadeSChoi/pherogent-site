import { describe, expect, it } from "vitest";
import { exportBackup, importBackup } from "./backup";
import { createProject, createWorkspace, withManuscriptUpdate, withNotebookUpdate, withSavedSource, withSectionUpdate, withSourceUpdate } from "./workspace";
import {
  withActiveStage,
  withAiReply,
  withContextEdited,
  withDraftEdited,
  withDraftReviewed,
} from "../chat/sectionChat";
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

  it("round-trips the Section chat with its conversations, drafts, and context", () => {
    const workspace = createWorkspace();
    let project = workspace.projects[0];
    project = withAiReply(project, "methods", {
      runId: "run-1",
      text: "A structure for the protocol.",
      suggestedDraft: { title: "Methods", body: "Mice were perfused…" },
    });
    project = withDraftEdited(project, "methods", {
      title: "Methods",
      body: "Working draft.",
    });
    project = withDraftReviewed(project, "methods");
    project = withContextEdited(project, "methods", "Cohort: 12 mice.");
    project = withActiveStage(project, "methods");
    workspace.projects[0] = project;

    const result = importBackup(exportBackup(workspace));

    expect(result).toEqual({ ok: true, workspace });
  });

  it("drops an invalid chat entry whole rather than keeping a corrupted conversation", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace)) as {
      projects: Record<string, unknown>[];
    };
    raw.projects[0].chat = {
      activeStage: "nonsense",
      sections: { methods: { messages: "not-a-list", draft: {}, context: 3 } },
    };
    const result = importBackup(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workspace.projects[0].chat).toBeUndefined();
  });

  it("round-trips review passes with their sentences and decisions", () => {
    const workspace = createWorkspace();
    const project = workspace.projects[0];
    const sectionId = project.manuscript!.sections[0].id;
    project.manuscript!.sections[0].text =
      "Reprogramming restored visual function in aged mice.";
    project.reviews = [{
      sectionId,
      baseText: "Reprogramming restored visual function in aged mice.",
      sentences: [
        {
          id: "sentence-1",
          text: "Reprogramming restored visual function in aged mice.",
          start: 0,
          end: 52,
          paperId: "MED:1",
          quote: "Visual function improved",
          assessment: "supports",
          revision: "",
          note: "Mouse study.",
          decision: {
            type: "approve",
            before: "Reprogramming restored visual function in aged mice.",
            after: "Reprogramming restored visual function in aged mice.",
            paperId: "MED:1",
            assessment: "supports",
            quote: "Visual function improved",
            note: "Mouse study.",
            at: "2026-11-17T00:00:00.000Z",
            lowOverlapAcknowledged: false,
            neighbors: { previous: null, next: "A following sentence." },
          },
          evidenceCheck: {
            at: "2026-11-18T00:00:00.000Z",
            runId: "run-1",
            sentenceText: "Reprogramming restored visual function in aged mice.",
            citedPaperIds: ["MED:1"],
            cards: [
              {
                paperId: "MED:1",
                suggestion: {
                  label: "partial",
                  suggestedWording: "Visual function improved in aged mice.",
                  reason: "The outcome is narrower than the sentence.",
                  mismatchNotes: ["Mouse evidence cannot establish a human outcome."],
                  studyType: "Animal experiment",
                  population: "Mice",
                },
                check: {
                  quoteVerified: true,
                  quote: "Visual function improved",
                  location: "Abstract (excerpt)",
                  coverage: "Abstract excerpt only.",
                  designAdjusted: false,
                },
              },
            ],
            unavailablePaperIds: ["PMC:PMC999"],
            notes: ["Only the selected cited sources were checked."],
          },
          contextChanged: true,
        },
      ],
    }];

    const result = importBackup(exportBackup(workspace));

    expect(result).toEqual({ ok: true, workspace });
  });

  it("round-trips source snapshots and the evidence run log", () => {
    const workspace = createWorkspace();
    const project = workspace.projects[0];
    const sectionId = project.manuscript!.sections[0].id;
    const check = {
      at: "2026-11-18T00:00:00.000Z",
      runId: "run-1",
      sentenceText: "Reprogramming restored visual function in aged mice.",
      citedPaperIds: ["MED:1"],
      cards: [],
      unavailablePaperIds: [],
      notes: [],
      sourceSnapshots: { "MED:1": '["MED:1","A title"]' },
    };
    project.evidenceRuns = [{ ...check, sectionId, sentenceId: "sentence-1" }];

    const result = importBackup(exportBackup(workspace));

    expect(result).toEqual({ ok: true, workspace });
  });

  it("drops an unreadable evidence run alone, keeping the rest of the trail", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].evidenceRuns = [
      { not: "a run" },
      {
        at: "2026-11-18T00:00:00.000Z",
        runId: "run-2",
        sentenceText: "A sentence long enough to anchor.",
        citedPaperIds: ["MED:1"],
        cards: [],
        unavailablePaperIds: [],
        notes: [],
        sectionId: "section-1",
        sentenceId: "sentence-1",
      },
    ];

    const result = importBackup(text(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.projects[0].evidenceRuns).toHaveLength(1);
    expect(result.workspace.projects[0].evidenceRuns![0].runId).toBe("run-2");
  });

  it("restores an unreadable Evidence check as null without losing the sentence", () => {
    const workspace = createWorkspace();
    const project = workspace.projects[0];
    const sectionId = project.manuscript!.sections[0].id;
    project.manuscript!.sections[0].text = "A sentence long enough to anchor.";
    const raw = JSON.parse(exportBackup(workspace));
    raw.projects[0].reviews = [
      {
        sectionId,
        baseText: "A sentence long enough to anchor.",
        sentences: [
          {
            id: "sentence-1",
            text: "A sentence long enough to anchor.",
            start: 0,
            end: 33,
            paperId: null,
            quote: "",
            assessment: "unreviewed",
            revision: "",
            note: "",
            evidenceCheck: { cards: "not-an-array" },
            decision: null,
            contextChanged: false,
          },
        ],
      },
    ];
    const result = importBackup(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sentence = result.workspace.projects[0].reviews![0].sentences[0];
    expect(sentence.id).toBe("sentence-1");
    expect(sentence.evidenceCheck).toBeNull();
  });

  it("drops an Evidence check card with an unrecognizable label", () => {
    const workspace = createWorkspace();
    const project = workspace.projects[0];
    const sectionId = project.manuscript!.sections[0].id;
    project.manuscript!.sections[0].text = "A sentence long enough to anchor.";
    const raw = JSON.parse(exportBackup(workspace));
    const card = (label: string) => ({
      paperId: "MED:1",
      suggestion: {
        label,
        suggestedWording: null,
        reason: "r",
        mismatchNotes: [],
        studyType: "s",
        population: "p",
      },
      check: {
        quoteVerified: true,
        quote: "q",
        location: "l",
        coverage: "c",
        designAdjusted: false,
      },
    });
    raw.projects[0].reviews = [
      {
        sectionId,
        baseText: "A sentence long enough to anchor.",
        sentences: [
          {
            id: "sentence-1",
            text: "A sentence long enough to anchor.",
            start: 0,
            end: 33,
            paperId: null,
            quote: "",
            assessment: "unreviewed",
            revision: "",
            note: "",
            evidenceCheck: {
              at: "2026-11-18T00:00:00.000Z",
              runId: null,
              sentenceText: "A sentence long enough to anchor.",
              citedPaperIds: ["MED:1"],
              cards: [card("decides-for-you"), card("partial")],
              unavailablePaperIds: [],
              notes: [],
            },
            decision: null,
            contextChanged: false,
          },
        ],
      },
    ];
    const result = importBackup(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const check = result.workspace.projects[0].reviews![0].sentences[0].evidenceCheck;
    expect(check?.cards.map((c) => c.suggestion.label)).toEqual(["partial"]);
  });

  it("imports a pre-ADR-0006 single review as that Section's one pass", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace)) as {
      projects: Record<string, unknown>[];
    };
    raw.projects[0].review = {
      sectionId: "section-old",
      baseText: "A sentence prepared before per-Section passes.",
      sentences: [
        {
          id: "sentence-old",
          text: "A sentence prepared before per-Section passes.",
          start: 0,
          end: 46,
          paperId: null,
          quote: "",
          assessment: "unreviewed",
          revision: "",
          note: "",
          decision: null,
        },
      ],
    };

    const result = importBackup(JSON.stringify(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reviews = result.workspace.projects[0].reviews!;
    expect(reviews).toHaveLength(1);
    expect(reviews[0].sectionId).toBe("section-old");
    expect(reviews[0].sentences[0].id).toBe("sentence-old");
  });

  it("drops a pass that reuses another pass's sentence id", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace)) as {
      projects: Record<string, unknown>[];
    };
    const sentence = {
      id: "sentence-shared",
      text: "A sentence long enough to anchor.",
      start: 0,
      end: 33,
      paperId: null,
      quote: "",
      assessment: "unreviewed",
      revision: "",
      note: "",
      decision: null,
    };
    raw.projects[0].reviews = [
      { sectionId: "section-a", baseText: sentence.text, sentences: [sentence] },
      { sectionId: "section-b", baseText: sentence.text, sentences: [sentence] },
    ];

    const result = importBackup(JSON.stringify(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const reviews = result.workspace.projects[0].reviews!;
    expect(reviews.map((pass) => pass.sectionId)).toEqual(["section-a"]);
  });

  it("drops an unreadable review without losing the project", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace)) as {
      projects: Record<string, unknown>[];
    };
    raw.projects[0].review = { sectionId: 7, sentences: "not a list" };

    const result = importBackup(JSON.stringify(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.projects[0].reviews).toBeUndefined();
    expect(result.workspace.projects[0].id).toBe(workspace.projects[0].id);
  });

  it("drops a review whose sentence offsets do not anchor in its baseText", () => {
    const workspace = createWorkspace();
    const raw = JSON.parse(exportBackup(workspace)) as {
      projects: Record<string, unknown>[];
    };
    raw.projects[0].review = {
      sectionId: "section-x",
      baseText: "Short text.",
      sentences: [
        {
          id: "sentence-1",
          text: "A sentence that is not at these offsets.",
          start: 0,
          end: 40,
          paperId: null,
          quote: "",
          assessment: "unreviewed",
          revision: "",
          note: "",
          decision: null,
        },
      ],
    };

    const result = importBackup(JSON.stringify(raw));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace.projects[0].reviews).toBeUndefined();
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
