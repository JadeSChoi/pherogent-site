import { describe, expect, it, vi } from "vitest";
import type { Paper } from "../library/europePmc";
import type { Project, ReviewSentence, SavedSource } from "../storage/workspace";
import {
  EvidenceCheckError,
  buildCheckRequest,
  checkBlockedReason,
  checkableSources,
  evidenceCheckFromResult,
  outgoingBody,
  readCheckAccess,
  runEvidenceCheck,
} from "./evidenceCheck";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const paper = (id: string): Paper => ({
  id,
  source: id.split(":")[0],
  title: "Paper " + id,
  authors: [],
  year: 2020,
  journal: "Journal",
  doi: "",
  pmid: "",
  pmcid: "",
  url: "https://europepmc.org/article/MED/1",
  abstract: "Visual function improved in aged mice.",
  openAccess: false,
});

const source = (id: string): SavedSource => ({
  paper: paper(id),
  note: "",
  status: "useful",
  savedAt: "",
});

const sentence = (text = "Reprogramming restored visual function in aged mice."): ReviewSentence => ({
  id: "sentence-1",
  text,
  start: 0,
  end: text.length,
  paperId: null,
  quote: "",
  assessment: "unreviewed",
  revision: "",
  note: "",
  evidenceCheck: null,
  decision: null,
  contextChanged: false,
});

describe("checkableSources", () => {
  it("keeps only saved sources whose ids the server accepts as cited sources", () => {
    const project = {
      sources: [
        source("MED:33268865"),
        source("PMC:PMC7752134"),
        source("PPR:PPR123456"),
        source("MED:0bad"),
      ],
    } as Project;
    expect(checkableSources(project).map((s) => s.paper.id)).toEqual([
      "MED:33268865",
      "PMC:PMC7752134",
    ]);
  });
});

describe("buildCheckRequest", () => {
  it("builds the consented Evidence check envelope for the unchanged sentence", () => {
    const request = buildCheckRequest(sentence(), ["MED:33268865", "PMC:PMC7752134"]);
    expect(request.requestId).toMatch(UUID);
    expect(request).toMatchObject({
      consent: true,
      question: "Reprogramming restored visual function in aged mice.",
      claim: {
        id: "sentence-1",
        text: "Reprogramming restored visual function in aged mice.",
      },
      citedPaperIds: ["MED:33268865", "PMC:PMC7752134"],
      studyDesign: true,
    });
  });

  it("issues a fresh requestId per request", () => {
    const one = buildCheckRequest(sentence(), ["MED:1"]);
    const two = buildCheckRequest(sentence(), ["MED:1"]);
    expect(one.requestId).not.toBe(two.requestId);
  });
});

describe("checkBlockedReason", () => {
  it("requires at least one and at most three selected sources", () => {
    expect(checkBlockedReason(sentence(), [])).toMatch(/select/i);
    expect(
      checkBlockedReason(sentence(), ["MED:1", "MED:2", "MED:3", "MED:4"]),
    ).toMatch(/three/i);
    expect(checkBlockedReason(sentence(), ["MED:1"])).toBeNull();
  });

  it("refuses a sentence beyond the server's 2,000-character bound", () => {
    expect(checkBlockedReason(sentence("x".repeat(2001)), ["MED:1"])).toMatch(/2,000/);
  });
});

describe("outgoingBody", () => {
  it("is the exact JSON the run sends", async () => {
    const request = buildCheckRequest(sentence(), ["MED:33268865"]);
    const body = outgoingBody(request);
    expect(JSON.parse(body)).toEqual(request);
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"type":"start","runId":"run-1"}\n{"type":"result","result":{}}\n'),
    );
    await runEvidenceCheck(request, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/check-claim",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
  });
});

