import { describe, expect, it } from "vitest";
import {
  createProject,
  type EvidenceCheck,
  type Project,
} from "../storage/workspace";
import type { Paper } from "../library/europePmc";
import {
  recordDecision,
  withEvidenceCheckRecorded,
  withEvidenceCheckReopened,
  withReviewPrepared,
  withSentencePatch,
} from "./review";
import {
  checkFreshness,
  evidenceTrailMarkdown,
  reopenableCheck,
} from "./evidenceTrail";

const SENTENCE = "Reprogramming restored visual function in aged mice.";
const ABSTRACT = "Visual function improved in aged mice.";

const paper = (id: string, abstract = ABSTRACT): Paper => ({
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
  abstract,
  openAccess: false,
});

/** A completed Evidence check run as the client records it. */
const evidenceCheck = (sentenceText: string): EvidenceCheck => ({
  at: "2026-11-18T00:00:00Z",
  runId: "run-1",
  sentenceText,
  citedPaperIds: ["MED:1"],
  cards: [
    {
      paperId: "MED:1",
      suggestion: {
        label: "partial",
        suggestedWording: "Visual function improved in aged mice.",
        reason: "The outcome is narrower than the sentence.",
        mismatchNotes: [],
        studyType: "Animal experiment",
        population: "Mice",
      },
      check: {
        quoteVerified: true,
        quote: "Visual function improved in aged mice.",
        location: "Abstract (excerpt)",
        coverage: "Abstract excerpt only.",
        designAdjusted: false,
      },
    },
  ],
  unavailablePaperIds: [],
  notes: [],
});

/** A prepared, checked project: one section, one saved source, the first
 * sentence carrying a recorded Evidence check. */
function checkedFixture() {
  const base = createProject("Vision recovery");
  const manuscript = base.manuscript!;
  const section = { ...manuscript.sections[0], text: SENTENCE };
  const project: Project = {
    ...base,
    manuscript: { ...manuscript, sections: [section] },
    sources: [{ paper: paper("MED:1"), note: "", status: "useful", savedAt: "" }],
  };
  const prepared = withReviewPrepared(project, section.id).project;
  const sentence = prepared.reviews![0].sentences[0];
  const checked = withEvidenceCheckRecorded(
    prepared,
    sentence.id,
    evidenceCheck(sentence.text),
  );
  return { project: checked, sectionId: section.id, sentenceId: sentence.id };
}

const sentenceOf = (project: Project, sentenceId: string) =>
  project.reviews![0].sentences.find((s) => s.id === sentenceId)!;

/** The project with its one saved source's paper record patched. */
const withPaperPatched = (project: Project, patch: Partial<Paper>): Project => ({
  ...project,
  sources: project.sources!.map((source) => ({
    ...source,
    paper: { ...source.paper, ...patch },
  })),
});

