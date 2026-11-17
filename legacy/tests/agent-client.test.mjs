import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const code=read('public/agent.js');
const matchClaim='Partial reprogramming improves visual function in mice.';
const quote='visual function improved in mice';
function finding(overrides={}){
  return {
    question:matchClaim,
    summary:{established:['The inspected mouse study reports visual recovery.'],uncertain:['Archive retrieval is not established.'],nextQuestions:['What separates retrieval from a newly formed state?']},
    papers:[{id:'MED:33268865',title:'Mouse visual recovery',authors:['Lu Y'],year:2020,journal:'Nature',doi:'10.1038/s41586-020-2975-4',url:'https://europepmc.org/article/MED/33268865',abstract:'Researchers observed that visual function improved in mice after the intervention.',sourceText:'Researchers observed that visual function improved in mice after the intervention.',access:'abstract_only'}],
    evidence:[{paperId:'MED:33268865',claim:matchClaim,label:'supports',quote,location:'Abstract',studyType:'Animal experiment',population:'Mice',access:'abstract_only',mismatchNotes:'',suggestedWording:'',reason:'Matches the measured population and outcome.',quoteVerified:true,coverage:'Abstract only.'}],
    usage:{calls:3,inputTokens:850,outputTokens:210,totalTokens:1060,estimatedCostUsd:.00422,papersSearched:1},
    ...overrides,
  };
}
function dom(){
  const elements=new Map(),documentEvents={};
  function element(id){
    if(!elements.has(id)){
      const events={},attrs={};
      const e={id,value:'',textContent:'',innerHTML:'',checked:false,disabled:false,hidden:false,open:false,dataset:{},className:'',
        addEventListener(type,fn){(events[type]||=[]).push(fn);},
        showModal(){this.open=true;},close(){this.open=false;},
        setAttribute(name,value){attrs[name]=value;},getAttribute(name){return attrs[name];},removeAttribute(name){delete attrs[name];},
        querySelector(selector){return element(id+selector);},focus(){},setSelectionRange(){},classList:{toggle(){}},
        dispatch(type,event={}){return Promise.all((events[type]||[]).map(fn=>fn(event)));}
      };
      elements.set(id,e);
    }
    return elements.get(id);
  }
  return {element,documentEvents,document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],body:{appendChild(){}},createElement:()=>({click(){},remove(){}}),addEventListener(type,fn){(documentEvents[type]||=[]).push(fn);}}};
}
function basicSandbox(d){return {window:{},document:d.document,URL,URLSearchParams,AbortController,Response,ReadableStream,TextDecoder,TextEncoder,Blob,Intl,Date,Math,console,crypto:{randomUUID},setTimeout:()=>1,clearTimeout(){}};}
function appHarness(){
  const d=dom(),stored=new Map(),sandbox=basicSandbox(d);let adapter;
  sandbox.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox);
  const safeLink=sandbox.window.PherogentAgent.safeLink;
  sandbox.window.PherogentAgent={safeLink,init(a){adapter=a;}};
  sandbox.window.PherogentLiterature={search:async()=>({total:0,papers:[]})};
  for(const f of ['reference-data.js','cell-demo.js','research-workspace.js'])vm.runInContext(read('public/'+f),sandbox);
  const original=read('public/app.js');
  const instrumented=original.replace(/\nrender\(\);\n(?=if\(recoveryNotice\))/, '\nwindow.__test={state:()=>state,prepare,canApprove,cited,manuscriptText};\nrender();\n');
  assert.notEqual(instrumented,original,'State hooks attach only to the VM test copy');
  vm.runInContext(instrumented,sandbox);
  const click=(action,arg='')=>(d.documentEvents.click||[]).forEach(fn=>fn({target:{closest:()=>({dataset:{action,arg}})}}));
  click('dismiss-intro');
  const create=(title,question='')=>{click('new-project');d.element('newProjectTitle').value=title;d.element('newProjectQuestion').value=question;click('create-project');return sandbox.window.__test.state().activeProjectId;};
  return {...d,adapter,click,create,t:sandbox.window.__test,stored};
}
const ready={enabled:true,signedIn:false,needsSignIn:false,canRun:true,message:'Ready.',limits:{lifetimeTokens:2000000,perRunTokens:40000,perRunUsd:.1,dailyUsd:1,lifetimeUsd:10,maxQueries:3,maxPapers:10,maxModelCalls:3},budget:{lifetimeReservedTokens:0,remainingLifetimeTokens:2000000,remainingDailyUsd:1,remainingLifetimeUsd:10,userRunsRemaining:3},usage:{inputTokens:0,outputTokens:0,totalTokens:0,modelCalls:0,estimatedCostUsd:0}};
async function clientHarness(fetchImpl,status=ready){
  const d=dom(),sandbox=basicSandbox(d),saved=[],logs=[];let current={projectId:'project-origin',title:'My research',question:matchClaim,runs:[]},modalContent='',claimCurrent=true;
  vm.createContext(sandbox);
  const testable=code.replace('window.PherogentAgent={','window.__agentTest={run,session:()=>session};\n  window.PherogentAgent={');
  vm.runInContext(testable,sandbox);
  const A=sandbox.window.PherogentAgent;
  A.init({context:()=>current,beforeOpen(){},toast(){},modal(_title,html){modalContent=html;},log:(id,event)=>logs.push({id,event}),saveRun:(id,run)=>saved.push({id,run}),canReview:()=>false,saveFindings:()=>true,saveSources:()=>true,isClaimCurrent:()=>claimCurrent});
  const calls=[];
  sandbox.fetch=async(url,options)=>{calls.push({url,options});if(url==='/api/agent/status')return typeof status==='function'?status():Response.json(status);return fetchImpl(url,options);};
  await A.refreshStatus();A.show();await Promise.resolve();await Promise.resolve();await A.refreshStatus();
  d.element('agentQuestion').value=matchClaim;d.element('agentConsent').checked=true;
  return {...d,A,t:sandbox.window.__agentTest,calls,saved,logs,setContext:next=>{current=next;},modal:()=>modalContent,setClaimCurrent:value=>{claimCurrent=value;}};
}
function stream(events){return new Response(events.map(e=>JSON.stringify(e)+'\n').join(''),{headers:{'content-type':'application/x-ndjson'}});}

