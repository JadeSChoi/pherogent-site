import { describe, expect, it } from "vitest";
import { createProject, type Project } from "../storage/workspace";
import type { Paper } from "../library/europePmc";
import { keepOriginal, withReviewPrepared } from "../review/review";
import { projectSummary } from "./summary";

const SENTENCE = "Reprogramming restored visual function in aged mice.";

const paper = (id: string): Paper => ({
  id,
  source: "MED",
  title: "A measured mouse outcome",
  authors: ["Author A"],
  year: 2020,
  journal: "Journal",
  doi: "",
  pmid: "",
  pmcid: "",
  url: "https://europepmc.org/article/MED/1",
  abstract: "An abstract.",
  openAccess: false,
});

const withSources = (project: Project, count: number): Project => ({
  ...project,
  sources: Array.from({ length: count }, (_, at) => ({
    paper: paper(`MED:${at + 1}`),
    note: "",
    status: "to-read" as const,
    savedAt: "",
  })),
});

const withSectionText = (project: Project, text: string): Project => ({
  ...project,
  manuscript: {
    ...project.manuscript!,
    sections: project.manuscript!.sections.map((section, at) =>
      at === 0 ? { ...section, text } : section,
    ),
  },
});

describe("projectSummary", () => {
  it("summarizes a fresh project and points it at the Library first", () => {
    const summary = projectSummary(createProject("Vision recovery"));
    expect(summary).toMatchObject({
      sourceCount: 0,
      sectionCount: 1,
      wordCount: 0,
      review: { decided: 0, total: 0, awaitingDecision: 0 },
    });
    expect(summary.nextAction.label).toBe("Save your first source");
    expect(summary.nextAction.destination).toBe("library");
  });

  it("points at starting the Manuscript once sources exist but no words do", () => {
    const summary = projectSummary(withSources(createProject("Vision recovery"), 2));
    expect(summary.sourceCount).toBe(2);
    expect(summary.nextAction.label).toBe("Start the manuscript");
    expect(summary.nextAction.destination).toBe("manuscript");
  });

  it("keeps pointing at writing while no sentence is long enough to review", () => {
    const project = withSectionText(
      withSources(createProject("Vision recovery"), 1),
      "Too short. So is this.",
    );
    const summary = projectSummary(project);
    expect(summary.wordCount).toBe(5);
    expect(summary.review.total).toBe(0);
    expect(summary.nextAction.label).toBe("Keep writing the manuscript");
    expect(summary.nextAction.destination).toBe("manuscript");
  });

  it("points at preparing sentences once reviewable text exists without a pass", () => {
    const project = withSectionText(
      withSources(createProject("Vision recovery"), 1),
      SENTENCE,
    );
    const summary = projectSummary(project);
    expect(summary.review).toMatchObject({ decided: 0, total: 1 });
    expect(summary.nextAction.label).toBe("Prepare sentences for review");
    expect(summary.nextAction.destination).toBe("manuscript");
  });

  it("points at deciding while a current pass holds undecided sentences", () => {
    let project = withSectionText(
      withSources(createProject("Vision recovery"), 1),
      SENTENCE,
    );
    project = withReviewPrepared(project, project.manuscript!.sections[0].id).project;
    const summary = projectSummary(project);
    expect(summary.review).toMatchObject({ decided: 0, total: 1, awaitingDecision: 1 });
    expect(summary.nextAction.label).toBe("Decide the prepared sentences");
    expect(summary.nextAction.destination).toBe("manuscript");
  });

  it("points at preparing more once every prepared sentence is decided but others remain", () => {
    // Seven sentences: one pass opens five; deciding all five leaves two
    // reviewable sentences no pass has opened.
    const text = Array.from(
      { length: 7 },
      (_, at) => `Reprogramming restored visual function in cohort ${String.fromCharCode(65 + at)}.`,
    ).join(" ");
    let project = withSectionText(withSources(createProject("Vision recovery"), 1), text);
    project = withReviewPrepared(project, project.manuscript!.sections[0].id).project;
    for (const sentence of project.reviews![0].sentences) {
      project = keepOriginal(project, sentence.id);
    }
    const summary = projectSummary(project);
    expect(summary.review).toMatchObject({ decided: 5, total: 7, awaitingDecision: 0 });
    expect(summary.nextAction.label).toBe("Prepare more sentences for review");
    expect(summary.nextAction.destination).toBe("manuscript");
  });

  it("points at exporting once every reviewable sentence is decided", () => {
    let project = withSectionText(
      withSources(createProject("Vision recovery"), 1),
      SENTENCE,
    );
    project = withReviewPrepared(project, project.manuscript!.sections[0].id).project;
    project = keepOriginal(project, project.reviews![0].sentences[0].id);
    const summary = projectSummary(project);
    expect(summary.review).toMatchObject({ decided: 1, total: 1 });
    expect(summary.nextAction.label).toBe("Export the manuscript");
    expect(summary.nextAction.destination).toBe("manuscript");
  });

  it("calls for preparing again when a pass has gone stale", () => {
    let project = withSectionText(
      withSources(createProject("Vision recovery"), 1),
      SENTENCE,
    );
    project = withReviewPrepared(project, project.manuscript!.sections[0].id).project;
    project = keepOriginal(project, project.reviews![0].sentences[0].id);
    // The Section is rewritten after its decision: the pass is stale and
    // the decision no longer counts against the new text.
    project = withSectionText(project, "A completely rewritten claim about axons.");
    const summary = projectSummary(project);
    expect(summary.review).toMatchObject({ decided: 0, total: 1 });
    expect(summary.nextAction.label).toBe("Prepare sentences for review");
  });
});
