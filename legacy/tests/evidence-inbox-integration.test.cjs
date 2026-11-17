'use strict';
// Exercises the actual app, evidence records, and studio together. Provider work
// is replaced by the existing adapter boundary; no remote requests are allowed.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const KEY='pherogent-evidence-workspace-v2';
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const original='Partial reprogramming improves visual function in humans.';
const revised='Partial reprogramming improves visual function in mice.';
const source={id:'MED:33268865',title:'Mouse visual recovery',authors:['Lu Y'],year:2020,journal:'Nature',doi:'10.1038/s41586-020-2975-4',pmid:'33268865',pmcid:'',url:'https://europepmc.org/article/MED/33268865',abstract:'Researchers observed that visual function improved in mice after the intervention.',sourceText:'Researchers observed that visual function improved in mice after the intervention.',access:'abstract_only'};
const quote='visual function improved in mice';

function harness(saved){
  const elements=new Map(),events={},stored=new Map(saved?[[KEY,saved]]:[]),shows=[],opened=[],downloads=[],blobs=new Map();
  let agent,studio,networkCalls=0;
  function element(id){
    if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',hidden:false,open:false,disabled:false,checked:false,dataset:{},style:{},scrollTop:0,scrollHeight:100,
      addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},setSelectionRange(){},setAttribute(){},removeAttribute(){},classList:{add(){},remove(){},toggle(){}},querySelector:selector=>element(id+selector),querySelectorAll:()=>[],closest:()=>null});
    return elements.get(id);
  }
  class LocalURL extends URL {static createObjectURL(blob){const id='blob:test-'+blobs.size;blobs.set(id,blob);return id;}static revokeObjectURL(){}}
  const sandbox={window:{},URL:LocalURL,URLSearchParams,AbortController,Blob,Intl,Date,Math,console,setTimeout:()=>1,clearTimeout(){},
    fetch:async()=>{networkCalls++;throw Error('Evidence integration must not call a remote service.');},
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
    document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}},
      createElement:()=>({click(){downloads.push({name:this.download,blob:blobs.get(this.href)});},remove(){}}),addEventListener(type,fn){(events[type]||=[]).push(fn);}}
  };
  sandbox.window.PherogentAgent={init:a=>{agent=a;},show:options=>shows.push(clone(options)),showSaved:id=>opened.push(id),safeLink:value=>{try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='europepmc.org'?url.href:'';}catch{return '';}},getUsageSnapshot:()=>({status:{enabled:false,canRun:false},usage:null})};
  vm.createContext(sandbox);
  for(const f of ['reference-data.js','cell-demo.js','research-workspace.js','studio-data.js','studio.js','evidence-inbox.js'])vm.runInContext(read(f),sandbox);
  const initStudio=sandbox.window.PherogentStudio.init;
  sandbox.window.PherogentStudio.init=bridge=>{studio=bridge;return initStudio(bridge);};
  vm.runInContext(read('app.js'),sandbox);
  const dispatch=(type,target)=>Promise.all((events[type]||[]).map(fn=>fn({target,preventDefault(){},stopPropagation(){}})));
  const click=(action,arg='',prefix='')=>{
    const selector=prefix?'[data-'+prefix+'-action]':'[data-action]';
    const button={dataset:prefix?{[prefix+'Action']:action,[prefix+'Arg']:arg}:{action,arg},closest:s=>s===selector?button:null};
    return dispatch('click',button);
  };
  const input=(id,value)=>{const target=element(id);target.value=value;return dispatch('input',target);};
  return {element,click,input,dispatch,shows,opened,downloads,agent,studio,modules:sandbox.window,state:()=>JSON.parse(stored.get(KEY)),raw:()=>stored.get(KEY),networkCalls:()=>networkCalls};
}