describe("checkFreshness", () => {
  it("is null for a sentence without a recorded check", () => {
    const { project, sentenceId } = checkedFixture();
    const bare = { ...sentenceOf(project, sentenceId), evidenceCheck: null };
    expect(checkFreshness(project, bare)).toBeNull();
  });

  it("reads fresh while the sentence and its checked sources are unchanged", () => {
    const { project, sentenceId } = checkedFixture();
    expect(checkFreshness(project, sentenceOf(project, sentenceId))).toEqual({
      fresh: true,
      reason: expect.stringMatching(/unchanged/i),
    });
  });

  it("marks a check needs-rechecking once the sentence's text changed", () => {
    const { project, sentenceId } = checkedFixture();
    const edited = {
      ...sentenceOf(project, sentenceId),
      text: "Reprogramming restored some visual function in aged mice.",
    };
    expect(checkFreshness(project, edited)).toEqual({
      fresh: false,
      reason: expect.stringMatching(/sentence changed/i),
    });
  });

  it("stays fresh when the author approved a revision after the check", () => {
    const { project, sentenceId } = checkedFixture();
    const assessed = withSentencePatch(project, sentenceId, {
      paperId: "MED:1",
      quote: "Visual function improved in aged mice",
      assessment: "partial",
      revision: "Visual function improved in aged mice.",
    });
    const decided = recordDecision(assessed, sentenceId).project;
    const sentence = sentenceOf(decided, sentenceId);
    expect(sentence.text).toBe("Visual function improved in aged mice.");
    expect(checkFreshness(decided, sentence)).toEqual({
      fresh: true,
      reason: expect.stringMatching(/revision/i),
    });
  });

  it("marks dependent checks needs-rechecking when the source's text changed", () => {
    const { project, sentenceId } = checkedFixture();
    const changed = withPaperPatched(project, {
      abstract: "Visual function declined in aged mice.",
    });
    expect(checkFreshness(changed, sentenceOf(changed, sentenceId))).toEqual({
      fresh: false,
      reason: expect.stringMatching(/text or metadata changed/i),
    });
  });

  it("marks dependent checks needs-rechecking when the source's metadata changed", () => {
    const { project, sentenceId } = checkedFixture();
    const changed = withPaperPatched(project, { year: 2021 });
    expect(checkFreshness(changed, sentenceOf(changed, sentenceId))?.fresh).toBe(false);
  });

  it("ignores the author's reading note and status — reading state, not source state", () => {
    const { project, sentenceId } = checkedFixture();
    const annotated: Project = {
      ...project,
      sources: project.sources!.map((source) => ({
        ...source,
        note: "Re-read the methods.",
        status: "conflicting" as const,
      })),
    };
    expect(checkFreshness(annotated, sentenceOf(annotated, sentenceId))?.fresh).toBe(
      true,
    );
  });

  it("marks the check needs-rechecking when a checked source was removed", () => {
    const { project, sentenceId } = checkedFixture();
    const removed: Project = { ...project, sources: [] };
    expect(checkFreshness(removed, sentenceOf(removed, sentenceId))).toEqual({
      fresh: false,
      reason: expect.stringMatching(/no longer in the Library/i),
    });
  });

  it("marks a check recorded before source tracking as needing rechecking", () => {
    const { project, sentenceId } = checkedFixture();
    const sentence = sentenceOf(project, sentenceId);
    const untracked = {
      ...sentence,
      evidenceCheck: { ...sentence.evidenceCheck!, sourceSnapshots: undefined },
    };
    expect(checkFreshness(project, untracked)).toEqual({
      fresh: false,
      reason: expect.stringMatching(/before source-change tracking/i),
    });
  });
});

/** The checked fixture after the section was edited, re-prepared (which
 * drops the attached check), reverted, and re-prepared again: the
 * sentence reads exactly as checked but no longer carries its check. */
function revertedFixture() {
    const { project, sectionId } = checkedFixture();
    const retext = (text: string) => (p: Project): Project => ({
      ...p,
      manuscript: {
        ...p.manuscript!,
        sections: p.manuscript!.sections.map((s) =>
          s.id === sectionId ? { ...s, text } : s,
        ),
      },
    });
    const edited = withReviewPrepared(
      retext("Reprogramming restored some visual function in aged mice.")(project),
      sectionId,
    ).project;
    const reverted = withReviewPrepared(retext(SENTENCE)(edited), sectionId).project;
    const sentence = reverted.reviews![0].sentences[0];
    expect(sentence.evidenceCheck).toBeNull();
    return { project: reverted, sentence };
  }

describe("reopenableCheck", () => {
  it("finds the logged run for an unchanged sentence and selection", () => {
    const { project, sentence } = revertedFixture();
    const found = reopenableCheck(project, sentence, ["MED:1"]);
    expect(found?.runId).toBe("run-1");
    expect(found?.sentenceText).toBe(SENTENCE);
  });

  it("finds nothing for a different source selection", () => {
    const { project, sentence } = revertedFixture();
    expect(reopenableCheck(project, sentence, ["MED:2"])).toBeNull();
    expect(reopenableCheck(project, sentence, ["MED:1", "MED:2"])).toBeNull();
  });

  it("finds nothing once the sentence's text differs from every logged run", () => {
    const { project, sentence } = revertedFixture();
    const edited = { ...sentence, text: "An entirely different sentence now." };
    expect(reopenableCheck(project, edited, ["MED:1"])).toBeNull();
  });

  it("finds nothing once a checked source's record changed since the run", () => {
    const { project, sentence } = revertedFixture();
    const changed = withPaperPatched(project, { abstract: "Different text." });
    expect(reopenableCheck(changed, sentence, ["MED:1"])).toBeNull();
  });

  it("prefers the latest matching run", () => {
    const { project, sentence } = revertedFixture();
    const again: Project = {
      ...project,
      evidenceRuns: [
        ...project.evidenceRuns!,
        { ...project.evidenceRuns![0], runId: "run-2", at: "2026-11-18T01:00:00Z" },
      ],
    };
    expect(reopenableCheck(again, sentence, ["MED:1"])?.runId).toBe("run-2");
  });
});

