import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

type AgentStatus = {
  enabled: boolean;
  canRun: boolean;
  reason: string | null;
  signedIn: boolean;
  publicAccess: boolean;
  limits: {
    pricesVerifiedOn: string;
    userRunsPerDay: number;
  } & Record<string, unknown>;
  budget: {
    remainingDailyUsd: number;
    remainingLifetimeUsd: number;
    remainingLifetimeTokens: number;
    userRunsRemaining: number;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelCalls: number;
    estimatedCostUsd: number;
    unknownCalls: number;
  };
};

describe("agent API on the deployed worker shape (AI enabled, owner-gated, no provider key)", () => {
  it("GET /api/agent/status reports the real D1-backed budget and usage", async () => {
    const response = await SELF.fetch("https://example.com/api/agent/status");

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^__Host-pherogent-visitor=[0-9a-f-]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000$/,
    );

    const status = (await response.json()) as AgentStatus;
    expect(status.enabled).toBe(false);
    expect(status.canRun).toBe(false);
    expect(status.reason).toBe("not_configured");
    expect(status.signedIn).toBe(false);
    // The deployment ships locked: no public demo until the config flip, and
    // the prices-last-verified date is reported as information only.
    expect(status.publicAccess).toBe(false);
    expect(status.limits.pricesVerifiedOn).toBe("2026-11-17");
    expect(status.limits).not.toHaveProperty("pricingValidUntil");
    // The budget comes from the ai_runs ledger in D1, not an invented zero.
    expect(status.budget.remainingDailyUsd).toBe(1);
    expect(status.budget.remainingLifetimeUsd).toBe(10);
    expect(status.budget.remainingLifetimeTokens).toBe(2_000_000);
    expect(status.budget.userRunsRemaining).toBe(3);
    expect(status.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
      estimatedCostUsd: 0,
      unknownCalls: 0,
    });
  });

  it("paid routes refuse at the owner gate before touching the ledger or a provider", async () => {
    const statusResponse = await SELF.fetch("https://example.com/api/agent/status");
    const cookie = statusResponse.headers.get("set-cookie")!.split(";")[0];

    const bodies: Record<string, object> = {
      "/api/check-claim": {
        requestId: crypto.randomUUID(),
        consent: true,
        question: "Does this hold?",
      },
      "/api/agent/chat": {
        requestId: crypto.randomUUID(),
        consent: true,
        stage: "methods",
        message: "Propose a method.",
        context: "",
      },
    };
    for (const [path, body] of Object.entries(bodies)) {
      const response = await SELF.fetch(`https://example.com${path}`, {
        method: "POST",
        headers: {
          origin: "https://example.com",
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify(body),
      });
      // AI is enabled but the deployment is locked and the worker-pool env has
      // no PHEROGENT_OWNER_KEY secret, so the gate fails closed before the
      // missing-provider-key configuration check.
      expect(response.status).toBe(401);
      const failure = (await response.json()) as { error: { code: string } };
      expect(failure.error.code).toBe("owner_key_required");
    }
  });

  it("the study workflow runs without any AI configuration", async () => {
    const response = await SELF.fetch("https://example.com/api/studies/run", {
      method: "POST",
      headers: { origin: "https://example.com", "content-type": "application/json" },
      body: JSON.stringify({ study: "rag1_lu2020", question: "OSK TET1 retinal ganglion cells" }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as { status: string; usage: { modelCalls: number } };
    expect(result.status).toBe("retrieved");
    expect(result.usage.modelCalls).toBe(0);
  });

  it("the MCP endpoint and ChatGPT sign-in routes are absent from the worker", async () => {
    for (const path of ["/mcp", "/signin-with-chatgpt", "/signout-with-chatgpt"]) {
      const response = await SELF.fetch(`https://example.com${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(response.status).toBe(404);
    }
  });
});
