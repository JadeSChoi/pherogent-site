import { describe, expect, it, vi } from "vitest";
import { withNotebookUpdate, type Project } from "../storage/workspace";
import {
  buildResearchRequest,
  outgoingBody,
  questionBlockedReason,
  researchFindingsMarkdown,
  researchNoteFromResult,
  runResearchCheck,
  withResearchFindingsSaved,
  withResearchSourcesSaved,
} from "./researchCheck";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("questionBlockedReason", () => {
  it("requires a non-empty question of at most 2,000 characters", () => {
    expect(questionBlockedReason("")).toMatch(/question/i);
    expect(questionBlockedReason("   ")).toMatch(/question/i);
    expect(questionBlockedReason("x".repeat(2001))).toMatch(/2,000/);
    expect(questionBlockedReason("Does OSK reprogramming restore vision?")).toBeNull();
  });
});

describe("buildResearchRequest", () => {
  it("builds the freeform research envelope with exactly the consented fields", () => {
    const request = buildResearchRequest("  Does OSK reprogramming restore vision?  ");
    expect(request.requestId).toMatch(UUID);
    // Exactly these keys: an extra field would be rejected by the server,
    // and a claim field would silently turn this into a bound check.
    expect(Object.keys(request).sort()).toEqual(["consent", "question", "requestId"]);
    expect(request.consent).toBe(true);
    expect(request.question).toBe("Does OSK reprogramming restore vision?");
  });

  it("issues a fresh requestId per request", () => {
    expect(buildResearchRequest("q").requestId).not.toBe(
      buildResearchRequest("q").requestId,
    );
  });
});

describe("outgoingBody and runResearchCheck", () => {
  it("sends exactly the previewed bytes to the research route", async () => {
    const request = buildResearchRequest("Does OSK reprogramming restore vision?");
    const body = outgoingBody(request);
    expect(JSON.parse(body)).toEqual(request);
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"type":"start","runId":"run-1"}\n{"type":"result","result":{}}\n'),
    );
    await runResearchCheck(request, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/check-claim",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
  });

  it("surfaces the server's refusal code before any run starts", async () => {
    await expect(
      runResearchCheck(buildResearchRequest("q"), {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: { code: "owner_key_required", message: "AI runs require the key." },
            }),
            { status: 401 },
          ),
      }),
    ).rejects.toMatchObject({ code: "owner_key_required" });
  });
});

describe("researchNoteFromResult", () => {
  const request = () => buildResearchRequest("Does OSK reprogramming restore vision?");
  const card = (extra: Record<string, unknown> = {}) => ({
    paperId: "MED:33268865",
    claim: "Partial reprogramming reversed vision loss in aged mice.",
    label: "supports",
    quote: "reverses vision loss in a mouse model of glaucoma and in aged mice",
    passageId: "abstract",
    location: "Abstract (excerpt)",
    studyType: "Animal experiment",
    population: "Mice",
    access: "abstract_only",
    coverage: "Abstract excerpt only; full-text methods and results were not checked.",
    mismatchNotes: ["The measured outcome is in mice, not people."],
    suggestedWording: null,
    reason: "The source reports a mouse outcome.",
    quoteVerified: true,
    checkedBy: "AI",
    approvalStatus: "awaiting_author",
    ...extra,
  });
  const serverPaper = (extra: Record<string, unknown> = {}) => ({
    id: "MED:33268865",
    title: "Reprogramming to recover youthful epigenetic information and restore vision.",
    authors: ["Lu Y", "Brommer B"],
    source: "MED",
    year: 2020,
    journal: "Nature",
    doi: "10.1038/s41586-020-2975-4",
    pmid: "33268865",
    pmcid: "",
    url: "https://europepmc.org/article/MED/33268865",
    abstract: "Ageing is a degenerative process.",
    openAccess: false,
    access: "abstract_only",
    coverage: "Abstract excerpt only.",
    sourceText: "never shown",
    ...extra,
  });
  const result = (extra: Record<string, unknown> = {}) => ({
    question: "Does OSK reprogramming restore vision?",
    summary: {
      established: [
        "Partial reprogramming reversed vision loss in aged mice. [MED:33268865]",
      ],
      uncertain: ["Human evidence was not found in this bounded search."],
      nextQuestions: ["Has OSK reprogramming been tested in primates?"],
    },
    evidence: [card()],
    papers: [serverPaper()],
    steps: [],
    usage: {},
    ...extra,
  });

  it("maps the verified result into the note the author reviews", () => {
    const note = researchNoteFromResult(request(), result(), {
      runId: "run-9",
      at: "2026-11-18T00:00:00Z",
    });
    expect(note).toEqual({
      at: "2026-11-18T00:00:00Z",
      runId: "run-9",
      question: "Does OSK reprogramming restore vision?",
      summary: {
        established: [
          "Partial reprogramming reversed vision loss in aged mice. [MED:33268865]",
        ],
        uncertain: ["Human evidence was not found in this bounded search."],
        nextQuestions: ["Has OSK reprogramming been tested in primates?"],
      },
      cards: [
        {
          paperId: "MED:33268865",
          claim: "Partial reprogramming reversed vision loss in aged mice.",
          label: "supports",
          quote: "reverses vision loss in a mouse model of glaucoma and in aged mice",
          location: "Abstract (excerpt)",
          coverage:
            "Abstract excerpt only; full-text methods and results were not checked.",
          studyType: "Animal experiment",
          population: "Mice",
          mismatchNotes: ["The measured outcome is in mice, not people."],
          suggestedWording: null,
          reason: "The source reports a mouse outcome.",
        },
      ],
      papers: [
        {
          id: "MED:33268865",
          source: "MED",
          title:
            "Reprogramming to recover youthful epigenetic information and restore vision.",
          authors: ["Lu Y", "Brommer B"],
          year: 2020,
          journal: "Nature",
          doi: "10.1038/s41586-020-2975-4",
          pmid: "33268865",
          pmcid: "",
          url: "https://europepmc.org/article/MED/33268865",
          abstract: "Ageing is a degenerative process.",
          openAccess: false,
        },
      ],
    });
  });

  it("drops a card without a server-verified quote or a recognized label", () => {
    const note = researchNoteFromResult(
      request(),
      result({
        evidence: [card({ quoteVerified: false }), card({ label: "proven" }), card()],
      }),
      { runId: null, at: "2026-11-18T00:00:00Z" },
    );
    expect(note.cards).toHaveLength(1);
  });

  it("keeps one card per paper, like the server's own discards", () => {
    const note = researchNoteFromResult(
      request(),
      result({ evidence: [card(), card({ reason: "A second card for the same paper." })] }),
      { runId: null, at: "2026-11-18T00:00:00Z" },
    );
    expect(note.cards).toHaveLength(1);
    expect(note.cards[0].reason).toBe("The source reports a mouse outcome.");
  });

  it("keeps only papers with a resolvable id and a Europe PMC link", () => {
    const note = researchNoteFromResult(
      request(),
      result({
        papers: [
          serverPaper(),
          serverPaper({ id: "WEB:1", url: "https://example.com/paper" }),
          serverPaper({ id: "MED:2", url: "javascript:alert(1)" }),
          serverPaper({ id: "MED:3", title: "" }),
        ],
      }),
      { runId: null, at: "2026-11-18T00:00:00Z" },
    );
    expect(note.papers.map((paper) => paper.id)).toEqual(["MED:33268865"]);
  });

  it("reads an empty or malformed result as an empty note, never invented content", () => {
    const note = researchNoteFromResult(request(), {}, {
      runId: null,
      at: "2026-11-18T00:00:00Z",
    });
    expect(note.summary).toEqual({ established: [], uncertain: [], nextQuestions: [] });
    expect(note.cards).toEqual([]);
    expect(note.papers).toEqual([]);
  });
});

