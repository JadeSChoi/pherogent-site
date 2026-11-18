/**
 * The eleven chat sections (issue #12), one per server chat stage. The id is
 * the entire wire contract: the server derives the assigned role from it
 * (worker/server/chat.mjs ROLES) — the client never supplies prompts, models,
 * or budgets. Labels, groups, and descriptions are display-only.
 */

export type ChatStage =
  | "organizer"
  | "data"
  | "methods"
  | "results"
  | "figures"
  | "title"
  | "introduction"
  | "discussion"
  | "abstract"
  | "references"
  | "review";

export type StageGroup = "Project" | "Research" | "Writing";

export const STAGE_GROUPS: readonly StageGroup[] = [
  "Project",
  "Research",
  "Writing",
];

export type ChatSection = {
  id: ChatStage;
  label: string;
  /** The server-side role's display name, e.g. the consent dialog title. */
  role: string;
  group: StageGroup;
  description: string;
};

export const CHAT_SECTIONS: readonly ChatSection[] = [
  {
    id: "organizer",
    label: "Research organizer",
    role: "Project agent",
    group: "Project",
    description:
      "Keep the research question, section work and decisions connected.",
  },
  {
    id: "data",
    label: "Data processing",
    role: "Data agent",
    group: "Research",
    description: "Plan cleaning, quality checks and reproducible analysis.",
  },
  {
    id: "methods",
    label: "Methods",
    role: "Methods agent",
    group: "Research",
    description:
      "Document what was done, and distinguish it from proposed experiments.",
  },
  {
    id: "results",
    label: "Results",
    role: "Results agent",
    group: "Research",
    description: "Connect each finding to its measurement, source and limits.",
  },
  {
    id: "figures",
    label: "Figures & tables",
    role: "Figures agent",
    group: "Research",
    description: "Plan figures and captions that make the evidence clear.",
  },
  {
    id: "title",
    label: "Title",
    role: "Title agent",
    group: "Writing",
    description:
      "Express the contribution without promising more than the evidence shows.",
  },
  {
    id: "introduction",
    label: "Introduction",
    role: "Introduction agent",
    group: "Writing",
    description: "Develop the context, research gap and central question.",
  },
  {
    id: "discussion",
    label: "Discussion",
    role: "Discussion agent",
    group: "Writing",
    description: "Interpret the findings alongside alternatives and limitations.",
  },
  {
    id: "abstract",
    label: "Abstract",
    role: "Abstract agent",
    group: "Writing",
    description: "Summarize the reviewed manuscript with its limits intact.",
  },
  {
    id: "references",
    label: "References",
    role: "Reference agent",
    group: "Writing",
    description: "Match claims to papers and inspect the supporting passages.",
  },
  {
    id: "review",
    label: "Final review",
    role: "Review agent",
    group: "Writing",
    description: "Check consistency, unresolved questions and author decisions.",
  },
];

/** The section for a stage id; an unknown id reads as the organizer so a
 * stored active stage from a newer or corrupted workspace still renders. */
export function sectionFor(stage: ChatStage): ChatSection {
  return CHAT_SECTIONS.find((section) => section.id === stage) ?? CHAT_SECTIONS[0];
}