async function project(text=original){
  const h=harness();await h.click('dismiss-intro');await h.click('new-project');h.element('newProjectTitle').value='Evidence integration';h.element('newProjectQuestion').value='What does the study establish?';await h.click('create-project');
  await h.input('draftText',text);await h.click('prepare');
  h.agent.saveSources(h.state().activeProjectId,{papers:[clone(source)]});
  await h.click('use-saved-paper',source.id);
  return h;
}
function runFor(h,claim,{id='claim-run',cited=true,label='partial'}={}){
  const ids=cited?[source.id]:[],claimContext={claim:{id:claim.id,text:claim.text},citedPaperIds:ids,sourceSnapshots:cited?{[source.id]:h.modules.PherogentEvidence.sourceSnapshot(h.state().papers[source.id])}:{}};
  const usage={calls:1,modelCalls:1,inputTokens:100,outputTokens:50,totalTokens:150,estimatedCostUsd:.001,papersSearched:1};
  const result={clientRunId:id,pipelineVersion:'claim-check-v1',question:claim.text,claim:{...claimContext.claim,citedPaperIds:ids},scope:{mode:cited?'cited_sources':'literature_search'},papers:[clone(source)],
    evidence:[{paperId:source.id,claimId:claim.id,claim:claim.text,label,quote,passageId:'abstract',location:'Abstract excerpt',studyType:'Animal experiment',population:'Mice',access:'abstract_only',mismatchNotes:['Mice were studied; human outcomes were not measured.'],suggestedWording:label==='partial'?revised:null,reason:'The measured population does not establish the original human claim.',quoteVerified:true,coverage:'Abstract excerpt only.'}],
    summary:{established:[],uncertain:['Human outcomes were not measured.'],nextQuestions:[]},usage};
  return {id,kind:'claim_check',at:'2026-10-31T12:00:00Z',question:claim.text,status:'completed',claimContext,result,steps:[{stage:'verify',detail:'Quote verified.',actor:'System'}],usage,durationMs:1200,reserved:true,reservedTokens:40000};
}
function saveRun(h,run){h.agent.saveRun(h.state().activeProjectId,run);}
async function approve(h){await h.click('approve-manual');if(h.element('dialog').open&&/Approve despite warning/.test(h.element('dialogContent').innerHTML))await h.click('confirm-low-overlap');}


test('starting a selected-source check captures the exact manuscript sentence and source snapshot',async()=>{
  const h=await project(),before=h.state(),claim=before.draft.claims[0];
  await h.click('check-sentence',claim.id);
  assert.match(h.element('dialogContent').innerHTML,/Check|ONE SENTENCE/);
  assert.match(h.element('dialogContent').innerHTML,new RegExp('value="'+source.id+'" selected'));
  h.element('claimCheckSource').value=source.id;await h.click('confirm-claim-check',claim.id);
  assert.equal(h.shows.length,1);assert.equal(h.opened.length,0);
  assert.deepEqual(h.shows[0].claim,{id:claim.id,text:claim.text});
  assert.deepEqual(h.shows[0].citedPaperIds,[source.id]);
  assert.equal(h.shows[0].sourceSnapshots[source.id],h.modules.PherogentEvidence.sourceSnapshot(before.papers[source.id]));
  assert.equal(h.agent.isClaimCurrent(before.activeProjectId,h.shows[0]),true);
  assert.deepEqual(h.state().draft,before.draft,'Preparing consent cannot edit or approve the manuscript.');
  assert.equal(h.networkCalls(),0);
});

test('an unchanged matching check reopens its saved run instead of preparing another paid check',async()=>{
  const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim);saveRun(h,run);
  await h.click('check-sentence',claim.id);h.element('claimCheckSource').value=source.id;await h.click('confirm-claim-check',claim.id);
  assert.deepEqual(h.opened,[run.id]);assert.equal(h.shows.length,0);
  assert.match(h.element('toast').textContent,/No new AI request/);
  assert.equal(h.state().draft.claims[0].decision,null);
  const reloaded=harness(h.raw());await reloaded.click('view','review');await reloaded.click('check-sentence',claim.id);reloaded.element('claimCheckSource').value=source.id;await reloaded.click('confirm-claim-check',claim.id);
  assert.deepEqual(reloaded.opened,[run.id]);assert.equal(reloaded.shows.length,0);
  assert.equal(h.networkCalls()+reloaded.networkCalls(),0);
});

