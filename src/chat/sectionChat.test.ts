import { describe, expect, it } from "vitest";
import { createProject, SECTION_LIMIT } from "../storage/workspace";
import {
  MAX_CONTEXT_CHARACTERS,
  appendDraftToManuscript,
  buildChatRequest,
  chatContext,
  conversationFor,
  messageBlockedReason,
  outgoingChatBody,
  withActiveStage,
  withAiReply,
  withAuthorMessage,
  withContextEdited,
  withDraftApplied,
  withDraftEdited,
  withDraftReviewed,
} from "./sectionChat";

/** A project whose methods section holds one AI reply with a draft. */
function projectWithSuggestion(draft = { title: "Methods", body: "Mice were perfused…" }) {
  const project = withAiReply(createProject("Alpha"), "methods", {
    runId: "run-1",
    text: "A structure for the protocol.",
    suggestedDraft: draft,
  });
  const messageId = conversationFor(project, "methods").messages[0].id;
  return { project, messageId };
}

describe("conversationFor", () => {
  it("reads as empty before any chat activity", () => {
    const project = createProject("Alpha");
    const conversation = conversationFor(project, "methods");
    expect(conversation.messages).toEqual([]);
    expect(conversation.draft.body).toBe("");
    expect(conversation.draft.reviewed).toBe(false);
    expect(conversation.context).toBe("");
  });
});

describe("messages", () => {
  it("keeps each section's conversation separate within the project", () => {
    let project = createProject("Alpha");
    project = withAuthorMessage(project, "methods", "How should I describe the assay?");
    project = withAiReply(project, "results", {
      runId: "run-1",
      text: "Describe only supplied observations.",
      suggestedDraft: null,
    });
    expect(conversationFor(project, "methods").messages).toHaveLength(1);
    expect(conversationFor(project, "results").messages).toHaveLength(1);
    expect(conversationFor(project, "organizer").messages).toEqual([]);
  });

  it("records who wrote each message and keeps the AI reply's draft separate", () => {
    let project = createProject("Alpha");
    project = withAuthorMessage(project, "methods", "Draft the perfusion protocol.");
    project = withAiReply(project, "methods", {
      runId: "run-2",
      text: "Here is a structure for the protocol.",
      suggestedDraft: { title: "Methods", body: "Mice were perfused…" },
    });
    const [author, ai] = conversationFor(project, "methods").messages;
    expect(author).toMatchObject({ author: "author", kind: "live" });
    expect(ai).toMatchObject({
      author: "ai",
      kind: "live",
      runId: "run-2",
      suggestedDraft: { title: "Methods", body: "Mice were perfused…" },
    });
    // The reply arriving changes no draft by itself.
    expect(conversationFor(project, "methods").draft.body).toBe("");
  });

  it("keeps only the newest hundred messages", () => {
    let project = createProject("Alpha");
    for (let i = 0; i < 105; i++) {
      project = withAuthorMessage(project, "organizer", `message ${i}`);
    }
    const messages = conversationFor(project, "organizer").messages;
    expect(messages).toHaveLength(100);
    expect(messages[0].text).toBe("message 5");
    expect(messages[99].text).toBe("message 104");
  });
});

describe("withDraftApplied", () => {
  it("copies the suggestion into the draft output, awaiting review", () => {
    const { project, messageId } = projectWithSuggestion();
    const next = withDraftApplied(project, "methods", messageId);
    const draft = conversationFor(next, "methods").draft;
    expect(draft).toMatchObject({
      title: "Methods",
      body: "Mice were perfused…",
      reviewed: false,
    });
    expect(draft.provenance).toContain("applied by author");
  });

  it("preserves the prior output in history instead of discarding it", () => {
    const { project, messageId } = projectWithSuggestion();
    let next = withDraftEdited(project, "methods", {
      title: "Old title",
      body: "Earlier working draft.",
    });
    next = withDraftApplied(next, "methods", messageId);
    const draft = conversationFor(next, "methods").draft;
    expect(draft.body).toBe("Mice were perfused…");
    expect(draft.history[0]).toMatchObject({
      title: "Old title",
      body: "Earlier working draft.",
    });
  });

  it("clears the reviewed status of the replaced draft", () => {
    const { project, messageId } = projectWithSuggestion();
    let next = withDraftEdited(project, "methods", { body: "Reviewed text." });
    next = withDraftReviewed(next, "methods");
    expect(conversationFor(next, "methods").draft.reviewed).toBe(true);
    next = withDraftApplied(next, "methods", messageId);
    expect(conversationFor(next, "methods").draft.reviewed).toBe(false);
  });

  it("changes nothing for a message without a suggestion", () => {
    const project = withAuthorMessage(createProject("Alpha"), "methods", "hello");
    const messageId = conversationFor(project, "methods").messages[0].id;
    expect(withDraftApplied(project, "methods", messageId)).toBe(project);
  });
});

describe("withDraftEdited and withDraftReviewed", () => {
  it("any edit clears the reviewed status", () => {
    let project = withDraftEdited(createProject("Alpha"), "title", { body: "A title." });
    project = withDraftReviewed(project, "title");
    project = withDraftEdited(project, "title", { body: "A better title." });
    expect(conversationFor(project, "title").draft.reviewed).toBe(false);
  });

  it("an empty draft cannot be marked reviewed", () => {
    const project = createProject("Alpha");
    expect(withDraftReviewed(project, "title")).toBe(project);
  });
});

