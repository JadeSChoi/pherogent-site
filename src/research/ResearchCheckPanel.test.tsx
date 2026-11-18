import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { clearOwnerKey } from "../api/ownerKey";
import { createProject, type Project } from "../storage/workspace";
import { ResearchCheckPanel } from "./ResearchCheckPanel";
import { useResearchCheckRun } from "./useResearchCheckRun";

const QUESTION = "Does OSK reprogramming restore vision in mammals?";

let latestProject: Project;

function Harness({ initial }: { initial: Project }) {
  const [project, setProject] = useState(initial);
  latestProject = project;
  // Applies the change synchronously against the latest project, like the
  // real useWorkspace.updateProject, so save outcomes read back immediately.
  const updateProject = (projectId: string, mutate: (p: Project) => Project) => {
    if (latestProject.id === projectId) latestProject = mutate(latestProject);
    setProject(latestProject);
  };
  const runState = useResearchCheckRun(updateProject);
  return <ResearchCheckPanel project={project} runState={runState} />;
}

const fixture = () => createProject("Vision recovery", QUESTION);

/** Serves status and, when consented, a successful freeform research stream. */
function stubApi({ canRun = true, message = "Open while the allowance lasts." } = {}) {
  const posts: { body: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/agent/status") {
        return new Response(JSON.stringify({ canRun, message }));
      }
      posts.push({ body: String(init?.body) });
      const lines = [
        { type: "start", runId: "run-7" },
        {
          type: "step",
          step: { stage: "search", detail: "Searching Europe PMC: OSK vision mice" },
        },
        {
          type: "result",
          result: {
            question: QUESTION,
            summary: {
              established: ["Vision loss reversed in aged mice. [MED:33268865]"],
              uncertain: ["Human evidence was not found in this bounded search."],
              nextQuestions: ["Has OSK reprogramming been tested in primates?"],
            },
            evidence: [
              {
                paperId: "MED:33268865",
                claim: "Vision loss reversed in aged mice.",
                label: "supports",
                quote: "reverses vision loss in a mouse model of glaucoma",
                passageId: "abstract",
                location: "Abstract (excerpt)",
                studyType: "Animal experiment",
                population: "Mice",
                access: "abstract_only",
                coverage: "Abstract excerpt only.",
                mismatchNotes: ["The measured outcome is in mice, not people."],
                suggestedWording: null,
                reason: "The source reports a mouse outcome.",
                quoteVerified: true,
                checkedBy: "AI",
                approvalStatus: "awaiting_author",
              },
            ],
            papers: [
              {
                id: "MED:33268865",
                source: "MED",
                title: "Reprogramming to restore vision.",
                authors: ["Lu Y"],
                year: 2020,
                journal: "Nature",
                doi: "",
                pmid: "33268865",
                pmcid: "",
                url: "https://europepmc.org/article/MED/33268865",
                abstract: "",
                openAccess: false,
              },
            ],
            steps: [],
            usage: {},
          },
        },
      ];
      return new Response(lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    }),
  );
  return posts;
}

/** A deployment refusing the run before any stream: the spend-cap 429. */
function stubRefusingApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/agent/status") {
        return new Response(JSON.stringify({ canRun: true, message: "Open." }));
      }
      return new Response(
        JSON.stringify({
          error: {
            code: "daily_budget_exhausted",
            message: "Today's shared AI budget is spent. Checks resume tomorrow.",
          },
        }),
        { status: 429 },
      );
    }),
  );
}

const openPreview = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Preview Research check" }));
  return screen.findByRole("button", { name: "Consent and send" });
};

describe("ResearchCheckPanel", () => {
  afterEach(() => {
    clearOwnerKey();
    vi.unstubAllGlobals();
  });

  it("starts from the Project's research question and previews the exact outgoing content", async () => {
    const posts = stubApi();
    render(<Harness initial={fixture()} />);
    const input = screen.getByLabelText("Research question") as HTMLTextAreaElement;
    expect(input.value).toBe(QUESTION);
    await openPreview();
    const preview = document.querySelector(".research-check-outgoing")!;
    const parsed = JSON.parse(preview.textContent!) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["consent", "question", "requestId"]);
    expect(parsed.question).toBe(QUESTION);
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(posts).toHaveLength(0);
  });

  it("refuses to preview an empty question without asking the server", () => {
    stubApi();
    const project = { ...fixture(), question: "" };
    render(<Harness initial={project} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview Research check" }));
    expect(screen.getByText(/Enter the research question/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Consent and send" })).toBeNull();
  });

  it("disables consent and shows the server's message when the deployment refuses runs", async () => {
    stubApi({
      canRun: false,
      message: "AI runs on this deployment require the owner access key.",
    });
    render(<Harness initial={fixture()} />);
    const consent = await openPreview();
    await screen.findByText(/require the owner access key/);
    expect(consent.hasAttribute("disabled")).toBe(true);
  });

  it("streams progress and renders the note with its verified evidence card", async () => {
    const posts = stubApi();
    render(<Harness initial={fixture()} />);
    const consent = await openPreview();
    const previewed = document.querySelector(".research-check-outgoing")!.textContent!;
    fireEvent.click(consent);

    await screen.findByText("AI research note");
    expect(posts).toEqual([{ body: previewed }]);
    // The streamed progress is genuine server steps, kept on screen.
    expect(screen.getByText("Searching Europe PMC: OSK vision mice")).toBeDefined();
    expect(screen.getByText(/Author review required/i)).toBeDefined();
    expect(
      screen.getByText("Vision loss reversed in aged mice. [MED:33268865]"),
    ).toBeDefined();
    expect(
      screen.getByText("Human evidence was not found in this bounded search."),
    ).toBeDefined();
    expect(
      screen.getByText("Has OSK reprogramming been tested in primates?"),
    ).toBeDefined();
    expect(
      screen.getByText("reverses vision loss in a mouse model of glaucoma"),
    ).toBeDefined();
    expect(screen.getByText(/verified this quote appears verbatim/)).toBeDefined();
    // Completion saved nothing by itself.
    expect(latestProject.notebook).toBeUndefined();
    expect(latestProject.sources).toBeUndefined();
  });

  it("saves findings and sources only on the author's explicit actions", async () => {
    stubApi();
    render(<Harness initial={fixture()} />);
    fireEvent.click(await openPreview());
    await screen.findByText("AI research note");

    fireEvent.click(screen.getByRole("button", { name: "Save findings to notebook" }));
    expect(latestProject.notebook?.findings).toContain("### AI research check:");
    await screen.findByText(/Findings saved/);

    fireEvent.click(screen.getByRole("button", { name: "Save sources to library" }));
    expect(latestProject.sources?.map((source) => source.paper.id)).toEqual([
      "MED:33268865",
    ]);
    await screen.findByText(/1 source saved/);

    // Saving again appends nothing and says so.
    fireEvent.click(screen.getByRole("button", { name: "Save findings to notebook" }));
    await screen.findByText(/already in the notebook/i);
    expect(
      latestProject.notebook!.findings.match(/### AI research check:/g),
    ).toHaveLength(1);
  });

  it("reports a refused run's own message and saves nothing", async () => {
    stubRefusingApi();
    render(<Harness initial={fixture()} />);
    fireEvent.click(await openPreview());
    await screen.findByText(/shared AI budget is spent/);
    expect(screen.queryByText("AI research note")).toBeNull();
    expect(latestProject.notebook).toBeUndefined();
  });
});
