import { describe, expect, it } from "vitest";
import type { Paper } from "../library/europePmc";
import {
  appendNotebookToManuscript,
  createProject,
  manuscriptMarkdown,
  withManuscriptUpdate,
  withNotebookUpdate,
  withSavedSource,
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

  it("edits the manuscript title and text", () => {
    const project = createProject("Vision recovery");
    const next = withManuscriptUpdate(
      withManuscriptUpdate(project, { title: "Reprogramming draft" }),
      { text: "First paragraph." },
    );
    expect(next.manuscript).toEqual({ title: "Reprogramming draft", text: "First paragraph." });
  });

  it("exports the manuscript as Markdown with the project name as fallback title", () => {
    const project = withManuscriptUpdate(createProject("Vision recovery"), {
      text: "First paragraph.",
    });
    expect(manuscriptMarkdown(project)).toBe("# Vision recovery\n\nFirst paragraph.\n");
    const titled = withManuscriptUpdate(project, { title: "Reprogramming draft" });
    expect(manuscriptMarkdown(titled)).toBe("# Reprogramming draft\n\nFirst paragraph.\n");
  });
});

describe("appendNotebookToManuscript", () => {
  it("appends findings and limitations as sections after the existing text", () => {
    let project = withManuscriptUpdate(createProject("Vision recovery"), {
      text: "Existing opening paragraph.",
    });
    project = withNotebookUpdate(project, {
      findings: "OSK restores vision in mice.",
      limitations: "Mouse models only.",
    });

    const result = appendNotebookToManuscript(project);

    expect(result.outcome).toBe("appended");
    expect(result.project.manuscript?.text).toBe(
      "Existing opening paragraph.\n\n## Findings notes\n\nOSK restores vision in mice.\n\n## Limitations\n\nMouse models only.",
    );
  });

  it("starts the manuscript with the notes when there is no text yet", () => {
    const project = withNotebookUpdate(createProject("Vision recovery"), {
      findings: "OSK restores vision in mice.",
    });
    const result = appendNotebookToManuscript(project);
    expect(result.outcome).toBe("appended");
    expect(result.project.manuscript?.text).toBe(
      "## Findings notes\n\nOSK restores vision in mice.",
    );
  });

  it("reports empty when there are no findings or limitations to add", () => {
    const project = withNotebookUpdate(createProject("Vision recovery"), {
      hypothesis: "Only a hypothesis.",
    });
    const result = appendNotebookToManuscript(project);
    expect(result.outcome).toBe("empty");
    expect(result.project).toBe(project);
  });

  it("reports duplicate instead of appending the same notes twice", () => {
    let project = withNotebookUpdate(createProject("Vision recovery"), {
      findings: "OSK restores vision in mice.",
    });
    project = appendNotebookToManuscript(project).project;
    const result = appendNotebookToManuscript(project);
    expect(result.outcome).toBe("duplicate");
    expect(result.project).toBe(project);
  });

  it("reports too_long rather than exceeding the manuscript limit", () => {
    let project = withManuscriptUpdate(createProject("Vision recovery"), {
      text: "x".repeat(11990),
    });
    project = withNotebookUpdate(project, { findings: "A long enough finding." });
    const result = appendNotebookToManuscript(project);
    expect(result.outcome).toBe("too_long");
    expect(result.project).toBe(project);
  });
});
