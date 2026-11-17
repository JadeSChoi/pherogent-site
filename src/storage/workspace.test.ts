import { describe, expect, it } from "vitest";
import type { Paper } from "../library/europePmc";
import {
  createProject,
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
