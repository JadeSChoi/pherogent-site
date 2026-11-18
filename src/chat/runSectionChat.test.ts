import { describe, expect, it } from "vitest";
import { buildChatRequest, outgoingChatBody } from "./sectionChat";
import { runSectionChat } from "./runSectionChat";

const ndjson = (...events: unknown[]) =>
  new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });

const goodEvents = [
  { type: "start", runId: "run-9" },
  { type: "step", step: { detail: "Preparing one reply." } },
  {
    type: "result",
    result: {
      stage: "methods",
      reply: "Here is a structure.",
      suggestedDraft: { title: "Methods", body: "Mice were perfused…" },
    },
  },
];

describe("runSectionChat", () => {
  it("POSTs exactly the previewed body and maps the streamed reply", async () => {
    const request = buildChatRequest("methods", "Draft the methods.", "ctx");
    const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return ndjson(...goodEvents);
    };
    const steps: string[] = [];
    const outcome = await runSectionChat(request, {
      fetchImpl,
      onStep: (detail) => steps.push(detail),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe("/api/agent/chat");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBe(outgoingChatBody(request));
    expect(steps).toEqual(["Preparing one reply."]);
    expect(outcome).toEqual({
      runId: "run-9",
      reply: {
        text: "Here is a structure.",
        suggestedDraft: { title: "Methods", body: "Mice were perfused…" },
      },
    });
  });

  it("reads a draftless reply as null, not as an empty draft", async () => {
    const request = buildChatRequest("title", "Suggest titles.", "");
    const outcome = await runSectionChat(request, {
      fetchImpl: async () =>
        ndjson(
          { type: "start", runId: "run-1" },
          { type: "result", result: { stage: "title", reply: "Two options.", suggestedDraft: null } },
        ),
    });
    expect(outcome.reply.suggestedDraft).toBeNull();
  });

  it("surfaces a refusal's own code and message", async () => {
    const request = buildChatRequest("methods", "m", "");
    await expect(
      runSectionChat(request, {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: { code: "owner_key_required", message: "AI runs require the key." },
            }),
            { status: 401 },
          ),
      }),
    ).rejects.toMatchObject({ code: "owner_key_required" });
  });

  it("rejects a malformed result instead of inventing a reply", async () => {
    const request = buildChatRequest("methods", "m", "");
    await expect(
      runSectionChat(request, {
        fetchImpl: async () =>
          ndjson({ type: "start", runId: "r" }, { type: "result", result: { stage: "methods" } }),
      }),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("treats a stream that ends without a terminal event as an interruption", async () => {
    const request = buildChatRequest("methods", "m", "");
    await expect(
      runSectionChat(request, {
        fetchImpl: async () => ndjson({ type: "start", runId: "r" }),
      }),
    ).rejects.toMatchObject({ code: "stream_interrupted" });
  });
});