test('completed AI work remains bound to its originating project; saves do not approve',()=>{
  const h=appHarness(),a=h.create('Original question',matchClaim),s=h.t.state();s.draft.text='My original manuscript must not change.';h.t.prepare();
  const originalDraft=JSON.stringify(s.draft),b=h.create('Other question');s.draft.text='Other project writing stays separate.';const activeDraft=JSON.stringify(s.draft);
  h.adapter.saveRun(a,{id:'run-a',at:new Date().toISOString(),question:matchClaim,status:'completed',result:finding(),usage:finding().usage});
  assert.equal(s.activeProjectId,b);assert.equal(JSON.stringify(s.draft),activeDraft);assert.equal(s.research.aiRuns,undefined);
  const origin=s.projects.find(p=>p.id===a);assert.equal(origin.research.aiRuns[0].id,'run-a');assert.equal(JSON.stringify(origin.draft),originalDraft);
  assert.equal(h.adapter.saveFindings(a,finding()),true);assert.equal(h.adapter.saveSources(a,finding()),true);
  assert.match(origin.research.analysisNotes,/AI research check/);assert.ok(origin.papers['MED:33268865']);assert.equal(origin.draft.claims[0].decision,null);
  assert.equal(s.research.analysisNotes,'');assert.deepEqual(Object.keys(s.papers),[]);assert.equal(JSON.stringify(s.draft),activeDraft);
  assert.equal(h.adapter.saveFindings(a,finding()),false,'Explicit save is idempotent');
  h.click('switch-project',a);assert.equal(JSON.stringify(h.t.state().draft),originalDraft);assert.equal(h.t.cited().length,0);
  assert.match(h.t.state().logs.map(l=>l.detail).join(' '),/No citations approved/);
});

