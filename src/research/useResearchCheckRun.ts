/**
 * Owns the one in-flight Research check for the whole app (issue #14).
 * This hook lives in the shell, above the routes, so an open run — and its
 * completed, not-yet-saved note — survives the author navigating anywhere.
 * Completion holds the note in memory only; the explicit save actions
 * commit findings and sources into the project the run started from — by
 * id, against the latest workspace — never into whatever is active then.
 */

import { useRef, useState } from "react";
import type { Project } from "../storage/workspace";
import {
  researchNoteFromResult,
  runResearchCheck,
  withResearchFindingsSaved,
  withResearchSourcesSaved,
  type FindingsSaveOutcome,
  type ResearchNote,
  type ResearchRequest,
} from "./researchCheck";

/** Progress lines kept for display; later steps replace the oldest. */
const MAX_STEPS = 50;

export type ResearchCheckRun = {
  /** The project the run started from; every save targets it. */
  projectId: string;
  requestId: string;
  question: string;
  /** The server's progress steps, as reported. */
  steps: string[];
  running: boolean;
  /** The completed note awaiting the author's review; null while running
   * or after a failure. */
  note: ResearchNote | null;
  /** The failed run's message; null unless the run failed. */
  notice: string | null;
};

export type ResearchCheckRunState = {
  /** The one run being shown — open, completed, or failed; null when idle. */
  run: ResearchCheckRun | null;
  /** Sends the consented request; refused while another run is open. */
  start: (projectId: string, request: ResearchRequest) => Promise<void>;
  /** Author action dismissing the shown run or note without saving. */
  dismiss: () => void;
  /** Author action saving the note's findings into the originating
   * project's notebook; null when no completed note is held. */
  saveFindings: () => FindingsSaveOutcome | null;
  /** Author action saving the note's papers into the originating project's
   * library; null when no completed note is held. */
  saveSources: () => number | null;
};

export function useResearchCheckRun(
  /** Replaces one project by id against the latest workspace state. */
  updateProject: (projectId: string, mutate: (project: Project) => Project) => void,
  runner: typeof runResearchCheck = runResearchCheck,
): ResearchCheckRunState {
  const [run, setRun] = useState<ResearchCheckRun | null>(null);
  // The synchronous guard: state updates are async, but two consents in one
  // tick must still produce one run.
  const open = useRef(false);
  // The latest run, readable inside save actions without a stale closure.
  const latest = useRef(run);
  latest.current = run;

  const start = async (projectId: string, request: ResearchRequest) => {
    if (open.current) return;
    open.current = true;
    setRun({
      projectId,
      requestId: request.requestId,
      question: request.question,
      steps: [],
      running: true,
      note: null,
      notice: null,
    });
    const patch = (change: Partial<ResearchCheckRun>) =>
      setRun((current) =>
        current && current.requestId === request.requestId
          ? { ...current, ...change }
          : current,
      );
    try {
      const { runId, result } = await runner(request, {
        onStep: (detail) =>
          setRun((current) =>
            current && current.requestId === request.requestId
              ? { ...current, steps: [...current.steps, detail].slice(-MAX_STEPS) }
              : current,
          ),
      });
      patch({
        running: false,
        note: researchNoteFromResult(request, result, {
          runId,
          at: new Date().toISOString(),
        }),
      });
    } catch (error) {
      patch({
        running: false,
        notice:
          error instanceof Error && error.message
            ? error.message
            : "The Research check could not finish safely.",
      });
    } finally {
      open.current = false;
    }
  };

  const saveFindings = (): FindingsSaveOutcome | null => {
    const current = latest.current;
    if (!current?.note) return null;
    let outcome: FindingsSaveOutcome | null = null;
    updateProject(current.projectId, (project) => {
      const saved = withResearchFindingsSaved(project, current.note!);
      outcome = saved.outcome;
      return saved.project;
    });
    return outcome;
  };

  const saveSources = (): number | null => {
    const current = latest.current;
    if (!current?.note) return null;
    let added: number | null = null;
    updateProject(current.projectId, (project) => {
      const saved = withResearchSourcesSaved(project, current.note!);
      added = saved.added;
      return saved.project;
    });
    return added;
  };

  return {
    run,
    start,
    dismiss: () => {
      if (!latest.current?.running) setRun(null);
    },
    saveFindings,
    saveSources,
  };
}
