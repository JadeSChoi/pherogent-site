// Monetary and token allowances are reserved before a run and never refunded.
// This deliberately overcounts successes and ambiguous/cancelled requests.
// All paid requests must pass through this ledger; do not use isolate memory.
// These are the source defaults; a deployment overrides any of them through
// configuration (see config.mjs), and every function below accepts the
// resolved limits so changing a limit edits no source file.
export const LIMITS = Object.freeze({
  reservationMicros: 100_000,
  dailyMicros: 1_000_000,
  lifetimeMicros: 10_000_000,
  perRunUsd: 0.10,
  dailyUsd: 1,
  lifetimeUsd: 10,
  perRunTokens: 40_000,
  lifetimeTokens: 2_000_000,
  userRunsPerDay: 3,
  userCooldownMs: 60_000,
  activeLeaseMs: 300_000,
  maxConcurrentRuns: 2,
  maxSeconds: 90,
  maxPapers: 10,
  maxQueries: 3,
  maxModelCalls: 3,
  maxNetworkCalls: 15,
  maxQuestionCharacters: 2_000
});

export class BudgetError extends Error {
  constructor(code, message, status = 429) { super(message); this.code = code; this.status = status; }
}

const usd = micros => Math.max(0, Number(micros) || 0) / 1_000_000;
export const utcDay = now => new Date(now).toISOString().slice(0, 10);

// This is one SQLite write statement, not read-then-write application logic.
// D1 serializes writes, so each contender sees reservations already committed.
// The unique index is the final idempotency guard under simultaneous requests.
export const RESERVE_SQL = `
INSERT INTO ai_runs
 (run_id, user_id, request_id, day, created_at, status, reserved_micros, usage_json, completed_at)
SELECT ?, ?, ?, ?, ?, 'running', ?, NULL, NULL
WHERE (SELECT COALESCE(SUM(reserved_micros), 0) FROM ai_runs) + ? <= ?
  AND (SELECT COUNT(*) FROM ai_runs) * ? + ? <= ?
  AND (SELECT COALESCE(SUM(reserved_micros), 0) FROM ai_runs WHERE day = ?) + ? <= ?
  AND (SELECT COUNT(*) FROM ai_runs WHERE user_id = ? AND day = ?) < ?
  AND NOT EXISTS (SELECT 1 FROM ai_runs WHERE user_id = ? AND created_at > ?)
  AND NOT EXISTS (SELECT 1 FROM ai_runs WHERE user_id = ? AND status = 'running' AND created_at > ?)
  AND (SELECT COUNT(*) FROM ai_runs WHERE status = 'running' AND created_at > ?) < ?
ON CONFLICT(user_id, request_id) DO NOTHING
`;

export function reservationBindings(userId, requestId, runId, now = Date.now(), limits = LIMITS) {
  const day = utcDay(now), activeSince = now - limits.activeLeaseMs;
  return [runId, userId, requestId, day, now, limits.reservationMicros,
    limits.reservationMicros, limits.lifetimeMicros,
    limits.perRunTokens, limits.perRunTokens, limits.lifetimeTokens,
    day, limits.reservationMicros, limits.dailyMicros,
    userId, day, limits.userRunsPerDay,
    userId, now - limits.userCooldownMs,
    userId, activeSince, activeSince, limits.maxConcurrentRuns];
}

export async function readBudget(db, userId = '', now = Date.now(), limits = LIMITS) {
  const day = utcDay(now), activeSince = now - limits.activeLeaseMs;
  const row = await db.prepare(`SELECT
    COUNT(*) AS lifetime_runs,
    COALESCE(SUM(reserved_micros), 0) AS lifetime_reserved,
    COALESCE(SUM(CASE WHEN day = ? THEN reserved_micros ELSE 0 END), 0) AS daily_reserved,
    COUNT(CASE WHEN user_id = ? AND day = ? THEN 1 END) AS user_runs,
    MAX(CASE WHEN user_id = ? THEN created_at END) AS user_last,
    COUNT(CASE WHEN status = 'running' AND created_at > ? THEN 1 END) AS active_runs,
    COUNT(CASE WHEN user_id = ? AND status = 'running' AND created_at > ? THEN 1 END) AS user_active
    FROM ai_runs`).bind(day, userId, day, userId, activeSince, userId, activeSince).first();
  if (!row || !['lifetime_reserved','daily_reserved','user_runs','active_runs','user_active','lifetime_runs'].every(k => Number.isSafeInteger(Number(row[k])) && Number(row[k]) >= 0)
    || !Number.isSafeInteger(Number(row.lifetime_runs) * limits.perRunTokens)) {
    throw new BudgetError('budget_unavailable', 'The spending ledger could not be verified. No AI request was started.', 503);
  }
  const last = row.user_last == null ? null : Number(row.user_last);
  const retryAfterSeconds = last == null ? 0 : Math.max(0, Math.ceil((last + limits.userCooldownMs - now) / 1000));
  return {
    // Every old and new run consumes the same conservative reservation. Do not
    // delete ledger rows or lower perRunTokens: that would restore allowance.
    lifetimeReservedTokens: Number(row.lifetime_runs) * limits.perRunTokens,
    remainingLifetimeTokens: Math.max(0, limits.lifetimeTokens - Number(row.lifetime_runs) * limits.perRunTokens),
    dailyReservedUsd: usd(row.daily_reserved), lifetimeReservedUsd: usd(row.lifetime_reserved),
    remainingDailyUsd: usd(limits.dailyMicros - Number(row.daily_reserved)),
    remainingLifetimeUsd: usd(limits.lifetimeMicros - Number(row.lifetime_reserved)),
    userRunsToday: Number(row.user_runs), userRunsRemaining: Math.max(0, limits.userRunsPerDay - Number(row.user_runs)),
    retryAfterSeconds, activeRuns: Number(row.active_runs), userActiveRuns: Number(row.user_active)
  };
}

