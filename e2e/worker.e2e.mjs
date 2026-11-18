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
// must verify its quote and claim itself and discard what fails.
const fakeProvider = (model) => ({
  model,
  estimateInputTokens: () => 2000,
  async complete({ name, input }) {
    if (name !== "pherogent_judge") {
      throw new Error("The cited-sources check must not call " + name);
    }
    const { originalClaim } = JSON.parse(input).untrusted_data;
    return {
      inputTokens: 200,
      outputTokens: 100,
      value: {
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
};

export default {
  fetch: (request, env, ctx) =>
    app.fetch(request, { ...env, TEST_DEPENDENCIES: dependencies }, ctx),
};
