// Owner-key gate, config-driven limits/pricing, and the provider adapter seam.
// Routes are exercised through the same Hono fetch handler that deploys, and
// the model provider is faked at the adapter interface, never at the wire.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {getStatus, runCheck, runSectionChat} from './route.mjs';
import {runResearch} from '../../worker/server/research.mjs';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const SCHEMA = 'CREATE TABLE ai_runs(run_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_id TEXT NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL,reserved_micros INTEGER NOT NULL,usage_json TEXT,completed_at INTEGER,UNIQUE(user_id,request_id));';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  const db = {prepare(sql) {return {bind(...args) {return {
    async run() {const r = sqlite.prepare(sql).run(...args); return {success:true,meta:{changes:Number(r.changes)}};},
    async first() {return sqlite.prepare(sql).get(...args) || null;},
    async all() {return {success:true,results:sqlite.prepare(sql).all(...args)};}
  };}};}};
  return {sqlite, db};
}
const rows = sqlite => sqlite.prepare('SELECT COUNT(*) AS n FROM ai_runs').get().n;

const OWNER_KEY = 'owner-access-test-key-never-real';
const uuid = () => crypto.randomUUID();
const cookie = id => '__Host-pherogent-visitor=' + id;
const baseEnv = db => ({DB:db, OPENAI_API_KEY:'unit-test-only-no-network', PHEROGENT_AI_ENABLED:'true', PHEROGENT_OWNER_KEY:OWNER_KEY});
const post = (url, body, headers = {}) => new Request('https://pherogent.example' + url, {method:'POST', headers:{origin:'https://pherogent.example','content-type':'application/json',...headers}, body:JSON.stringify(body)});
const statusRequest = (headers = {}) => new Request('https://pherogent.example/api/agent/status', {headers});
const checkBody = () => ({requestId:uuid(), consent:true, question:'Does the mouse evidence support this?'});
const chatBody = () => ({requestId:uuid(), consent:true, stage:'methods', message:'Suggest methods.', context:''});
const ownerHeaders = (extra = {}) => ({authorization:'Bearer ' + OWNER_KEY, ...extra});
const stubUsage = {model:'stub-model', inputTokens:10, outputTokens:5, totalTokens:15, modelCalls:1, calls:1, estimatedCostUsd:.001, unknownCalls:0};
const stubResult = {question:'q', summary:{established:[],uncertain:[],nextQuestions:[]}, evidence:[], papers:[], steps:[], usage:stubUsage};

const originalNow = Date.now;
Date.now = () => NOW;
try {

// Without the owner key, paid routes refuse before the ledger or the runner,
// whatever spoofed credential shapes the caller sends. Fail closed when no
// owner key is configured at all.
{
  const {sqlite, db} = database();
  const env = baseEnv(db);
  let ran = 0;
  const deps = {runResearch:async () => {ran++; return stubResult;}};
  for (const headers of [{}, {authorization:'Bearer wrong-key'}, {authorization:OWNER_KEY}, {'x-owner-key':OWNER_KEY}]) {
    const response = await runCheck(post('/api/check-claim', checkBody(), {...headers, cookie:cookie(uuid())}), env, deps);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'owner_key_required');
  }
  const keyless = await runSectionChat(post('/api/agent/chat', chatBody(), {cookie:cookie(uuid())}), {...env, PHEROGENT_OWNER_KEY:''}, deps);
  assert.equal(keyless.status, 401);
  assert.equal(ran, 0);
  assert.equal(rows(sqlite), 0, 'Refused requests never reserve budget');
  sqlite.close();
}

// The gate is verifiable live before any provider key exists: with AI enabled
// and no OPENAI_API_KEY, an anonymous caller gets the 401 gate refusal, while
// the authorized owner reaches the configuration refusal. Only the kill
// switch outranks the gate.
{
  const {sqlite, db} = database();
  const env = {...baseEnv(db), OPENAI_API_KEY:undefined};
  let ran = 0;
  const deps = {runResearch:async () => {ran++; return stubResult;}};
  const gated = await runCheck(post('/api/check-claim', checkBody(), {cookie:cookie(uuid())}), env, deps);
  assert.equal(gated.status, 401);
  assert.equal((await gated.json()).error.code, 'owner_key_required');
  const ownerNoProvider = await runCheck(post('/api/check-claim', checkBody(), ownerHeaders()), env, deps);
  assert.equal(ownerNoProvider.status, 503);
  assert.equal((await ownerNoProvider.json()).error.code, 'not_configured');
  const killSwitch = await runCheck(post('/api/check-claim', checkBody(), {cookie:cookie(uuid())}), {...env, PHEROGENT_AI_ENABLED:'false'}, deps);
  assert.equal(killSwitch.status, 503);
  assert.equal((await killSwitch.json()).error.code, 'not_configured');
  assert.equal(ran, 0);
  assert.equal(rows(sqlite), 0);
  sqlite.close();
}