export function blockedReason(budget, limits = LIMITS) {
  // Compare integer microdollars to avoid floating-point boundary drift.
  if (Math.round(budget.remainingLifetimeUsd * 1e6) < limits.reservationMicros) return ['lifetime_budget_exhausted', 'The site’s $' + limits.lifetimeUsd + ' starter allowance is used up. The owner must review it before more AI runs.'];
  if (!Number.isSafeInteger(budget.remainingLifetimeTokens) || budget.remainingLifetimeTokens < limits.perRunTokens) return ['token_budget_exhausted', 'The site’s shared token allowance is used up. It does not refill automatically; the owner must review it before more AI runs.'];
  if (Math.round(budget.remainingDailyUsd * 1e6) < limits.reservationMicros) return ['daily_budget_exhausted', 'The site’s $' + limits.dailyUsd + ' daily allowance is used up. It resets at midnight UTC.'];
  if (!budget.userRunsRemaining) return ['visitor_daily_limit', 'You have used your ' + limits.userRunsPerDay + ' AI runs for today.'];
  if (budget.userActiveRuns) return ['run_in_progress', 'Your previous AI run is still in progress.'];
  if (budget.retryAfterSeconds) return ['visitor_rate_limit', 'Please wait ' + Math.ceil(limits.userCooldownMs / 1000) + ' seconds between AI runs.'];
  if (budget.activeRuns >= limits.maxConcurrentRuns) return ['site_busy', limits.maxConcurrentRuns + ' research checks are already running. Please try again shortly.'];
  return null;
}

export async function reserveRun(db, userId, requestId, now = Date.now(), limits = LIMITS) {
  const runId = crypto.randomUUID();
  const result = await db.prepare(RESERVE_SQL).bind(...reservationBindings(userId, requestId, runId, now, limits)).run();
  if (result?.success === false || !Number.isInteger(result?.meta?.changes)) throw new BudgetError('budget_unavailable', 'The spending ledger could not be verified. No AI request was started.', 503);
  if (result.meta.changes === 1) return {runId, reservedUsd: limits.perRunUsd, reservedTokens: limits.perRunTokens};
  const existing = await db.prepare('SELECT run_id, status FROM ai_runs WHERE user_id = ? AND request_id = ?').bind(userId, requestId).first();
  if (existing) throw new BudgetError('duplicate_request', 'This run was already submitted. It will not be charged or started again.', 409);
  const reason = blockedReason(await readBudget(db, userId, now, limits), limits);
  throw new BudgetError(reason?.[0] || 'budget_unavailable', reason?.[1] || 'A budget or concurrency check prevented this run. Please try again later.', reason ? 429 : 503);
}

export function cleanUsage(value, limits = LIMITS) {
  const out = {model:typeof value?.model === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(value.model) ? value.model : null};
  for (const key of ['inputTokens','outputTokens','totalTokens','modelCalls','calls','queries','papersSearched','fullTextsRead','unknownCalls','conservativeTokenBound']) {
    out[key] = Number.isSafeInteger(value?.[key]) && value[key] >= 0 ? value[key] : 0;
  }
  out.modelCalls = out.modelCalls || out.calls;
  out.calls = out.calls || out.modelCalls;
  out.usageUnknown = out.unknownCalls > 0;
  for (const key of ['estimatedCostUsd','conservativeCostBoundUsd']) out[key] = Number.isFinite(value?.[key]) && value[key] >= 0 ? value[key] : 0;
  out.reservedCostUsd = limits.perRunUsd;
  out.reservedTokens = limits.perRunTokens;
  return out;
}

export async function completeRun(db, runId, userId, status, usage, now = Date.now(), limits = LIMITS) {
  if (!['completed','failed','cancelled'].includes(status)) throw new Error('Invalid run status');
  const result = await db.prepare(`UPDATE ai_runs SET status = ?, usage_json = ?, completed_at = ?
    WHERE run_id = ? AND user_id = ? AND status = 'running'`).bind(status, JSON.stringify(cleanUsage(usage, limits)), now, runId, userId).run();
  if (result?.success === false) throw new Error('Ledger update failed');
}

export async function readUsage(db, userId) {
  const total = {inputTokens:0,outputTokens:0,totalTokens:0,modelCalls:0,estimatedCostUsd:0,unknownCalls:0};
  if (!userId) return total;
  // Keep the prior release's 100-row ceiling so its historical usage survives.
  // The shared token reservation cap admits at most fifty runs in total.
  const rows = await db.prepare('SELECT usage_json FROM ai_runs WHERE user_id = ? LIMIT 100').bind(userId).all();
  if (rows?.success === false || !Array.isArray(rows?.results)) throw new Error('Usage unavailable');
  for (const row of rows.results) {
    // A reserved run may have reached the provider before a Worker died. Keep
    // that unresolved accounting visible, without inventing tokens or charges.
    let value; try { value = JSON.parse(row.usage_json); } catch { total.unknownCalls++; continue; }
    const valid = value && typeof value === 'object' && !Array.isArray(value)
      && ['inputTokens','outputTokens','totalTokens','modelCalls','unknownCalls'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
      && Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0;
    if (!valid) { total.unknownCalls++; continue; }
    const usage = cleanUsage(value);
    for (const key of Object.keys(total)) total[key] += usage[key];
  }
  return total;
}
