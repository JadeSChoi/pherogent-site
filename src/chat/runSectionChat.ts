/**
 * The client side of the consented Section chat run (issue #12): POSTing the
 * previewed envelope to the Worker's /api/agent/chat route and mapping the
 * server's reply into the stored message shape. Nothing here sends anything
 * by itself — the UI calls runSectionChat strictly after the author consents
 * on a preview of outgoingChatBody.
 */

import { AiRunError, isRecord, runAiRoute } from "../api/aiRun";
import {
  outgoingChatBody,
  type ChatRequest,
  type SuggestedDraft,
} from "./sectionChat";

export type ChatReplyOutcome = {
  runId: string | null;
  reply: { text: string; suggestedDraft: SuggestedDraft | null };
};

const malformed = () =>
  new AiRunError(
    "invalid_output",
    "The reply did not match the required structure. No reply was invented.",
  );

/**
 * Runs the previewed request and validates the reply's shape — defense in
 * depth over the server's own output validation, never a replacement for it.
 */
export async function runSectionChat(
  request: ChatRequest,
  {
    fetchImpl,
    signal,
    onStep,
  }: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    /** Called with each progress step's detail line as the server reports it. */
    onStep?: (detail: string) => void;
  } = {},
): Promise<ChatReplyOutcome> {
  const { runId, result } = await runAiRoute("/api/agent/chat", outgoingChatBody(request), {
    subject: "AI reply",
    failureCode: "chat_failed",
    fetchImpl,
    signal,
    onStep,
  });
  if (typeof result.reply !== "string" || !result.reply.trim()) throw malformed();
  let suggestedDraft: SuggestedDraft | null = null;
  if (result.suggestedDraft != null) {
    const draft = result.suggestedDraft;
    if (
      !isRecord(draft) ||
      typeof draft.title !== "string" ||
      !draft.title.trim() ||
      typeof draft.body !== "string" ||
      !draft.body.trim()
    ) {
      throw malformed();
    }
    suggestedDraft = { title: draft.title, body: draft.body };
  }
  return { runId, reply: { text: result.reply, suggestedDraft } };
}
