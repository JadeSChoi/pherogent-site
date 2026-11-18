/**
 * Test fixture: a healthy /api/agent/status body, shaped exactly as
 * worker/server/api.mjs's getStatus reports it. Shared by the usage test
 * suites so the Worker's wire shape is written down once.
 */
export const healthyStatus = () => ({
  signedIn: false,
  needsSignIn: false,
  publicAccess: true,
  enabled: true,
  canRun: true,
  reason: null as string | null,
  message: "Open to everyone while the shared allowance lasts.",
  limits: {
    perRunUsd: 0.1,
    dailyUsd: 1,
    lifetimeUsd: 10,
    perRunTokens: 40_000,
    lifetimeTokens: 2_000_000,
    userRunsPerDay: 3,
    maxSeconds: 90,
    maxPapers: 10,
    maxQueries: 3,
    maxModelCalls: 3,
    pricesVerifiedOn: "2026-11-17",
  },
  budget: {
    lifetimeReservedTokens: 200_000,
    remainingLifetimeTokens: 1_800_000,
    dailyReservedUsd: 0.2,
    lifetimeReservedUsd: 0.5,
    remainingDailyUsd: 0.8,
    remainingLifetimeUsd: 9.5,
    userRunsToday: 1,
    userRunsRemaining: 2,
    retryAfterSeconds: 0,
    activeRuns: 0,
    userActiveRuns: 0,
  },
  usage: {
    inputTokens: 10_000,
    outputTokens: 2_340,
    totalTokens: 12_340,
    modelCalls: 3,
    estimatedCostUsd: 0.0412,
    unknownCalls: 0,
  },
});