describe("appendDraftToManuscript", () => {
  const reviewedProject = () => {
    let project = withDraftEdited(createProject("Alpha"), "methods", {
      title: "Methods",
      body: "Mice were perfused…",
    });
    return withDraftReviewed(project, "methods");
  };

  it("requires mark-reviewed first", () => {
    const project = withDraftEdited(createProject("Alpha"), "methods", {
      body: "Unreviewed text.",
    });
    const { outcome, project: next } = appendDraftToManuscript(project, "methods");
    expect(outcome).toBe("not_reviewed");
    expect(next).toBe(project);
  });

  it("appends a new Section and never replaces existing text", () => {
    const project = reviewedProject();
    const before = (project.manuscript?.sections ?? []).map((s) => ({ ...s }));
    const { outcome, project: next } = appendDraftToManuscript(project, "methods");
    expect(outcome).toBe("appended");
    const sections = next.manuscript?.sections ?? [];
    expect(sections).toHaveLength(before.length + 1);
    expect(sections.slice(0, before.length)).toEqual(before);
    expect(sections[sections.length - 1]).toMatchObject({
      heading: "Methods",
      text: "Mice were perfused…",
    });
    // The chat draft stays where it was; a copy was appended.
    expect(conversationFor(next, "methods").draft.body).toBe("Mice were perfused…");
  });

  it("refuses an exact duplicate instead of appending twice", () => {
    const first = appendDraftToManuscript(reviewedProject(), "methods");
    const second = appendDraftToManuscript(first.project, "methods");
    expect(second.outcome).toBe("duplicate");
    expect(second.project).toBe(first.project);
  });

  it("refuses a body over the per-section cap", () => {
    let project = withDraftEdited(createProject("Alpha"), "methods", {
      title: "Methods",
      body: "x".repeat(SECTION_LIMIT + 1),
    });
    project = withDraftReviewed(project, "methods");
    expect(appendDraftToManuscript(project, "methods").outcome).toBe("too_long");
  });

  it("reports an empty draft", () => {
    const project = createProject("Alpha");
    expect(appendDraftToManuscript(project, "methods").outcome).toBe("empty");
  });
});

describe("chatContext", () => {
  const richProject = () => {
    let project = createProject("Alpha", "Does OSK reprogramming restore vision?");
    project = withDraftEdited(project, "results", { body: "Working results text." });
    project = withAuthorMessage(project, "results", "What belongs here?");
    project = withAiReply(project, "results", {
      runId: "run-1",
      text: "Only supplied observations.",
      suggestedDraft: null,
    });
    project = withContextEdited(project, "results", "Cohort: 12 mice, 3 timepoints.");
    // Another section's conversation, which must never leak across.
    project = withAuthorMessage(project, "discussion", "Secret other-stage note.");
    return project;
  };

  it("assembles question, current draft, recent conversation, and the author note", () => {
    const { text } = chatContext(richProject(), "results");
    expect(text).toContain("PROJECT QUESTION\nDoes OSK reprogramming restore vision?");
    expect(text).toContain("CURRENT SECTION DRAFT (Author; draft)\nWorking results text.");
    expect(text).toContain("RECENT SECTION CONVERSATION");
    expect(text).toContain("Author: What belongs here?");
    expect(text).toContain("AI: Only supplied observations.");
    expect(text).toContain("SELECTED INPUT: Author note (Author-selected)");
    expect(text).toContain("Cohort: 12 mice, 3 timepoints.");
  });

  it("includes only this section's conversation, never another stage's", () => {
    const { text } = chatContext(richProject(), "results");
    expect(text).not.toContain("Secret other-stage note.");
  });

  it("keeps only the last four conversation messages", () => {
    let project = richProject();
    for (let i = 0; i < 4; i++) {
      project = withAuthorMessage(project, "results", `later ${i}`);
    }
    const { text } = chatContext(project, "results");
    expect(text).not.toContain("What belongs here?");
    expect(text).toContain("later 3");
  });

  it("stays within the server's bound and discloses clipping", () => {
    let project = createProject("Alpha");
    project = withContextEdited(project, "results", "y".repeat(MAX_CONTEXT_CHARACTERS));
    const context = chatContext(project, "results");
    expect(context.text.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
    expect(context.clipped).toBe(true);
    const small = chatContext(createProject("Beta", "Q?"), "results");
    expect(small.clipped).toBe(false);
  });

  it("reads as empty for a blank project", () => {
    expect(chatContext(createProject("Alpha"), "title").text).toBe("");
  });
});

describe("buildChatRequest", () => {
  it("carries only the consented envelope — no prompt, model, or budget", () => {
    const request = buildChatRequest("methods", "  Draft the methods.  ", "ctx");
    expect(Object.keys(request).sort()).toEqual([
      "consent",
      "context",
      "message",
      "requestId",
      "stage",
    ]);
    expect(request).toMatchObject({
      consent: true,
      stage: "methods",
      message: "Draft the methods.",
      context: "ctx",
    });
    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("asks for the study-design preview only where the server allows it", () => {
    expect(buildChatRequest("results", "m", "c").studyDesign).toBe(true);
    expect(buildChatRequest("references", "m", "c").studyDesign).toBe(true);
    expect("studyDesign" in buildChatRequest("methods", "m", "c")).toBe(false);
  });

  it("previews exactly the bytes that will be sent", () => {
    const request = buildChatRequest("results", "m", "c");
    expect(JSON.parse(outgoingChatBody(request))).toEqual(request);
  });
});

describe("messageBlockedReason", () => {
  it("requires a non-empty message within the server bound", () => {
    expect(messageBlockedReason("   ")).toContain("Write a message");
    expect(messageBlockedReason("x".repeat(4001))).toContain("4,000");
    expect(messageBlockedReason("Fine.")).toBeNull();
  });
});

describe("withActiveStage", () => {
  it("remembers the picker's selection on the project", () => {
    const project = withActiveStage(createProject("Alpha"), "discussion");
    expect(project.chat?.activeStage).toBe("discussion");
  });
});
