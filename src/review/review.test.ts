import { describe, expect, it } from "vitest";
import { createProject, type Project } from "../storage/workspace";
import type { Paper } from "../library/europePmc";
import {
  isReviewStale,
  keepOriginal,
  keywordOverlap,
  quoteMatches,
  recordDecision,
  undoDecision,
  withReviewPrepared,
  withSentencePatch,
} from "./review";

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
  return { project, sectionId, sentences: project.review!.sentences };
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

describe("withReviewPrepared", () => {
  it("splits a section into listed sentences, skipping heading lines and fragments", () => {
    const { project, sectionId } = projectWithSection(
      "# Working notes\nReprogramming restored visual function in aged mice. Tiny. " +
        "The second cohort showed partial recovery of axon density.",
    );
    const { project: prepared, outcome } = withReviewPrepared(project, sectionId);
    expect(outcome).toBe("prepared");
    expect(prepared.review?.sectionId).toBe(sectionId);
    expect(prepared.review?.sentences.map((sentence) => sentence.text)).toEqual([
      "Reprogramming restored visual function in aged mice.",
      "The second cohort showed partial recovery of axon density.",
    ]);
  });

  it("reviews at most five sentences in one pass", () => {
    const { project, sectionId } = projectWithSection(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`).join(" "),
    );
    const { project: prepared } = withReviewPrepared(project, sectionId);
    expect(prepared.review?.sentences).toHaveLength(5);
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
    const [staged, decided] = first.review!.sentences;
    first.review!.sentences = [
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
    const [carried, kept] = again.review!.sentences;
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
    const sentence = first.review!.sentences[0];
    first.review!.sentences = [
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
    expect(again.review!.sentences[0].decision).toBeNull();
    expect(again.review!.sentences[0].id).not.toBe(sentence.id);
  });

  it("walks the Section in batches: carried decisions plus the next five undecided", () => {
    const { project, sectionId } = projectWithSection(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`).join(" "),
    );
    const first = withReviewPrepared(project, sectionId).project;
    expect(first.review!.sentences).toHaveLength(5);

    let decided = first;
    for (const sentence of first.review!.sentences) {
      decided = keepOriginal(decided, sentence.id);
    }
    const second = withReviewPrepared(decided, sectionId).project;
    expect(second.review!.sentences).toHaveLength(7);
    expect(
      second.review!.sentences.map((sentence) => sentence.decision?.type ?? null),
    ).toEqual(["keep", "keep", "keep", "keep", "keep", null, null]);
    expect(second.review!.sentences.map((sentence) => sentence.text)).toEqual(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`),
    );
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
    const sentence = project.review!.sentences[0];
    const next = withSentencePatch(project, sentence.id, {
      paperId: "MED:1",
      quote: "visual function",
      assessment: "supports",
    });
    expect(next.review!.sentences[0]).toMatchObject({
      paperId: "MED:1",
      quote: "visual function",
      assessment: "supports",
    });
  });

  it("refuses updates on a decided sentence", () => {
    const { project } = prepared();
    const sentence = project.review!.sentences[0];
    project.review!.sentences[0] = {
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
    expect(isReviewStale(project)).toBe(false);
    const edited = {
      ...project,
      manuscript: {
        ...project.manuscript!,
        sections: project.manuscript!.sections.map((section) =>
          section.id === sectionId ? { ...section, text: "Rewritten entirely." } : section,
        ),
      },
    };
    expect(isReviewStale(edited)).toBe(true);
    const sentence = edited.review!.sentences[0];
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
    const decision = decided.review!.sentences[0].decision!;
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
    expect(isReviewStale(decided)).toBe(false);
    const [first, second] = decided.review!.sentences;
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
    expect(confirmed.project.review!.sentences[0].decision!.lowOverlapAcknowledged).toBe(
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
    const decision = decided.review!.sentences[0].decision!;
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
    const decision = kept.review!.sentences[0].decision!;
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
    const [first, second] = undone.review!.sentences;
    expect(first.decision).toBeNull();
    expect(first.text).toBe("Reprogramming restored visual function in aged mice.");
    expect(first.assessment).toBe("partial");
    expect(first.quote).toBe("Visual function improved in aged mice");
    expect(section.text.slice(second.start, second.end)).toBe(second.text);
    expect(isReviewStale(undone)).toBe(false);
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
    const carried = second.review!.sentences[1];
    expect(carried.decision?.type).toBe("keep");
    expect(carried.contextChanged).toBe(true);
    expect(second.review!.sentences[0].contextChanged).toBe(false);

    const third = withReviewPrepared(second, sectionId).project;
    expect(third.review!.sentences[1].contextChanged).toBe(true);

    const undone = undoDecision(third, carried.id);
    expect(undone.review!.sentences[1].contextChanged).toBe(false);
    expect(undone.review!.sentences[1].decision).toBeNull();
  });

  it("leaves the note off when the neighbors read the same", () => {
    const { project, sectionId, sentences } = reviewFixture(TEXT, "Unrelated.");
    const decided = keepOriginal(project, sentences[0].id);
    const again = withReviewPrepared(decided, sectionId).project;
    expect(again.review!.sentences[0].decision?.type).toBe("keep");
    expect(again.review!.sentences[0].contextChanged).toBe(false);
  });

  it("does not flag batch boundaries: a neighbor beyond the cap is not a change", () => {
    const { project, sectionId } = projectWithSection(
      Array.from({ length: 7 }, (_, i) => `Sentence number ${i + 1} is long enough.`).join(" "),
    );
    const first = withReviewPrepared(project, sectionId).project;
    let decided = first;
    for (const sentence of first.review!.sentences) {
      decided = keepOriginal(decided, sentence.id);
    }
    const second = withReviewPrepared(decided, sectionId).project;
    expect(
      second.review!.sentences.map((sentence) => sentence.contextChanged),
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
    expect(current.review!.sentences[1].decision?.type).toBe("approve");
    expect(current.review!.sentences[0].contextChanged).toBe(true);

    const undone = undoDecision(current, second.id);
    expect(undone.review!.sentences[0].contextChanged).toBe(false);
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
