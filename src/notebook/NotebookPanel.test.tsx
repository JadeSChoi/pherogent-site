import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { createProject, withManuscriptUpdate, type Project } from "../storage/workspace";
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

  it("refuses an append that would exceed the manuscript limit", () => {
    const full = withManuscriptUpdate(createProject("Vision recovery"), {
      text: "x".repeat(11990),
    });
    render(<Harness initial={full} />);
    fireEvent.change(screen.getByLabelText("Findings & interpretation"), {
      target: { value: "A finding that will not fit." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add notes to manuscript" }));
    expect(screen.getByRole("status").textContent).toMatch(/12,000/);
  });
});
