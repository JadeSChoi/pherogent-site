import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { clearOwnerKey, readOwnerKey } from "../api/ownerKey";
import type { Paper } from "../library/europePmc";
import { createProject, type Project } from "../storage/workspace";
import { withReviewPrepared } from "./review";
import { ReviewMargin } from "./ReviewMargin";

const SENTENCE = "Reprogramming restored visual function in aged mice.";

const paper = (id: string, title: string): Paper => ({
  id,
  source: id.split(":")[0],
  title,
  authors: [],
  year: 2020,
  journal: "Journal",
  doi: "",
  pmid: "",
  pmcid: "",
  url: "https://europepmc.org/article/MED/1",
  abstract: "Visual function improved in aged mice after reprogramming.",
  openAccess: false,
});

/** A prepared project with checkable and non-checkable saved sources. */
function fixture() {
  const base = createProject("Vision recovery");
  const manuscript = base.manuscript!;
  const section = { ...manuscript.sections[0], text: SENTENCE };
  const project: Project = {
    ...base,
    manuscript: { ...manuscript, sections: [section] },
    sources: [
      {
        paper: paper("MED:33268865", "Reprogramming restores vision"),
        note: "",
        status: "useful",
        savedAt: "",
      },
      {
        paper: paper("PPR:PPR123", "A preprint the server cannot resolve"),
        note: "",
        status: "to-read",
        savedAt: "",
      },
    ],
  };
  const prepared = withReviewPrepared(project, section.id).project;
  return { project: prepared, sentence: prepared.reviews![0].sentences[0] };
}

let latestProject: Project;

function Harness({ initial, sentenceId }: { initial: Project; sentenceId: string }) {
  const [project, setProject] = useState(initial);
  latestProject = project;
  return (
    <ReviewMargin
      project={project}
      onProjectChange={(next) => {
        latestProject = next;
        setProject(next);
      }}
      selectedId={sentenceId}
    />
  );
}

const resultCard = {
  paperId: "MED:33268865",
  claimId: "",
  claim: SENTENCE,
  label: "partial",
  quote: "Visual function improved in aged mice",
  passageId: "abstract",
  location: "Abstract (excerpt)",
  studyType: "Animal experiment",
  population: "Mice",
  access: "abstract_only",
  coverage: "Abstract excerpt only; full-text methods and results were not checked.",
  mismatchNotes: ["Mouse evidence cannot establish a human outcome."],
  suggestedWording: "Visual function improved in aged mice.",
  reason: "The measured outcome is narrower than the sentence.",
  quoteVerified: true,
  checkedBy: "AI",
  approvalStatus: "awaiting_author",
};

/** Serves status and, when consented, a successful claim-check stream. */
function stubApi({ canRun = true, message = "Open while the allowance lasts." } = {}) {
  const posts: { body: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/agent/status") {
        return new Response(JSON.stringify({ canRun, message }));
      }
      const body = String(init?.body);
      posts.push({ body });
      const claimId = (JSON.parse(body) as { claim: { id: string } }).claim.id;
      const lines = [
        { type: "start", runId: "run-7" },
        { type: "step", step: { stage: "sources", detail: "Checking selected sources." } },
        {
          type: "result",
          result: {
            question: SENTENCE,
            summary: {
              established: [],
              uncertain: ["Only the selected cited sources were checked."],
              nextQuestions: [],
            },
            scope: {
              mode: "cited_sources",
              requestedPaperIds: ["MED:33268865"],
              unavailablePaperIds: [],
            },
            evidence: [{ ...resultCard, claimId }],
          },
        },
      ];
      return new Response(lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    }),
  );
  return posts;
}

const openPreview = async () => {
  fireEvent.click(screen.getByRole("checkbox", { name: /Reprogramming restores vision/ }));
  fireEvent.click(screen.getByRole("button", { name: "Preview AI check" }));
  return screen.findByRole("button", { name: "Consent and send" });
};

/** An owner-gated deployment: status reports signed in only for the right
 * key's authorization header; no check POST is ever expected. */
function stubGatedApi(rightKey: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "/api/agent/status") {
        throw new Error("No check may be sent while gated");
      }
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
      return new Response(
        JSON.stringify(
          auth === `Bearer ${rightKey}`
            ? { canRun: true, message: "Open to the owner.", signedIn: true, needsSignIn: false }
            : {
                canRun: false,
                message: "AI runs on this deployment require the owner access key.",
                signedIn: false,
                needsSignIn: true,
              },
        ),
      );
    }),
  );
}

