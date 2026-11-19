import { describe, expect, it } from "vitest";
import { createProject, type EvidenceCheck, type Project } from "../storage/workspace";
import type { Paper } from "../library/europePmc";
import {
  isReviewStale,
  keepOriginal,
  keywordOverlap,
  quoteMatches,
  recordDecision,
  reviewProgress,
  undoDecision,
  withEvidenceCheckRecorded,
  withReviewPrepared,
  withSentencePatch,
} from "./review";

/** A completed Evidence check run as stored on a sentence. */
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
        mismatchNotes: ["Mouse evidence cannot establish a human outcome."],
        studyType: "Animal experiment",
        population: "Mice",
      },
      check: {
        quoteVerified: true,
        quote: "Visual function improved in aged mice.",
        location: "Abstract (excerpt)",
        coverage: "Abstract excerpt only; full-text methods and results were not checked.",
        designAdjusted: false,
      },
    },
  ],
  unavailablePaperIds: [],
  notes: ["Only the selected cited sources were checked."],
});

const paper = (id: string, abstract: string): Paper => ({
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

/** A prepared project with one saved source to review against. */
function reviewFixture(sectionText: string, abstract: string) {
  const { project: base, sectionId } = projectWithSection(sectionText);
  const withSource: Project = {
    ...base,
    sources: [
      { paper: paper("MED:1", abstract), note: "", status: "useful", savedAt: "" },
    ],
  };
  const project = withReviewPrepared(withSource, sectionId).project;
  return { project, sectionId, sentences: project.reviews![0].sentences };
}

/** A project whose first manuscript section holds the given text. */
function projectWithSection(text: string): { project: Project; sectionId: string } {
  const project = createProject("Vision recovery");
  const manuscript = project.manuscript!;
  const section = { ...manuscript.sections[0], text };
  return {
    project: { ...project, manuscript: { ...manuscript, sections: [section] } },
    sectionId: section.id,
  };
}

/** A project with two manuscript sections. */
function projectWithSections(
  first: string,
  second: string,
): { project: Project; firstId: string; secondId: string } {
  const project = createProject("Vision recovery");
  const manuscript = project.manuscript!;
  const sections = [
    { ...manuscript.sections[0], text: first },
    { id: "section-second", heading: "Methods", text: second },
  ];
  return {
    project: { ...project, manuscript: { ...manuscript, sections } },
    firstId: sections[0].id,
    secondId: sections[1].id,
  };
}

describe("per-Section review passes", () => {
  const FIRST = "Reprogramming restored visual function in aged mice.";
  const SECOND = "We measured axon density at four and eight weeks.";

  it("preparing one Section never discards another Section's pass or decisions", () => {
    const { project, firstId, secondId } = projectWithSections(FIRST, SECOND);
    const one = withReviewPrepared(project, firstId).project;
    const decided = keepOriginal(one, one.reviews![0].sentences[0].id);
    const both = withReviewPrepared(decided, secondId).project;
    expect(both.reviews).toHaveLength(2);
    const firstPass = both.reviews!.find((pass) => pass.sectionId === firstId)!;
    expect(firstPass.sentences[0].decision?.type).toBe("keep");
    const secondPass = both.reviews!.find((pass) => pass.sectionId === secondId)!;
    expect(secondPass.sentences[0].text).toBe(SECOND);
  });

  it("editing one Section stales only its own pass; the other stays actionable", () => {
    const { project, firstId, secondId } = projectWithSections(FIRST, SECOND);
    let current = withReviewPrepared(project, firstId).project;
    current = withReviewPrepared(current, secondId).project;
    const secondSentence = current
      .reviews!.find((pass) => pass.sectionId === secondId)!
      .sentences[0];
    const edited: Project = {
      ...current,
      manuscript: {
        ...current.manuscript!,
        sections: current.manuscript!.sections.map((section) =>
          section.id === firstId ? { ...section, text: "Rewritten entirely." } : section,
        ),
      },
    };
    expect(isReviewStale(edited, firstId)).toBe(true);
    expect(isReviewStale(edited, secondId)).toBe(false);
    const decided = keepOriginal(edited, secondSentence.id);
    const pass = decided.reviews!.find((p) => p.sectionId === secondId)!;
    expect(pass.sentences[0].decision?.type).toBe("keep");
    const undone = undoDecision(decided, secondSentence.id);
    expect(
      undone.reviews!.find((p) => p.sectionId === secondId)!.sentences[0].decision,
    ).toBeNull();
  });

  it("re-preparing a Section replaces only that Section's pass", () => {
    const { project, firstId, secondId } = projectWithSections(FIRST, SECOND);
    let current = withReviewPrepared(project, firstId).project;
    current = withReviewPrepared(current, secondId).project;
    const again = withReviewPrepared(current, firstId).project;
    expect(again.reviews).toHaveLength(2);
    expect(again.reviews!.filter((pass) => pass.sectionId === firstId)).toHaveLength(1);
  });
});

describe("withReviewPrepared", () => {
  it("splits a section into listed sentences, skipping heading lines and fragments", () => {
    const { project, sectionId } = projectWithSection(
      "# Working notes\nReprogramming restored visual function in aged mice. Tiny. " +
        "The second cohort showed partial recovery of axon density.",
    );
    const { project: prepared, outcome } = withReviewPrepared(project, sectionId);
    expect(outcome).toBe("prepared");
    expect(prepared.reviews?.[0].sectionId).toBe(sectionId);
    expect(prepared.reviews?.[0].sentences.map((sentence) => sentence.text)).toEqual([
      "Reprogramming restored visual function in aged mice.",
      "The second cohort showed partial recovery of axon density.",
    ]);
  });

  it("reviews at most five sentences in one pass", () => {
    const { project, sectionId } = projectWithSection(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`).join(" "),
    );
    const { project: prepared } = withReviewPrepared(project, sectionId);
    expect(prepared.reviews?.[0].sentences).toHaveLength(5);
  });

  it("reports no_sentences for fragments only, leaving the project unchanged", () => {
    const { project, sectionId } = projectWithSection("Too short.\n# Only a heading line here");
    const result = withReviewPrepared(project, sectionId);
    expect(result.outcome).toBe("no_sentences");
    expect(result.project).toBe(project);
  });

  it("carries working state and decisions across re-preparation for byte-identical sentences", () => {
    const { project, sectionId } = projectWithSection(
      "Reprogramming restored visual function in aged mice. The second cohort showed partial recovery.",
    );
    const first = withReviewPrepared(project, sectionId).project;
    const [staged, decided] = first.reviews![0].sentences;
    first.reviews![0].sentences = [
      { ...staged, paperId: "MED:1", quote: "a pasted passage", assessment: "supports", note: "n" },
      {
        ...decided,
        assessment: "conflicting",
        decision: {
          type: "flag",
          before: decided.text,
          after: decided.text,
          paperId: null,
          assessment: "conflicting",
          quote: "",
          note: "",
          at: "2026-11-17T00:00:00Z",
          lowOverlapAcknowledged: false,
          neighbors: null,
        },
      },
    ];
    const again = withReviewPrepared(first, sectionId).project;
    const [carried, kept] = again.reviews![0].sentences;
    expect(carried.id).toBe(staged.id);
    expect(carried.paperId).toBe("MED:1");
    expect(carried.quote).toBe("a pasted passage");
    expect(carried.assessment).toBe("supports");
    expect(kept.id).toBe(decided.id);
    expect(kept.decision?.type).toBe("flag");
    expect(kept.assessment).toBe("conflicting");
  });

  it("resets a decision when the sentence's own text changed", () => {
    const { project, sectionId } = projectWithSection(
      "Reprogramming restored visual function in aged mice.",
    );
    const first = withReviewPrepared(project, sectionId).project;
    const sentence = first.reviews![0].sentences[0];
    first.reviews![0].sentences = [
      {
        ...sentence,
        decision: {
          type: "keep",
          before: sentence.text,
          after: sentence.text,
          paperId: null,
          assessment: "unreviewed",
          quote: "",
          note: "",
          at: "2026-11-17T00:00:00Z",
          lowOverlapAcknowledged: false,
          neighbors: null,
        },
      },
    ];
    const edited = {
      ...first,
      manuscript: {
        ...first.manuscript!,
        sections: first.manuscript!.sections.map((s) =>
          s.id === sectionId
            ? { ...s, text: "Reprogramming restored some visual function in aged mice." }
            : s,
        ),
      },
    };
    const again = withReviewPrepared(edited, sectionId).project;
    expect(again.reviews![0].sentences[0].decision).toBeNull();
    expect(again.reviews![0].sentences[0].id).not.toBe(sentence.id);
  });

  it("walks the Section in batches: carried decisions plus the next five undecided", () => {
    const { project, sectionId } = projectWithSection(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`).join(" "),
    );
    const first = withReviewPrepared(project, sectionId).project;
    expect(first.reviews![0].sentences).toHaveLength(5);

    let decided = first;
    for (const sentence of first.reviews![0].sentences) {
      decided = keepOriginal(decided, sentence.id);
    }
    const second = withReviewPrepared(decided, sectionId).project;
    expect(second.reviews![0].sentences).toHaveLength(7);
    expect(
      second.reviews![0].sentences.map((sentence) => sentence.decision?.type ?? null),
    ).toEqual(["keep", "keep", "keep", "keep", "keep", null, null]);
    expect(second.reviews![0].sentences.map((sentence) => sentence.text)).toEqual(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`),
    );
  });
});

describe("withEvidenceCheckRecorded", () => {
  const prepared = () => {
    const { project, sectionId } = projectWithSection(
      "Reprogramming restored visual function in aged mice.",
    );
    const next = withReviewPrepared(project, sectionId).project;
    return { project: next, sectionId, sentence: next.reviews![0].sentences[0] };
  };

  it("attaches the check to an undecided sentence of a current pass", () => {
    const { project, sentence } = prepared();
    const check = evidenceCheck(sentence.text);
    const next = withEvidenceCheckRecorded(project, sentence.id, check);
    expect(next.reviews![0].sentences[0].evidenceCheck).toEqual({
      ...check,
      sourceSnapshots: {},
    });
  });

  it("replaces an earlier check on the same sentence", () => {
    const { project, sentence } = prepared();
    const first = withEvidenceCheckRecorded(project, sentence.id, {
      ...evidenceCheck(sentence.text),
      runId: "run-old",
    });
    const next = withEvidenceCheckRecorded(
      first,
      sentence.id,
      evidenceCheck(sentence.text),
    );
    expect(next.reviews![0].sentences[0].evidenceCheck?.runId).toBe("run-1");
  });

  it("refuses to attach to a decided sentence", () => {
    const { project, sentence } = prepared();
    const decided = keepOriginal(project, sentence.id);
    const next = withEvidenceCheckRecorded(
      decided,
      sentence.id,
      evidenceCheck(sentence.text),
    );
    expect(next).toBe(decided);
  });

  it("refuses to attach to a stale pass", () => {
    const { project, sectionId, sentence } = prepared();
    const edited: Project = {
      ...project,
      manuscript: {
        ...project.manuscript!,
        sections: project.manuscript!.sections.map((s) =>
          s.id === sectionId ? { ...s, text: "Changed text entirely now." } : s,
        ),
      },
    };
    const next = withEvidenceCheckRecorded(
      edited,
      sentence.id,
      evidenceCheck(sentence.text),
    );
    expect(next).toBe(edited);
  });

  it("carries the check across re-preparation for a byte-identical sentence", () => {
    const { project, sectionId, sentence } = prepared();
    const checked = withEvidenceCheckRecorded(
      project,
      sentence.id,
      evidenceCheck(sentence.text),
    );
    const again = withReviewPrepared(checked, sectionId).project;
    expect(again.reviews![0].sentences[0].evidenceCheck?.runId).toBe("run-1");
  });

  it("drops the check when the sentence's own text changed", () => {
    const { project, sectionId, sentence } = prepared();
    const checked = withEvidenceCheckRecorded(
      project,
      sentence.id,
      evidenceCheck(sentence.text),
    );
    const edited: Project = {
      ...checked,
      manuscript: {
        ...checked.manuscript!,
        sections: checked.manuscript!.sections.map((s) =>
          s.id === sectionId
            ? { ...s, text: "Reprogramming restored some visual function in aged mice." }
            : s,
        ),
      },
    };
    const again = withReviewPrepared(edited, sectionId).project;
    expect(again.reviews![0].sentences[0].evidenceCheck).toBeNull();
  });
});

describe("evidence run log", () => {
  const SENTENCE = "Reprogramming restored visual function in aged mice.";
  const ABSTRACT = "Visual function improved in aged mice.";

  it("recording a check snapshots the cited saved sources and logs the run", () => {
    const { project, sectionId, sentences } = reviewFixture(SENTENCE, ABSTRACT);
    const next = withEvidenceCheckRecorded(
      project,
      sentences[0].id,
      evidenceCheck(sentences[0].text),
    );
    const attached = next.reviews![0].sentences[0].evidenceCheck!;
    expect(attached.sourceSnapshots).toEqual({ "MED:1": expect.any(String) });
    expect(next.evidenceRuns).toHaveLength(1);
    expect(next.evidenceRuns![0]).toMatchObject({
      sectionId,
      sentenceId: sentences[0].id,
      runId: "run-1",
      sentenceText: sentences[0].text,
      sourceSnapshots: { "MED:1": expect.any(String) },
    });
  });

  it("a replacing run appends to the log; earlier provenance is never overwritten", () => {
    const { project, sentences } = reviewFixture(SENTENCE, ABSTRACT);
    const first = withEvidenceCheckRecorded(project, sentences[0].id, {
      ...evidenceCheck(sentences[0].text),
      runId: "run-old",
    });
    const next = withEvidenceCheckRecorded(
      first,
      sentences[0].id,
      evidenceCheck(sentences[0].text),
    );
    expect(next.evidenceRuns!.map((run) => run.runId)).toEqual(["run-old", "run-1"]);
  });

  it("editing the checked sentence keeps the logged run even as the attached check resets", () => {
    const { project, sectionId, sentences } = reviewFixture(SENTENCE, ABSTRACT);
    const checked = withEvidenceCheckRecorded(
      project,
      sentences[0].id,
      evidenceCheck(sentences[0].text),
    );
    const edited: Project = {
      ...checked,
      manuscript: {
        ...checked.manuscript!,
        sections: checked.manuscript!.sections.map((s) =>
          s.id === sectionId
            ? { ...s, text: "Reprogramming restored some visual function in aged mice." }
            : s,
        ),
      },
    };
    const again = withReviewPrepared(edited, sectionId).project;
    expect(again.reviews![0].sentences[0].evidenceCheck).toBeNull();
    expect(again.evidenceRuns).toHaveLength(1);
    expect(again.evidenceRuns![0].runId).toBe("run-1");
  });
});

describe("withSentencePatch and staleness", () => {
  const prepared = () => {
    const { project, sectionId } = projectWithSection(
      "Reprogramming restored visual function in aged mice.",
    );
    return { project: withReviewPrepared(project, sectionId).project, sectionId };
  };

  it("records the author's working state on an undecided sentence", () => {
    const { project } = prepared();
    const sentence = project.reviews![0].sentences[0];
    const next = withSentencePatch(project, sentence.id, {
      paperId: "MED:1",
      quote: "visual function",
      assessment: "supports",
    });
    expect(next.reviews![0].sentences[0]).toMatchObject({
      paperId: "MED:1",
      quote: "visual function",
      assessment: "supports",
    });
  });

  it("refuses updates on a decided sentence", () => {
    const { project } = prepared();
    const sentence = project.reviews![0].sentences[0];
    project.reviews![0].sentences[0] = {
      ...sentence,
      decision: {
        type: "keep",
        before: sentence.text,
        after: sentence.text,
        paperId: null,
        assessment: "unreviewed",
        quote: "",
        note: "",
        at: "2026-11-17T00:00:00Z",
        lowOverlapAcknowledged: false,
        neighbors: null,
      },
    };
    expect(withSentencePatch(project, sentence.id, { quote: "changed" })).toBe(project);
  });

  it("editing the section text makes the pass stale and blocks updates", () => {
    const { project, sectionId } = prepared();
    expect(isReviewStale(project, sectionId)).toBe(false);
    const edited = {
      ...project,
      manuscript: {
        ...project.manuscript!,
        sections: project.manuscript!.sections.map((section) =>
          section.id === sectionId ? { ...section, text: "Rewritten entirely." } : section,
        ),
      },
    };
    expect(isReviewStale(edited, sectionId)).toBe(true);
    const sentence = edited.reviews![0].sentences[0];
    expect(withSentencePatch(edited, sentence.id, { quote: "x" })).toBe(edited);
  });
});

describe("recordDecision", () => {
  const ABSTRACT =
    "Visual function improved in aged mice after reprogramming. " +
    "The weather was sunny yesterday afternoon.";

  it("approves a supports assessment as an explicit decision carrying the citation", () => {
    const { project, sentences } = reviewFixture(
      "Reprogramming restored visual function in aged mice.",
      ABSTRACT,
    );
    const staged = withSentencePatch(project, sentences[0].id, {
      paperId: "MED:1",
      quote: "Visual function improved in aged mice",
      assessment: "supports",
      note: "Mouse study.",
    });
    const { project: decided, outcome } = recordDecision(staged, sentences[0].id);
    expect(outcome).toBe("approved");
    const decision = decided.reviews![0].sentences[0].decision!;
    expect(decision.type).toBe("approve");
    expect(decision.paperId).toBe("MED:1");
    expect(decision.before).toBe(decision.after);
  });

  it("never decides without the author's explicit, complete input", () => {
    const { project, sentences } = reviewFixture(
      "Reprogramming restored visual function in aged mice.",
      ABSTRACT,
    );
    const id = sentences[0].id;
    const cases: [string, Project][] = [
      ["no source selected", withSentencePatch(project, id, { assessment: "supports", quote: "Visual function improved" })],
      ["assessment unreviewed", withSentencePatch(project, id, { paperId: "MED:1", quote: "Visual function improved" })],
      [
        "quote not in the source",
        withSentencePatch(project, id, { paperId: "MED:1", assessment: "supports", quote: "A paraphrased claim." }),
      ],
      [
        "partial without a revision",
        withSentencePatch(project, id, { paperId: "MED:1", assessment: "partial", quote: "Visual function improved" }),
      ],
    ];
    for (const [label, staged] of cases) {
      const result = recordDecision(staged, id);
      expect(result.outcome, label).toBe("blocked");
      expect(result.project, label).toBe(staged);
    }
  });

  it("applies a partial assessment's revised wording to the manuscript section", () => {
    const { project, sectionId, sentences } = reviewFixture(
      "Reprogramming restored visual function in aged mice. The effect size was small.",
      ABSTRACT,
    );
    const staged = withSentencePatch(project, sentences[0].id, {
      paperId: "MED:1",
      quote: "Visual function improved in aged mice",
      assessment: "partial",
      revision: "Reprogramming improved visual function in aged mice.",
    });
    const { project: decided, outcome } = recordDecision(staged, sentences[0].id);
    expect(outcome).toBe("approved");
    const section = decided.manuscript!.sections.find((s) => s.id === sectionId)!;
    expect(section.text).toBe(
      "Reprogramming improved visual function in aged mice. The effect size was small.",
    );
    expect(isReviewStale(decided, sectionId)).toBe(false);
    const [first, second] = decided.reviews![0].sentences;
    expect(first.text).toBe("Reprogramming improved visual function in aged mice.");
    expect(first.decision!.before).toBe(
      "Reprogramming restored visual function in aged mice.",
    );
    expect(section.text.slice(second.start, second.end)).toBe(second.text);
  });

  it("demands explicit acknowledgment when keyword overlap is low", () => {
    const { project, sentences } = reviewFixture(
      "Reprogramming reverses aging in humans.",
      ABSTRACT,
    );
    const staged = withSentencePatch(project, sentences[0].id, {
      paperId: "MED:1",
      quote: "The weather was sunny yesterday afternoon.",
      assessment: "supports",
    });
    const asked = recordDecision(staged, sentences[0].id);
    expect(asked.outcome).toBe("needs_acknowledgment");
    expect(asked.project).toBe(staged);
    const confirmed = recordDecision(staged, sentences[0].id, {
      acknowledgedLowOverlap: true,
    });
    expect(confirmed.outcome).toBe("approved");
    expect(confirmed.project.reviews![0].sentences[0].decision!.lowOverlapAcknowledged).toBe(
      true,
    );
  });

  it("records a conflicting assessment as a finding, never as a citation", () => {
    const { project, sectionId, sentences } = reviewFixture(
      "Reprogramming restored visual function in aged mice.",
      ABSTRACT,
    );
    const staged = withSentencePatch(project, sentences[0].id, {
      paperId: "MED:1",
      assessment: "conflicting",
      note: "The source reports the opposite direction.",
    });
    const { project: decided, outcome } = recordDecision(staged, sentences[0].id);
    expect(outcome).toBe("finding_recorded");
    const decision = decided.reviews![0].sentences[0].decision!;
    expect(decision.type).toBe("flag");
    expect(decision.paperId).toBeNull();
    expect(decided.manuscript!.sections.find((s) => s.id === sectionId)!.text).toBe(
      "Reprogramming restored visual function in aged mice.",
    );
  });
});

describe("keepOriginal", () => {
  it("retains the wording and records that the concern stays unresolved", () => {
    const { project, sentences } = reviewFixture(
      "Reprogramming restored visual function in aged mice.",
      "Unrelated abstract.",
    );
    const kept = keepOriginal(project, sentences[0].id);
    const decision = kept.reviews![0].sentences[0].decision!;
    expect(decision.type).toBe("keep");
    expect(decision.paperId).toBeNull();
    expect(decision.before).toBe(decision.after);
  });
});

describe("undoDecision", () => {
  const ABSTRACT = "Visual function improved in aged mice after reprogramming.";
  const TEXT =
    "Reprogramming restored visual function in aged mice. The effect size was small.";

  it("restores the prior wording and reopens the sentence for review", () => {
    const { project, sectionId, sentences } = reviewFixture(TEXT, ABSTRACT);
    const staged = withSentencePatch(project, sentences[0].id, {
      paperId: "MED:1",
      quote: "Visual function improved in aged mice",
      assessment: "partial",
      revision: "Reprogramming improved visual function in aged mice.",
    });
    const decided = recordDecision(staged, sentences[0].id).project;
    const undone = undoDecision(decided, sentences[0].id);
    const section = undone.manuscript!.sections.find((s) => s.id === sectionId)!;
    expect(section.text).toBe(TEXT);
    const [first, second] = undone.reviews![0].sentences;
    expect(first.decision).toBeNull();
    expect(first.text).toBe("Reprogramming restored visual function in aged mice.");
    expect(first.assessment).toBe("partial");
    expect(first.quote).toBe("Visual function improved in aged mice");
    expect(section.text.slice(second.start, second.end)).toBe(second.text);
    expect(isReviewStale(undone, sectionId)).toBe(false);
  });

  it("does nothing without a decision", () => {
    const { project, sentences } = reviewFixture(TEXT, ABSTRACT);
    expect(undoDecision(project, sentences[0].id)).toBe(project);
  });
});

describe("context-changed note", () => {
  const TEXT = "First sentence is long enough here. Second sentence is also long enough.";

  const withAppended = (project: Project, addition: string): Project => ({
    ...project,
    manuscript: {
      ...project.manuscript!,
      sections: project.manuscript!.sections.map((section) => ({
        ...section,
        text: section.text + addition,
      })),
    },
  });

  it("flags a carried decision whose neighbor changed, stays sticky, and clears on undo", () => {
    const { project, sectionId, sentences } = reviewFixture(TEXT, "Unrelated.");
    const decided = keepOriginal(project, sentences[1].id);
    const edited = withAppended(decided, " A third sentence appears afterwards.");
    const second = withReviewPrepared(edited, sectionId).project;
    const carried = second.reviews![0].sentences[1];
    expect(carried.decision?.type).toBe("keep");
    expect(carried.contextChanged).toBe(true);
    expect(second.reviews![0].sentences[0].contextChanged).toBe(false);

    const third = withReviewPrepared(second, sectionId).project;
    expect(third.reviews![0].sentences[1].contextChanged).toBe(true);

    const undone = undoDecision(third, carried.id);
    expect(undone.reviews![0].sentences[1].contextChanged).toBe(false);
    expect(undone.reviews![0].sentences[1].decision).toBeNull();
  });

  it("leaves the note off when the neighbors read the same", () => {
    const { project, sectionId, sentences } = reviewFixture(TEXT, "Unrelated.");
    const decided = keepOriginal(project, sentences[0].id);
    const again = withReviewPrepared(decided, sectionId).project;
    expect(again.reviews![0].sentences[0].decision?.type).toBe("keep");
    expect(again.reviews![0].sentences[0].contextChanged).toBe(false);
  });

  it("does not flag batch boundaries: a neighbor beyond the cap is not a change", () => {
    const { project, sectionId } = projectWithSection(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`).join(" "),
    );
    const first = withReviewPrepared(project, sectionId).project;
    let decided = first;
    for (const sentence of first.reviews![0].sentences) {
      decided = keepOriginal(decided, sentence.id);
    }
    const second = withReviewPrepared(decided, sectionId).project;
    expect(
      second.reviews![0].sentences.map((sentence) => sentence.contextChanged),
    ).toEqual([false, false, false, false, false, false, false]);
  });

  it("flags an in-pass neighbor revision immediately, and clears when it is undone", () => {
    const abstract = "It was also long enough for mice.";
    const { project, sentences } = reviewFixture(TEXT, abstract);
    const [first, second] = sentences;
    let current = keepOriginal(project, first.id);
    current = withSentencePatch(current, second.id, {
      paperId: "MED:1",
      quote: "also long enough",
      assessment: "partial",
      revision: "Second sentence reads differently now.",
    });
    current = recordDecision(current, second.id, { acknowledgedLowOverlap: true }).project;
    expect(current.reviews![0].sentences[1].decision?.type).toBe("approve");
    expect(current.reviews![0].sentences[0].contextChanged).toBe(true);

    const undone = undoDecision(current, second.id);
    expect(undone.reviews![0].sentences[0].contextChanged).toBe(false);
  });
});