// With the owner key the run succeeds against a provider faked at the adapter
// interface; the route builds the provider from configuration (model ID), and
// configured limits replace the source defaults without any code edit.
{
  const {sqlite, db} = database();
  const env = {...baseEnv(db), PHEROGENT_MODEL:'config-model', PHEROGENT_LIMITS:JSON.stringify({userRunsPerDay:1, userCooldownMs:1})};
  const factoryConfigs = [];
  let providerCalls = 0;
  const deps = {
    createProvider: config => {
      factoryConfigs.push(config);
      return {model:config.model, estimateInputTokens:() => 1000, complete:async () => {providerCalls++; return {value:{}, inputTokens:10, outputTokens:5};}};
    },
    runResearch: async ({provider}) => {
      const completion = await provider.complete({name:'pherogent_judge'});
      return {...stubResult, usage:{...stubUsage, model:provider.model, inputTokens:completion.inputTokens, outputTokens:completion.outputTokens}};
    }
  };
  const first = await runCheck(post('/api/check-claim', checkBody(), ownerHeaders()), env, deps);
  assert.equal(first.status, 200);
  const lines = (await first.text()).trim().split('\n').map(JSON.parse);
  assert.equal(lines.at(-1).type, 'result');
  assert.equal(providerCalls, 1);
  assert.deepEqual(factoryConfigs.map(c => c.model), ['config-model'], 'The model ID reaches the adapter from configuration');
  assert.equal(factoryConfigs[0].apiKey, 'unit-test-only-no-network');
  assert.equal(sqlite.prepare('SELECT user_id FROM ai_runs').get().user_id, 'owner');

  const second = await runCheck(post('/api/check-claim', checkBody(), ownerHeaders()), env, deps);
  assert.equal(second.status, 429);
  assert.equal((await second.json()).error.code, 'visitor_daily_limit', 'The configured one-run-per-day limit replaced the default of three');

  const ownerStatus = await (await getStatus(statusRequest(ownerHeaders()), env)).json();
  assert.equal(ownerStatus.signedIn, true);
  assert.equal(ownerStatus.needsSignIn, false);
  assert.equal(ownerStatus.limits.userRunsPerDay, 1);
  assert.equal(ownerStatus.reason, 'visitor_daily_limit');

  const lockedStatus = await (await getStatus(statusRequest(), env)).json();
  assert.equal(lockedStatus.signedIn, false);
  assert.equal(lockedStatus.needsSignIn, true);
  assert.equal(lockedStatus.publicAccess, false);
  assert.equal(lockedStatus.canRun, false);
  assert.equal(lockedStatus.reason, 'owner_key_required');
  sqlite.close();
}

// The public demo flip restores open-with-ledger behavior: a visitor cookie
// runs without any key and the ledger records the reservation. The
// client-supplied platform identity header is ignored everywhere.
{
  const {sqlite, db} = database();
  const env = {...baseEnv(db), PHEROGENT_OWNER_KEY:'', PHEROGENT_PUBLIC_ACCESS:'true'};
  let ran = 0;
  const deps = {runResearch:async () => {ran++; return stubResult;}};

  const spoofed = await runCheck(post('/api/check-claim', checkBody(), {'oai-authenticated-user-id':'attacker'}), env, deps);
  assert.equal(spoofed.status, 400);
  assert.equal((await spoofed.json()).error.code, 'visitor_session_required', 'A user-identity header is not a session');
  assert.equal(ran, 0);

  const visitorId = uuid();
  const open = await runCheck(post('/api/check-claim', checkBody(), {cookie:cookie(visitorId), 'oai-authenticated-user-id':'attacker'}), env, deps);
  assert.equal(open.status, 200);
  await open.text();
  assert.equal(ran, 1);
  const row = sqlite.prepare('SELECT user_id, reserved_micros FROM ai_runs').get();
  assert.equal(row.user_id, 'anonymous:' + visitorId, 'The ledger bucket comes from the cookie, never from a spoofable header');
  assert.equal(row.reserved_micros, 100000);

  const status = await (await getStatus(statusRequest({cookie:cookie(visitorId)}), env)).json();
  assert.equal(status.publicAccess, true);
  assert.equal(status.needsSignIn, false);
  assert.equal(status.signedIn, false);
  assert.ok(!('pricingValidUntil' in status.limits), 'The date-based pricing expiry is gone');
  assert.equal(status.limits.pricesVerifiedOn, '2026-11-17');
  sqlite.close();
}