test('AI evidence needs an unchanged exact claim, independent source text, and explicit author approval',()=>{
  const h=appHarness(),id=h.create('Claim review',matchClaim),s=h.t.state();s.draft.text=matchClaim;h.t.prepare();
  const r=finding(),e=r.evidence[0],claim=s.draft.claims[0];
  assert.equal(h.adapter.canReview(id,r,{...e,claim:matchClaim+' Extra.'}),false,'Related wording cannot replace the author’s actual claim');
  assert.equal(h.adapter.canReview(id,{...r,papers:[{...r.papers[0],sourceText:'A different passage.'}]},e),false,'Model quoteVerified alone is insufficient');
  assert.equal(h.adapter.canReview(id,{...r,papers:[{...r.papers[0],sourceText:undefined}]},e),false,'The quote is never used as its own source text');
  assert.equal(h.adapter.canReview(id,r,{...e,quoteVerified:false}),false);
  const untouched=JSON.stringify(s.draft);assert.equal(h.adapter.reviewEvidence(id,r,e),true);assert.equal(s.draft.text,matchClaim);assert.equal(claim.decision,null);assert.equal(h.t.cited().length,0);
  assert.equal(claim.manual.aiGenerated,true);assert.equal(claim.manual.quote,quote);assert.equal(h.t.canApprove(claim),true);
  assert.equal(s.papers[e.paperId].agentSourceText,r.papers[0].sourceText);
  assert.equal(h.adapter.canReview(id,r,e),false,'An existing review is never silently overwritten');
  claim.manual.quote='A quotation that the paper never contained.';assert.equal(h.t.canApprove(claim),false);h.click('approve-manual');assert.equal(claim.decision,null);
  claim.manual.quote=quote;h.click('approve-manual');if(h.element('dialog').open)h.click('confirm-low-overlap');assert.equal(h.t.cited().length,1);assert.equal(claim.decision.type,'apply');
  h.click('undo');assert.equal(h.t.cited().length,0);assert.equal(s.draft.text,matchClaim);assert.notEqual(JSON.stringify(s.draft),untouched,'The saved AI suggestion remains available after undo');
  s.draft.text+=' Changed after review.';assert.equal(h.adapter.canReview(id,r,e),false,'Changed manuscript invalidates the review bridge');
});

test('agent stream is one POST, escapes untrusted text, and saves back to the original project',async()=>{
  let finish;const responsePromise=new Promise(resolve=>finish=resolve);
  const h=await clientHarness(async()=>responsePromise);
  const pending=h.t.run();
  h.setContext({projectId:'project-other',title:'Other',question:'A different question.',runs:[]});
  const malicious='<img src=x onerror=alert(1)>';
  const r=finding({question:malicious,summary:{established:[malicious],uncertain:[],nextQuestions:[]}});r.evidence[0].quote=malicious;r.papers[0].title=malicious;r.papers[0].url='javascript:alert(1)';
  finish(stream([{type:'start',runId:'server-run'},{type:'step',step:{actor:'AI',stage:'Search',detail:malicious}},{type:'usage',usage:r.usage},{type:'result',result:r}]));await pending;
  assert.equal(h.calls.filter(c=>c.url==='/api/check-claim').length,1);const submitted=JSON.parse(h.calls.find(c=>c.url==='/api/check-claim').options.body);assert.deepEqual(Object.keys(submitted).sort(),['consent','question','requestId']);assert.equal(submitted.consent,true);assert.equal(submitted.question,matchClaim);
  assert.equal(h.saved[0].id,'project-origin');assert.equal(h.saved[0].run.status,'completed');assert.ok(h.logs.every(x=>x.id==='project-origin'));
  const rendered=h.element('agentResult').innerHTML;assert.ok(rendered.includes('&lt;img'));assert.ok(!rendered.includes('<img'));assert.ok(!rendered.includes('href="javascript:'));
  assert.ok(h.element('agentSteps').innerHTML.includes('&lt;img'));assert.ok(!h.element('agentSteps').innerHTML.includes('<img'));
  assert.equal(h.A.safeLink('https://europepmc.org.attacker.test/'),'');assert.equal(h.A.safeLink('https://secret@europepmc.org/article/MED/33268865'),'');
});

