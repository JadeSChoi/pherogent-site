import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {LIMITS, RESERVE_SQL, reservationBindings, reserveRun, readBudget, completeRun, cleanUsage} from '../server/budget.mjs';
import {runResearch, RESEARCH_LIMITS} from '../server/research.mjs';

const NOW=Date.parse('2026-10-24T12:00:00Z');
const SCHEMA=`CREATE TABLE ai_runs(run_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_id TEXT NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL,reserved_micros INTEGER NOT NULL,usage_json TEXT,completed_at INTEGER,UNIQUE(user_id,request_id));`;
const uuid=()=>crypto.randomUUID();
function adapter(sqlite){return {prepare(sql){return {bind(...params){return {
  async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
  async first(){return sqlite.prepare(sql).get(...params)||null;},
  async all(){return {success:true,results:sqlite.prepare(sql).all(...params)};}
};}};}};}
function seed(sqlite,n){
  for(let i=0;i<n;i++)sqlite.prepare('INSERT INTO ai_runs VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(),'old-'+i,uuid(),'2026-10-23',NOW-86400000,'completed',LIMITS.reservationMicros,null,NOW-86399000);
}

assert.equal(LIMITS.lifetimeTokens,2000000);
assert.equal(LIMITS.lifetimeTokens / LIMITS.perRunTokens,50);
assert.equal(RESEARCH_LIMITS.maxRunTokens,LIMITS.perRunTokens);
assert.equal(cleanUsage({reservedTokens:999999,conservativeTokenBound:123}).reservedTokens,40000,'Caller data cannot increase the reservation');
assert.equal(cleanUsage({conservativeTokenBound:123}).conservativeTokenBound,123);

// Raising the cap preserves the five existing reservations and opens exactly
// 45 additional slots; it does not reset history or refund prior failures.
{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(SCHEMA);seed(sqlite,5);
  const db=adapter(sqlite),oldRows=sqlite.prepare('SELECT * FROM ai_runs ORDER BY run_id').all();
  const before=await readBudget(db,'new-visitor',NOW);
  assert.equal(before.lifetimeReservedTokens,200000);
  assert.equal(before.lifetimeReservedUsd,.5);
  assert.equal(before.remainingLifetimeTokens,1800000);
  assert.equal(before.remainingLifetimeTokens / LIMITS.perRunTokens,45);
  const sixth=await reserveRun(db,'new-visitor',uuid(),NOW);
  assert.equal(sixth.reservedTokens,40000);
  const after=await readBudget(db,'new-visitor',NOW);
  assert.equal(after.lifetimeReservedTokens,240000);
  assert.equal(after.remainingLifetimeTokens,1760000);
  assert.equal(after.lifetimeReservedUsd,.6);
  assert.deepEqual(sqlite.prepare('SELECT * FROM ai_runs WHERE run_id != ? ORDER BY run_id').all(sixth.runId),oldRows);
  sqlite.close();
}

// Old, failed, cancelled and orphaned rows all retain their full allowance.
// Closing and reopening the actual database, or crossing UTC midnight, cannot
// restore tokens. No source-schema migration or in-memory counter is involved.
{
  const dir=mkdtempSync(join(tmpdir(),'pherogent-token-restart-')),file=join(dir,'ledger.db');
  try {
    let sqlite=new DatabaseSync(file);sqlite.exec(SCHEMA);let db=adapter(sqlite);
    seed(sqlite,46);
    assert.equal((await readBudget(db,'new',NOW)).remainingLifetimeTokens,160000);
    for(const [i,status] of ['completed','failed','cancelled'].entries()){
      const user='visitor-'+i,r=await reserveRun(db,user,uuid(),NOW+i*1000);
      assert.equal(r.reservedTokens,40000);
      await completeRun(db,r.runId,user,status,{inputTokens:1,outputTokens:1,totalTokens:2},NOW+i*1000+1);
    }
    const orphan=await reserveRun(db,'orphan',uuid(),NOW+4000);
    assert.ok(orphan.runId);
    const b=await readBudget(db,'another',NOW+5000);
    assert.equal(b.lifetimeReservedTokens,2000000);assert.equal(b.remainingLifetimeTokens,0);
    assert.equal(b.lifetimeReservedUsd,5,'The independent token cap stops before the dollar cap');
    await assert.rejects(reserveRun(db,'over',uuid(),NOW+6000),e=>e.code==='token_budget_exhausted');
    sqlite.close();
    sqlite=new DatabaseSync(file);db=adapter(sqlite);
    const tomorrow=await readBudget(db,'fresh-cookie',NOW+86400000);
    assert.equal(tomorrow.remainingDailyUsd,1);assert.equal(tomorrow.remainingLifetimeTokens,0);
    await assert.rejects(reserveRun(db,'fresh-cookie',uuid(),NOW+86400000),e=>e.code==='token_budget_exhausted');
    sqlite.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
}

// Real independent SQLite connections contend for the final token reservation.
// Only one can win even if visitors have distinct identifiers and request IDs.
{
  const dir=mkdtempSync(join(tmpdir(),'pherogent-token-race-')),file=join(dir,'ledger.db');
  try {
    const sqlite=new DatabaseSync(file);sqlite.exec('PRAGMA journal_mode=WAL;');sqlite.exec(SCHEMA);seed(sqlite,49);
    const gate=new SharedArrayBuffer(4),ready=[],done=[];
    const code=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=5000');parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.gate),0,0);try{const r=db.prepare(workerData.sql).run(...workerData.params);parentPort.postMessage({changes:Number(r.changes)});}catch(e){parentPort.postMessage({error:e.message});}finally{db.close();}`;
    for(let i=0;i<8;i++){
      const worker=new Worker(code,{eval:true,workerData:{file,gate,sql:RESERVE_SQL,params:reservationBindings('contender-'+i,uuid(),uuid(),NOW)}});
      let markReady;ready.push(new Promise(r=>{markReady=r;}));
      done.push(new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready)markReady();else if(m.error)reject(new Error(m.error));else resolve(m.changes);});worker.on('error',reject);}));
    }
    await Promise.all(ready);Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0);
    assert.equal((await Promise.all(done)).reduce((a,b)=>a+b,0),1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM ai_runs').get().count,50);
    assert.equal((await readBudget(adapter(sqlite),'other',NOW)).lifetimeReservedTokens,LIMITS.lifetimeTokens);
    sqlite.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
}

