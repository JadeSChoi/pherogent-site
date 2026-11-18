/**
 * The client side of the usage meter (issue #13): reading the Worker's
 * /api/agent/status body into a display model. Every figure is either a
 * value the server actually reported or null — an unreachable ledger or a
 * malformed field renders as unknown, never as an invented zero. The
 * legacy illustrative demo mode is deliberately not rebuilt.
 */

import { apiFetch } from "../api/ownerKey";

/** This visitor's provider-reported usage; null fields were not reported. */
export type ReportedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  modelCalls: number | null;
  estimatedCostUsd: number | null;
  /** Runs whose usage never resolved; kept visible, never counted as zero.
   * Null when the server reported the field malformed or not at all —
   * completeness itself is then unconfirmed. */
  unknownCalls: number | null;
  /** True when the server reported no usage object at all. */
  unknown: boolean;
};

/** What remains of the shared allowances, beside their configured totals. */
export type Allowance = {
  remainingDailyUsd: number | null;
  dailyUsd: number | null;
  remainingLifetimeUsd: number | null;
  lifetimeUsd: number | null;
  remainingLifetimeTokens: number | null;
  lifetimeTokens: number | null;
  userRunsRemaining: number | null;
  userRunsPerDay: number | null;
};

/** Amounts held back before runs start — reservations, not charges. */
export type Reservations = {
  dailyReservedUsd: number | null;
  lifetimeReservedUsd: number | null;
  lifetimeReservedTokens: number | null;
  perRunUsd: number | null;
  perRunTokens: number | null;
};

export type UsageModel = {
  message: string;
  reported: ReportedUsage;
  allowance: Allowance;
  reservations: Reservations;
  /** Display-only: when the owner last confirmed the configured prices. */
  pricesVerifiedOn: string | null;
};

const record = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};

const count = (x: unknown): number | null =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : null;

const usd = (x: unknown): number | null =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;

/**
 * Reads the meter's model from /api/agent/status. The call rides through
 * apiFetch so a saved owner key identifies the owner's own usage. A
 * refusal status still carries the deployment's limits and message, so
 * the body is read regardless of the HTTP status; only an unreachable
 * endpoint rejects.
 */
export async function readUsageStatus({
  fetchImpl = apiFetch,
}: { fetchImpl?: typeof fetch } = {}): Promise<UsageModel> {
  const response = await fetchImpl("/api/agent/status");
  return usageModelFromStatus(await response.json());
}

/** The status body as the meter reads it. Unrecognized fields are ignored;
 * missing or malformed ones become null, shown as unknown. */
export function usageModelFromStatus(status: unknown): UsageModel {
  const body = record(status);
  const limits = record(body.limits);
  const budget = record(body.budget);
  const usage = record(body.usage);
  return {
    message: typeof body.message === "string" ? body.message : "",
    reported: {
      inputTokens: count(usage.inputTokens),
      outputTokens: count(usage.outputTokens),
      totalTokens: count(usage.totalTokens),
      modelCalls: count(usage.modelCalls),
      estimatedCostUsd: usd(usage.estimatedCostUsd),
      unknownCalls: count(usage.unknownCalls),
      unknown: body.usage == null,
    },
    allowance: {
      remainingDailyUsd: usd(budget.remainingDailyUsd),
      dailyUsd: usd(limits.dailyUsd),
      remainingLifetimeUsd: usd(budget.remainingLifetimeUsd),
      lifetimeUsd: usd(limits.lifetimeUsd),
      remainingLifetimeTokens: count(budget.remainingLifetimeTokens),
      lifetimeTokens: count(limits.lifetimeTokens),
      userRunsRemaining: count(budget.userRunsRemaining),
      userRunsPerDay: count(limits.userRunsPerDay),
    },
    reservations: {
      dailyReservedUsd: usd(budget.dailyReservedUsd),
      lifetimeReservedUsd: usd(budget.lifetimeReservedUsd),
      lifetimeReservedTokens: count(budget.lifetimeReservedTokens),
      perRunUsd: usd(limits.perRunUsd),
      perRunTokens: count(limits.perRunTokens),
    },
    pricesVerifiedOn:
      typeof limits.pricesVerifiedOn === "string" ? limits.pricesVerifiedOn : null,
  };
}
