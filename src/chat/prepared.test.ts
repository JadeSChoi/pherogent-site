import { describe, expect, it } from "vitest";
import { createProject } from "../storage/workspace";
import { PREPARED_EXAMPLES, withPreparedExample } from "./prepared";
import { conversationFor } from "./sectionChat";
import { CHAT_SECTIONS } from "./stages";

describe("PREPARED_EXAMPLES", () => {
  it("covers every section with a prompt, reply, and draft", () => {
    for (const section of CHAT_SECTIONS) {
      const example = PREPARED_EXAMPLES[section.id];
      expect(example.prompt).not.toBe("");
      expect(example.reply).not.toBe("");
      expect(example.draft.title).not.toBe("");
      expect(example.draft.body).not.toBe("");
    }
  });

  it("labels every reply as prewritten, not an AI response", () => {
    for (const section of CHAT_SECTIONS) {
      expect(PREPARED_EXAMPLES[section.id].reply).toContain("prewritten");
    }
  });
});

describe("withPreparedExample", () => {
  it("loads the example conversation marked as prepared, with its draft suggestion", () => {
    const project = withPreparedExample(createProject("Alpha"), "abstract");
    const messages = conversationFor(project, "abstract").messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ author: "author", kind: "prepared" });
    expect(messages[1]).toMatchObject({
      author: "ai",
      kind: "prepared",
      runId: null,
      suggestedDraft: PREPARED_EXAMPLES.abstract.draft,
    });
    // Loading the example changes no draft by itself.
    expect(conversationFor(project, "abstract").draft.body).toBe("");
  });
});
