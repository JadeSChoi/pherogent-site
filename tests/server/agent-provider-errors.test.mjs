import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {classifyProviderError,PROVIDER_ERROR_MESSAGES} from '../../worker/server/provider-errors.mjs';
import {runSectionReply} from '../../worker/server/chat.mjs';
import {runResearch} from '../../worker/server/research.mjs';
import {runSectionChat,runCheck} from './route.mjs';

const NOW=Date.parse('2026-10-24T12:00:00Z');
const SECRET='secret-like-key-and-manuscript-text';
const cases=[
  [401,{},'provider_authentication'],
  [400,{code:'invalid_api_key'},'provider_authentication'],
  [429,{code:'insufficient_quota'},'provider_quota'],
  [429,{type:'insufficient_quota'},'provider_quota'],
  ...['credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded'].map(code=>[429,{code},'provider_quota']),
  [429,{code:'rate_limit_exceeded'},'provider_rate_limit'],
  [403,{},'provider_access'],[404,{code:'model_not_found'},'provider_access'],
  [400,{param:'service_tier'},'provider_service_tier'],
  [400,{param:SECRET},'provider_invalid_request'],
  [500,{code:SECRET},'model_unavailable']
];
const response=(status,error)=>new Response(JSON.stringify({error:{message:SECRET,...error}}),{status,headers:{'content-type':'application/json'}});

for(const [status,error,expected] of cases){
  assert.deepEqual(await classifyProviderError(response(status,error)),{code:expected,message:PROVIDER_ERROR_MESSAGES[expected]});
  for(const kind of ['chat','research']){
    let calls=0;
    const common={apiKey:'fake-test-key',now:()=>NOW,fetchImpl:async()=>{calls++;return response(status,error);}};
    const run=kind==='chat'?()=>runSectionReply({...common,stage:'methods',message:'Propose a method.',context:''}):()=>runResearch({...common,question:'What evidence exists?'});
    await assert.rejects(run(),err=>err.code===expected&&err.usage.unknownCalls===1&&!err.message.includes(SECRET));
    assert.equal(calls,1,'Provider failure must never trigger a retry');
  }
}
for(const source of [new Response('{bad JSON '+SECRET,{status:500}),new Response(SECRET.repeat(1000),{status:500}),new Response('{}',{status:500,headers:{'content-length':'9000'}})]){
  assert.deepEqual(await classifyProviderError(source),{code:'model_unavailable',message:PROVIDER_ERROR_MESSAGES.model_unavailable});
}
{
  let cancelled=false;
  const neverEnds=new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}),{status:429});
  const started=Date.now();assert.equal((await classifyProviderError(neverEnds)).code,'provider_rate_limit');
  assert.ok(Date.now()-started<3000,'Reading errors has an independent timeout');assert.equal(cancelled,true);
}
{
  const controller=new AbortController();
  const stalled=new Response(new ReadableStream({pull(){return new Promise(()=>{});}}),{status:500});
  const pending=classifyProviderError(stalled,controller.signal);controller.abort();
  assert.equal((await pending).code,'model_unavailable');
}
for(const kind of ['chat','research']){
  let calls=0;const common={apiKey:'fake-test-key',now:()=>NOW,fetchImpl:async()=>{calls++;throw new Error(SECRET);}};
  await assert.rejects(kind==='chat'?runSectionReply({...common,stage:'methods',message:'Propose methods.',context:''}):runResearch({...common,question:'Find evidence.'}),err=>err.code==='connection_failed'&&!err.message.includes(SECRET));
  assert.equal(calls,1);
}

// The public NDJSON route must select fixed messages, never forward error.message.
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE ai_runs(run_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_id TEXT NOT NULL,day TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL,reserved_micros INTEGER NOT NULL,usage_json TEXT,completed_at INTEGER,UNIQUE(user_id,request_id));');
const DB={prepare(query){return {bind(...args){return {async run(){const r=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};}};}};}};
const originalNow=Date.now;Date.now=()=>NOW;
try{
  for(const [i,code] of ['provider_quota','provider_authentication','model_mismatch','pricing_tier_mismatch','invalid_output'].entries()){
    const chat=i%2===0;
    const payload={requestId:crypto.randomUUID(),consent:true,...(chat?{stage:'methods',message:'Test',context:''}:{question:'Find evidence'})};
    const req=new Request('https://test.example/api/'+(chat?'agent/chat':'check-claim'),{method:'POST',headers:{origin:'https://test.example','content-type':'application/json',cookie:'__Host-pherogent-visitor='+crypto.randomUUID()},body:JSON.stringify(payload)});
    const failure=async()=>{const e=new Error(SECRET);e.code=code;throw e;};
    const result=await (chat?runSectionChat:runCheck)(req,{DB,OPENAI_API_KEY:'fake-test-key',PHEROGENT_AI_ENABLED:'true',PHEROGENT_PUBLIC_ACCESS:'true'},chat?{runSectionReply:failure}:{runResearch:failure});
    const raw=await result.text(),last=JSON.parse(raw.trim().split('\n').at(-1));
    assert.equal(last.type,'error');assert.equal(last.error.code,code);assert.ok(last.error.message.includes(PROVIDER_ERROR_MESSAGES[code]));assert.ok(!raw.includes(SECRET));
    assert.equal(last.reservedTokens,40000);assert.equal(last.usage.unknownCalls,1);
  }
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM ai_runs').get().n,5,'Error diagnostics cannot refund reservations');
}finally{Date.now=originalNow;sql.close();}
console.log('Provider failure classification, bounded reads, route redaction and retained budgets passed.');
