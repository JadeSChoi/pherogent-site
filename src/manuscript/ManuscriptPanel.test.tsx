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

describe("ManuscriptPanel", () => {
  it("edits the document title and manuscript text", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Document title"), {
      target: { value: "Reprogramming draft" },
    });
    fireEvent.change(screen.getByLabelText("Manuscript text"), {
      target: { value: "First paragraph." },
    });
    expect((screen.getByLabelText("Document title") as HTMLInputElement).value).toBe(
      "Reprogramming draft",
    );
    expect((screen.getByLabelText("Manuscript text") as HTMLTextAreaElement).value).toBe(
      "First paragraph.",
    );
  });

  it("imports a text file directly into an empty manuscript", async () => {
    render(<Harness />);
    importFile("Imported opening paragraph.");
    expect(
      await screen.findByDisplayValue("Imported opening paragraph."),
    ).toBeTruthy();
  });

  it("asks before an import replaces existing manuscript text", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Manuscript text"), {
      target: { value: "Existing writing." },
    });
    importFile("Imported replacement.");

    fireEvent.click(
      await screen.findByRole("button", { name: "Replace manuscript text" }),
    );
    expect(
      (screen.getByLabelText("Manuscript text") as HTMLTextAreaElement).value,
    ).toBe("Imported replacement.");
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
    // The switch lands before the file's async read resolves.
    fireEvent.click(screen.getByRole("button", { name: "Switch to second" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/switched projects/i);
    expect(
      (screen.getByLabelText("Manuscript text") as HTMLTextAreaElement).value,
    ).toBe("");
  });

  it("rejects a file that is not .txt or .md without changing the text", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Manuscript text"), {
      target: { value: "Existing writing." },
    });
    importFile("<doc>", "draft.docx");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/\.txt or \.md/);
    expect(
      (screen.getByLabelText("Manuscript text") as HTMLTextAreaElement).value,
    ).toBe("Existing writing.");
  });
});
