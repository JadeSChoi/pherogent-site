import { describe, expect, it } from "vitest";
import type { Paper } from "../library/europePmc";
import {
  MANUSCRIPT_GUARD,
  SECTION_LIMIT,
  appendNotebookToManuscript,
  createProject,
  manuscriptFromText,
  manuscriptMarkdown,
  sectionsFromText,
  withManuscriptUpdate,
  withNotebookUpdate,
  withSavedSource,
  withSectionAdded,
  withSectionRemoved,
  withSectionUpdate,
  withSourceUpdate,
} from "./workspace";

const paper: Paper = {
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

describe("withSavedSource", () => {
  it("saves a paper to the project with a to-read status and empty note", () => {
    const project = createProject("Vision recovery");
    const next = withSavedSource(project, paper);
    expect(next.sources).toHaveLength(1);
    expect(next.sources?.[0]).toMatchObject({
      paper,
      note: "",
      status: "to-read",
    });
    expect(typeof next.sources?.[0].savedAt).toBe("string");
    // The input project is not mutated.
    expect(project.sources).toBeUndefined();
  });

  it("keeps the existing note and status when the same paper is saved again", () => {
    let project = withSavedSource(createProject("Vision recovery"), paper);
    project = withSourceUpdate(project, paper.id, {
      note: "Mouse model only.",
      status: "useful",
    });
    const next = withSavedSource(project, { ...paper, title: "Different metadata" });
    expect(next.sources).toHaveLength(1);
    expect(next.sources?.[0].note).toBe("Mouse model only.");
    expect(next.sources?.[0].status).toBe("useful");
    expect(next.sources?.[0].paper.title).toBe(paper.title);
  });
});

describe("withSourceUpdate", () => {
  it("updates only the addressed source", () => {
    const other: Paper = { ...paper, id: "MED:123", pmid: "123" };
    let project = withSavedSource(createProject("Vision recovery"), paper);
    project = withSavedSource(project, other);

    const next = withSourceUpdate(project, paper.id, { status: "conflicting" });
    expect(next.sources?.find((s) => s.paper.id === paper.id)?.status).toBe(
      "conflicting",
    );
    expect(next.sources?.find((s) => s.paper.id === other.id)?.status).toBe(
      "to-read",
    );
  });

  it("returns the project unchanged for an unknown paper id", () => {
    const project = withSavedSource(createProject("Vision recovery"), paper);
    expect(withSourceUpdate(project, "MED:999", { note: "x" })).toBe(project);
  });
});

describe("notebook and manuscript", () => {
  it("edits notebook fields without mutating the input project", () => {
    const project = createProject("Vision recovery");
    const next = withNotebookUpdate(project, { findings: "OSK restores vision in mice." });
    expect(next.notebook?.findings).toBe("OSK restores vision in mice.");
    expect(next.notebook?.limitations).toBe("");
    expect(project.notebook).toBeUndefined();

    const again = withNotebookUpdate(next, { hypothesis: "Reprogramming is reversible." });
    expect(again.notebook?.findings).toBe("OSK restores vision in mice.");
    expect(again.notebook?.hypothesis).toBe("Reprogramming is reversible.");
  });

  it("edits the manuscript title and the text of one section", () => {
    const project = createProject("Vision recovery");
    let next = withManuscriptUpdate(project, { title: "Reprogramming draft" });
    const sectionId = next.manuscript!.sections[0].id;
    next = withSectionUpdate(next, sectionId, {
      heading: "Introduction",
      text: "First paragraph.",
    });
    expect(next.manuscript?.title).toBe("Reprogramming draft");
    expect(next.manuscript?.sections).toEqual([
      { id: sectionId, heading: "Introduction", text: "First paragraph." },
    ]);
    expect(withSectionUpdate(next, "section-unknown", { text: "x" })).toBe(next);
  });

  it("adds and removes sections", () => {
    let project = withManuscriptUpdate(createProject("Vision recovery"), {});
    project = withSectionAdded(project);
    expect(project.manuscript?.sections).toHaveLength(2);
    const [first, second] = project.manuscript!.sections;
    expect(second.id).not.toBe(first.id);
    project = withSectionRemoved(project, first.id);
    expect(project.manuscript?.sections.map((s) => s.id)).toEqual([second.id]);
  });

  it("exports the sections as one Markdown document", () => {
    let project = withManuscriptUpdate(createProject("Vision recovery"), {
      title: "Reprogramming draft",
    });
    const opening = project.manuscript!.sections[0].id;
    project = withSectionUpdate(project, opening, { text: "Opening paragraph." });
    project = withSectionAdded(project);
    const second = project.manuscript!.sections[1].id;
    project = withSectionUpdate(project, second, {
      heading: "Methods",
      text: "We measured things.",
    });
    expect(manuscriptMarkdown(project)).toBe(
      "# Reprogramming draft\n\nOpening paragraph.\n\n## Methods\n\nWe measured things.\n",
    );
  });

  it("falls back to the project name for the exported title", () => {
    const project = createProject("Vision recovery");
    expect(manuscriptMarkdown(project)).toBe("# Vision recovery\n");
  });
});

describe("manuscriptFromText", () => {
  it("splits on ## headings with a heading-less preamble section", () => {
    const parsed = manuscriptFromText(
      "Opening paragraph.\n\n## Methods\n\nWe measured things.\n\n## Results\n\nIt worked.",
    );
    expect(parsed.title).toBe("");
    expect(
      parsed.sections.map((s) => [s.heading, s.text]),
    ).toEqual([
      ["", "Opening paragraph."],
      ["Methods", "We measured things."],
      ["Results", "It worked."],
    ]);
  });

  it("reads a leading # line as the document title", () => {
    const parsed = manuscriptFromText("# Reprogramming draft\n\nOpening paragraph.");
    expect(parsed.title).toBe("Reprogramming draft");
    expect(parsed.sections.map((s) => [s.heading, s.text])).toEqual([
      ["", "Opening paragraph."],
    ]);
  });

  it("round-trips its own export", () => {
    let project = withManuscriptUpdate(createProject("Vision recovery"), {
      title: "Reprogramming draft",
    });
    project = withSectionUpdate(project, project.manuscript!.sections[0].id, {
      text: "Opening paragraph.",
    });
    project = withSectionAdded(project);
    project = withSectionUpdate(project, project.manuscript!.sections[1].id, {
      heading: "Methods",
      text: "We measured things.",
    });

    const parsed = manuscriptFromText(manuscriptMarkdown(project));

    expect(parsed.title).toBe("Reprogramming draft");
    expect(parsed.sections.map((s) => [s.heading, s.text])).toEqual(
      project.manuscript!.sections.map((s) => [s.heading, s.text]),
    );
  });

  it("yields one empty section for empty text", () => {
    const parsed = manuscriptFromText("");
    expect(parsed.sections.map((s) => [s.heading, s.text])).toEqual([["", ""]]);
  });

  it("splits an oversized body into capped continuation sections, losing nothing", () => {
    const big = "y".repeat(SECTION_LIMIT * 2 + 5000);
    const parsed = manuscriptFromText("## Results\n\n" + big);
    expect(parsed.sections.length).toBe(3);
    expect(parsed.sections[0].heading).toBe("Results");
    for (const section of parsed.sections) {
      expect(section.text.length).toBeLessThanOrEqual(SECTION_LIMIT);
    }
    expect(parsed.sections.map((s) => s.text).join("")).toBe(big);
  });
});

describe("sectionsFromText", () => {
  it("keeps a leading # line as body text instead of consuming it", () => {
    const sections = sectionsFromText("# Not a title here\n\nBody follows.");
    expect(sections.map((s) => [s.heading, s.text])).toEqual([
      ["", "# Not a title here\n\nBody follows."],
    ]);
  });
});

describe("appendNotebookToManuscript", () => {
  it("appends findings and limitations as new sections after the existing ones", () => {
    let project = withManuscriptUpdate(createProject("Vision recovery"), {});
    const opening = project.manuscript!.sections[0].id;
    project = withSectionUpdate(project, opening, { text: "Existing opening paragraph." });
    project = withNotebookUpdate(project, {
      findings: "OSK restores vision in mice.",
      limitations: "Mouse models only.",
    });

    const result = appendNotebookToManuscript(project);

    expect(result.outcome).toBe("appended");
    expect(
      result.project.manuscript?.sections.map((s) => [s.heading, s.text]),
    ).toEqual([
      ["", "Existing opening paragraph."],
      ["Findings notes", "OSK restores vision in mice."],
      ["Limitations", "Mouse models only."],
    ]);
    // The pre-existing section is untouched, not rewritten.
    expect(result.project.manuscript?.sections[0].id).toBe(opening);
  });

  it("reports empty when there are no findings or limitations to add", () => {
    const project = withNotebookUpdate(createProject("Vision recovery"), {
      hypothesis: "Only a hypothesis.",
    });
    const result = appendNotebookToManuscript(project);
    expect(result.outcome).toBe("empty");
    expect(result.project).toBe(project);
  });

  it("detects a duplicate by section identity, not by substring", () => {
    let project = withNotebookUpdate(createProject("Vision recovery"), {
      findings: "OSK restores vision in mice.",
    });
    project = appendNotebookToManuscript(project).project;
    expect(appendNotebookToManuscript(project).outcome).toBe("duplicate");

    // The same sentence inside a larger section is NOT a duplicate.
    let embedded = withNotebookUpdate(createProject("Vision recovery"), {
      findings: "OSK restores vision in mice.",
    });
    embedded = withSectionUpdate(embedded, embedded.manuscript?.sections[0].id ?? "", {
      text: "As we argue, OSK restores vision in mice. More prose follows.",
    });
    expect(appendNotebookToManuscript(embedded).outcome).toBe("appended");
  });

  it("appends only the sections that are not already present", () => {
    let project = withNotebookUpdate(createProject("Vision recovery"), {
      findings: "OSK restores vision in mice.",
    });
    project = appendNotebookToManuscript(project).project;
    project = withNotebookUpdate(project, { limitations: "Mouse models only." });

    const result = appendNotebookToManuscript(project);

    expect(result.outcome).toBe("appended");
    expect(
      result.project.manuscript?.sections.map((s) => s.heading),
    ).toEqual(["", "Findings notes", "Limitations"]);
  });

  it("reports too_long rather than exceeding the manuscript guard", () => {
    let project = withManuscriptUpdate(createProject("Vision recovery"), {});
    const big = "x".repeat(SECTION_LIMIT - 100);
    for (let added = 0; added * big.length < MANUSCRIPT_GUARD; added++) {
      project = withSectionAdded(project);
      const last = project.manuscript!.sections.at(-1)!;
      project = withSectionUpdate(project, last.id, { text: big });
    }
    project = withNotebookUpdate(project, { findings: "One more finding." });
    const result = appendNotebookToManuscript(project);
    expect(result.outcome).toBe("too_long");
    expect(result.project).toBe(project);
  });
});