describe("withEvidenceCheckReopened", () => {
  it("re-attaches the logged run without a new log entry — nothing ran, nothing was spent", () => {
    const { project, sentence } = revertedFixture();
    const found = reopenableCheck(project, sentence, ["MED:1"])!;
    const reopened = withEvidenceCheckReopened(project, sentence.id, found);
    expect(
      reopened.reviews![0].sentences.find((s) => s.id === sentence.id)!.evidenceCheck
        ?.runId,
    ).toBe("run-1");
    expect(reopened.evidenceRuns).toHaveLength(1);
  });

  it("refuses to attach to a decided sentence", () => {
    const { project, sentenceId } = checkedFixture();
    const assessed = withSentencePatch(project, sentenceId, {
      paperId: "MED:1",
      quote: "Visual function improved in aged mice",
      assessment: "supports",
    });
    const decided = recordDecision(assessed, sentenceId).project;
    const check = sentenceOf(decided, sentenceId).evidenceCheck!;
    expect(withEvidenceCheckReopened(decided, sentenceId, check)).toBe(decided);
  });
});

describe("evidenceTrailMarkdown", () => {
  it("says when no run is recorded", () => {
    expect(evidenceTrailMarkdown(createProject("Vision recovery"))).toMatch(
      /No consented Evidence check runs/,
    );
  });

  it("records run provenance, the checked sentence, and the matched source outcome", () => {
    const { project } = checkedFixture();
    const trail = evidenceTrailMarkdown(project);
    expect(trail).toMatch(/# Evidence trail — Vision recovery/);
    expect(trail).toMatch(/Run run-1 · 2026-11-18T00:00:00Z/);
    expect(trail).toContain(SENTENCE);
    expect(trail).toMatch(/MED:1.*Quote matched in source/);
    expect(trail).toMatch(/partly supports/i);
    expect(trail).toMatch(/Awaiting the author's decision/);
    expect(trail).toContain("> Visual function improved in aged mice.");
  });

  it("records the author's decision outcome once one is made", () => {
    const { project, sentenceId } = checkedFixture();
    const assessed = withSentencePatch(project, sentenceId, {
      paperId: "MED:1",
      quote: "Visual function improved in aged mice",
      assessment: "supports",
    });
    const decided = recordDecision(assessed, sentenceId).project;
    expect(evidenceTrailMarkdown(decided)).toMatch(/Approved by author/);
  });

  it("marks a run needs-rechecking once its sentence was edited away", () => {
    const { project, sectionId } = checkedFixture();
    const edited: Project = {
      ...project,
      manuscript: {
        ...project.manuscript!,
        sections: project.manuscript!.sections.map((s) =>
          s.id === sectionId
            ? { ...s, text: "Reprogramming restored some visual function in aged mice." }
            : s,
        ),
      },
    };
    const reprepared = withReviewPrepared(edited, sectionId).project;
    expect(evidenceTrailMarkdown(reprepared)).toMatch(/Needs rechecking/);
  });

  it("reports not-retrieved and no-card source outcomes", () => {
    const { project, sentenceId } = checkedFixture();
    const sentence = sentenceOf(project, sentenceId);
    const wide: Project = {
      ...project,
      evidenceRuns: [
        {
          ...project.evidenceRuns![0],
          citedPaperIds: ["MED:1", "MED:2", "MED:3"],
          unavailablePaperIds: ["MED:2"],
        },
      ],
      reviews: project.reviews!.map((pass) => ({
        ...pass,
        sentences: pass.sentences.map((s) =>
          s.id === sentence.id
            ? {
                ...s,
                evidenceCheck: {
                  ...s.evidenceCheck!,
                  citedPaperIds: ["MED:1", "MED:2", "MED:3"],
                  unavailablePaperIds: ["MED:2"],
                },
              }
            : s,
        ),
      })),
    };
    const trail = evidenceTrailMarkdown(wide);
    expect(trail).toMatch(/MED:2.*Not retrieved; nothing was substituted/);
    expect(trail).toMatch(/MED:3.*No evidence card survived/);
  });
});
