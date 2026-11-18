/**
 * The browser-local Section chat model (issue #12): per Project, each of the
 * eleven chat sections keeps its own conversation, working draft, and
 * author-written context. Everything here is a pure transition on Project —
 * nothing sends a request, and no transition ever edits Manuscript text
 * (appending adds new Sections only).
 */

import {
  MANUSCRIPT_GUARD,
  SECTION_LIMIT,
  createSection,
  defaultManuscript,
  manuscriptLength,
  type AppendOutcome,
  type Project,
} from "../storage/workspace";
import type { ChatStage } from "./stages";

export type SuggestedDraft = { title: string; body: string };

/**
 * One conversation entry. A "prepared" message is the built-in zero-AI
 * example; a "live" AI message is a consented reply awaiting author review.
 */
export type ChatMessage = {
  id: string;
  author: "author" | "ai";
  kind: "live" | "prepared";
  text: string;
  at: string;
  /** The server run that produced an AI reply; null otherwise. */
  runId: string | null;
  /** A proposed section draft riding along with a reply. Changes nothing
   * until the author applies it. */
  suggestedDraft: SuggestedDraft | null;
};

/** A prior version of the working draft, preserved when a new one replaces it. */
export type DraftSnapshot = {
  title: string;
  body: string;
  provenance: string;
  at: string;
};

/** The section's working draft. Never part of the Manuscript until the
 * author reviews it and appends a copy. */
export type ChatDraft = {
  title: string;
  body: string;
  /** The author marked this exact draft reviewed; cleared by any change. */
  reviewed: boolean;
  /** Where this draft text came from, shown beside it. */
  provenance: string;
  /** Prior versions, newest first. */
  history: DraftSnapshot[];
};

export type Conversation = {
  messages: ChatMessage[];
  draft: ChatDraft;
  /** Author-written context included in this section's sends. */
  context: string;
};

export type ProjectChat = {
  activeStage: ChatStage;
  sections: Partial<Record<ChatStage, Conversation>>;
};

/** Conversation caps, mirroring the legacy workspace's normalize bounds. */
export const MAX_CHAT_MESSAGES = 100;

export const emptyDraft = (): ChatDraft => ({
  title: "",
  body: "",
  reviewed: false,
  provenance: "Author",
  history: [],
});

export const emptyConversation = (): Conversation => ({
  messages: [],
  draft: emptyDraft(),
  context: "",
});

export function conversationFor(project: Project, stage: ChatStage): Conversation {
  return project.chat?.sections[stage] ?? emptyConversation();
}

function withConversation(
  project: Project,
  stage: ChatStage,
  mutate: (conversation: Conversation) => Conversation,
): Project {
  const chat: ProjectChat = project.chat ?? { activeStage: stage, sections: {} };
  return {
    ...project,
    chat: {
      ...chat,
      sections: {
        ...chat.sections,
        [stage]: mutate(conversationFor(project, stage)),
      },
    },
  };
}

export function withActiveStage(project: Project, stage: ChatStage): Project {
  const chat: ProjectChat = project.chat ?? { activeStage: stage, sections: {} };
  return { ...project, chat: { ...chat, activeStage: stage } };
}

function appended(messages: ChatMessage[], next: ChatMessage): ChatMessage[] {
  return [...messages, next].slice(-MAX_CHAT_MESSAGES);
}

const message = (
  author: ChatMessage["author"],
  kind: ChatMessage["kind"],
  text: string,
): ChatMessage => ({
  id: `message-${crypto.randomUUID()}`,
  author,
  kind,
  text,
  at: new Date().toISOString(),
  runId: null,
  suggestedDraft: null,
});

export function withAuthorMessage(
  project: Project,
  stage: ChatStage,
  text: string,
): Project {
  return withConversation(project, stage, (conversation) => ({
    ...conversation,
    messages: appended(conversation.messages, message("author", "live", text)),
  }));
}

