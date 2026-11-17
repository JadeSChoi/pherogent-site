import { beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY, loadWorkspace, saveWorkspace } from "./local";
import { createProject, createWorkspace } from "./workspace";

describe("local persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a workspace through browser storage", () => {
    const workspace = createWorkspace();
    workspace.projects.push(createProject("Imaginary enzyme kinetics"));

    expect(saveWorkspace(localStorage, workspace)).toBe(true);
    expect(loadWorkspace(localStorage)).toEqual(workspace);
  });

  it("starts a fresh workspace with one project when nothing is stored", () => {
    const workspace = loadWorkspace(localStorage);
    expect(workspace.version).toBe(3);
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.activeProjectId).toBe(workspace.projects[0].id);
  });

  it("preserves an unreadable stored value instead of discarding it", () => {
    localStorage.setItem(STORAGE_KEY, "{corrupt");
    const workspace = loadWorkspace(localStorage);
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.recovered?.recovery).toBe("{corrupt");
  });
});