// Idempotent replay and storage errors cannot create a second paid reservation.
{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(SCHEMA);const db=adapter(sqlite),request=uuid();
  await reserveRun(db,'visitor',request,NOW);
  await assert.rejects(reserveRun(db,'visitor',request,NOW),e=>e.code==='duplicate_request');
  assert.equal((await readBudget(db,'visitor',NOW)).lifetimeReservedTokens,40000);
  sqlite.close();
  await assert.rejects(reserveRun({prepare(){throw new Error('offline');}},'visitor',uuid(),NOW));
  await assert.rejects(readBudget({prepare(){return {bind(){return {first:async()=>({lifetime_reserved:0,daily_reserved:0,user_runs:0,active_runs:0,user_active:0})};}};}},'visitor',NOW),e=>e.code==='budget_unavailable');
}

// Simulated provider requests measure the serialized bounds independently.
// Long Unicode data exercises UTF-8 accounting; failed calls retain their bound.
for(const unicode of [false,true]){
  let modelCalls=0,searchCalls=0,totalBound=0;
  const modelBodies=[];
  const fetchImpl=async(url,init={})=>{
    if(url==='https://api.openai.com/v1/responses'){
      const b=JSON.parse(init.body);modelBodies.push(b);modelCalls++;
      totalBound+=new TextEncoder().encode(init.body).length+512+b.max_output_tokens;
      assert.ok(totalBound<=LIMITS.perRunTokens,'No request is sent beyond the per-run token reservation');
      const outputs=[{queries:['partial reprogramming','mouse vision']},{keep:[1,2,3].map(i=>({paperId:'MED:'+i,reason:'Relevant'})),refinementQuery:null},{summary:{established:[],uncertain:['Uncertain'],nextQuestions:[]},evidence:[]}];
      return new Response(JSON.stringify({model:RESEARCH_LIMITS.model,service_tier:'default',status:'completed',usage:{input_tokens:200,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(outputs[modelCalls-1])}]}]}));
    }
    searchCalls++;
    const result=Array.from({length:3},(_,i)=>({source:'MED',id:String((searchCalls-1)*3+i+1),title:unicode?'😀'.repeat(170):'Mouse research',abstractText:unicode?'😀'.repeat(9000):'The mouse experiment reported partial visual recovery.',isOpenAccess:'N'}));
    return new Response(JSON.stringify({hitCount:3,resultList:{result}}));
  };
  try {
    const result=await runResearch({question:unicode?'😀'.repeat(1000):'Did the mouse experiment show recovery?',apiKey:'test-placeholder-never-network',fetchImpl,now:()=>NOW});
    assert.equal(result.usage.conservativeTokenBound,totalBound);
    assert.equal(result.usage.reservedTokens,LIMITS.perRunTokens);
    assert.ok(result.usage.totalTokens<=result.usage.conservativeTokenBound);
    if(!unicode)assert.equal(modelCalls,3);
  }catch(error){
    assert.ok(unicode);assert.equal(error.code,'token_budget');
    assert.equal(error.usage.conservativeTokenBound,totalBound);assert.ok(modelCalls<3);
  }
  assert.ok(totalBound<=LIMITS.perRunTokens);
  assert.equal(modelBodies.length,modelCalls);
}

console.log('Shared token budget tests passed: 2,000,000 durable tokens, 40,000 reservations, five existing runs preserved with 45 slots restored, concurrent final slot, no refunds/refill, restart persistence, idempotency, fail-closed storage and bounded simulated requests.');