/** Appends one fully specified message; id and timestamp are assigned here.
 * The prepared-example loader builds its zero-AI conversation with this. */
export function withMessageAppended(
  project: Project,
  stage: ChatStage,
  entry: Omit<ChatMessage, "id" | "at">,
): Project {
  return withConversation(project, stage, (conversation) => ({
    ...conversation,
    messages: appended(conversation.messages, {
      ...message(entry.author, entry.kind, entry.text),
      runId: entry.runId,
      suggestedDraft: entry.suggestedDraft ? { ...entry.suggestedDraft } : null,
    }),
  }));
}

/** The server's bound on one chat message, in characters. */
export const MAX_MESSAGE_CHARACTERS = 4000;

/** The server's bound on the selected context, in characters. */
export const MAX_CONTEXT_CHARACTERS = 6000;

/** How many trailing conversation messages ride along as context. */
const CONTEXT_MESSAGES = 4;

/** Saves the author's context note for this section's sends. */
export function withContextEdited(
  project: Project,
  stage: ChatStage,
  text: string,
): Project {
  return withConversation(project, stage, (current) => ({
    ...current,
    context: text.slice(0, MAX_CONTEXT_CHARACTERS),
  }));
}

/**
 * The bounded context for one send: the research question, this section's
 * current draft and recent conversation, and the author's context note —
 * never the Manuscript and never another section's conversation. Clipped to
 * the server's bound, with the clipping disclosed to the consent preview.
 */
export function chatContext(
  project: Project,
  stage: ChatStage,
): { text: string; clipped: boolean } {
  const conversation = conversationFor(project, stage);
  const parts: string[] = [];
  if (project.question.trim()) {
    parts.push(`PROJECT QUESTION\n${project.question.trim()}`);
  }
  const draft = conversation.draft;
  if (draft.body) {
    const status = draft.reviewed ? "reviewed" : "draft";
    parts.push(`CURRENT SECTION DRAFT (${draft.provenance}; ${status})\n${draft.body}`);
  }
  const recent = conversation.messages.slice(-CONTEXT_MESSAGES);
  if (recent.length) {
    const lines = recent.map(
      (entry) => `${entry.author === "author" ? "Author" : "AI"}: ${entry.text}`,
    );
    parts.push(`RECENT SECTION CONVERSATION\n${lines.join("\n")}`);
  }
  if (conversation.context.trim()) {
    parts.push(
      `SELECTED INPUT: Author note (Author-selected)\n${conversation.context.trim()}`,
    );
  }
  const text = parts.join("\n\n");
  return {
    text: text.slice(0, MAX_CONTEXT_CHARACTERS),
    clipped: text.length > MAX_CONTEXT_CHARACTERS,
  };
}

/** Why a message cannot be sent, or null when it can — mirrors the server's
 * own validation so nothing is sent just to fail. */
export function messageBlockedReason(message: string): string | null {
  if (!message.trim()) return "Write a message to send.";
  if (message.length > MAX_MESSAGE_CHARACTERS) {
    return "Use a message of at most 4,000 characters.";
  }
  return null;
}

/**
 * The exact envelope POSTed to /api/agent/chat after consent. The stage id
 * is all the server needs to pick the role; the study-design preview is
 * requested only for the two stages the server accepts it on.
 */
export type ChatRequest = {
  requestId: string;
  consent: true;
  stage: ChatStage;
  message: string;
  context: string;
  studyDesign?: true;
};

export function buildChatRequest(
  stage: ChatStage,
  message: string,
  context: string,
): ChatRequest {
  return {
    requestId: crypto.randomUUID(),
    consent: true,
    stage,
    message: message.trim(),
    context,
    ...(stage === "results" || stage === "references"
      ? { studyDesign: true as const }
      : {}),
  };
}

/** The exact bytes the run sends: the consent preview shows this string,
 * not a paraphrase of it. */
export function outgoingChatBody(request: ChatRequest): string {
  return JSON.stringify(request, null, 2);
}

