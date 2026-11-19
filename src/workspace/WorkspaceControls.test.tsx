import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY } from "../storage/local";
import { WorkspaceControls } from "./WorkspaceControls";
import { useWorkspace } from "./useWorkspace";

/** Composes the controls with the workspace hook the way App does. */
function Controls() {
  const { workspace, activeProject, saved, commit } = useWorkspace();
  return (
    <WorkspaceControls
      workspace={workspace}
      activeProject={activeProject}
      saved={saved}
      onCommit={commit}
    />
  );
}

const seedTwoProjects = () =>
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 3,
      activeProjectId: "project-one",
      projects: [
        {
          id: "project-one",
          name: "Reef thresholds",
          question: "",
          createdAt: "2026-05-01T00:00:00.000Z",
        },
        {
          id: "project-two",
          name: "Axolotl limbs",
          question: "Which signals initiate regrowth?",
          createdAt: "2026-05-02T00:00:00.000Z",
        },
      ],
    }),
  );

/** The project the switcher shows as active; the page head lives in the
 * Overview summary now, not in these controls. */
const activeName = () =>
  (screen.getByLabelText("Project") as HTMLSelectElement).selectedOptions[0]
    .textContent;

describe("WorkspaceControls", () => {
  beforeEach(() => localStorage.clear());

  it("creates a project, makes it active, and persists across remount", () => {
    render(<Controls />);

    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Coral bleaching thresholds" },
    });
    fireEvent.change(screen.getByLabelText("Research question"), {
      target: { value: "At what temperature does fixture coral bleach?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(activeName()).toBe("Coral bleaching thresholds");

    cleanup();
    render(<Controls />);
    expect(activeName()).toBe("Coral bleaching thresholds");
  });

  it("switches the active project and persists the choice", () => {
    seedTwoProjects();
    render(<Controls />);
    expect(activeName()).toBe("Reef thresholds");

    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "project-two" },
    });

    expect(activeName()).toBe("Axolotl limbs");

    cleanup();
    render(<Controls />);
    expect(activeName()).toBe("Axolotl limbs");
  });

  it("rejects a malformed import without touching existing data", async () => {
    seedTwoProjects();
    render(<Controls />);
    const before = localStorage.getItem(STORAGE_KEY);

    const file = new File(["not json {"], "backup.json", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("Import backup file"), {
      target: { files: [file] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/JSON/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(activeName()).toBe("Reef thresholds");
  });

  it("imports a backup after the author confirms the replacement", async () => {
    seedTwoProjects();
    render(<Controls />);

    const backup = JSON.stringify({
      version: 3,
      activeProjectId: "project-nine",
      projects: [
        {
          id: "project-nine",
          name: "Restored enzyme project",
          question: "",
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    fireEvent.change(screen.getByLabelText("Import backup file"), {
      target: {
        files: [new File([backup], "backup.json", { type: "application/json" })],
      },
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Replace workspace" }),
    );

    expect(activeName()).toBe("Restored enzyme project");
    cleanup();
    render(<Controls />);
    expect(activeName()).toBe("Restored enzyme project");
  });
});