test('identical sentence text never attaches an AI result to the wrong claim ID',async()=>{
  const h=await project(original+' '+original),claims=h.state().draft.claims;
  assert.equal(claims.length,2);assert.notEqual(claims[0].id,claims[1].id);
  const run=runFor(h,claims[1],{cited:false});saveRun(h,run);
  assert.equal(h.agent.reviewEvidence(h.state().activeProjectId,run.result,run.result.evidence[0]),true);
  const after=h.state();
  assert.equal(after.selected.draft,claims[1].id);
  assert.equal(after.draft.claims[0].manual.verdict,'unreviewed','The first sentence retains its unrelated manual review.');
  assert.equal(after.draft.claims[0].manual.evidenceRunId,undefined);
  assert.equal(after.draft.claims[1].manual.evidenceRunId,run.id);
  assert.equal(after.draft.claims[1].manual.evidenceKey,run.id+':'+source.id);
  assert.ok(after.draft.claims.every(c=>c.decision===null));
  const wrong={...run.result.evidence[0],claimId:claims[0].id};
  assert.equal(h.agent.canReview(after.activeProjectId,run.result,wrong),false);
  assert.equal(h.networkCalls(),0);
});

test('editing an original sentence makes its saved AI evidence stale and blocks approval',async()=>{
  const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim);saveRun(h,run);
  assert.equal(h.agent.reviewEvidence(h.state().activeProjectId,run.result,run.result.evidence[0]),true);
  await h.input('draftText','A new version of the human claim now includes a different measured outcome.');
  await h.click('approve-manual');await h.click('view','review');
  assert.equal(h.state().draft.claims[0].decision,null);
  assert.equal(h.agent.isClaimCurrent(h.state().activeProjectId,run.claimContext),false);
  assert.equal(h.agent.canReview(h.state().activeProjectId,run.result,run.result.evidence[0]),false);
  assert.equal(h.studio.context().evidenceRecords[0].status,'needs_recheck');
  assert.match(h.element('main').innerHTML,/Needs rechecking/);
  assert.equal(h.networkCalls(),0);
});

test('a changed saved source blocks approval even when its quotation still matches',async()=>{
  const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim);saveRun(h,run);
  h.agent.reviewEvidence(h.state().activeProjectId,run.result,run.result.evidence[0]);
  const updated=h.state();updated.papers[source.id].title='A source record changed after the check';
  const reloaded=harness(JSON.stringify(updated));await reloaded.click('view','review');
  assert.match(reloaded.element('main').innerHTML,/Needs rechecking/);
  assert.match(reloaded.element('main').innerHTML,/id="manualApprove"[^>]*disabled/);
  assert.equal(reloaded.studio.context().evidenceRecords[0].status,'needs_recheck');
  await reloaded.click('approve-manual');
  assert.equal(reloaded.state().draft.claims[0].decision,null);
  assert.equal(reloaded.studio.context().citationCount,0);
  assert.equal(h.networkCalls()+reloaded.networkCalls(),0);
});

test('author approval exposes reusable evidence and exports preserve the original claim, decision and AI run',async()=>{
  const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim);saveRun(h,run);
  assert.equal(h.studio.context().evidenceRecords[0].status,'awaiting_author');
  await h.click('open-evidence',run.id+':'+source.id);await approve(h);
  const after=h.state(),record=h.studio.context().evidenceRecords[0];
  assert.equal(after.draft.text,revised);
  assert.equal(after.draft.claims[0].decision.evidenceRunId,run.id);
  assert.equal(record.status,'approved');assert.match(record.reason,/Author approved a revision/);assert.match(h.element('main').innerHTML,/<h2>Revision and citation approved\.<\/h2>/);assert.equal(record.claim,original);assert.equal(record.currentText,revised);assert.equal(record.fresh,true);
  await h.click('open-stage','discussion','studio');await h.click('input-add','','studio');
  assert.match(h.element('dialogContent').innerHTML,/APPROVED EVIDENCE/);
  assert.match(h.element('dialogContent').innerHTML,/Use in this workspace/);
  await h.click('attach-evidence',record.key,'studio');
  const input=h.state().research.agentWorkspace.agents.discussion.inputs.find(i=>i.evidenceRef?.key===record.key);
  assert.ok(input);assert.match(input.text,/ORIGINAL SENTENCE CHECKED/);assert.ok(input.text.includes(original));assert.ok(input.text.includes(revised));assert.ok(input.text.includes(quote));
  await h.click('export-evidence');await h.click('export-log');await h.click('export-md');
  const evidence=await h.downloads.find(d=>d.name==='pherogent-evidence-trail.md').blob.text();
  assert.ok(evidence.includes(original));assert.ok(evidence.includes(quote));assert.match(evidence,/approved/);assert.ok(evidence.includes(run.id));assert.match(evidence,/150 tokens/);
  const log=JSON.parse(await h.downloads.find(d=>d.name==='pherogent-review-log.json').blob.text());
  assert.equal(log.liveAI,true);assert.equal(log.aiRuns[0].id,run.id);assert.equal(log.evidence[0].status,'approved');
  assert.ok(log.actions.some(action=>action.evidenceRunId===run.id&&action.type==='Wording / citation approved'));
  const manuscript=await h.downloads.find(d=>d.name==='pherogent-manuscript.md').blob.text();
  assert.ok(manuscript.includes(revised+' [1]'));assert.ok(manuscript.includes(source.doi));
  assert.equal(h.networkCalls(),0);
});

