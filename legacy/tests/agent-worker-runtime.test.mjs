// Exercise the real Worker Request/fetch implementation, not Node's more
// permissive RequestInit parser. All outbound traffic ends in a local mock.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const toolRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,Response:MockResponse}=toolRequire('miniflare');
const {build}=toolRequire('esbuild');
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const API='https://api.openai.com/v1/responses';
const redirectTarget='https://redirect-target.invalid/credential-collector';
const fixtureKey='worker-test-only-not-a-real-api-key';
const quote='Partial reprogramming improved visual function in older mice.';
const modelOutput=value=>new MockResponse(JSON.stringify({
  model:'gpt-5.6-terra',service_tier:'default',status:'completed',
  usage:{input_tokens:200,output_tokens:100},
  output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]
}),{headers:{'Content-Type':'application/json'}});

// Bundle the production modules in memory. No env files, build credentials,
// provider keys or application data are read by this test.
const bundled=await build({
  stdin:{resolveDir:projectRoot,sourcefile:'worker-regression-entry.mjs',contents:`
    import {runSectionReply} from './server/chat.mjs';
    import {runResearch} from './server/research.mjs';
    import {createConnectionProbe} from './server/connection-diagnostics.mjs';
    const now=()=>Date.parse('2026-10-24T12:00:00Z');
    export default {async fetch(request){
      const route=new URL(request.url).pathname;
      if(route==='/request-construction'){
        let unsupported=false;
        try{new Request('https://unused.invalid/',{redirect:'error'});}
        catch(error){unsupported=error instanceof TypeError;}
        return Response.json({unsupported,manual:new Request('https://unused.invalid/',{redirect:'manual'}).redirect});
      }
      try{
        if(route==='/diagnostic')return Response.json(await createConnectionProbe()());
        if(route==='/chat'){
          const result=await runSectionReply({stage:'methods',message:'Explain the proposed control.',context:'No experiment has run.',apiKey:${JSON.stringify(fixtureKey)},now});
          return Response.json({ok:true,reply:result.reply,calls:result.usage.calls});
        }
        const result=await runResearch({question:'Did reprogramming improve mouse visual function?',apiKey:${JSON.stringify(fixtureKey)},now});
        return Response.json({ok:true,calls:result.usage.calls,evidence:result.evidence});
      }catch(error){return Response.json({ok:false,code:error.code,calls:error.usage?.calls});}
    }};
  `},
  bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'
});

let mode='success',calls=[];
const mf=new Miniflare({
  modules:true,script:bundled.outputFiles[0].text,
  compatibilityDate:'2026-05-15',
  outboundService:async request=>{
    const url=request.url,body=request.method==='POST'?await request.text():'';
    const authorization=request.headers.get('Authorization');
    calls.push({url,body,authorization});
    // This callback is the entire outbound route. It never calls fetch().
    // Even an accidental redirect is intercepted rather than reaching a host.
    if(url===redirectTarget)return new MockResponse('Unexpected redirected request',{status:500});
    if(mode==='redirect')return new MockResponse('',{status:307,headers:{Location:redirectTarget}});
    if(url===API){
      if(body==='{}'){
        assert.equal(authorization,null,'The diagnostic must not transmit a key');
        return new MockResponse('{"error":{"code":"missing_api_key"}}',{status:401});
      }
      assert.equal(authorization,'Bearer '+fixtureKey);
      const payload=JSON.parse(body),name=payload.text?.format?.name;
      if(name==='pherogent_section_reply')return modelOutput({reply:'This control is proposed, not performed.',suggestedDraft:null});
      if(name==='pherogent_plan')return modelOutput({queries:['mouse reprogramming vision']});
      if(name==='pherogent_screen')return modelOutput({keep:[{paperId:'MED:101',reason:'Mouse visual function experiment.'}],refinementQuery:null});
      if(name==='pherogent_judge')return modelOutput({summary:{established:[],uncertain:[],nextQuestions:[]},evidence:[{
        paperId:'MED:101',claim:quote,label:'supports',quote,passageId:'abstract',studyType:'Mouse experiment',population:'Mice',mismatchNotes:[],suggestedWording:null,reason:'The abstract reports this measured outcome.'
      }]});
      throw new Error('Unexpected model operation in Worker test');
    }
    const parsed=new URL(url);
    assert.equal(parsed.origin,'https://www.ebi.ac.uk','No unapproved outbound host may be requested');
    if(mode==='source-redirect')return new MockResponse('',{status:302,headers:{Location:redirectTarget}});
    assert.ok(parsed.pathname.endsWith('/search'));
    return new MockResponse(JSON.stringify({hitCount:1,resultList:{result:[{
      source:'MED',id:'101',title:'Mouse visual function after reprogramming',pubYear:'2020',authorString:'Example A',abstractText:quote+' This study used a mouse model.',isOpenAccess:'N'
    }]}}),{headers:{'Content-Type':'application/json'}});
  }
});

async function invoke(path,nextMode='success'){
  mode=nextMode;calls=[];
  const response=await mf.dispatchFetch('http://localhost/'+path);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.ok(calls.every(call=>call.url!==redirectTarget),'No redirect target may be fetched');
  return result;
}
try{
  assert.deepEqual(await invoke('request-construction'),{unsupported:true,manual:'manual'});
  assert.equal(calls.length,0,'Request construction must not initiate network I/O');
  const chat=await invoke('chat');assert.equal(chat.ok,true);assert.equal(chat.calls,1);assert.equal(calls.length,1);
  const research=await invoke('research');assert.equal(research.ok,true);assert.equal(research.calls,3);assert.equal(research.evidence[0].quoteVerified,true);assert.equal(calls.length,4);
  assert.deepEqual(await invoke('diagnostic'),{category:'http_response',status:401,expectedUnauthorized:true,authenticated:false});assert.equal(calls.length,1);
  for(const path of ['chat','research']){
    const result=await invoke(path,'redirect');assert.equal(result.ok,false);assert.equal(result.code,'provider_redirect');assert.equal(result.calls,1);assert.equal(calls.length,1,'Rejected redirects cannot cause a retry or a follow-up request');
  }
  const diagnostic=await invoke('diagnostic','redirect');assert.equal(diagnostic.category,'redirect_rejected');assert.equal(diagnostic.status,307);assert.equal(diagnostic.expectedUnauthorized,false);assert.equal(calls.length,1);
  const source=await invoke('research','source-redirect');assert.equal(source.ok,true);assert.equal(source.evidence.length,0);assert.equal(calls.length,2,'A redirected literature source is discarded without following it');
}finally{await mf.dispose();}
console.log('Worker runtime passed: real Request/fetch on all three paths, mocked outbound only, successful replies/evidence, no redirect following or retries.');
