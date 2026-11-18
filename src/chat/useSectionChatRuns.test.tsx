import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createProject, type Project, type Workspace } from "../storage/workspace";
import type { ChatReplyOutcome } from "./runSectionChat";
import { buildChatRequest, conversationFor } from "./sectionChat";
import { useSectionChatRuns } from "./useSectionChatRuns";

/** A workspace of two projects with the hook's updateProject contract:
 * route the change into the named project against the latest state. */
function harness(runner: (onStep?: (detail: string) => void) => Promise<ChatReplyOutcome>) {
  const alpha = createProject("Alpha");
  const beta = createProject("Beta");
  const state: { workspace: Workspace } = {
    workspace: { version: 3, activeProjectId: alpha.id, projects: [alpha, beta] },
  };
  const updateProject = (projectId: string, mutate: (project: Project) => Project) => {
    state.workspace = {
      ...state.workspace,
      projects: state.workspace.projects.map((project) =>
        project.id === projectId ? mutate(project) : project,
      ),
    };
  };
  const rendered = renderHook(() =>
    useSectionChatRuns(updateProject, (_request, options) => runner(options?.onStep)),
  );
  const projectNamed = (name: string) =>
    state.workspace.projects.find((project) => project.name === name)!;
  return { alpha, state, rendered, projectNamed };
}

describe("useSectionChatRuns", () => {
  it("lands the reply in the originating project and section after navigating away", async () => {
    let resolve!: (outcome: ChatReplyOutcome) => void;
    const { alpha, state, rendered, projectNamed } = harness(
      () => new Promise((r) => (resolve = r)),
    );
    const request = buildChatRequest("results", "Describe the outcome.", "");
    let started!: Promise<void>;
    act(() => {
      started = rendered.result.current.start(alpha, "results", request);
    });
    // The author's message is recorded immediately, and the run shows pending.
    expect(conversationFor(projectNamed("Alpha"), "results").messages).toHaveLength(1);
    expect(rendered.result.current.pending).toMatchObject({
      projectId: alpha.id,
      stage: "results",
    });

    // The author navigates away: another project becomes active and edits
    // happen elsewhere while the stream is open.
    act(() => {
      state.workspace = { ...state.workspace, activeProjectId: "project-elsewhere" };
    });

    await act(async () => {
      resolve({
        runId: "run-7",
        reply: { text: "Only supplied observations.", suggestedDraft: null },
      });
      await started;
    });

    const messages = conversationFor(projectNamed("Alpha"), "results").messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      author: "ai",
      runId: "run-7",
      text: "Only supplied observations.",
    });
    expect(conversationFor(projectNamed("Beta"), "results").messages).toEqual([]);
    expect(rendered.result.current.pending).toBeNull();
  });

  it("reports progress steps while the run is open", async () => {
    let capturedStep: ((detail: string) => void) | undefined;
    let resolve!: (outcome: ChatReplyOutcome) => void;
    const { alpha, rendered } = harness((onStep) => {
      capturedStep = onStep;
      return new Promise((r) => (resolve = r));
    });
    let started!: Promise<void>;
    act(() => {
      started = rendered.result.current.start(
        alpha,
        "methods",
        buildChatRequest("methods", "m", ""),
      );
    });
    act(() => capturedStep?.("Preparing one reply."));
    expect(rendered.result.current.pending?.step).toBe("Preparing one reply.");
    await act(async () => {
      resolve({ runId: null, reply: { text: "Done.", suggestedDraft: null } });
      await started;
    });
  });

  it("keeps a failed run as a notice for its project and section, inventing no reply", async () => {
    const { alpha, rendered, projectNamed } = harness(() =>
      Promise.reject(new Error("The AI reply could not finish safely.")),
    );
    await act(async () => {
      await rendered.result.current.start(
        alpha,
        "methods",
        buildChatRequest("methods", "m", ""),
      );
    });
    const messages = conversationFor(projectNamed("Alpha"), "methods").messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].author).toBe("author");
    expect(rendered.result.current.notice).toMatchObject({
      projectId: alpha.id,
      stage: "methods",
      message: "The AI reply could not finish safely.",
    });
    expect(rendered.result.current.pending).toBeNull();
  });

  it("runs one consented request at a time", async () => {
    let resolve!: (outcome: ChatReplyOutcome) => void;
    const { alpha, rendered, projectNamed } = harness(
      () => new Promise((r) => (resolve = r)),
    );
    let started!: Promise<void>;
    act(() => {
      started = rendered.result.current.start(
        alpha,
        "methods",
        buildChatRequest("methods", "first", ""),
      );
    });
    await act(async () => {
      await rendered.result.current.start(
        alpha,
        "methods",
        buildChatRequest("methods", "second", ""),
      );
    });
    // The second start was refused: no second author message was recorded.
    expect(conversationFor(projectNamed("Alpha"), "methods").messages).toHaveLength(1);
    await act(async () => {
      resolve({ runId: null, reply: { text: "Done.", suggestedDraft: null } });
      await started;
    });
  });
});