test('reopening an AI card never overwrites an author-edited assessment',async()=>{
 const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim);saveRun(h,run);h.agent.reviewEvidence(h.state().activeProjectId,run.result,run.result.evidence[0]);
 await h.input('manualNote','My additional methodological concern must be preserved.');
 assert.equal(h.agent.canReview(h.state().activeProjectId,run.result,run.result.evidence[0]),false);
 assert.equal(h.agent.reviewEvidence(h.state().activeProjectId,run.result,run.result.evidence[0]),false);
 assert.equal(h.state().draft.claims[0].manual.note,'My additional methodological concern must be preserved.');
});
test('bound evidence cannot enter author review until its completed run has been saved',async()=>{
 const h=await project(),run=runFor(h,h.state().draft.claims[0]);
 assert.equal(h.agent.canReview(h.state().activeProjectId,run.result,run.result.evidence[0]),false);
 saveRun(h,run);assert.equal(h.agent.canReview(h.state().activeProjectId,run.result,run.result.evidence[0]),true);
});
test('source changes while low-overlap confirmation is open cancel citation approval',async()=>{
 const h=await project(),run=runFor(h,h.state().draft.claims[0]);saveRun(h,run);h.agent.reviewEvidence(h.state().activeProjectId,run.result,run.result.evidence[0]);
 await h.input('manualRevision','The clinical participants experienced durable safety benefits.');await h.click('approve-manual');
 assert.match(h.element('dialogContent').innerHTML,/Approve despite warning/);
 h.studio.context().papers.find(p=>p.id===source.id).year=2025;
 await h.click('confirm-low-overlap');assert.equal(h.state().draft.claims[0].decision,null);assert.match(h.element('toast').textContent,/changed/);
});
test('unchanged prepared sentences retain IDs and reuse checks after unrelated manuscript edits',async()=>{
 const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim);saveRun(h,run);
 await h.input('draftText',original+' A separate sentence was added for further investigation.');await h.click('prepare');
 assert.equal(h.state().draft.claims[0].id,claim.id);
 assert.equal(h.studio.context().evidenceRecords[0].fresh,true);
 await h.click('check-sentence',claim.id);h.element('claimCheckSource').value=source.id;await h.click('confirm-claim-check',claim.id);
 assert.deepEqual(h.opened,[run.id]);assert.equal(h.shows.length,0);
});


test('approving support without changing wording reports a citation approval, and undo restores pending labels',async()=>{
  const h=await project(revised),claim=h.state().draft.claims[0],run=runFor(h,claim,{label:'supports'});saveRun(h,run);
  await h.click('open-evidence',run.id+':'+source.id);
  assert.match(h.element('main').innerHTML,/AI SUGGESTION · AUTHOR APPROVAL REQUIRED/);
  await approve(h);
  const record=h.studio.context().evidenceRecords[0];
  assert.equal(h.state().draft.text,revised);
  assert.equal(record.status,'approved');
  assert.equal(record.reason,'Author approved the citation without changing the sentence.');
  assert.match(h.element('main').innerHTML,/AI ASSESSMENT · APPROVED BY AUTHOR/);
  assert.match(h.element('main').innerHTML,/<h2>Citation approved\.<\/h2>/);
  assert.doesNotMatch(h.element('main').innerHTML,/AI SUGGESTION · AUTHOR APPROVAL REQUIRED|Author approved a revision/);
  await h.click('undo');
  assert.equal(h.studio.context().evidenceRecords[0].status,'awaiting_author');
  assert.match(h.element('main').innerHTML,/AI SUGGESTION · AUTHOR APPROVAL REQUIRED/);
  assert.match(h.element('main').innerHTML,/<h2>Inspect the evidence\.<\/h2>/);
  assert.equal(h.networkCalls(),0);
});