test('disabled service and absent consent never issue a paid request; non-200 never retries',async()=>{
  let paid=0;const off=await clientHarness(async()=>{paid++;throw Error('must not run');},{...ready,enabled:false,canRun:false,reason:'not_configured',message:'Connection pending.'});
  await off.t.run();assert.equal(paid,0);assert.equal(off.element('agentRun').disabled,true);assert.match(off.element('agentStatus').innerHTML,/connection pending/i);assert.match(off.element('agentStatus').innerHTML,/Live AI is off/);
  const on=await clientHarness(async()=>{paid++;return Response.json({error:{message:'Daily allowance reached.'}},{status:429});});
  on.element('agentConsent').checked=false;await on.t.run();assert.equal(paid,0);
  on.element('agentConsent').checked=true;await on.t.run();assert.equal(paid,1);assert.equal(on.saved[0].run.status,'failed');assert.equal(on.saved[0].run.reserved,false);assert.match(on.element('agentRunStatus').textContent,/Daily allowance reached/);
});

test('unknown call usage remains marked incomplete when the status request also fails',async()=>{
  let statusCalls=0;
  const h=await clientHarness(async()=>stream([{type:'start',runId:'started'},{type:'usage',usage:{inputTokens:100,outputTokens:30,totalTokens:130,calls:1,unknownCalls:1}},{type:'error',error:{message:'The next model call timed out.'}}]),()=>{
    statusCalls++;if(statusCalls>3)return new Response('Unavailable',{status:503});return Response.json({...ready,usage:{totalTokens:0}});
  });
  // Explicitly make the final status unavailable, regardless of show/init fetch timing.
  statusCalls=10;await h.t.run();
  assert.equal(h.saved[0].run.status,'failed');assert.equal(h.saved[0].run.reserved,true);assert.equal(h.saved[0].run.usage.usageUnknown,true);
  assert.match(h.element('tokenCounter').getAttribute('aria-label'),/130 reported tokens.*Usage incomplete/);
  h.A.showUsage();assert.match(h.modal(),/not a complete bill/);assert.match(h.element('agentRunStatus').textContent,/timed out/);
});


test('research check explains scope, requires fresh consent on reopen and respects an exhausted shared pool',async()=>{
  let paid=0;
  const h=await clientHarness(async()=>{paid++;throw Error('must not run');},{...ready,canRun:false,reason:'token_budget_exhausted',message:'The shared token allowance is used up.'});
  assert.match(h.element('agentBody').innerHTML,/Plans searches → reads papers → checks passages/);
  assert.match(h.element('agentBody').innerHTML,/does not run experiments/);
  assert.match(h.element('agentStatus').innerHTML,/shared token allowance is used up/);
  assert.match(h.element('tokenCounter').getAttribute('aria-label'),/AI access limited/);
  await h.t.run();assert.equal(paid,0);
  await h.element('agentDialog').dispatch('click',{target:{closest:()=>({dataset:{agentAction:'close'}})}});
  assert.equal(h.element('agentDialog').open,false);
  h.setContext({projectId:'project-other',title:'Other research',question:'A different question.',runs:[]});
  h.A.show();
  assert.equal(h.element('agentDialog').open,true);
  assert.match(h.element('agentBody').innerHTML,/Other research/);
  assert.match(h.element('agentBody').innerHTML,/A different question/);
  assert.equal(h.element('agentConsent').checked,false,'Reopening the panel cannot reuse previous consent.');
  await h.t.run();assert.equal(paid,0);
});


