/**
 * Owns the one in-flight Section chat run for the whole app (issue #12).
 * This hook lives in the shell, above the routes, so an open run survives
 * the author navigating anywhere: the reply is committed into the project
 * and section the run started from — by id, against the latest workspace —
 * never into whatever is on screen when it arrives.
 */

import { useRef, useState } from "react";
import type { Project } from "../storage/workspace";
import { runSectionChat } from "./runSectionChat";
import {
  withAiReply,
  withAuthorMessage,
  type ChatRequest,
} from "./sectionChat";
import type { ChatStage } from "./stages";

export type PendingChatRun = {
  projectId: string;
  stage: ChatStage;
  requestId: string;
  /** The server's latest progress step, as reported. */
  step: string | null;
};

export type ChatRunNotice = {
  projectId: string;
  stage: ChatStage;
  message: string;
};

export type SectionChatRuns = {
  /** The one open run; null when idle. */
  pending: PendingChatRun | null;
  /** The last failed run's message, kept for its own project and section. */
  notice: ChatRunNotice | null;
  dismissNotice: () => void;
  /** Sends the consented request. Records the author message immediately
   * and the reply (or failure notice) when the stream ends. */
  start: (project: Project, stage: ChatStage, request: ChatRequest) => Promise<void>;
};

export function useSectionChatRuns(
  /** Replaces one project by id against the latest workspace state. */
  updateProject: (projectId: string, mutate: (project: Project) => Project) => void,
  runner: typeof runSectionChat = runSectionChat,
): SectionChatRuns {
  const [pending, setPending] = useState<PendingChatRun | null>(null);
  const [notice, setNotice] = useState<ChatRunNotice | null>(null);
  // The synchronous guard: state updates are async, but two consents in one
  // tick must still produce one run.
  const open = useRef(false);

  const start = async (project: Project, stage: ChatStage, request: ChatRequest) => {
    if (open.current) return;
    open.current = true;
    updateProject(project.id, (latest) =>
      withAuthorMessage(latest, stage, request.message),
    );
    setNotice(null);
    setPending({ projectId: project.id, stage, requestId: request.requestId, step: null });
    try {
      const { runId, reply } = await runner(request, {
        onStep: (detail) =>
          setPending((current) =>
            current && current.requestId === request.requestId
              ? { ...current, step: detail }
              : current,
          ),
      });
      updateProject(project.id, (latest) =>
        withAiReply(latest, stage, {
          runId,
          text: reply.text,
          suggestedDraft: reply.suggestedDraft,
        }),
      );
    } catch (error) {
      setNotice({
        projectId: project.id,
        stage,
        message:
          error instanceof Error && error.message
            ? error.message
            : "The AI reply could not finish safely.",
      });
    } finally {
      open.current = false;
      setPending(null);
    }
  };

  return { pending, notice, dismissNotice: () => setNotice(null), start };
}
