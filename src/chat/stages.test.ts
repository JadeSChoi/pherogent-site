import { describe, expect, it } from "vitest";
import { CHAT_SECTIONS, STAGE_GROUPS, sectionFor, type ChatStage } from "./stages";

/** The server's CHAT_STAGES (worker/server/chat.mjs), the wire contract the
 * picker must cover exactly — the server derives the role from these ids. */
const SERVER_STAGES = [
  "organizer",
  "data",
  "methods",
  "results",
  "figures",
  "title",
  "introduction",
  "discussion",
  "abstract",
  "references",
  "review",
] as const;

describe("CHAT_SECTIONS", () => {
  it("covers each of the server's eleven stages exactly once", () => {
    expect(CHAT_SECTIONS.map((section) => section.id)).toEqual([...SERVER_STAGES]);
  });

  it("gives every section a label, role, group, and description", () => {
    for (const section of CHAT_SECTIONS) {
      expect(section.label).not.toBe("");
      expect(section.role).not.toBe("");
      expect(STAGE_GROUPS).toContain(section.group);
      expect(section.description).not.toBe("");
    }
  });

  it("orders the groups Project, Research, Writing for the picker", () => {
    const groups = CHAT_SECTIONS.map((section) => section.group);
    expect([...new Set(groups)]).toEqual([...STAGE_GROUPS]);
    // Grouped order is picker order: no group interleaves another.
    const sorted = [...groups].sort(
      (a, b) => STAGE_GROUPS.indexOf(a) - STAGE_GROUPS.indexOf(b),
    );
    expect(groups).toEqual(sorted);
  });
});

describe("sectionFor", () => {
  it("resolves a stage id to its section", () => {
    expect(sectionFor("results").label).toBe("Results");
  });

  it("falls back to the organizer for an unknown id", () => {
    expect(sectionFor("admin" as ChatStage).id).toBe("organizer");
  });
});