test('unavailable visitor usage renders a dash rather than a fabricated zero',async()=>{
  const h=await clientHarness(async()=>{throw Error('must not run');},{...ready,enabled:false,canRun:false,usage:null,reason:'not_configured'});
  assert.equal(h.element('tokenTotal').textContent,'—');
  assert.match(h.element('tokenCounter').getAttribute('aria-label'),/usage unavailable/i);
  assert.doesNotMatch(h.element('tokenCounter').getAttribute('aria-label'),/0 reported tokens/);
  assert.equal(h.A.getUsageSnapshot().usage,null);
  h.A.showUsage();assert.match(h.modal(),/No token count or model cost has been reported/);assert.doesNotMatch(h.modal(),/\$0\.0000/);
});

test('a status network failure retains previously reported counts without claiming freshness',async()=>{
  let fail=false;
  const h=await clientHarness(async()=>{throw Error('must not run');},()=>fail?new Response('Unavailable',{status:503}):Response.json({...ready,usage:{inputTokens:100,outputTokens:23,totalTokens:123,modelCalls:1,estimatedCostUsd:.001}}));
  await new Promise(resolve=>setImmediate(resolve));
  fail=true;await h.A.refreshStatus();
  assert.equal(h.element('tokenTotal').textContent,'123');
  assert.match(h.element('tokenCounter').getAttribute('aria-label'),/123 reported tokens.*AI status unavailable/);
  assert.equal(h.A.getUsageSnapshot().usage.totalTokens,123);
  assert.equal(h.A.getUsageSnapshot().unavailable,true);
});


test('anonymous visitors see shared reservations separately from measured usage',async()=>{
  const h=await clientHarness(async()=>stream([{type:'start',runId:'public-run',reservedTokens:40000},{type:'result',result:finding()}]),{
    ...ready,budget:{...ready.budget,lifetimeReservedTokens:80000,remainingLifetimeTokens:1920000},usage:{inputTokens:90,outputTokens:10,totalTokens:100,modelCalls:1,estimatedCostUsd:.001}
  });
  assert.match(h.element('agentLimits').innerHTML,/2,000,000<\/strong><span>shared token allowance/);
  assert.match(h.element('agentLimits').innerHTML,/1,920,000<\/strong><span>allowance remaining/);
  assert.match(h.element('agentLimits').innerHTML,/40,000<\/strong><span>tokens reserved \/ run/);
  assert.match(h.element('agentBudgetNote').textContent,/80,000 tokens reserved across all visitors/);
  assert.match(h.element('agentBudgetNote').textContent,/does not refill automatically/);
  assert.equal(h.element('tokenTotal').textContent,'100','Reserved tokens do not replace reported usage');
  assert.doesNotMatch(h.element('agentStatus').innerHTML,/Sign in|approved testers/);
  h.A.showUsage();assert.match(h.modal(),/reported usage for this visitor/);assert.match(h.modal(),/allowance figures, not measured usage/);
  await h.t.run();assert.equal(h.saved[0].run.reservedTokens,40000);assert.equal(h.calls.filter(c=>c.url==='/api/check-claim').length,1,'An anonymous visitor can submit with consent');
});

test('missing shared balance is unknown, never zero or the configured pool size',async()=>{
  const h=await clientHarness(async()=>{throw Error('must not run');},{...ready,canRun:false,budget:null});
  assert.match(h.element('agentLimits').innerHTML,/—<\/strong><span>allowance remaining/);
  assert.match(h.element('agentBudgetNote').textContent,/Remaining allowance is unconfirmed/);
  assert.doesNotMatch(h.element('agentLimits').innerHTML,/2,000,000<\/strong><span>allowance remaining/);
});