test('Inbox surfaces a missing selected source alongside accepted evidence, and offers a consent-gated next step',async()=>{
 const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim),missing='MED:404';
 run.claimContext.citedPaperIds.push(missing);run.result.claim.citedPaperIds=[source.id,missing];
 run.result.scope={mode:'cited_sources',requestedPaperIds:[source.id,missing],retrievedPaperIds:[source.id],unavailablePaperIds:[missing],unreadablePaperIds:[]};
 saveRun(h,run);await h.click('view','review');const html=h.element('main').innerHTML;
 assert.match(html,/1 of 2 with a matched quote/);assert.match(html,/Record not retrieved/);assert.match(html,/AI assessment: Partly supports\. Author review: Waiting for you/);
 assert.match(html,/Choose a source or search/);assert.match(html,/<details class="source-coverage" open>/);
 await h.click('check-sentence',claim.id);
 assert.match(h.element('dialogContent').innerHTML,/Find evidence in Europe PMC/);assert.match(h.element('dialogContent').innerHTML,/Continue to consent/);
 assert.equal(h.shows.length,0);assert.equal(h.state().draft.claims[0].decision,null);
 await h.click('export-evidence');
 const trail=await h.downloads.find(d=>d.name==='pherogent-evidence-trail.md').blob.text();
 assert.match(trail,/MED:404 — Record not retrieved/);assert.match(trail,/Not assessed|not assessed/);assert.ok(trail.includes(quote));
 assert.equal(h.networkCalls(),0);
});

test('a zero-card check shows its actual access gap instead of a generic empty inbox',async()=>{
 const h=await project(),claim=h.state().draft.claims[0],run=runFor(h,claim);
 run.result.papers=[{...source,abstract:'',sourceText:''}];run.result.evidence=[];run.result.scope.unreadablePaperIds=[source.id];
 saveRun(h,run);await h.click('view','review');const html=h.element('main').innerHTML;
 assert.match(html,/Record found; no readable text/);assert.match(html,/0 of 1 with a matched quote/);
 assert.doesNotMatch(html,/No evidence cards match this filter|No verified evidence card returned/);
 assert.match(html,/Choose a source or search/);assert.equal(h.networkCalls(),0);
});

test('opt-in does not reopen an unguarded run; a guarded result preserves the model suggestion and author control on export',async()=>{
  const h=await project(),claim=h.state().draft.claims[0],plain=runFor(h,claim);saveRun(h,plain);
  await h.click('check-sentence',claim.id);
  assert.match(h.element('dialogContent').innerHTML,/Apply the study-design check \(preview\)/);
  h.element('claimStudyDesign').checked=true;h.element('claimCheckSource').value=source.id;
  await h.click('confirm-claim-check',claim.id);
  assert.equal(h.shows[0].studyDesign,true);assert.equal(h.opened.length,0);
  const guarded=runFor(h,claim,{id:'guarded',label:'unsupported'});
  guarded.claimContext.studyDesign=true;guarded.result.studyDesignVersion='same-cell-tracking-v1';
  guarded.result.evidence[0].designCheck={rule:'same-cell-tracking-v1',status:'unknown',reason:'Tracking details were not available.',modelLabel:'supports',adjusted:true};
  saveRun(h,guarded);await h.click('view','review');assert.match(h.element('main').innerHTML,/Cannot assess tracking from these excerpts/);
  assert.match(h.modules.PherogentEvidence.markdown(h.state()),/Original AI suggestion: Supports; final assessment: Not established/);
  await h.click('check-sentence',claim.id);h.element('claimStudyDesign').checked=true;h.element('claimCheckSource').value=source.id;await h.click('confirm-claim-check',claim.id);
  assert.deepEqual(h.opened,['guarded']);assert.equal(h.state().draft.claims[0].decision,null);assert.equal(h.networkCalls(),0);
});
