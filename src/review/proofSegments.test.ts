import { describe, expect, it } from "vitest";
import { createProject, type Project } from "../storage/workspace";
import { withReviewPrepared } from "./review";
import { proofSegments } from "./proofSegments";

function prepared(text: string): { project: Project; sectionId: string } {
  const project = createProject("Vision recovery");
  const manuscript = project.manuscript!;
  const section = { ...manuscript.sections[0], text };
  const withText = {
    ...project,
    manuscript: { ...manuscript, sections: [section] },
  };
  return {
    project: withReviewPrepared(withText, section.id).project,
    sectionId: section.id,
  };
}

describe("proofSegments", () => {
  it("interleaves plain text and sentences so the whole section reads back exactly", () => {
    const text =
      "# A heading line\nReprogramming restored visual function in aged mice. Tiny. " +
      "The second cohort showed partial recovery.";
    const { project } = prepared(text);
    const pass = project.reviews![0];
    const segments = proofSegments(pass.baseText, pass.sentences);
    expect(
      segments
        .map((segment) =>
          segment.kind === "text" ? segment.text : segment.sentence.text,
        )
        .join(""),
    ).toBe(text);
    expect(
      segments
        .filter((segment) => segment.kind === "sentence")
        .map((segment) => (segment.kind === "sentence" ? segment.sentence.text : "")),
    ).toEqual([
      "Reprogramming restored visual function in aged mice.",
      "The second cohort showed partial recovery.",
    ]);
  });

  it("returns one text segment for a section with no sentences", () => {
    const segments = proofSegments("Short.", []);
    expect(segments).toEqual([{ kind: "text", text: "Short." }]);
  });
});