test('literature history excludes section conversations',async()=>{
  const h=await clientHarness(async()=>{throw Error('No model call needed');});
  h.setContext({projectId:'project-origin',title:'Mixed history',question:matchClaim,runs:[
    {id:'chat-only',kind:'section_chat',question:'Draft a title',at:'2026-10-24T10:00:00Z',status:'completed',result:{reply:'A title idea'}},
    {id:'research-only',question:'Find a source',at:'2026-10-24T10:00:00Z',status:'completed',result:finding()}
  ]});
  h.A.show();
  assert.match(h.element('agentHistory').innerHTML,/research-only/);
  assert.doesNotMatch(h.element('agentHistory').innerHTML,/chat-only|Draft a title/);
});


function boundFinding(binding,overrides={}){
  const r=finding({question:binding.claim.text,claim:{...binding.claim,citedPaperIds:binding.citedPaperIds||[]},pipelineVersion:'claim-check-v1',scope:{mode:binding.citedPaperIds?.length?'cited_sources':'literature_search'},...overrides});
  r.evidence=r.evidence.map(e=>({...e,claim:binding.claim.text,claimId:binding.claim.id,passageId:'abstract'}));
  return r;
}
async function openBound(h,binding){h.A.show(binding);await new Promise(resolve=>setImmediate(resolve));h.element('agentConsent').checked=true;}

test('bound claim uses an immutable exact sentence and sends only canonical source IDs',async()=>{
  const binding={claim:{id:'sentence-1',text:'  '+matchClaim+'  '},citedPaperIds:['MED:33268865'],sourceSnapshots:{'MED:33268865':'local snapshot, never sent'}};
  const response=boundFinding(binding);
  const h=await clientHarness(async()=>stream([{type:'start',runId:'bound-run'},{type:'result',result:response}]));
  await openBound(h,binding);
  assert.match(h.element('agentBody').innerHTML,/Check selected sources/);
  assert.match(h.element('agentBody').innerHTML,/Original sentence · fixed/);
  assert.equal(h.element('agentQuestion').readOnly,true);
  h.element('agentQuestion').value='A changed composer cannot change the frozen sentence.';
  binding.claim.text='Mutating the caller cannot change the saved snapshot.';
  const frozen={...binding,claim:{id:'sentence-1',text:'  '+matchClaim+'  '}};
  await h.t.run();
  const payload=JSON.parse(h.calls.find(c=>c.url==='/api/check-claim').options.body);
  assert.equal(payload.question,frozen.claim.text);
  assert.deepEqual(payload.claim,frozen.claim);
  assert.deepEqual(payload.citedPaperIds,['MED:33268865']);
  assert.equal(payload.sourceSnapshots,undefined);
  assert.equal(h.saved[0].run.kind,'claim_check');
  assert.equal(h.saved[0].run.result.clientRunId,h.saved[0].run.id);
  assert.equal(h.saved[0].run.claimContext.sourceSnapshots['MED:33268865'],'local snapshot, never sent');
  assert.equal(h.saved[0].run.status,'completed');
  assert.equal(typeof h.saved[0].run.durationMs,'number');
  assert.equal(h.element('agentConsent').checked,false,'Completion cannot authorize another paid run');
  assert.match(h.element('agentResult').innerHTML,/Find additional evidence/);
});

test('a result judging different wording is discarded and the original request stays available',async()=>{
  const binding={claim:{id:'sentence-2',text:matchClaim},citedPaperIds:[]};
  const r=boundFinding(binding);r.evidence[0].claim='A narrower mouse finding.';
  const h=await clientHarness(async()=>stream([{type:'start',runId:'drift'},{type:'result',result:r}]));
  await openBound(h,binding);await h.t.run();
  assert.equal(h.saved[0].run.status,'failed');
  assert.equal(h.saved[0].run.result,null);
  assert.equal(h.saved[0].run.claimContext.claim.text,matchClaim);
  assert.equal(h.element('agentQuestion').value,matchClaim);
  assert.match(h.element('agentRunStatus').textContent,/did not match the original sentence/);
  assert.equal(h.element('agentResult').innerHTML,'');
  assert.equal(h.calls.filter(c=>c.url==='/api/check-claim').length,1);
});

