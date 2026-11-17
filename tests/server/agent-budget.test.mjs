import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {LIMITS, RESERVE_SQL, reservationBindings, reserveRun, readBudget, completeRun, readUsage, blockedReason} from '../../worker/server/budget.mjs';
import {getStatus, runCheck} from './route.mjs';

const NOW=Date.parse('2026-10-24T12:00:00Z');
const SCHEMA=`CREATE TABLE ai_runs(run_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_id TEXT NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL,reserved_micros INTEGER NOT NULL,usage_json TEXT,completed_at INTEGER,UNIQUE(user_id,request_id));`;
function adapter(sqlite){return {prepare(sql){return {bind(...params){return {
  async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  async first(){return sqlite.prepare(sql).get(...params)||null;},
  async all(){return {success:true,results:sqlite.prepare(sql).all(...params)};}
};}};}};}
function database(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(SCHEMA);return {sqlite,db:adapter(sqlite)};}
function seed(sqlite,{runId=crypto.randomUUID(),user='someone',requestId=crypto.randomUUID(),at=NOW-400_000,day='2026-10-24',status='completed',micros=100_000}={}){
  sqlite.prepare('INSERT INTO ai_runs VALUES(?,?,?,?,?,?,?,NULL,?)').run(runId,user,requestId,day,at,status,micros,status==='running'?null:at+1000);
}
const uuid=()=>crypto.randomUUID();
const expectCode=(promise,code)=>assert.rejects(promise,error=>error.code===code);

// Actual SQLite execution validates all constraints, not a mock implementation.
{
  const {sqlite,db}=database();
  const id=uuid();const run=await reserveRun(db,'author',id,NOW);
  assert.equal((await readBudget(db,'author',NOW)).dailyReservedUsd,.1);
  await expectCode(reserveRun(db,'author',id,NOW),'duplicate_request');
  await expectCode(reserveRun(db,'author',uuid(),NOW),'run_in_progress');
  await completeRun(db,run.runId,'author','failed',{model:'test-model',inputTokens:20,outputTokens:10,totalTokens:30,calls:1,estimatedCostUsd:.001},NOW+1000);
  await expectCode(reserveRun(db,'author',uuid(),NOW+2000),'visitor_rate_limit');
  assert.equal((await readBudget(db,'author',NOW+2000)).dailyReservedUsd,.1,'Failure never refunds the reservation');
  assert.equal((await readUsage(db,'author')).modelCalls,1);
  assert.equal((await readUsage(db,'other')).totalTokens,0,'Usage is scoped to the signed-in visitor');
  for(let i=1;i<3;i++){const r=await reserveRun(db,'author',uuid(),NOW+i*61_000);await completeRun(db,r.runId,'author','completed',{},NOW+i*61_000+1);}
  await expectCode(reserveRun(db,'author',uuid(),NOW+240_000),'visitor_daily_limit');
  assert.equal((await readBudget(db,'author',NOW+240_000)).userRunsRemaining,0);
  sqlite.close();
}
{
  const {sqlite,db}=database();
  for(let i=0;i<3;i++)seed(sqlite,{user:'visitor-'+i,micros:300_000});
  await reserveRun(db,'last-visitor',uuid(),NOW);
  await expectCode(reserveRun(db,'over-budget',uuid(),NOW),'daily_budget_exhausted');
  const budget=await readBudget(db,'over-budget',NOW);assert.equal(budget.dailyReservedUsd,1);assert.equal(budget.remainingDailyUsd,0);
  assert.equal(blockedReason(budget)[0],'daily_budget_exhausted');
  sqlite.close();
}
// A larger lifetime pool does not expand the $1 daily cap: ten normal
// reservations across distinct visitors fit, but an eleventh is refused.
{
  const {sqlite,db}=database();
  for(let i=0;i<10;i++){
    const user='daily-visitor-'+i,at=NOW+i*1000;
    const run=await reserveRun(db,user,uuid(),at);
    await completeRun(db,run.runId,user,i%2?'completed':'failed',{},at+1);
  }
  const budget=await readBudget(db,'daily-overflow',NOW+11000);
  assert.equal(budget.dailyReservedUsd,1);
  assert.equal(budget.remainingLifetimeTokens,1600000,'Lifetime tokens remain when the daily stop engages');
  await expectCode(reserveRun(db,'daily-overflow',uuid(),NOW+11000),'daily_budget_exhausted');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_runs').get().n,10);
  sqlite.close();
}
{
  const {sqlite,db}=database();
  for(let i=0;i<100;i++)seed(sqlite,{user:'visitor-'+i,day:'2026-10-23'});
  await expectCode(reserveRun(db,'fresh-visitor',uuid(),NOW),'lifetime_budget_exhausted');
  assert.equal((await readBudget(db,'fresh-visitor',NOW)).lifetimeReservedUsd,10,'Midnight does not reset the lifetime stop');
  sqlite.close();
}
{
  const {sqlite,db}=database();
  const a=await reserveRun(db,'a',uuid(),NOW);await reserveRun(db,'b',uuid(),NOW);
  await expectCode(reserveRun(db,'c',uuid(),NOW),'site_busy');
  await completeRun(db,a.runId,'a','cancelled',{},NOW+1000);
  await reserveRun(db,'c',uuid(),NOW+1000);
  assert.equal((await readBudget(db,'c',NOW+1000)).dailyReservedUsd,.3,'Cancellation does not create free retries');
  // Orphaned execution leases eventually allow work; spending reservations remain.
  await reserveRun(db,'d',uuid(),NOW+LIMITS.activeLeaseMs+1);
  assert.equal((await readBudget(db,'d',NOW+LIMITS.activeLeaseMs+1)).dailyReservedUsd,.4);
  sqlite.close();
}