describe("runEvidenceCheck", () => {
  const request = () => buildCheckRequest(sentence(), ["MED:33268865"]);

  it("resolves with the runId and final result, reporting steps on the way", async () => {
    const lines = [
      { type: "start", runId: "run-9" },
      { type: "step", step: { stage: "sources", detail: "Checking 1 selected source IDs." } },
      { type: "usage", usage: { modelCalls: 1 } },
      { type: "result", result: { question: "q", evidence: [] } },
    ]
      .map((line) => JSON.stringify(line))
      .join("\n");
    const steps: string[] = [];
    const outcome = await runEvidenceCheck(request(), {
      fetchImpl: async () => new Response(lines + "\n"),
      onStep: (detail) => steps.push(detail),
    });
    expect(outcome.runId).toBe("run-9");
    expect(outcome.result).toEqual({ question: "q", evidence: [] });
    expect(steps).toEqual(["Checking 1 selected source IDs."]);
  });

  it("reports steps while the stream is still open, not only at its end", async () => {
    // The result line is withheld until a step has been observed: a client
    // that buffers the whole stream before parsing would deadlock here.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "start", runId: "run-9" }) +
              "\n" +
              JSON.stringify({ type: "step", step: { stage: "sources", detail: "first" } }) +
              "\n",
          ),
        );
        await gate;
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "result", result: {} }) + "\n"),
        );
        controller.close();
      },
    });
    const outcome = await runEvidenceCheck(request(), {
      fetchImpl: async () => new Response(stream),
      onStep: () => release(),
    });
    expect(outcome.runId).toBe("run-9");
  });

  it("throws the server's coded error from an error event", async () => {
    const lines =
      JSON.stringify({ type: "start", runId: "run-9" }) +
      "\n" +
      JSON.stringify({
        type: "error",
        error: { code: "token_budget", message: "Shorten the question." },
      }) +
      "\n";
    await expect(
      runEvidenceCheck(request(), { fetchImpl: async () => new Response(lines) }),
    ).rejects.toMatchObject({ code: "token_budget", message: "Shorten the question." });
  });

  it("throws the server's coded error from a non-streaming refusal", async () => {
    await expect(
      runEvidenceCheck(request(), {
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

  it("reports an interrupted stream instead of inventing a result", async () => {
    const lines = JSON.stringify({ type: "start", runId: "run-9" }) + "\n";
    await expect(
      runEvidenceCheck(request(), { fetchImpl: async () => new Response(lines) }),
    ).rejects.toMatchObject({ code: "stream_interrupted" });
  });

  it("wraps a network failure as a coded error", async () => {
    await expect(
      runEvidenceCheck(request(), {
        fetchImpl: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    ).rejects.toBeInstanceOf(EvidenceCheckError);
  });
});

describe("evidenceCheckFromResult", () => {
  const request = () => buildCheckRequest(sentence(), ["MED:33268865", "PMC:PMC999"]);
  const card = (extra: Record<string, unknown> = {}) => ({
    paperId: "MED:33268865",
    claimId: "sentence-1",
    claim: "Reprogramming restored visual function in aged mice.",
    label: "partial",
    quote: "Visual function improved in aged mice.",
    passageId: "abstract",
    location: "Abstract (excerpt)",
    studyType: "Animal experiment",
    population: "Mice",
    access: "abstract_only",
    coverage: "Abstract excerpt only; full-text methods and results were not checked.",
    mismatchNotes: ["Mouse evidence cannot establish a human outcome."],
    suggestedWording: "Visual function improved in aged mice.",
    reason: "The outcome is narrower than the sentence.",
    quoteVerified: true,
    checkedBy: "AI",
    approvalStatus: "awaiting_author",
    ...extra,
  });
  const result = (extra: Record<string, unknown> = {}) => ({
    question: "Reprogramming restored visual function in aged mice.",
    summary: {
      established: [],
      uncertain: ["Only the selected cited sources were checked."],
      nextQuestions: [],
    },
    scope: {
      mode: "cited_sources",
      requestedPaperIds: ["MED:33268865", "PMC:PMC999"],
      unavailablePaperIds: ["PMC:PMC999"],
      coverage: "Only the selected cited sources were checked.",
    },
    evidence: [card()],
    papers: [],
    steps: [],
    usage: {},
    ...extra,
  });

  it("splits each surviving card into its AI-suggestion and code-check records", () => {
    const check = evidenceCheckFromResult(request(), result(), {
      runId: "run-9",
      at: "2026-11-18T00:00:00Z",
    });
    expect(check).toEqual({
      at: "2026-11-18T00:00:00Z",
      runId: "run-9",
      sentenceText: "Reprogramming restored visual function in aged mice.",
      citedPaperIds: ["MED:33268865", "PMC:PMC999"],
      cards: [
        {
          paperId: "MED:33268865",
          suggestion: {
            label: "partial",
            suggestedWording: "Visual function improved in aged mice.",
            reason: "The outcome is narrower than the sentence.",
            mismatchNotes: ["Mouse evidence cannot establish a human outcome."],
            studyType: "Animal experiment",
            population: "Mice",
          },
          check: {
            quoteVerified: true,
            quote: "Visual function improved in aged mice.",
            location: "Abstract (excerpt)",
            coverage:
              "Abstract excerpt only; full-text methods and results were not checked.",
            designAdjusted: false,
          },
        },
      ],
      unavailablePaperIds: ["PMC:PMC999"],
      notes: ["Only the selected cited sources were checked."],
    });
  });

  it("drops a card for a different claim or an unverified quote", () => {
    const check = evidenceCheckFromResult(
      request(),
      result({
        evidence: [
          card({ claimId: "another-sentence" }),
          card({ quoteVerified: false }),
          card(),
        ],
      }),
      { runId: null, at: "2026-11-18T00:00:00Z" },
    );
    expect(check.cards).toHaveLength(1);
  });

  it("marks a design-adjusted card from the server's design check", () => {
    const check = evidenceCheckFromResult(
      request(),
      result({
        evidence: [
          card({
            label: "unsupported",
            designCheck: {
              rule: "same-cell-tracking-v1",
              status: "incompatible",
              reason: "Bulk sampling cannot track the same cells.",
              modelLabel: "supports",
              adjusted: true,
            },
          }),
        ],
      }),
      { runId: null, at: "2026-11-18T00:00:00Z" },
    );
    expect(check.cards[0].check.designAdjusted).toBe(true);
    expect(check.cards[0].suggestion.label).toBe("unsupported");
  });
});

describe("readCheckAccess", () => {
  it("returns the server's run permission and message", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ canRun: false, reason: "owner_key_required", message: "Key required." }),
          { status: 200 },
        ),
    );
    const access = await readCheckAccess({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("/api/agent/status");
    expect(access).toEqual({ canRun: false, message: "Key required." });
  });

  it("reports an unreachable status endpoint as not runnable", async () => {
    const access = await readCheckAccess({
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(access.canRun).toBe(false);
    expect(access.message).toMatch(/reach/i);
  });
});
