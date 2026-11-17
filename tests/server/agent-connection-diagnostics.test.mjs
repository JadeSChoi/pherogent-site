import assert from 'node:assert/strict';
import {inspectApiCredential,classifyTransportError,createConnectionProbe} from '../../worker/server/connection-diagnostics.mjs';
import {getStatus,runSectionChat,runCheck} from './route.mjs';

const secret='test-secret-never-returned';
assert.equal(classifyTransportError(new TypeError('Invalid redirect value, must be one of "follow" or "manual"')),'unsupported_request_option');
assert.deepEqual(inspectApiCredential(' \n'+secret+'\t').diagnostics,{present:true,headerValid:true,trimmed:true,shape:'ready'});
assert.equal(inspectApiCredential(' \n'+secret+'\t').value,secret);
for(const [value,shape] of [[null,'missing'],['','missing'],['x\ny','internal_whitespace'],['key with spaces','internal_whitespace'],['x\u0000y','invalid_header'],['x💡y','invalid_header'],['"test-key"','quoted_value'],['sk-...','masked_value'],['sk-***','masked_value'],['x'.repeat(4097),'too_long']]){
  const result=inspectApiCredential(value);assert.equal(result.value,'');assert.equal(result.diagnostics.headerValid,false);assert.equal(result.diagnostics.shape,shape);
}
for(const [message,category] of [['Illegal invocation: incorrect this reference','fetch_binding'],['Cannot perform I/O in a global scope outside a request','request_context'],['Invalid header value','invalid_header'],['Network egress blocked','blocked_network'],['Request timed out','timeout'],[secret,'transport_failure']]){
  assert.equal(classifyTransportError(new Error(message)),category);
}
{
  let calls=0;const probe=createConnectionProbe(async(url,init)=>{
    calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.method,'POST');assert.equal(init.body,'{}');assert.equal(init.redirect,'manual');
    assert.equal(new Headers(init.headers).get('Authorization'),null);assert.deepEqual(Object.keys(init.headers),['Content-Type']);
    assert.ok(!JSON.stringify(init).includes(secret));return new Response(secret,{status:401});
  });
  const [a,b]=await Promise.all([probe(),probe()]);assert.equal(b.category,'in_progress');assert.deepEqual(a,{category:'http_response',status:401,expectedUnauthorized:true,authenticated:false});assert.equal(calls,1);assert.deepEqual(await probe(),a);assert.equal(calls,1);
}
{
  let calls=0;const probe=createConnectionProbe(async()=>{calls++;throw new Error('Egress blocked '+secret);});
  const result=await probe();assert.equal(result.category,'blocked_network');assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes(secret));
}
{
  const start=Date.now();const probe=createConnectionProbe(()=>new Promise(()=>{}));
  assert.equal((await probe()).category,'timeout');assert.ok(Date.now()-start<4500);
}
const originalNow=Date.now;Date.now=()=>Date.parse('2026-10-24T12:00:00Z');
try{
  let probes=0,writes=0;
  const env={OPENAI_API_KEY:secret,PHEROGENT_AI_ENABLED:'false'};
  const deps={probeConnection:async()=>{probes++;return {category:'http_response',status:401,expectedUnauthorized:true,authenticated:false};}};
  const plain=await (await getStatus(new Request('https://test.example/api/agent/status'),env,deps)).json();
  assert.equal(probes,0);assert.equal(plain.credential.headerValid,true);assert.ok(!JSON.stringify(plain).includes(secret));
  const checked=await (await getStatus(new Request('https://test.example/api/agent/status?connection_check=1'),env,deps)).json();
  assert.equal(probes,1);assert.equal(checked.connectionDiagnostic.status,401);assert.equal(checked.enabled,false);assert.equal(checked.budget,null);
  const enabled=await (await getStatus(new Request('https://test.example/api/agent/status?connection_check=1'),{...env,PHEROGENT_AI_ENABLED:'true'},deps)).json();
  assert.equal(probes,1);assert.equal(enabled.connectionDiagnostic.category,'disabled_only');
  // Malformed headers are rejected before any ledger reservation or runner call.
  const badEnv={PHEROGENT_AI_ENABLED:'true',PHEROGENT_PUBLIC_ACCESS:'true',OPENAI_API_KEY:'bad\nkey',DB:{prepare(){writes++;throw new Error('must not touch ledger');}}};
  for(const chat of [true,false]){
    const request=new Request('https://test.example/api/'+(chat?'agent/chat':'check-claim'),{method:'POST',headers:{origin:'https://test.example','content-type':'application/json','oai-authenticated-user-id':'author'},body:JSON.stringify({requestId:crypto.randomUUID(),consent:true,...(chat?{stage:'methods',message:'test',context:''}:{question:'test'})})});
    const response=await (chat?runSectionChat:runCheck)(request,badEnv,{runSectionReply(){throw new Error('must not run');},runResearch(){throw new Error('must not run');}});
    assert.equal((await response.json()).error.code,'invalid_credential_format');assert.equal(writes,0);
  }
}finally{Date.now=originalNow;}
console.log('Connection diagnostics passed: no credentials/input/generation, bounded cached probe, safe categories, no default network or invalid-key reservations.');