// Orphaned reservations and damaged usage records cannot silently become zero
// reported spend. Their allowance stays consumed and usage remains incomplete.
{
  const {sqlite,db}=database();
  seed(sqlite,{runId:'orphan',user:'usage-owner',status:'running',day:'2026-10-23'});
  for (const [id,value] of [['invalid-json','{bad'],['empty-object','{}'],['array','[]']]) {
    seed(sqlite,{runId:id,user:'usage-owner',day:'2026-10-23'});
    sqlite.prepare('UPDATE ai_runs SET usage_json = ? WHERE run_id = ?').run(value,id);
  }
  const known=await reserveRun(db,'usage-owner',uuid(),NOW);
  await completeRun(db,known.runId,'usage-owner','failed',{model:'test-model',inputTokens:20,outputTokens:10,totalTokens:30,calls:1,estimatedCostUsd:.001,unknownCalls:2},NOW+1);
  const usage=await readUsage(db,'usage-owner');
  assert.deepEqual(usage,{inputTokens:20,outputTokens:10,totalTokens:30,modelCalls:1,estimatedCostUsd:.001,unknownCalls:6});
  assert.equal((await readBudget(db,'usage-owner',NOW)).lifetimeReservedUsd,.5);
  assert.equal((await readUsage(db,'another-user')).unknownCalls,0);
  sqlite.close();
}

// Multiple SQLite connections really contend for the final $0.10. Exactly one
// can reserve it even when the precondition checks happen simultaneously.
{
  const dir=mkdtempSync(join(tmpdir(),'pherogent-budget-')),file=join(dir,'ledger.db');
  try{
    const sqlite=new DatabaseSync(file);sqlite.exec('PRAGMA journal_mode=WAL;');sqlite.exec(SCHEMA);
    for(let i=0;i<3;i++)seed(sqlite,{user:'seed-'+i,micros:300_000});
    const gate=new SharedArrayBuffer(4);const ready=[];const completions=[];
    const source=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=5000');parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.gate),0,0);try{const r=db.prepare(workerData.sql).run(...workerData.params);parentPort.postMessage({changes:Number(r.changes)});}catch(e){parentPort.postMessage({error:e.message});}finally{db.close();}`;
    for(let i=0;i<6;i++){
      const worker=new Worker(source,{eval:true,workerData:{file,gate,sql:RESERVE_SQL,params:reservationBindings('parallel-'+i,uuid(),uuid(),NOW)}});
      let readyResolve;ready.push(new Promise(r=>{readyResolve=r;}));
      completions.push(new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready)readyResolve();else if(m.error)reject(new Error(m.error));else resolve(m.changes);});worker.on('error',reject);}));
    }
    await Promise.all(ready);Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0);
    const changes=await Promise.all(completions);assert.equal(changes.reduce((a,b)=>a+b,0),1,'Concurrent requests cannot oversubscribe the final reservation');
    assert.equal(sqlite.prepare('SELECT SUM(reserved_micros) AS total FROM ai_runs').get().total,LIMITS.dailyMicros);
    sqlite.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
}

