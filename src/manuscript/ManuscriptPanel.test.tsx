import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { createProject, type Project } from "../storage/workspace";
import { ManuscriptPanel } from "./ManuscriptPanel";

function Harness({ initial }: { initial?: Project }) {
  const [project, setProject] = useState(
    initial ?? createProject("Vision recovery"),
  );
  return <ManuscriptPanel project={project} onProjectChange={setProject} />;
}

const importFile = (text: string, name = "draft.md") =>
  fireEvent.change(screen.getByLabelText("Import manuscript file"), {
    target: { files: [new File([text], name, { type: "text/markdown" })] },
  });

const field = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;

describe("ManuscriptPanel", () => {
  it("edits the document title and the first section's text", () => {
    render(<Harness />);
    fireEvent.change(field("Document title"), {
      target: { value: "Reprogramming draft" },
    });
    fireEvent.change(field("Section 1 text"), {
      target: { value: "First paragraph." },
    });
    expect(field("Document title").value).toBe("Reprogramming draft");
    expect(field("Section 1 text").value).toBe("First paragraph.");
  });

  it("adds a section with its own heading and removes an empty one", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));
    fireEvent.change(field("Section 2 heading"), {
      target: { value: "Methods" },
    });
    expect(field("Section 2 heading").value).toBe("Methods");

    fireEvent.change(field("Section 2 heading"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove section 2" }));
    expect(screen.queryByLabelText("Section 2 text")).toBeNull();
  });

  it("imports a Markdown file into sections, with a # line as the title", async () => {
    render(<Harness />);
    importFile("# Imported draft\n\nOpening.\n\n## Methods\n\nWe measured things.");
    expect(await screen.findByDisplayValue("We measured things.")).toBeTruthy();
    expect(field("Document title").value).toBe("Imported draft");
    expect(field("Section 1 text").value).toBe("Opening.");
    expect(field("Section 2 heading").value).toBe("Methods");
  });

  it("asks before an import replaces existing manuscript text", async () => {
    render(<Harness />);
    fireEvent.change(field("Section 1 text"), {
      target: { value: "Existing writing." },
    });
    importFile("Imported replacement.");

    fireEvent.click(
      await screen.findByRole("button", { name: "Replace manuscript text" }),
    );
    expect(field("Section 1 text").value).toBe("Imported replacement.");
  });

  it("cancels an import when the author switches projects before the file is read", async () => {
    const projects = [createProject("First"), createProject("Second")];
    function SwitchHarness() {
      const [all, setAll] = useState(projects);
      const [active, setActive] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setActive(1)}>
            Switch to second
          </button>
          <ManuscriptPanel
            project={all[active]}
            onProjectChange={(next) =>
              setAll(all.map((p) => (p.id === next.id ? next : p)))
            }
          />
        </>
      );
    }
    render(<SwitchHarness />);

    importFile("Imported paragraph.");
    fireEvent.click(screen.getByRole("button", { name: "Switch to second" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/switched projects/i);
    expect(field("Section 1 text").value).toBe("");
  });

  it("rejects a file that is not .txt or .md without changing the text", async () => {
    render(<Harness />);
    fireEvent.change(field("Section 1 text"), {
      target: { value: "Existing writing." },
    });
    importFile("<doc>", "draft.docx");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/\.txt or \.md/);
    expect(field("Section 1 text").value).toBe("Existing writing.");
  });
});