// The prices-last-verified date is display-only: an old date never pauses runs.
{
  const {sqlite, db} = database();
  const env = {...baseEnv(db), PHEROGENT_OWNER_KEY:'', PHEROGENT_PUBLIC_ACCESS:'true',
    PHEROGENT_PRICING:JSON.stringify({inputMicrosPerToken:2, outputMicrosPerToken:12, reservedInputMicrosPerToken:2.5, pricesVerifiedOn:'2024-01-01'})};
  let ran = 0;
  const deps = {runResearch:async () => {ran++; return stubResult;}};
  const response = await runCheck(post('/api/check-claim', checkBody(), {cookie:cookie(uuid())}), env, deps);
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(ran, 1, 'An old verification date is information, not an automatic stop');
  const status = await (await getStatus(statusRequest(), env)).json();
  assert.equal(status.limits.pricesVerifiedOn, '2024-01-01');
  sqlite.close();
}

// Invalid configuration fails closed on every route before any paid work.
{
  const {sqlite, db} = database();
  let ran = 0;
  const deps = {runResearch:async () => {ran++; return stubResult;}};
  for (const broken of [
    {PHEROGENT_LIMITS:'{bad'},
    {PHEROGENT_LIMITS:'{"notALimit":5}'},
    {PHEROGENT_LIMITS:'{"userRunsPerDay":0}'},
    {PHEROGENT_PRICING:'[]'},
    {PHEROGENT_MODEL:'bad model id'}
  ]) {
    const env = {...baseEnv(db), PHEROGENT_PUBLIC_ACCESS:'true', ...broken};
    const paid = await runCheck(post('/api/check-claim', checkBody(), {cookie:cookie(uuid())}), env, deps);
    assert.equal(paid.status, 503);
    assert.equal((await paid.json()).error.code, 'config_invalid');
    const status = await getStatus(statusRequest(), env);
    assert.equal(status.status, 503);
    assert.equal((await status.json()).reason, 'config_invalid');
  }
  assert.equal(ran, 0);
  assert.equal(rows(sqlite), 0);
  sqlite.close();
}

} finally {
  Date.now = originalNow;
}

// The research pipeline runs end to end against a provider faked purely at the
// adapter interface: no API key, and fetch carries only Europe PMC traffic.
{
  const completions = [];
  const abstract = 'Visual function improved in aged mice. A mouse model was used.';
  const provider = {
    model: 'fake-model',
    estimateInputTokens: () => 2000,
    complete: async request => {
      completions.push(request);
      const value = [
        {queries:['mouse vision recovery']},
        {keep:[{paperId:'MED:101', reason:'Relevant measured outcome.'}], refinementQuery:null},
        {summary:{established:[],uncertain:['Uncertain.'],nextQuestions:[]}, evidence:[{
          paperId:'MED:101', claim:'Visual function improved in aged mice.', label:'supports',
          quote:'Visual function improved in aged mice.', passageId:'abstract', studyType:'Mouse experiment',
          population:'Mice', mismatchNotes:[], suggestedWording:null, reason:'The passage reports the measured outcome.'
        }]}
      ][completions.length - 1];
      return {value, inputTokens:100, outputTokens:50};
    }
  };
  const pmcCalls = [];
  const fetchImpl = async url => {
    pmcCalls.push(url);
    assert.ok(String(url).startsWith('https://www.ebi.ac.uk/'), 'Only Europe PMC goes over fetch when the provider is faked');
    return new Response(JSON.stringify({hitCount:1, resultList:{result:[{source:'MED', id:'101', title:'Mouse visual function', pubYear:'2020', authorString:'Example A', abstractText:abstract, isOpenAccess:'N'}]}}));
  };
  const result = await runResearch({question:'Did visual function improve?', provider, fetchImpl, now:() => NOW});
  assert.deepEqual(completions.map(c => c.name), ['pherogent_plan', 'pherogent_screen', 'pherogent_judge']);
  assert.ok(completions.every(c => c.schema && typeof c.instructions === 'string' && c.maxOutputTokens > 0));
  assert.equal(result.usage.model, 'fake-model');
  assert.equal(result.usage.modelCalls, 3);
  assert.equal(result.usage.inputTokens, 300);
  assert.equal(result.usage.outputTokens, 150);
  assert.equal(result.usage.estimatedCostUsd, (300 * 2.5 + 150 * 12) / 1e6);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].quoteVerified, true);
  assert.ok(pmcCalls.length > 0);
}

console.log('Owner-gate and provider-adapter tests passed: key-gated paid routes, public demo flip, ignored identity headers, config-driven model/limits/prices, display-only price date, fail-closed config, and a pipeline run against the faked adapter interface.');
