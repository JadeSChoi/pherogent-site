import { describe, expect, it, vi } from "vitest";
import { healthyStatus } from "./statusFixture";
import { readUsageStatus, usageModelFromStatus } from "./usageStatus";

describe("usageModelFromStatus", () => {
  it("maps a healthy status body to reported usage, allowances, reservations, and the prices date", () => {
    const model = usageModelFromStatus(healthyStatus());

    expect(model.reported).toEqual({
      inputTokens: 10_000,
      outputTokens: 2_340,
      totalTokens: 12_340,
      modelCalls: 3,
      estimatedCostUsd: 0.0412,
      unknownCalls: 0,
      unknown: false,
    });
    expect(model.allowance).toEqual({
      remainingDailyUsd: 0.8,
      dailyUsd: 1,
      remainingLifetimeUsd: 9.5,
      lifetimeUsd: 10,
      remainingLifetimeTokens: 1_800_000,
      lifetimeTokens: 2_000_000,
      userRunsRemaining: 2,
      userRunsPerDay: 3,
    });
    expect(model.reservations).toEqual({
      dailyReservedUsd: 0.2,
      lifetimeReservedUsd: 0.5,
      lifetimeReservedTokens: 200_000,
      perRunUsd: 0.1,
      perRunTokens: 40_000,
    });
    expect(model.pricesVerifiedOn).toBe("2026-11-17");
    expect(model.message).toBe("Open to everyone while the shared allowance lasts.");
  });

  it("reports a gated deployment's null ledger as unknown, never as zeros", () => {
    const status = {
      ...healthyStatus(),
      enabled: false,
      canRun: false,
      reason: "owner_key_required",
      message: "AI runs on this deployment require the owner access key.",
      budget: null,
      usage: null,
    };

    const model = usageModelFromStatus(status);

    expect(model.reported.unknown).toBe(true);
    expect(model.reported.totalTokens).toBeNull();
    expect(model.reported.estimatedCostUsd).toBeNull();
    expect(model.allowance.remainingDailyUsd).toBeNull();
    expect(model.allowance.remainingLifetimeTokens).toBeNull();
    // The configured limits and prices date are still information.
    expect(model.allowance.dailyUsd).toBe(1);
    expect(model.reservations.perRunTokens).toBe(40_000);
    expect(model.pricesVerifiedOn).toBe("2026-11-17");
    expect(model.message).toBe(
      "AI runs on this deployment require the owner access key.",
    );
  });

  it("drops malformed figures to unknown instead of trusting them", () => {
    const status = healthyStatus();
    status.usage.totalTokens = -5 as never;
    status.usage.estimatedCostUsd = Number.NaN as never;
    status.budget.remainingDailyUsd = "0.80" as never;

    const model = usageModelFromStatus(status);

    expect(model.reported.totalTokens).toBeNull();
    expect(model.reported.estimatedCostUsd).toBeNull();
    expect(model.allowance.remainingDailyUsd).toBeNull();
    expect(model.reported.inputTokens).toBe(10_000);
  });

  it("treats a malformed unknownCalls as unconfirmed, never as a clean zero", () => {
    const status = healthyStatus();
    status.usage.unknownCalls = -1 as never;

    const model = usageModelFromStatus(status);

    expect(model.reported.unknownCalls).toBeNull();
  });

  it("keeps unresolved runs visible through unknownCalls", () => {
    const status = healthyStatus();
    status.usage.unknownCalls = 2;

    const model = usageModelFromStatus(status);

    expect(model.reported.unknownCalls).toBe(2);
    expect(model.reported.unknown).toBe(false);
  });

  it("reads a body that is not an object as entirely unknown", () => {
    const model = usageModelFromStatus(undefined);

    expect(model.reported.unknown).toBe(true);
    expect(model.allowance.dailyUsd).toBeNull();
    expect(model.pricesVerifiedOn).toBeNull();
    expect(model.message).toBe("");
  });
});

describe("readUsageStatus", () => {
  it("reads the model from /api/agent/status", async () => {
    const fetchImpl = vi.fn(async () => Response.json(healthyStatus()));

    const model = await readUsageStatus({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("/api/agent/status");
    expect(model.reported.totalTokens).toBe(12_340);
  });

  it("still reads the body of a refusal status — a gated deployment answers 503 with its limits", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { ...healthyStatus(), budget: null, usage: null, message: "Gated." },
        { status: 503 },
      ),
    );

    const model = await readUsageStatus({ fetchImpl });

    expect(model.reported.unknown).toBe(true);
    expect(model.allowance.lifetimeTokens).toBe(2_000_000);
    expect(model.message).toBe("Gated.");
  });

  it("rejects when the endpoint cannot be reached, so nothing renders as a figure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(readUsageStatus({ fetchImpl })).rejects.toThrow();
  });
});
