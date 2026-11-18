// The Playwright-only Worker entry (wrangler.e2e.jsonc): the deployed app
// unchanged, with TEST_DEPENDENCIES injecting a fake AI provider and a fake
// Europe PMC transport into the real research pipeline. Everything else —
// routes, consent validation, the D1 spending ledger, quote verification,
// card discards — runs exactly as deployed. Never deployed itself.
import app from "../worker/app.mjs";
import { runResearch } from "../worker/server/research.mjs";

export const E2E_QUOTE =
  "reverses vision loss in a mouse model of glaucoma and in aged mice";

const ABSTRACT =
  "Ageing is a degenerative process that leads to tissue dysfunction and death. " +
  "Ectopic expression of Oct4, Sox2 and Klf4 genes in mouse retinal ganglion cells " +
  "promotes axon regeneration after injury, and " +
  E2E_QUOTE +
  ".";

const RECORD = {
  id: "33268865",
  source: "MED",
  pmid: "33268865",
  title: "Reprogramming to recover youthful epigenetic information and restore vision.",
  authorString: "Lu Y, Brommer B, Tian X",
  pubYear: "2020",
  journalInfo: { journal: { title: "Nature" } },
  doi: "10.1038/s41586-020-2975-4",
  isOpenAccess: "N",
  abstractText: ABSTRACT,
};

// The pipeline's only allowed destination is Europe PMC; serve its one
// lookup from the fixture so no e2e traffic leaves the machine.
const fakeEuropePmc = async (url) => {
  if (new URL(url).pathname.endsWith("/search")) {
    return new Response(JSON.stringify({ hitCount: 1, resultList: { result: [RECORD] } }), {
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error("Unexpected e2e destination: " + url);
};

// A deliberately overconfident judge, as in the server suites: the server
// must verify its quote and claim itself and discard what fails. The plan
// and screen calls serve the freeform Research check (#14); a cited-sources
// Evidence check never reaches them in the real pipeline.
const fakeProvider = (model) => ({
  model,
  estimateInputTokens: () => 2000,
  async complete({ name, input }) {
    const data = JSON.parse(input).untrusted_data;
    const paid = (value) => ({ inputTokens: 200, outputTokens: 100, value });
    if (name === "pherogent_plan") {
      return paid({ queries: ["OSK reprogramming vision", "partial reprogramming glaucoma"] });
    }
    if (name === "pherogent_screen") {
      return paid({
        keep: [
          { paperId: "MED:33268865", reason: "Directly reports the OSK vision outcome." },
        ],
        refinementQuery: null,
      });
    }
    if (name !== "pherogent_judge") {
      throw new Error("The research pipeline must not call " + name);
    }
    const { originalClaim } = data;
    if (!originalClaim) {
      // Freeform mode: cards carry their own claims and no claimId.
      return paid({
        summary: {
          established: [],
          uncertain: ["Human evidence was not reported in this abstract."],
          nextQuestions: ["Has OSK reprogramming been tested in primates?"],
        },
        evidence: [
          {
            paperId: "MED:33268865",
            claim: "Partial reprogramming reversed vision loss in aged mice.",
            label: "supports",
            quote: E2E_QUOTE,
            passageId: "abstract",
            studyType: "Animal experiment",
            population: "Mice",
            mismatchNotes: ["The measured outcome is in mice, not people."],
            suggestedWording: null,
            reason: "The abstract reports the vision outcome directly.",
          },
        ],
      });
    }
    return paid({
      summary: { established: [], uncertain: [], nextQuestions: [] },
      evidence: [
        {
          paperId: "MED:33268865",
          claimId: originalClaim.id,
          claim: originalClaim.text,
          label: "partial",
          quote: E2E_QUOTE,
          passageId: "abstract",
          studyType: "Animal experiment",
          population: "Mice",
          mismatchNotes: ["The measured outcome is in mice, not people."],
          suggestedWording:
            "Partial reprogramming reversed vision loss in a mouse model of glaucoma.",
          reason: "The source reports a mouse outcome narrower than the sentence.",
        },
      ],
    });
  },
});

// The Section chat (#12) runs through the real runSectionReply pipeline —
// validation, token bounds, strict output checks — against this provider,
// injected via the route's createProvider seam. The echoed message proves
// the reply came from the consented request.
export const E2E_CHAT_DRAFT = {
  title: "Methods",
  body: "Mice were perfused with fixative following the supplied protocol. [detail needed: perfusion pressure]",
};

const fakeChatProvider = ({ model }) => ({
  model,
  estimateInputTokens: () => 2000,
  async complete({ name, input }) {
    if (name !== "pherogent_section_reply") {
      throw new Error("The section chat must not call " + name);
    }
    const { stage, message } = JSON.parse(input).untrusted_data;
    return {
      inputTokens: 200,
      outputTokens: 100,
      value: {
        reply: `For the ${stage} section, on "${message}": describe only what was done.`,
        suggestedDraft: E2E_CHAT_DRAFT,
      },
    };
  },
});

const dependencies = {
  runResearch: (options) =>
    runResearch({
      ...options,
      provider: fakeProvider(options.model),
      fetchImpl: fakeEuropePmc,
    }),
  createProvider: fakeChatProvider,
};

export default {
  fetch: (request, env, ctx) =>
    app.fetch(request, { ...env, TEST_DEPENDENCIES: dependencies }, ctx),
};