// HTTP route guards: no test performs a network request or spends model tokens.
const oldNow=Date.now;Date.now=()=>NOW;
try{
  const visitorCookie=id=>'__Host-pherogent-visitor='+id;
  const TESTER=uuid();
  const makeRequest=(body,headers={},url='https://pherogent.example/api/check-claim')=>new Request(url,{method:'POST',headers:{origin:'https://pherogent.example','content-type':'application/json',cookie:visitorCookie(TESTER),...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  const statusRequest=(headers={})=>new Request('https://pherogent.example/api/agent/status',{headers:{cookie:visitorCookie(TESTER),...headers}});
  const body=()=>({requestId:uuid(),question:'Does this source support the mechanism?',consent:true});
  const {sqlite,db}=database();const env={DB:db,OPENAI_API_KEY:'unit-test-secret-never-network',PHEROGENT_AI_ENABLED:'true',PHEROGENT_PUBLIC_ACCESS:'true'};
  let calls=0;const runner=async ({onEvent})=>{calls++;const usage={model:'test-model',calls:1,inputTokens:20,outputTokens:10,totalTokens:30,estimatedCostUsd:.001};onEvent({type:'usage',usage});return {question:'test',summary:{established:[],uncertain:[],nextQuestions:[]},evidence:[],papers:[],steps:[],usage};};
  const deps={runResearch:runner};
  // Public demo mode: visitors do not need an account or an owner key.
  const openStatus=await (await getStatus(statusRequest(),env)).json();
  assert.equal(openStatus.canRun,true);assert.equal(openStatus.needsSignIn,false);
  const anonymousStatusResponse=await getStatus(new Request('https://pherogent.example/api/agent/status'),env);
  const cookieHeader=anonymousStatusResponse.headers.get('set-cookie');
  assert.match(cookieHeader,/^__Host-pherogent-visitor=[0-9a-f-]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000$/);
  const anonymousStatus=await anonymousStatusResponse.json();
  assert.equal(anonymousStatus.canRun,true);assert.equal(anonymousStatus.signedIn,false);assert.equal(anonymousStatus.needsSignIn,false);
  assert.equal(anonymousStatus.limits.lifetimeTokens,2000000);assert.equal(anonymousStatus.budget.remainingLifetimeTokens,2000000);
  assert.equal(calls,0);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_runs').get().n,0);
  assert.equal((await runCheck(makeRequest(body(),{origin:'https://attacker.example'}),env,deps)).status,403);
  assert.equal((await runCheck(makeRequest(body(),{cookie:''}),env,deps)).status,400);
  assert.equal((await runCheck(makeRequest(body()),{...env,OPENAI_API_KEY:''},deps)).status,503);
  assert.equal((await runCheck(makeRequest(body()),{...env,PHEROGENT_AI_ENABLED:'false'},deps)).status,503);
  assert.equal((await runCheck(makeRequest(body()),{...env,DB:null},deps)).status,503);
  const brokenDB={prepare(){throw new Error('DB unavailable');}};
  assert.equal((await runCheck(makeRequest(body()),{...env,DB:brokenDB},deps)).status,503,'Ledger failures must fail closed before a paid call');
  assert.equal((await runCheck(makeRequest({...body(),consent:false}),env,deps)).status,400);
  assert.equal((await runCheck(makeRequest({...body(),dailyBudget:999}),env,deps)).status,400,'A visitor cannot supply budget or model overrides');
  assert.equal((await runCheck(makeRequest({...body(),question:'x'.repeat(2001)}),env,deps)).status,400);
  assert.equal((await runCheck(makeRequest('x'.repeat(16001)),env,deps)).status,413,'The actual body is bounded without trusting Content-Length');
  assert.equal((await runCheck(makeRequest('{bad'),env,deps)).status,400);
  assert.equal(calls,0,'Rejected requests never invoke the model');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM ai_runs').get().n,0,'Invalid requests do not consume a reservation');

  const id=uuid();const response=await runCheck(makeRequest({...body(),requestId:id}),env,deps);
  assert.equal(response.status,200);const lines=(await response.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map(x=>x.type),['start','usage','result']);
  assert.equal(lines[2].reservedUsd,.1);assert.equal(lines[2].result.usage.modelCalls,1);
  assert.equal(calls,1);assert.ok(!JSON.stringify(lines).includes(env.OPENAI_API_KEY));
  assert.equal((await runCheck(makeRequest({...body(),requestId:id}),env,deps)).status,409);
  assert.equal(calls,1,'Idempotent replay never makes another paid call');
  const status=await (await getStatus(statusRequest(),env)).json();
  assert.equal(status.budget.dailyReservedUsd,.1);assert.equal(status.usage.totalTokens,30);assert.equal(status.canRun,false);assert.equal(status.reason,'visitor_rate_limit');
  assert.ok(!JSON.stringify(status).includes(TESTER),'Status never exposes the visitor identifier');
  for (const change of [{PHEROGENT_AI_ENABLED:'false'},{OPENAI_API_KEY:''}]) {
    const disabledStatus=await (await getStatus(statusRequest(),{...env,...change})).json();
    assert.equal(disabledStatus.canRun,false);assert.equal(disabledStatus.reason,'not_configured');
    assert.equal(disabledStatus.usage.totalTokens,30,'Visitors retain historical usage when new AI work is disabled');
    assert.equal(disabledStatus.budget.dailyReservedUsd,.1);
  }
  const unavailableUsage=await (await getStatus(statusRequest(),{...env,DB:brokenDB})).json();
  assert.equal(unavailableUsage.usage,null);assert.equal(unavailableUsage.reason,'budget_unavailable');
  const noLedger=await (await getStatus(statusRequest(),{...env,DB:null})).json();
  assert.equal(noLedger.usage,null);assert.equal(noLedger.canRun,false);
  const anonymous=await (await getStatus(statusRequest({cookie:visitorCookie(uuid())}),env)).json();
  assert.equal(anonymous.usage.totalTokens,0);assert.equal(anonymous.canRun,true);assert.equal(anonymous.needsSignIn,false);

  const FAILURE_USER=uuid();
  const failResponse=await runCheck(makeRequest(body(),{cookie:visitorCookie(FAILURE_USER)}),env,{runResearch:async()=>{throw new Error('provider contains unit-test-secret-never-network');}});
  const failed=(await failResponse.text()).trim().split('\n').map(JSON.parse);assert.equal(failed.at(-1).type,'error');assert.ok(!JSON.stringify(failed).includes(env.OPENAI_API_KEY));
  assert.equal(failed.at(-1).usage.usageUnknown,true,'Unaccounted interrupted calls must not be presented as confirmed zero usage');
  assert.equal((await readBudget(db,'anonymous:'+FAILURE_USER,NOW)).dailyReservedUsd,.2,'Provider failure retains its full reservation');

  let sawAbort=false;const CANCEL_USER=uuid();
  const cancelled=await runCheck(makeRequest(body(),{cookie:visitorCookie(CANCEL_USER)}),env,{runResearch:({signal})=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>{sawAbort=true;reject(signal.reason);},{once:true});})});
  const reader=cancelled.body.getReader();await reader.read();await reader.cancel();await new Promise(r=>setImmediate(r));
  assert.equal(sawAbort,true);assert.equal((await readBudget(db,'anonymous:'+CANCEL_USER,NOW)).dailyReservedUsd,.3);
  const cookie=cookieHeader.split(';')[0];
  const anonRequest=(payload,override=cookie)=>makeRequest(payload,{cookie:override});
  for(const invalidCookie of ['', '__Host-pherogent-visitor=attacker',cookie+'; '+cookie]) {
    assert.equal((await runCheck(anonRequest(body(),invalidCookie),env,deps)).status,400,'Malformed/missing/duplicate visitor cookies cannot run paid work');
  }
  const anonId=uuid();const anonRun=await runCheck(anonRequest({...body(),requestId:anonId}),env,deps);
  assert.equal(anonRun.status,200);await anonRun.text();
  const anonFollow=await (await getStatus(new Request('https://pherogent.example/api/agent/status',{headers:{cookie}}),env)).json();
  assert.equal(anonFollow.usage.totalTokens,30);assert.equal(anonFollow.budget.userRunsToday,1);
  assert.equal(anonFollow.budget.lifetimeReservedTokens,160000);
  assert.equal(anonFollow.needsSignIn,false);assert.equal(anonFollow.reason,'visitor_rate_limit');
  assert.equal((await runCheck(anonRequest({...body(),requestId:anonId}),env,deps)).status,409,'Anonymous retry retains idempotency');
  // Keep today's four real route invocations, and fill historical allowance
  // without masking the last token slot behind the separate daily dollar cap.
  for(let i=0;i<45;i++)seed(sqlite,{user:'historical-'+i,day:'2026-10-23',at:NOW-86400000});
  const freshCookieResponse=await getStatus(new Request('https://pherogent.example/api/agent/status'),env);
  const freshCookie=freshCookieResponse.headers.get('set-cookie').split(';')[0];
  const finalRun=await runCheck(anonRequest(body(),freshCookie),env,deps);assert.equal(finalRun.status,200);await finalRun.text();
  const exhausted=await (await getStatus(new Request('https://pherogent.example/api/agent/status'),env)).json();
  assert.equal(exhausted.reason,'token_budget_exhausted');assert.equal(exhausted.budget.remainingLifetimeTokens,0);
  assert.equal(exhausted.canRun,false,'A new browser identity cannot reset the global pool');
  const callsBefore=calls;
  assert.equal((await runCheck(makeRequest(body(),{cookie:visitorCookie(uuid())}),env,deps)).status,429);
  assert.equal(calls,callsBefore,'No provider call after shared allowance is exhausted');
  // The prices-last-verified date is reported as information only; no clock
  // comparison can pause runs (the budget stops above are the safeguards).
  const finalStatus=await (await getStatus(statusRequest(),env)).json();
  assert.equal(finalStatus.limits.pricesVerifiedOn,'2026-11-17');
  assert.ok(!('pricingValidUntil' in finalStatus.limits));
  sqlite.close();
}finally{Date.now=oldNow;}
console.log('Agent budget/API tests passed: atomic concurrent reservations, daily/lifetime/per-user stops, idempotency, public visitor cookies/origin/consent, bounded input, no refunds, cancellation, private usage and honest streaming.');
