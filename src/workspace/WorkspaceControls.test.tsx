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

    expect(
      screen.getByRole("heading", { name: "Coral bleaching thresholds" }),
    ).toBeTruthy();
    expect(
      screen.getByText("At what temperature does fixture coral bleach?"),
    ).toBeTruthy();

    cleanup();
    render(<Controls />);
    expect(
      screen.getByRole("heading", { name: "Coral bleaching thresholds" }),
    ).toBeTruthy();
  });

  it("switches the active project and persists the choice", () => {
    seedTwoProjects();
    render(<Controls />);
    expect(screen.getByRole("heading", { name: "Reef thresholds" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "project-two" },
    });

    expect(screen.getByRole("heading", { name: "Axolotl limbs" })).toBeTruthy();
    expect(screen.getByText("Which signals initiate regrowth?")).toBeTruthy();

    cleanup();
    render(<Controls />);
    expect(screen.getByRole("heading", { name: "Axolotl limbs" })).toBeTruthy();
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
    expect(screen.getByRole("heading", { name: "Reef thresholds" })).toBeTruthy();
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

    expect(
      screen.getByRole("heading", { name: "Restored enzyme project" }),
    ).toBeTruthy();
    cleanup();
    render(<Controls />);
    expect(
      screen.getByRole("heading", { name: "Restored enzyme project" }),
    ).toBeTruthy();
  });
});