test('reopening an active check cannot change its binding or create a duplicate request',async()=>{
  let finish;const pendingResponse=new Promise(resolve=>finish=resolve);
  const binding={claim:{id:'sentence-3',text:matchClaim},citedPaperIds:[]};
  const h=await clientHarness(async()=>pendingResponse);
  await openBound(h,binding);const pending=h.t.run();
  assert.equal(h.A.show({claim:{id:'other',text:'A completely different sentence.'},citedPaperIds:[]}),false);
  assert.equal(h.t.session().claimContext.claim.id,'sentence-3');
  await h.t.run();
  assert.equal(h.calls.filter(c=>c.url==='/api/check-claim').length,1);
  finish(stream([{type:'result',result:boundFinding(binding)}]));await pending;
  assert.equal(h.saved[0].run.status,'completed');
  assert.equal(h.saved[0].run.claimContext.claim.id,'sentence-3');
});

test('saved checks are free to reopen and additional searches need new consent',async()=>{
  let paid=0;
  const binding={claim:{id:'sentence-4',text:matchClaim},citedPaperIds:['MED:33268865'],sourceSnapshots:{'MED:33268865':'snapshot'}};
  const saved={id:'saved-check',at:'2026-10-31T12:00:00Z',question:matchClaim,status:'completed',kind:'claim_check',claimContext:binding,result:boundFinding(binding),steps:[]};
  const h=await clientHarness(async()=>{paid++;return stream([{type:'result',result:boundFinding({...binding,citedPaperIds:[]})}]);});
  h.setContext({projectId:'project-origin',title:'Saved project',question:matchClaim,runs:[saved]});
  h.A.showSaved('saved-check');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(paid,0);assert.equal(h.element('agentConsent').checked,false);assert.equal(h.element('agentRun').disabled,true);
  h.element('agentConsent').checked=true;await h.t.run();assert.equal(paid,0,'Saved result cannot be resubmitted by manipulating consent');
  await h.element('agentDialog').dispatch('click',{target:{closest:()=>({dataset:{agentAction:'additional-search'}})}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.element('agentConsent').checked,false);await h.t.run();assert.equal(paid,0);
  h.element('agentConsent').checked=true;await h.t.run();
  assert.equal(paid,1);
  assert.deepEqual(JSON.parse(h.calls.find(c=>c.url==='/api/check-claim').options.body).citedPaperIds,[]);
  assert.equal(h.saved[0].run.claimContext.claim.id,'sentence-4');
});

test('stale claim snapshots and invalid source choices stop before a paid request',async()=>{
  let paid=0;const h=await clientHarness(async()=>{paid++;throw Error('must not call');});
  const binding={claim:{id:'sentence-5',text:matchClaim},citedPaperIds:[]};
  await openBound(h,binding);h.setClaimCurrent(false);await h.t.run();
  assert.equal(paid,0);assert.match(h.element('agentRunStatus').textContent,/sentence or selected source changed/);
  assert.equal(h.A.show({...binding,citedPaperIds:['https://attacker.test/paper']}),false);
  assert.equal(paid,0);
});

test('opted-in sentence check transmits true after consent and rejects a response missing the study-design version',async()=>{
 const binding={claim:{id:'design-preview',text:matchClaim},citedPaperIds:[],studyDesign:true};
 const h=await clientHarness(async()=>stream([{type:'result',result:boundFinding(binding)}]));
 await openBound(h,binding);await h.t.run();
 const req=h.calls.find(c=>c.url==='/api/check-claim');assert.equal(JSON.parse(req.options.body).studyDesign,true);
 assert.equal(h.saved[0].run.status,'failed');assert.equal(h.saved[0].run.result,null);
});
