import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Paper } from "../library/europePmc";
import { createProject, type Project } from "../storage/workspace";
import { ReviewPanel } from "./ReviewPanel";

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
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setProject((current) => ({
            ...current,
            manuscript: {
              ...current.manuscript!,
              sections: current.manuscript!.sections.map((section) => ({
                ...section,
                text: section.text + " An edit from the manuscript.",
              })),
            },
          }))
        }
      >
        Edit section elsewhere
      </button>
      <ReviewPanel project={project} onProjectChange={setProject} />
    </>
  );
}

const field = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;

const prepare = () =>
  fireEvent.click(screen.getByRole("button", { name: "Prepare sentences for review" }));

/** Stages a complete supports-assessment on the first sentence. */
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

describe("ReviewPanel", () => {
  it("prepares the section's sentences and lists them", () => {
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
        name: /Reprogramming restored visual function in aged mice\./,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /The effect size was small overall\./ }),
    ).toBeTruthy();
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
    const approve = () => screen.getByRole("button", { name: /Approve citation|Record your decision/ });
    expect(approve().hasAttribute("disabled")).toBe(true);
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

  it("carries a decision across batches and quietly notes changed context", () => {
    render(
      <Harness
        initial={projectFixture(
          "First sentence is long enough here. Second sentence is also long enough.",
        )}
      />,
    );
    prepare();
    fireEvent.click(
      screen.getByRole("button", { name: /Second sentence is also long enough\./ }),
    );
    fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
    expect(screen.getByText("Original wording kept")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Edit section elsewhere" }));
    prepare();
    expect(screen.getByText("Original kept")).toBeTruthy();
    expect(screen.getByText("Context changed")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Second sentence is also long enough\./ }),
    );
    expect(screen.getByText("Original wording kept")).toBeTruthy();
    expect(screen.getByText(/re-read the surrounding wording/)).toBeTruthy();
  });

  it("keeps each Section's pass and decisions when the author reviews another Section", () => {
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
    prepare();
    fireEvent.change(field("Source to check against"), { target: { value: "MED:1" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep original" }));
    expect(screen.getByText("Original wording kept")).toBeTruthy();

    // Review the Methods Section; the first Section's decision survives.
    fireEvent.change(field("Section to review"), {
      target: { value: "section-methods" },
    });
    prepare();
    expect(
      screen.getByRole("button", { name: /We measured axon density/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Original wording kept")).toBeNull();

    const sectionPicker = screen.getByLabelText(
      "Section to review",
    ) as HTMLSelectElement;
    fireEvent.change(sectionPicker, {
      target: { value: sectionPicker.options[0].value },
    });
    expect(screen.getByText("Original kept")).toBeTruthy();
  });

  it("pauses the review when the section text changes elsewhere", () => {
    render(
      <Harness
        initial={projectFixture("Reprogramming restored visual function in aged mice.")}
      />,
    );
    prepare();
    fireEvent.click(screen.getByRole("button", { name: "Edit section elsewhere" }));
    expect(screen.getByText(/section changed/i)).toBeTruthy();
    expect(screen.queryByLabelText("Evidence passage")).toBeNull();
  });
});
