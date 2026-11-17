// PROTOTYPE — throwaway sample data for the issue #3 design-direction prototype.
// Shared by all variants so every direction renders the exact same content.

export type SampleProject = {
  id: string;
  name: string;
  question: string;
  papers: number;
  words: number;
  checksDone: number;
  checksTotal: number;
  updated: string;
};

export const projects: SampleProject[] = [
  {
    id: "reprogramming",
    name: "Reprogramming & visual recovery",
    question:
      "What does partial reprogramming restore — and how far can the evidence take us?",
    papers: 3,
    words: 56,
    checksDone: 0,
    checksTotal: 3,
    updated: "2 hours ago",
  },
  {
    id: "epistate",
    name: "EpiState transitions in Lee 2014",
    question: "Do heterochromatin transition rates differ by lineage?",
    papers: 12,
    words: 1840,
    checksDone: 9,
    checksTotal: 14,
    updated: "Yesterday",
  },
  {
    id: "collagen",
    name: "Collagen aging markers",
    question: "Which collagen markers track biological age in skin?",
    papers: 7,
    words: 430,
    checksDone: 3,
    checksTotal: 5,
    updated: "Nov 3",
  },
];

export const sections = [
  "Workspace",
  "Library",
  "Manuscript",
  "Evidence",
  "Data analysis",
] as const;

export const activeSection = "Evidence";

export const checkedSentence =
  "Partial reprogramming can reverse vision loss in people with glaucoma.";

export const evidenceCheck = {
  verdict: "Narrower wording needed",
  badge: "Scope mismatch",
  explanation:
    "Directly relevant to vision and glaucoma, but the study population is mice. Cite it only after correcting the population in the sentence.",
  source: {
    authors: "Lu et al.",
    year: 2020,
    title:
      "Reprogramming to recover youthful epigenetic information and restore vision",
    venue: "Nature",
    doi: "10.1038/s41586-020-2975-4",
    quote:
      "reverses vision loss in a mouse model of glaucoma and in aged mice.",
    passage: "Abstract",
  },
  suggestion:
    "Partial reprogramming restored vision in a mouse model of glaucoma.",
};

export const chatTurns = [
  {
    role: "user" as const,
    text: `Check this sentence against my library: “${checkedSentence}”`,
  },
  {
    role: "agent" as const,
    text: "I found one source in your library that speaks to this claim. The evidence supports a narrower statement than the sentence makes.",
    check: evidenceCheck,
  },
];

export const projectName = "Reprogramming & visual recovery";
