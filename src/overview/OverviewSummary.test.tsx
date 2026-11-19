import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProject, withSavedSource, type Project } from "../storage/workspace";
import type { Paper } from "../library/europePmc";
import { keepOriginal, withReviewPrepared } from "../review/review";
import { OverviewSummary } from "./OverviewSummary";

const paper = (id: string): Paper => ({
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
  abstract: "An abstract.",
  openAccess: false,
});

/** Two sources, one reviewable sentence prepared and decided. */
function reviewedProject(): Project {
  let project = createProject("Vision recovery", "Can sight be restored?");
  project = withSavedSource(project, paper("MED:1"));
  project = withSavedSource(project, paper("MED:2"));
  const sectionId = project.manuscript!.sections[0].id;
  project = {
    ...project,
    manuscript: {
      ...project.manuscript!,
      sections: project.manuscript!.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              text: "Reprogramming restored visual function in aged mice. We then measured axon density at eight weeks.",
            }
          : section,
      ),
    },
  };
  project = withReviewPrepared(project, sectionId).project;
  return keepOriginal(project, project.reviews![0].sentences[0].id);
}

describe("OverviewSummary", () => {
  it("leads with the project head and its real counts", () => {
    render(<OverviewSummary project={reviewedProject()} onNavigate={() => {}} />);
    expect(screen.getByRole("heading", { name: "Vision recovery" })).toBeTruthy();
    expect(screen.getByText("Can sight be restored?")).toBeTruthy();
    const summary = screen.getByRole("region", { name: "Project summary" });
    const value = (label: string) => {
      const term = within(summary)
        .getAllByRole("term")
        .find((candidate) => candidate.textContent === label)!;
      return term.nextElementSibling?.textContent;
    };
    expect(value("Saved sources")).toBe("2");
    expect(value("Manuscript sections")).toBe("1");
    expect(value("Words")).toBe("15");
    expect(value("Sentences decided")).toBe("1 of 2");
  });

  it("shows exactly one primary action, derived from the project state", () => {
    const onNavigate = vi.fn();
    render(<OverviewSummary project={reviewedProject()} onNavigate={onNavigate} />);
    const primaries = document.querySelectorAll(".ui-button-primary");
    expect(primaries).toHaveLength(1);
    const action = screen.getByRole("button", { name: "Decide the prepared sentences" });
    fireEvent.click(action);
    expect(onNavigate).toHaveBeenCalledWith("manuscript");
  });

  it("marks the review row as not started before any sentence exists", () => {
    render(
      <OverviewSummary
        project={createProject("Vision recovery")}
        onNavigate={() => {}}
      />,
    );
    const summary = screen.getByRole("region", { name: "Project summary" });
    expect(within(summary).getByText("None to review yet")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save your first source" }),
    ).toBeTruthy();
  });
});
