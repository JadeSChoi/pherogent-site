import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  createWorkspace,
  withSavedSource,
  withSectionUpdate,
  type Workspace,
} from "../storage/workspace";
import type { Paper } from "../library/europePmc";
import { AppShell } from "./AppShell";

const paper = (id: string, title: string): Paper => ({
  id,
  source: "MED",
  title,
  authors: ["Author A"],
  year: 2020,
  journal: "Journal",
  doi: "",
  pmid: "",
  pmcid: "",
  url: "https://europepmc.org/article/MED/1",
  abstract: "An abstract.",
  openAccess: false,
});

function fixtureWorkspace(): Workspace {
  let project = createProject("Vision recovery", "Can sight be restored?");
  project = withSectionUpdate(project, project.manuscript!.sections[0].id, {
    text: "Reprogramming restored visual function.",
  });
  project = withSavedSource(project, paper("MED:1", "First saved paper"));
  project = withSavedSource(project, paper("MED:2", "Second saved paper"));
  return { version: 3, activeProjectId: project.id, projects: [project] };
}

function Harness({ initial }: { initial?: Workspace }) {
  const [workspace, setWorkspace] = useState(initial ?? fixtureWorkspace());
  const activeProject =
    workspace.projects.find((p) => p.id === workspace.activeProjectId) ??
    workspace.projects[0];
  return (
    <AppShell
      workspace={workspace}
      activeProject={activeProject}
      saved={true}
      commit={setWorkspace}
      commitProject={(next) =>
        setWorkspace((w) => ({
          ...w,
          projects: w.projects.map((p) => (p.id === next.id ? next : p)),
        }))
      }
      updateProject={(projectId, mutate) =>
        setWorkspace((w) => ({
          ...w,
          projects: w.projects.map((p) => (p.id === projectId ? mutate(p) : p)),
        }))
      }
    />
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ ok: true, service: "pherogent", schemaVersion: "0002" }),
    ),
  );
});

/** The rail's nav; the top bar repeats the same contents for narrow widths. */
const railNav = () =>
  within(screen.getByRole("complementary")).getByRole("navigation", {
    name: "Contents",
  });

describe("AppShell", () => {
  it("lists only the destinations that exist, with counts from the active project", () => {
    render(<Harness />);
    const links = within(railNav()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Overview",
      "Library2",
      "Research",
      "Manuscript4 words",
      "Section chat",
      "Usage",
    ]);
    expect(screen.queryByRole("link", { name: /Evidence/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Activity/ })).toBeNull();
  });

  it("leads the Overview with the project summary; backups follow, API status is gone", () => {
    render(<Harness />);
    const summary = screen.getByRole("region", { name: "Project summary" });
    expect(within(summary).getByRole("heading", { name: "Vision recovery" })).toBeTruthy();
    const controls = screen.getByRole("region", { name: "Projects and backups" });
    expect(
      summary.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Closed dialogs keep their own primaries in the DOM; the page shows one.
    const primaries = [...document.querySelectorAll(".ui-button-primary")].filter(
      (button) => !button.closest("dialog"),
    );
    expect(primaries).toHaveLength(1);
    expect(screen.queryByText("API status")).toBeNull();
  });

  it("follows the summary's next action to its destination", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare sentences for review" }),
    );
    expect(window.location.pathname).toBe("/manuscript");
    expect(screen.getByLabelText("Document title")).toBeTruthy();
  });

  it("navigates between destinations without a reload, marking the current one", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Project")).toBeTruthy();

    const rail = railNav();
    fireEvent.click(within(rail).getByRole("link", { name: /Library/ }));
    expect(window.location.pathname).toBe("/library");
    expect(
      within(rail)
        .getByRole("link", { name: /Library/ })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByText("Find papers")).toBeTruthy();
    expect(screen.queryByLabelText("Project")).toBeNull();

    fireEvent.click(within(rail).getByRole("link", { name: /Manuscript/ }));
    expect(window.location.pathname).toBe("/manuscript");
    expect(screen.getByLabelText("Document title")).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "Evidence review" }),
    ).toBeTruthy();
    expect(screen.getByText("Notebook")).toBeTruthy();
  });

  it("opens the Section chat from the rail", () => {
    render(<Harness />);
    const rail = screen.getByRole("complementary");
    fireEvent.click(within(rail).getByRole("link", { name: /Section chat/ }));
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    expect(window.location.pathname).toBe("/chat");
  });

  it("opens the Research check from the rail, seeded with the project question", () => {
    render(<Harness />);
    fireEvent.click(within(railNav()).getByRole("link", { name: "Research" }));
    expect(window.location.pathname).toBe("/research");
    expect(
      (screen.getByLabelText("Research question") as HTMLTextAreaElement).value,
    ).toBe("Can sight be restored?");
  });

  it("opens the usage meter from the rail", async () => {
    render(<Harness />);
    fireEvent.click(within(railNav()).getByRole("link", { name: "Usage" }));
    expect(window.location.pathname).toBe("/usage");
    expect(
      await screen.findByRole("group", { name: "Remaining allowance" }),
    ).toBeTruthy();
  });

  it("returns to the Overview from the rail's switch-project link", () => {
    render(<Harness />);
    fireEvent.click(within(railNav()).getByRole("link", { name: /Library/ }));
    fireEvent.click(screen.getByRole("button", { name: "Switch project" }));
    expect(window.location.pathname).toBe("/");
    expect(screen.getByLabelText("Project")).toBeTruthy();
  });

  it("opens the destination a deep link addresses", () => {
    window.history.replaceState(null, "", "/manuscript");
    render(<Harness />);
    expect(screen.getByLabelText("Document title")).toBeTruthy();
  });

  it("rewrites an unclean deep link to the path of the route it renders", () => {
    window.history.replaceState(null, "", "/library/");
    render(<Harness />);
    expect(screen.getByText("Find papers")).toBeTruthy();
    expect(window.location.pathname).toBe("/library");
  });

  it("follows browser back and forward through popstate", () => {
    render(<Harness />);
    fireEvent.click(within(railNav()).getByRole("link", { name: /Library/ }));
    expect(screen.getByText("Find papers")).toBeTruthy();
    window.history.replaceState(null, "", "/");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByLabelText("Project")).toBeTruthy();
  });

  it("drives the same navigation from the top nav that replaces the rail when narrow", () => {
    render(<Harness />);
    // Two Contents navs exist; the one outside the rail is the top nav.
    const topNav = screen
      .getAllByRole("navigation", { name: "Contents" })
      .find((nav) => !screen.getByRole("complementary").contains(nav))!;
    fireEvent.click(within(topNav).getByRole("link", { name: /Manuscript/ }));
    expect(window.location.pathname).toBe("/manuscript");
    expect(screen.getByLabelText("Document title")).toBeTruthy();
  });
});