/** Prior drafts preserved on the output, mirroring the legacy history cap. */
export const MAX_DRAFT_HISTORY = 20;

/**
 * Copies a reply's suggested draft into the section's working draft — the
 * author's explicit action, never automatic. The prior version is preserved
 * at the head of history, and the new draft always starts unreviewed.
 */
export function withDraftApplied(
  project: Project,
  stage: ChatStage,
  messageId: string,
): Project {
  const conversation = conversationFor(project, stage);
  const source = conversation.messages.find((entry) => entry.id === messageId);
  if (!source?.suggestedDraft) return project;
  const suggestion = source.suggestedDraft;
  return withConversation(project, stage, (current) => ({
    ...current,
    draft: {
      title: suggestion.title,
      body: suggestion.body,
      reviewed: false,
      provenance:
        source.kind === "prepared"
          ? "Prepared example · applied by author"
          : "AI suggestion · applied by author",
      history: preserved(current.draft),
    },
  }));
}

function preserved(draft: ChatDraft): DraftSnapshot[] {
  if (!draft.body) return draft.history;
  const snapshot: DraftSnapshot = {
    title: draft.title,
    body: draft.body,
    provenance: draft.provenance,
    at: new Date().toISOString(),
  };
  return [snapshot, ...draft.history].slice(0, MAX_DRAFT_HISTORY);
}

/** Edits the working draft directly. Any change clears the reviewed status:
 * a review belongs to the exact text that was reviewed. */
export function withDraftEdited(
  project: Project,
  stage: ChatStage,
  patch: Partial<Pick<ChatDraft, "title" | "body">>,
): Project {
  return withConversation(project, stage, (current) => ({
    ...current,
    draft: { ...current.draft, ...patch, reviewed: false, provenance: "Author" },
  }));
}

/** Marks the current draft text reviewed. An empty draft has nothing to
 * review, so the project is returned unchanged. */
export function withDraftReviewed(project: Project, stage: ChatStage): Project {
  if (!conversationFor(project, stage).draft.body) return project;
  return withConversation(project, stage, (current) => ({
    ...current,
    draft: { ...current.draft, reviewed: true },
  }));
}

export type ChatAppendOutcome = AppendOutcome | "not_reviewed";

/**
 * Appends a copy of the reviewed draft to the Manuscript as a new Section.
 * Existing sections are never altered or replaced; a draft that is not
 * marked reviewed never reaches the Manuscript. Duplicate means a section
 * with the same heading and text already exists — identity, not substring.
 */
export function appendDraftToManuscript(
  project: Project,
  stage: ChatStage,
): { project: Project; outcome: ChatAppendOutcome } {
  const draft = conversationFor(project, stage).draft;
  if (!draft.body) return { project, outcome: "empty" };
  if (!draft.reviewed) return { project, outcome: "not_reviewed" };
  const manuscript = project.manuscript ?? defaultManuscript(project);
  if (
    manuscript.sections.some(
      (section) => section.heading === draft.title && section.text === draft.body,
    )
  ) {
    return { project, outcome: "duplicate" };
  }
  if (
    draft.body.length > SECTION_LIMIT ||
    manuscriptLength(manuscript) + draft.title.length + draft.body.length >
      MANUSCRIPT_GUARD
  ) {
    return { project, outcome: "too_long" };
  }
  return {
    project: {
      ...project,
      manuscript: {
        ...manuscript,
        sections: [...manuscript.sections, createSection(draft.title, draft.body)],
      },
    },
    outcome: "appended",
  };
}

export function withAiReply(
  project: Project,
  stage: ChatStage,
  reply: { runId: string | null; text: string; suggestedDraft: SuggestedDraft | null },
): Project {
  return withConversation(project, stage, (conversation) => ({
    ...conversation,
    messages: appended(conversation.messages, {
      ...message("ai", "live", reply.text),
      runId: reply.runId,
      suggestedDraft: reply.suggestedDraft ? { ...reply.suggestedDraft } : null,
    }),
  }));
}
