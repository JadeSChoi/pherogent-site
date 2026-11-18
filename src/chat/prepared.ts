/**
 * The prepared examples (issue #12): one prewritten exchange per chat
 * section, loadable with zero AI calls so every section demonstrates its
 * flow — including apply-draft and review — before any key or consent
 * exists. Nothing in this module performs any network request; every reply
 * says in its own text that it is prewritten.
 */

import type { Project } from "../storage/workspace";
import { withMessageAppended, type SuggestedDraft } from "./sectionChat";
import type { ChatStage } from "./stages";

export type PreparedExample = {
  /** The example author message. */
  prompt: string;
  /** The prewritten reply; always labels itself as not an AI response. */
  reply: string;
  /** The example's suggested section draft, applied like any other. */
  draft: SuggestedDraft;
};

const NOTE =
  "This is a prewritten example, not an AI response — nothing was sent and nothing was spent.";

export const PREPARED_EXAMPLES: Record<ChatStage, PreparedExample> = {
  organizer: {
    prompt: "Help me organize what this project still needs.",
    reply:
      `${NOTE} A useful split: (1) the research question as one sentence, ` +
      "(2) the evidence you already hold, (3) the evidence each claim still " +
      "needs, (4) the next experiment or search. Keep observations separate " +
      "from proposals.",
    draft: {
      title: "Project brief",
      body:
        "Question: [state the research question].\nEvidence in hand: [list].\n" +
        "Evidence still needed: [list].\nNext step: [one proposed action].",
    },
  },
  data: {
    prompt: "How should I plan the data preparation?",
    reply:
      `${NOTE} Plan three passes: cleaning rules written down before you ` +
      "apply them, quality checks with thresholds you set in advance, and an " +
      "analysis script someone else could rerun. Nothing here runs code.",
    draft: {
      title: "Data preparation plan",
      body:
        "Cleaning: [rules, decided before applying].\nQuality checks: " +
        "[checks and thresholds].\nAnalysis: [planned steps, not yet run].",
    },
  },
  methods: {
    prompt: "Turn my notes into a reproducible methods passage.",
    reply:
      `${NOTE} A methods draft should let a stranger repeat the work: ` +
      "materials with sources, procedure in order, and every parameter you " +
      "actually used. Mark anything missing as [detail needed] rather than " +
      "guessing it.",
    draft: {
      title: "Methods",
      body:
        "Animals: [strain, age, n; detail needed].\nProcedure: [ordered " +
        "steps as performed].\nAnalysis: [tests and software, with versions].",
    },
  },
  results: {
    prompt: "Help me describe these results accurately.",
    reply:
      `${NOTE} State each observation with its measurement, sample size, and ` +
      "uncertainty, and nothing you did not measure. A result without its " +
      "limits reads as a stronger claim than you made.",
    draft: {
      title: "Results",
      body:
        "[Measurement] changed by [effect size] (n = [n], [uncertainty]). " +
        "No other outcomes were measured.",
    },
  },
  figures: {
    prompt: "What figures would make this evidence clear?",
    reply:
      `${NOTE} Pick one message per figure, name the comparison it shows, and ` +
      "caption what was measured — not what you conclude. No figure is " +
      "rendered by this chat.",
    draft: {
      title: "Figure plan",
      body:
        "Figure 1: [comparison shown], from [data source]. Caption: " +
        "[measured quantity, groups, n].",
    },
  },
  title: {
    prompt: "Suggest a title that matches the evidence.",
    reply:
      `${NOTE} A defensible title names the system, the intervention, and the ` +
      "measured outcome — and promises nothing beyond them. Keep hypotheses " +
      "out of the title.",
    draft: {
      title: "Working title",
      body: "[Intervention] [changes measured outcome] in [system/population].",
    },
  },
  introduction: {
    prompt: "Help me structure the introduction.",
    reply:
      `${NOTE} Three moves: the established context with citations you have ` +
      "verified, the specific gap, and your question. Where a source is " +
      "missing, write [citation needed] instead of inventing one.",
    draft: {
      title: "Introduction",
      body:
        "Context: [established findings; citation needed].\nGap: [what is " +
        "not known].\nQuestion: [this study's question].",
    },
  },
  discussion: {
    prompt: "How do I interpret these findings carefully?",
    reply:
      `${NOTE} Interpret only what was measured, name at least one ` +
      "alternative explanation, and keep association distinct from " +
      "causation. Limits belong beside the interpretation, not after it.",
    draft: {
      title: "Discussion",
      body:
        "Finding: [observation].\nInterpretation: [reading, within the " +
        "measured scope].\nAlternatives: [other explanations].\nLimits: " +
        "[population, design, measurement].",
    },
  },
  abstract: {
    prompt: "Summarize the manuscript as an abstract.",
    reply:
      `${NOTE} Summarize only sections that exist: question, methods as ` +
      "performed, results with numbers, and limits. Name any section that is " +
      "still missing instead of papering over it.",
    draft: {
      title: "Abstract",
      body:
        "Background: [question]. Methods: [as performed]. Results: [measured " +
        "outcomes with n]. Limits: [key limitation].",
    },
  },
  references: {
    prompt: "Help me organize what still needs a citation.",
    reply:
      `${NOTE} List each claim that leans on outside work and what would ` +
      "support it. This chat searches nothing and verifies no quotation — " +
      "use the Library to find sources and an Evidence check to verify one.",
    draft: {
      title: "Citation needs",
      body:
        "Claim: [sentence needing support] — needs [kind of source]. " +
        "Verified via Evidence check: [not yet].",
    },
  },
  review: {
    prompt: "Review this section for overclaims.",
    reply:
      `${NOTE} Read for three things: claims stronger than their evidence, ` +
      "numbers reported without uncertainty, and conclusions that outrun the " +
      "population studied. Scientific verification still requires your own " +
      "review.",
    draft: {
      title: "Review notes",
      body:
        "Overclaims: [sentences to narrow].\nMissing reporting: [n, " +
        "uncertainty, conditions].\nScope: [where conclusions outrun the " +
        "evidence].",
    },
  },
};

/**
 * Loads one section's prepared exchange into its conversation, marked
 * "prepared" end to end. No request leaves the browser; the draft
 * suggestion waits for the author's apply like any live reply's.
 */
export function withPreparedExample(project: Project, stage: ChatStage): Project {
  const example = PREPARED_EXAMPLES[stage];
  const withPrompt = withMessageAppended(project, stage, {
    author: "author",
    kind: "prepared",
    text: example.prompt,
    runId: null,
    suggestedDraft: null,
  });
  return withMessageAppended(withPrompt, stage, {
    author: "ai",
    kind: "prepared",
    text: example.reply,
    runId: null,
    suggestedDraft: example.draft,
  });
}
