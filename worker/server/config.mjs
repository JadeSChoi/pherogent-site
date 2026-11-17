// Deployment configuration for the AI routes. Model ID, token prices, and every
// spend limit are read from env vars with the source defaults below; changing
// any of them is a config edit, never a source edit. Invalid configuration is
// reported as a problem and the caller must fail closed before any paid work.
import {LIMITS} from './budget.mjs';

export const DEFAULT_MODEL = 'gpt-5.6-terra';
// pricesVerifiedOn is display-only information for the owner and visitors.
// Nothing compares it to the clock: there is no date-based auto-expiry.
export const DEFAULT_PRICING = Object.freeze({
  inputMicrosPerToken: 2,
  outputMicrosPerToken: 12,
  reservedInputMicrosPerToken: 2.5,
  pricesVerifiedOn: '2026-11-17'
});

const MODEL_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// perRunUsd/dailyUsd/lifetimeUsd are derived from the micro amounts, never set.
const LIMIT_KEYS = new Set(['reservationMicros','dailyMicros','lifetimeMicros','perRunTokens','lifetimeTokens',
  'userRunsPerDay','userCooldownMs','activeLeaseMs','maxConcurrentRuns','maxSeconds','maxPapers','maxQueries',
  'maxModelCalls','maxNetworkCalls','maxQuestionCharacters']);

const CONFIG_PROBLEM = Object.freeze(['config_invalid','The server configuration is invalid. AI requests are disabled until the site owner corrects it.']);

function parseObject(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function resolveLimits(raw) {
  if (raw == null || raw === '') return LIMITS;
  const overrides = parseObject(raw);
  if (!overrides) return null;
  const merged = {...LIMITS};
  for (const [key, value] of Object.entries(overrides)) {
    if (!LIMIT_KEYS.has(key)) return null;
    // Zero cooldown is a valid choice; every cap must admit at least one unit.
    const minimum = key === 'userCooldownMs' ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum) return null;
    merged[key] = value;
  }
  merged.perRunUsd = merged.reservationMicros / 1e6;
  merged.dailyUsd = merged.dailyMicros / 1e6;
  merged.lifetimeUsd = merged.lifetimeMicros / 1e6;
  return Object.freeze(merged);
}

function resolvePricing(raw) {
  if (raw == null || raw === '') return DEFAULT_PRICING;
  const overrides = parseObject(raw);
  if (!overrides) return null;
  const merged = {...DEFAULT_PRICING};
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'pricesVerifiedOn') {
      if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;
    } else if (['inputMicrosPerToken','outputMicrosPerToken','reservedInputMicrosPerToken'].includes(key)) {
      if (!Number.isFinite(value) || value <= 0) return null;
    } else return null;
    merged[key] = value;
  }
  return Object.freeze(merged);
}

// The resolved shape always carries usable defaults so a status page can still
// describe the deployment; `problem` is non-null whenever any var is invalid.
export function resolveConfig(env) {
  const limits = resolveLimits(env?.PHEROGENT_LIMITS);
  const pricing = resolvePricing(env?.PHEROGENT_PRICING);
  const model = env?.PHEROGENT_MODEL == null || env.PHEROGENT_MODEL === '' ? DEFAULT_MODEL
    : (typeof env.PHEROGENT_MODEL === 'string' && MODEL_PATTERN.test(env.PHEROGENT_MODEL) ? env.PHEROGENT_MODEL : null);
  const ownerKey = typeof env?.PHEROGENT_OWNER_KEY === 'string' && env.PHEROGENT_OWNER_KEY.trim() ? env.PHEROGENT_OWNER_KEY.trim() : null;
  const publicAccess = env?.PHEROGENT_PUBLIC_ACCESS === 'true';
  const problem = limits && pricing && model ? null : CONFIG_PROBLEM;
  return {
    model: model || DEFAULT_MODEL,
    pricing: pricing || DEFAULT_PRICING,
    limits: limits || LIMITS,
    ownerKey,
    publicAccess,
    problem
  };
}
