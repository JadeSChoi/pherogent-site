import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  SECTION_LIMIT,
  createProject,
  withSectionAdded,
  withSectionUpdate,
  type Project,
} from "../storage/workspace";
import { NotebookPanel } from "./NotebookPanel";

function Harness({ initial }: { initial?: Project }) {
  const [project, setProject] = useState(
    initial ?? createProject("Vision recovery"),
  );
  return <NotebookPanel project={project} onProjectChange={setProject} />;
}

describe("NotebookPanel", () => {
  it("edits all four notebook fields", () => {
    render(<Harness />);
    const fields: Array<[string, string]> = [
      ["Findings & interpretation", "OSK restores vision in mice."],
      ["Limitations & alternatives", "Mouse models only."],
      ["Working hypothesis", "Reprogramming is reversible."],
      ["Next experiment or question", "Test in aged primates."],
    ];
    for (const [label, value] of fields) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    for (const [label, value] of fields) {
      expect((screen.getByLabelText(label) as HTMLTextAreaElement).value).toBe(value);
    }
  });

  it("confirms when notes were added to the manuscript", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Findings & interpretation"), {
      target: { value: "OSK restores vision in mice." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add notes to manuscript" }));
    expect(screen.getByRole("status").textContent).toMatch(/added to the manuscript/i);

    // A second click must not silently duplicate the notes.
    fireEvent.click(screen.getByRole("button", { name: "Add notes to manuscript" }));
    expect(screen.getByRole("status").textContent).toMatch(/already in the manuscript/i);
  });

  it("asks for findings before appending an empty notebook", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add notes to manuscript" }));
    expect(screen.getByRole("status").textContent).toMatch(/write findings/i);
  });

  it("refuses an append that would exceed the manuscript safety limit", () => {
    let full = createProject("Vision recovery");
    const big = "x".repeat(SECTION_LIMIT);
    // Fill the manuscript to the 500,000-character guard with full sections.
    for (let chars = 0; chars < 500000; chars += big.length) {
      full = withSectionAdded(full);
      const last = full.manuscript!.sections.at(-1)!;
      full = withSectionUpdate(full, last.id, { text: big });
    }
    render(<Harness initial={full} />);
    fireEvent.change(screen.getByLabelText("Findings & interpretation"), {
      target: { value: "A finding that will not fit." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add notes to manuscript" }));
    expect(screen.getByRole("status").textContent).toMatch(/500,000/);
  });
});