describe("saving a research note", () => {
  const note = () => ({
    at: "2026-11-18T00:00:00Z",
    runId: "run-9",
    question: "Does OSK reprogramming restore vision?",
    summary: {
      established: [
        "Partial reprogramming reversed vision loss in aged mice. [MED:33268865]",
      ],
      uncertain: ["Human evidence was not found in this bounded search."],
      nextQuestions: ["Has OSK reprogramming been tested in primates?"],
    },
    cards: [],
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
  });
  const project = (): Project => ({
    id: "project-1",
    name: "Vision",
    question: "",
    createdAt: "2026-11-01T00:00:00Z",
  });

  it("renders the findings block with provenance and sources inspected", () => {
    const text = researchFindingsMarkdown(note());
    expect(text).toContain("### AI research check: Does OSK reprogramming restore vision?");
    expect(text).toContain("Findings suggested by AI");
    expect(text).toContain(
      "- Partial reprogramming reversed vision loss in aged mice. [MED:33268865]",
    );
    expect(text).toContain("Uncertainty & limitations");
    expect(text).toContain("Next questions");
    expect(text).toContain(
      "- Reprogramming to restore vision. — https://europepmc.org/article/MED/33268865",
    );
    expect(text).toMatch(/saved by the author/i);
    expect(text).toMatch(/no experiment ran/i);
  });

  it("appends findings to the notebook once; saving the same note again is a duplicate", () => {
    const first = withResearchFindingsSaved(project(), note());
    expect(first.outcome).toBe("saved");
    expect(first.project.notebook?.findings).toContain("### AI research check:");
    const again = withResearchFindingsSaved(first.project, note());
    expect(again.outcome).toBe("duplicate");
    expect(again.project).toBe(first.project);
  });

  it("keeps existing notebook findings and appends after them", () => {
    const base = withNotebookUpdate(project(), { findings: "My own observation." });
    const { project: next } = withResearchFindingsSaved(base, note());
    expect(next.notebook?.findings.startsWith("My own observation.")).toBe(true);
    expect(next.notebook?.findings).toContain("### AI research check:");
  });

  it("refuses an append that would overflow the notebook field", () => {
    const base = withNotebookUpdate(project(), { findings: "x".repeat(19990) });
    const { outcome, project: next } = withResearchFindingsSaved(base, note());
    expect(outcome).toBe("too_long");
    expect(next.notebook?.findings).toBe("x".repeat(19990));
  });

  it("saves sources to the library once, as to-read saved sources only", () => {
    const first = withResearchSourcesSaved(project(), note());
    expect(first.added).toBe(1);
    expect(first.project.sources?.map((source) => source.paper.id)).toEqual([
      "MED:33268865",
    ]);
    expect(first.project.sources?.[0].status).toBe("to-read");
    const again = withResearchSourcesSaved(first.project, note());
    expect(again.added).toBe(0);
    expect(again.project.sources).toHaveLength(1);
  });
});
