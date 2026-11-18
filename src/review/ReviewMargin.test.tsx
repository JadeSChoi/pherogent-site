import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paper } from "../library/europePmc";
import { ManuscriptPanel } from "../manuscript/ManuscriptPanel";
import { createProject, type Project } from "../storage/workspace";

const ABSTRACT =
  "Visual function improved in aged mice after reprogramming. " +
  "The weather was sunny yesterday afternoon.";

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
  abstract: ABSTRACT,
  openAccess: false,
});

function projectFixture(sectionText: string): Project {
  const project = createProject("Vision recovery");
  const manuscript = project.manuscript!;
  return {
    ...project,
    manuscript: {
      ...manuscript,
      sections: [{ ...manuscript.sections[0], text: sectionText }],
    },
    sources: [{ paper: paper("MED:1"), note: "", status: "useful", savedAt: "" }],
  };
}

function Harness({ initial }: { initial: Project }) {
  const [project, setProject] = useState(initial);
  return <ManuscriptPanel project={project} onProjectChange={setProject} />;
}

const field = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;

const margin = () => screen.getByRole("complementary", { name: "Evidence review" });

const prepare = () =>
  fireEvent.click(screen.getByRole("button", { name: "Prepare sentences for review" }));

/** Stages a complete supports-assessment on the first (selected) sentence. */
function stageSupports(quote = "Visual function improved in aged mice") {
  prepare();
  fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
  fireEvent.change(field("Evidence passage"), { target: { value: quote } });
  fireEvent.change(field("Your assessment"), { target: { value: "supports" } });
}

beforeEach(() => {
  // No step of this flow may call any network or AI endpoint.
  vi.stubGlobal("fetch", () => {
    throw new Error("The no-AI review loop must not fetch.");
  });
});

describe("the review flow in the proof-sheet margin", () => {
  it("prepares a section into proof sentences and opens the first in the margin", () => {
    render(
      <Harness
        initial={projectFixture(
          "Reprogramming restored visual function in aged mice. The effect size was small overall.",
        )}
      />,
    );
    prepare();
    expect(
      screen.getByRole("button", {
        name: "Reprogramming restored visual function in aged mice.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "The effect size was small overall." }),
    ).toBeTruthy();
    // The first sentence's review controls open in the margin.
    expect(within(margin()).getByLabelText("Source to check against")).toBeTruthy();
  });

  it("reports a code-only match for an exact pasted passage, and no match for a paraphrase", () => {
    render(
      <Harness
        initial={projectFixture("Reprogramming restored visual function in aged mice.")}
      />,
    );
    prepare();
    fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
    fireEvent.change(field("Evidence passage"), {
      target: { value: "Visual function improved in aged mice" },
    });
    expect(screen.getByText(/Passage found in the source text/)).toBeTruthy();
    fireEvent.change(field("Evidence passage"), {
      target: { value: "Visual function got better in mice" },
    });
    expect(screen.getByText(/Paste an exact passage/)).toBeTruthy();
  });

  it("keeps approval disabled until the author's input is complete, then records it only on the explicit click", () => {
    render(
      <Harness
        initial={projectFixture("Reprogramming restored visual function in aged mice.")}
      />,
    );
    prepare();
    fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
    fireEvent.change(field("Evidence passage"), {
      target: { value: "Visual function improved in aged mice" },
    });
    const decide = () =>
      screen.getByRole("button", { name: /Approve citation|Record your decision/ });
    expect(decide().hasAttribute("disabled")).toBe(true);
    fireEvent.change(field("Your assessment"), { target: { value: "supports" } });
    expect(screen.queryByText("Approved by author")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve citation" }));
    expect(screen.getByText("Approved by author")).toBeTruthy();
  });

  it("undoes a decision back to the prior state", () => {
    render(
      <Harness
        initial={projectFixture("Reprogramming restored visual function in aged mice.")}
      />,
    );
    stageSupports();
    fireEvent.click(screen.getByRole("button", { name: "Approve citation" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo decision" }));
    expect(screen.queryByText("Approved by author")).toBeNull();
    expect((field("Your assessment") as HTMLInputElement).value).toBe("supports");
  });

  it("demands explicit acknowledgment of low keyword overlap before approving", () => {
    render(
      <Harness initial={projectFixture("Reprogramming reverses aging in humans always.")} />,
    );
    stageSupports("The weather was sunny yesterday afternoon.");
    fireEvent.click(screen.getByRole("button", { name: "Approve citation" }));
    expect(screen.queryByText("Approved by author")).toBeNull();
    expect(screen.getByText(/Low keyword overlap/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve despite warning" }));
    expect(screen.getByText("Approved by author")).toBeTruthy();
  });

  it("pauses that section's review when its text is edited", () => {
    render(
      <Harness
        initial={projectFixture("Reprogramming restored visual function in aged mice.")}
      />,
    );
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    fireEvent.change(field("Section 1 text"), {
      target: { value: "Rewritten entirely by the author." },
    });
    expect(screen.getByText(/section changed/i)).toBeTruthy();
    expect(screen.queryByLabelText("Evidence passage")).toBeNull();
  });

  it("records keep original without a source selected", () => {
    render(<Harness initial={projectFixture("First sentence is long enough here.")} />);
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
    expect(within(margin()).getByText("Original wording kept")).toBeTruthy();
  });

  it("opens the next undecided sentence's controls after a decision", () => {
    render(
      <Harness
        initial={projectFixture(
          "Reprogramming restored visual function in aged mice. The effect size was small overall.",
        )}
      />,
    );
    prepare();
    fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
    expect(within(margin()).getByText("Original wording kept")).toBeTruthy();
    // The second sentence's editor opened by itself, as the panel did.
    expect(within(margin()).getByLabelText("Source to check against")).toBeTruthy();
  });

  it("carries decisions across re-preparation and quietly notes changed context", () => {
    render(<Harness initial={projectFixture("First sentence is long enough here.")} />);
    prepare();
    fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
    expect(within(margin()).getByText("Original wording kept")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit text" }));
    fireEvent.change(field("Section 1 text"), {
      target: {
        value:
          "First sentence is long enough here. A second sentence appears afterwards.",
      },
    });
    prepare();
    expect(within(margin()).getByText("Original wording kept")).toBeTruthy();
    expect(
      within(margin()).getByText(/Context changed since this decision/),
    ).toBeTruthy();
  });

  it("keeps each Section's decisions in the margin while reviewing another Section", () => {
    const base = projectFixture("First sentence is long enough here.");
    const withMethods: Project = {
      ...base,
      manuscript: {
        ...base.manuscript!,
        sections: [
          ...base.manuscript!.sections,
          {
            id: "section-methods",
            heading: "Methods",
            text: "We measured axon density at four and eight weeks.",
          },
        ],
      },
    };
    render(<Harness initial={withMethods} />);
    const [prepareFirst, prepareSecond] = screen.getAllByRole("button", {
      name: "Prepare sentences for review",
    });
    fireEvent.click(prepareFirst);
    fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
    expect(within(margin()).getByText("Original wording kept")).toBeTruthy();

    fireEvent.click(prepareSecond);
    // Both Sections' notes are in the margin: the kept decision and the
    // newly opened editor, grouped under their section labels.
    expect(within(margin()).getByText("Original wording kept")).toBeTruthy();
    expect(within(margin()).getByText("Methods")).toBeTruthy();
    expect(within(margin()).getByLabelText("Source to check against")).toBeTruthy();
  });
});
