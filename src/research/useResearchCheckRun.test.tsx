import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createProject, type Project, type Workspace } from "../storage/workspace";
import { buildResearchRequest } from "./researchCheck";
import { useResearchCheckRun } from "./useResearchCheckRun";

type RunOutcome = { runId: string | null; result: Record<string, unknown> };

const RESULT: Record<string, unknown> = {
  question: "Does OSK reprogramming restore vision?",
  summary: {
    established: ["Vision loss reversed in aged mice. [MED:33268865]"],
    uncertain: [],
    nextQuestions: [],
  },
  evidence: [],
  papers: [
    {
      id: "MED:33268865",
      title: "Reprogramming to restore vision.",
      authors: [],
      source: "MED",
      year: 2020,
      journal: "Nature",
      doi: "",
      pmid: "33268865",
      pmcid: "",
      url: "https://europepmc.org/article/MED/33268865",
      abstract: "",
      openAccess: false,
    },
  ],
};

/** A workspace of two projects with the hook's updateProject contract:
 * route the change into the named project against the latest state. */
function harness(runner: (onStep?: (detail: string) => void) => Promise<RunOutcome>) {
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
    useResearchCheckRun(updateProject, (_request, options) => runner(options?.onStep)),
  );
  const projectNamed = (name: string) =>
    state.workspace.projects.find((project) => project.name === name)!;
  return { alpha, state, rendered, projectNamed };
}

describe("useResearchCheckRun", () => {
  it("streams progress, completes into an unsaved note, and saves into the originating project", async () => {
    let capturedStep: ((detail: string) => void) | undefined;
    let resolve!: (outcome: RunOutcome) => void;
    const { alpha, state, rendered, projectNamed } = harness((onStep) => {
      capturedStep = onStep;
      return new Promise((r) => (resolve = r));
    });
    const request = buildResearchRequest("Does OSK reprogramming restore vision?");
    let started!: Promise<void>;
    act(() => {
      started = rendered.result.current.start(alpha.id, request);
    });
    expect(rendered.result.current.run).toMatchObject({
      projectId: alpha.id,
      running: true,
      note: null,
    });
    act(() => capturedStep?.("Searching Europe PMC: OSK vision"));
    expect(rendered.result.current.run?.steps).toEqual([
      "Searching Europe PMC: OSK vision",
    ]);

    // The author switches projects while the stream is open.
    act(() => {
      state.workspace = { ...state.workspace, activeProjectId: "project-elsewhere" };
    });
    await act(async () => {
      resolve({ runId: "run-7", result: RESULT });
      await started;
    });

    const run = rendered.result.current.run;
    expect(run?.running).toBe(false);
    expect(run?.note).toMatchObject({ runId: "run-7" });
    // Nothing was saved anywhere by completion itself.
    expect(projectNamed("Alpha").notebook).toBeUndefined();
    expect(projectNamed("Alpha").sources).toBeUndefined();

    // Explicit saves land in the originating project, not the active one.
    let findingsOutcome: string | null = null;
    let sourcesAdded: number | null = null;
    act(() => {
      findingsOutcome = rendered.result.current.saveFindings();
      sourcesAdded = rendered.result.current.saveSources();
    });
    expect(findingsOutcome).toBe("saved");
    expect(sourcesAdded).toBe(1);
    expect(projectNamed("Alpha").notebook?.findings).toContain("### AI research check:");
    expect(projectNamed("Alpha").sources?.map((source) => source.paper.id)).toEqual([
      "MED:33268865",
    ]);
    expect(projectNamed("Beta").notebook).toBeUndefined();
    expect(projectNamed("Beta").sources).toBeUndefined();

    // Saving findings again reports the duplicate instead of appending twice.
    let again: string | null = null;
    act(() => {
      again = rendered.result.current.saveFindings();
    });
    expect(again).toBe("duplicate");
  });

  it("keeps a failed run as a notice, inventing no note", async () => {
    const { alpha, rendered, projectNamed } = harness(() =>
      Promise.reject(new Error("AI runs on this deployment require the owner access key.")),
    );
    await act(async () => {
      await rendered.result.current.start(alpha.id, buildResearchRequest("q"));
    });
    expect(rendered.result.current.run).toMatchObject({
      running: false,
      note: null,
      notice: "AI runs on this deployment require the owner access key.",
    });
    expect(projectNamed("Alpha").notebook).toBeUndefined();
  });

  it("runs one consented request at a time and dismisses a note explicitly", async () => {
    let resolve!: (outcome: RunOutcome) => void;
    const { alpha, rendered } = harness(() => new Promise((r) => (resolve = r)));
    const first = buildResearchRequest("first");
    let started!: Promise<void>;
    act(() => {
      started = rendered.result.current.start(alpha.id, first);
    });
    await act(async () => {
      await rendered.result.current.start(alpha.id, buildResearchRequest("second"));
    });
    // The second start was refused while the first stream is open.
    expect(rendered.result.current.run?.requestId).toBe(first.requestId);
    await act(async () => {
      resolve({ runId: null, result: RESULT });
      await started;
    });
    expect(rendered.result.current.run?.note).not.toBeNull();
    act(() => rendered.result.current.dismiss());
    expect(rendered.result.current.run).toBeNull();
  });

  it("saves nothing when no completed note is held", () => {
    const { rendered } = harness(() => Promise.resolve({ runId: null, result: {} }));
    let findings: string | null = "untouched" as never;
    let sources: number | null = 0 as never;
    act(() => {
      findings = rendered.result.current.saveFindings();
      sources = rendered.result.current.saveSources();
    });
    expect(findings).toBeNull();
    expect(sources).toBeNull();
  });
});