describe("reviewProgress", () => {
  const FIRST = "Reprogramming restored visual function in aged mice.";
  const SECOND = "We measured axon density at four and eight weeks.";

  it("counts reviewable sentences across all Sections, with zero decided before any pass", () => {
    const { project } = projectWithSections(`${FIRST} ${SECOND}`, FIRST);
    expect(reviewProgress(project)).toEqual({
      decided: 0,
      total: 3,
      awaitingDecision: 0,
    });
  });

  it("counts decisions across every Section's pass", () => {
    const { project, firstId, secondId } = projectWithSections(FIRST, SECOND);
    let current = withReviewPrepared(project, firstId).project;
    current = withReviewPrepared(current, secondId).project;
    expect(reviewProgress(current)).toEqual({
      decided: 0,
      total: 2,
      awaitingDecision: 2,
    });
    current = keepOriginal(
      current,
      current.reviews!.find((pass) => pass.sectionId === firstId)!.sentences[0].id,
    );
    current = keepOriginal(
      current,
      current.reviews!.find((pass) => pass.sectionId === secondId)!.sentences[0].id,
    );
    expect(reviewProgress(current)).toEqual({
      decided: 2,
      total: 2,
      awaitingDecision: 0,
    });
  });

  it("skips heading lines and short fragments, like preparation does", () => {
    const { project } = projectWithSection(`# Working notes\n${FIRST} Tiny.`);
    expect(reviewProgress(project)).toEqual({
      decided: 0,
      total: 1,
      awaitingDecision: 0,
    });
  });

  it("counts a stale pass's decision only where it would carry to unchanged text", () => {
    const { project, firstId } = projectWithSections(`${FIRST} ${SECOND}`, "");
    let current = withReviewPrepared(project, firstId).project;
    const pass = current.reviews![0];
    current = keepOriginal(current, pass.sentences[0].id);
    current = keepOriginal(current, pass.sentences[1].id);
    // The first sentence's wording changes after its decision: that
    // decision no longer counts, while the untouched second one still does.
    const edited: Project = {
      ...current,
      manuscript: {
        ...current.manuscript!,
        sections: current.manuscript!.sections.map((section) =>
          section.id === firstId
            ? { ...section, text: `Rewritten opening sentence entirely. ${SECOND}` }
            : section,
        ),
      },
    };
    expect(isReviewStale(edited, firstId)).toBe(true);
    // The stale pass's undecided sentences are not awaiting a decision:
    // nothing on a stale pass is actionable until it is prepared again.
    expect(reviewProgress(edited)).toEqual({
      decided: 1,
      total: 2,
      awaitingDecision: 0,
    });
  });
});