describe("EvidenceCheckPanel via ReviewMargin", () => {
  afterEach(() => {
    clearOwnerKey();
    vi.unstubAllGlobals();
  });

  it("offers only server-resolvable saved sources for the check", () => {
    const { project, sentence } = fixture();
    stubApi();
    render(<Harness initial={project} sentenceId={sentence.id} />);
    expect(
      screen.getByRole("checkbox", { name: /Reprogramming restores vision/ }),
    ).toBeDefined();
    expect(screen.queryByRole("checkbox", { name: /preprint/ })).toBeNull();
  });

  it("previews the exact outgoing content and sends nothing before consent", async () => {
    const { project, sentence } = fixture();
    const posts = stubApi();
    render(<Harness initial={project} sentenceId={sentence.id} />);
    await openPreview();
    const preview = document.querySelector(".evidence-check-outgoing")!;
    const body = preview.textContent!;
    expect(JSON.parse(body)).toMatchObject({
      consent: true,
      question: SENTENCE,
      claim: { id: sentence.id, text: SENTENCE },
      citedPaperIds: ["MED:33268865"],
    });
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(posts).toHaveLength(0);
  });

  it("disables consent and shows the server's message when the deployment refuses runs", async () => {
    const { project, sentence } = fixture();
    stubApi({ canRun: false, message: "AI runs on this deployment require the owner access key." });
    render(<Harness initial={project} sentenceId={sentence.id} />);
    const consent = await openPreview();
    await screen.findByText(/require the owner access key/);
    expect(consent.hasAttribute("disabled")).toBe(true);
  });

  it("sends exactly the previewed content on consent and records three distinct records", async () => {
    const { project, sentence } = fixture();
    const posts = stubApi();
    render(<Harness initial={project} sentenceId={sentence.id} />);
    const consent = await openPreview();
    const previewed = document.querySelector(".evidence-check-outgoing")!.textContent!;
    fireEvent.click(consent);

    await screen.findByText("AI suggestion");
    expect(posts).toEqual([{ body: previewed }]);
    expect(screen.getByText("Code check")).toBeDefined();
    expect(screen.getByText("Author decision")).toBeDefined();
    expect(screen.getByText(/narrower than the sentence/)).toBeDefined();
    // The quote appears in the code-check record and the suggested wording
    // in the AI record: both render, each inside its own labeled record.
    expect(screen.getAllByText(/Visual function improved in aged mice/).length)
      .toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/No decision has been recorded/)).toBeDefined();

    const stored = latestProject.reviews![0].sentences[0].evidenceCheck;
    expect(stored?.runId).toBe("run-7");
    expect(stored?.cards).toHaveLength(1);
  });

  it("lets the author copy the suggestion into the proposed wording — never automatically", async () => {
    const { project, sentence } = fixture();
    stubApi();
    render(<Harness initial={project} sentenceId={sentence.id} />);
    fireEvent.click(await openPreview());
    await screen.findByText("AI suggestion");

    // Nothing was prefilled: the inspection fields are not even open until
    // the author acts.
    expect(screen.queryByLabelText("Proposed wording, if a revision is needed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use as proposed wording" }));
    expect(
      (screen.getByLabelText("Proposed wording, if a revision is needed") as HTMLTextAreaElement)
        .value,
    ).toBe("Visual function improved in aged mice.");
  });

  it("keeps the three records visible and distinct after the author decides", async () => {
    const { project, sentence } = fixture();
    stubApi();
    render(<Harness initial={project} sentenceId={sentence.id} />);
    fireEvent.click(await openPreview());
    await screen.findByText("AI suggestion");

    fireEvent.click(screen.getByRole("button", { name: "Keep original" }));

    expect(screen.getByText("Original wording kept")).toBeDefined();
    expect(screen.getByText("AI suggestion")).toBeDefined();
    expect(screen.getByText("Code check")).toBeDefined();
    expect(screen.getByText("Author decision")).toBeDefined();
    // The placeholder gives way to the recorded decision itself.
    expect(screen.queryByText(/No decision has been recorded/)).toBeNull();
    expect(latestProject.reviews![0].sentences[0].evidenceCheck?.cards).toHaveLength(1);
  });

  it("offers the key input only when gated, and a wrong key leaves it gated", async () => {
    const { project, sentence } = fixture();
    stubGatedApi("right-key-0000");
    render(<Harness initial={project} sentenceId={sentence.id} />);
    const consent = await openPreview();
    await screen.findByText(/require the owner access key/);

    const keyInput = screen.getByLabelText("Owner access key") as HTMLInputElement;
    expect(keyInput.type).toBe("password");
    expect(consent.hasAttribute("disabled")).toBe(true);

    fireEvent.change(keyInput, { target: { value: "wrong-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock AI runs" }));

    await screen.findByText(/was not accepted/);
    expect(
      screen
        .getByRole("button", { name: "Consent and send" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByLabelText("Owner access key")).toBeDefined();
    // A rejected key is not kept for silent retries.
    expect(readOwnerKey()).toBeNull();
  });

  it("unlocks with the right key and forgets it back to the gated state", async () => {
    const { project, sentence } = fixture();
    stubGatedApi("right-key-0000");
    render(<Harness initial={project} sentenceId={sentence.id} />);
    const consent = await openPreview();
    await screen.findByText(/require the owner access key/);

    fireEvent.change(screen.getByLabelText("Owner access key"), {
      target: { value: "right-key-0000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unlock AI runs" }));

    await screen.findByText(/authorization header/);
    expect(consent.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByLabelText("Owner access key")).toBeNull();
    expect(readOwnerKey()).toBe("right-key-0000");

    fireEvent.click(screen.getByRole("button", { name: "Forget owner key" }));

    await screen.findByText(/require the owner access key/);
    expect(readOwnerKey()).toBeNull();
    expect(screen.getByLabelText("Owner access key")).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: "Consent and send" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows the server's error message when the run fails", async () => {
    const { project, sentence } = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/agent/status") {
          return new Response(JSON.stringify({ canRun: true, message: "Open." }));
        }
        return new Response(
          JSON.stringify({ type: "start", runId: "run-7" }) +
            "\n" +
            JSON.stringify({
              type: "error",
              error: { code: "token_budget", message: "Shorten the question." },
            }) +
            "\n",
        );
      }),
    );
    render(<Harness initial={project} sentenceId={sentence.id} />);
    fireEvent.click(await openPreview());
    await screen.findByText(/Shorten the question/);
    expect(latestProject.reviews![0].sentences[0].evidenceCheck).toBeNull();
  });
});