describe("quoteMatches", () => {
  const source = "Visual function improved in mice.\nAxon density partially recovered.";

  it("matches an exact pasted passage, tolerating only whitespace differences", () => {
    expect(quoteMatches("function improved  in mice", source)).toBe(true);
    expect(quoteMatches("Axon density\npartially recovered", source)).toBe(true);
  });

  it("rejects paraphrases, absent text, and empty passages", () => {
    expect(quoteMatches("function improved in humans", source)).toBe(false);
    expect(quoteMatches("An invented passage.", source)).toBe(false);
    expect(quoteMatches("   ", source)).toBe(false);
  });
});

describe("keywordOverlap", () => {
  it("flags a passage sharing no keywords with the wording", () => {
    const overlap = keywordOverlap(
      "Reprogramming reverses aging in humans.",
      "The weather was sunny yesterday afternoon.",
    );
    expect(overlap.low).toBe(true);
    expect(overlap.shared).toEqual([]);
  });

  it("accepts shared keywords, counting singular and plural as the same term", () => {
    const overlap = keywordOverlap(
      "Axons regenerated in treated mice.",
      "Treated mice showed axon regrowth.",
    );
    expect(overlap.low).toBe(false);
    expect(overlap.shared).toContain("axons");
  });

  it("flags a long sentence sharing under a fifth of its keywords", () => {
    const overlap = keywordOverlap(
      "Epigenetic reprogramming restored youthful transcription signatures in cortical neurons.",
      "Neurons were measured.",
    );
    expect(overlap.low).toBe(true);
    expect(overlap.shared).toEqual(["neurons"]);
  });
});
