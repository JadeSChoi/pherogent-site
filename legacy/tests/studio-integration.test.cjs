'use strict';
// Loads the real application and studio together. State is observed through the
// existing localStorage save format; no production test hooks are required.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KEY='pherogent-evidence-workspace-v2';
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');

function harness(saved,withStudio=true,options={}) {
  const elements=new Map(),events={},stored=new Map(saved?[[KEY,saved]]:[]);
  let networkCalls=0;
  function element(id) {
    if(!elements.has(id)) elements.set(id,{id,value:'',innerHTML:'',textContent:'',hidden:false,open:false,disabled:false,checked:false,dataset:{},style:{},scrollTop:0,scrollHeight:100,
      addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},setSelectionRange(){},
      setAttribute(){},removeAttribute(){},classList:{add(){},remove(){},toggle(){}},
      querySelector:selector=>element(id+selector),querySelectorAll:()=>[],closest:()=>null});
    return elements.get(id);
  }
  const sandbox={window:{},URL,URLSearchParams,AbortController,Blob,Intl,Date,Math,console,
    setTimeout:()=>1,clearTimeout(){},
    fetch:async()=>{networkCalls++;throw Error('This integration workflow must not call a remote service.');},
    localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
    document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],
      body:{appendChild(){},classList:{add(){},remove(){},toggle(){}}},
      createElement:()=>({click(){},remove(){}}),addEventListener(type,fn){(events[type]||=[]).push(fn);}}
  };
  if(options.usage)sandbox.window.PherogentAgent={init(){},getUsageSnapshot:()=>JSON.parse(JSON.stringify(options.usage))};
  vm.createContext(sandbox);
  for(const f of ['reference-data.js','cell-demo.js','research-workspace.js',...(withStudio?['studio-data.js','studio.js']:[]),...(options.modules||[]),'app.js'])vm.runInContext(read(f),sandbox);
  const dispatch=(type,target)=>Promise.all((events[type]||[]).map(fn=>fn({target,preventDefault(){},stopPropagation(){}})));
  const click=(action,arg='',studio=false)=>{
    const prefix=studio===true?'studio':typeof studio==='string'?studio:'';
    const button={dataset:prefix?{[prefix+'Action']:action,[prefix+'Arg']:arg}:{action,arg},closest:selector=>selector===(prefix?'[data-'+prefix.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'-action]':'[data-action]')?button:null};
    return dispatch('click',button);
  };
  const input=(id,value,dataset={})=>{const target=element(id);target.value=value;target.dataset=dataset;return dispatch('input',target);};
  const state=()=>JSON.parse(stored.get(KEY));
  const emit=(type,detail)=>Promise.all((events[type]||[]).map(fn=>fn({detail})));
  return {element,click,input,state,dispatch,emit,raw:()=>stored.get(KEY),networkCalls:()=>networkCalls,modules:sandbox.window};
}

async function legacyFixture() {
  // Generate the pre-studio format through ordinary existing product actions.
  const h=harness(undefined,false);await h.click('dismiss-intro');await h.click('open-sample');
  const originId=h.state().activeProjectId;
  await h.click('approve-demo');
  if(h.element('dialog').open)await h.click('confirm-low-overlap');
  assert.ok(h.state().draft.claims.some(c=>c.decision?.type==='apply'),'The fixture contains a real existing author-approved citation.');
  await h.input('source-note','My author note must survive the workspace redesign.',{sourceNote:'MED:27347753'});
  await h.click('new-project');h.element('newProjectTitle').value='Previously saved second project';h.element('newProjectQuestion').value='Independent question';await h.click('create-project');
  const otherId=h.state().activeProjectId;await h.input('draftText','An unrelated manuscript already exists in this second project.');
  await h.click('switch-project',originId);
  const before=h.state();assert.equal(before.studioLayoutVersion,undefined);assert.equal(before.research.agentWorkspace,undefined);
  return {raw:h.raw(),before,originId,otherId};
}

test('v2 migration and project switching preserve manuscripts, citation decisions and source notes with the real studio loaded',async()=>{
  const fixture=await legacyFixture(),h=harness(fixture.raw,true),migrated=h.state();
  assert.equal(migrated.studioLayoutVersion,1);assert.equal(migrated.view,'studio');
  assert.ok(migrated.research.agentWorkspace.agents.results);
  assert.deepEqual(migrated.draft,fixture.before.draft,'Migration preserves manuscript text, prepared spans, approvals and undo provenance byte-for-byte.');
  assert.deepEqual(migrated.papers,fixture.before.papers);
  assert.deepEqual(migrated.research.sourceNotes,fixture.before.research.sourceNotes);
  assert.deepEqual(migrated.logs,fixture.before.logs,'Opening the new UI does not rewrite the existing decision history.');
  await h.click('open-stage','results',true);await h.input('studioComposer','Unsent request scoped to the original project.');
  await h.click('switch-project',fixture.otherId);
  assert.equal(h.state().draft.text,'An unrelated manuscript already exists in this second project.');
  assert.equal(h.state().research.agentWorkspace.agents.results.composer,'');
  await h.click('open-stage','methods',true);await h.input('studioOutputBody','A proposed protocol for the other project.');
  await h.click('switch-project',fixture.originId);
  assert.deepEqual(h.state().draft,fixture.before.draft);
  assert.deepEqual(h.state().research.sourceNotes,fixture.before.research.sourceNotes);
  assert.equal(h.state().research.agentWorkspace.agents.results.composer,'Unsent request scoped to the original project.');
  assert.equal(h.state().research.agentWorkspace.agents.methods.output.body,'');
  const reloaded=harness(h.raw(),true);
  assert.deepEqual(reloaded.state().draft,fixture.before.draft,'A browser reload retains the exact saved citation decisions.');
  assert.equal(reloaded.state().research.agentWorkspace.agents.results.composer,'Unsent request scoped to the original project.');
  assert.equal(h.networkCalls()+reloaded.networkCalls(),0);
});

test('studio append and undo preserve existing writing and refuse to erase later manuscript edits',async()=>{
  const fixture=await legacyFixture(),h=harness(fixture.raw,true),original=h.state().draft;
  await h.click('open-stage','methods',true);await h.input('studioOutputTitle','Author methods proposal');
  await h.input('studioOutputBody','Proposed protocol only. No new experiment was performed.');
  await h.click('review-output','',true);await h.click('insert-output','',true);
  assert.equal(h.state().draft.text,original.text,'Previewing an insertion does not change the manuscript.');
  await h.click('confirm-insert','',true);
  const inserted=h.state();
  assert.ok(inserted.draft.text.startsWith(original.text+'\n\n## Author methods proposal'));
  assert.deepEqual(inserted.draft.claims,original.claims,'Appending a section retains existing reviewed claim spans and citation decisions.');
  assert.equal(inserted.draft.baseText,inserted.draft.text,'An append-only insertion keeps previously reviewed spans valid.');
  assert.equal(inserted.research.agentWorkspace.lastInsertion.previousBaseText,original.baseText,'Undo retains the exact prior review baseline.');
  assert.ok(inserted.draft.claims.every(c=>c.end<=original.text.length),'The new section has no automatically prepared or approved claims.');
  await h.click('view','review');
  assert.match(h.element('main').innerHTML,/reference-list/,'Existing approved citations remain visible after appending the new, unreviewed section.');
  assert.equal(inserted.research.agentWorkspace.lastInsertion.before,original.text);
  await h.click('undo-insertion','',true);
  assert.deepEqual(h.state().draft,original,'Undo restores exactly the original manuscript and its citation state.');
  assert.equal(h.state().research.agentWorkspace.lastInsertion,undefined);
  assert.match(h.state().research.agentWorkspace.agents.methods.output.body,/Proposed protocol/,'Undo does not delete the stage draft.');

  await h.click('insert-output','',true);await h.click('confirm-insert','',true);
  const after=h.state().draft.text,newer=after+'\n\nA later author edit must not be discarded.';
  await h.input('draftText',newer);await h.click('undo-insertion','',true);
  assert.equal(h.state().draft.text,newer,'Undo refuses to erase unrelated edits made after the insertion.');
  assert.ok(h.state().research.agentWorkspace.lastInsertion,'The recorded insertion is retained for recovery when undo is refused.');
  assert.match(h.element('toast').textContent,/protect your newer edits/);
  assert.equal(h.networkCalls(),0);
});

test('append-only insertion does not make an already edited manuscript pass its old evidence review',async()=>{
  const fixture=await legacyFixture(),h=harness(fixture.raw,true),original=h.state().draft;
  const edited=original.text+'\n\nAn author added this unreviewed finding before insertion.';
  await h.input('draftText',edited);
  await h.click('open-stage','methods',true);await h.input('studioOutputTitle','Proposed follow-up');
  await h.input('studioOutputBody','A local planning section awaiting scientific assessment.');
  await h.click('review-output','',true);await h.click('insert-output','',true);await h.click('confirm-insert','',true);
  assert.ok(h.state().draft.text.startsWith(edited));
  assert.equal(h.state().draft.baseText,original.baseText,'Appending cannot silently validate earlier unrelated edits.');
  assert.notEqual(h.state().draft.text,h.state().draft.baseText);
  assert.deepEqual(h.state().draft.claims,original.claims);
  await h.click('undo-insertion','',true);
  assert.equal(h.state().draft.text,edited,'Undo removes only the appended section, preserving pre-existing author edits.');
  assert.equal(h.state().draft.baseText,original.baseText);
  assert.equal(h.networkCalls(),0);
});

test('map review actions open the intended panel and reflect only author-copied handoffs',async()=>{
  const fixture=await legacyFixture(),h=harness(fixture.raw,true,{modules:['research-map.js']});
  await h.click('dismiss-intro');
  await h.click('open-stage','results',true);
  await h.input('studioOutputTitle','Author results draft');
  await h.input('studioOutputBody','A proposed analysis. No experiment has been run.');
  await h.click('view','map');
  await h.click('review-draft','results','map');
  assert.equal(h.state().view,'studio');
  assert.equal(h.state().research.agentWorkspace.activeStage,'results');
  assert.equal(h.state().research.agentWorkspace.sideTab,'output');
  assert.match(h.element('main').innerHTML,/data-side-open="true"/);
  assert.equal(h.state().research.agentWorkspace.agents.results.output.status,'draft','Opening a draft does not approve it.');
  await h.click('review-output','',true);
  await h.click('handoff','',true);
  await h.click('confirm-handoff','discussion',true);
  const input=h.state().research.agentWorkspace.agents.discussion.inputs[0];
  assert.equal(input.kind,'handoff');assert.equal(input.fromStage,'results');
  assert.equal(input.text,'A proposed analysis. No experiment has been run.');
  await h.click('view','map');await h.click('select','discussion','map');
  assert.match(h.element('main').innerHTML,/Author results draft/,'The map exposes the saved handoff title.');
  await h.click('context','discussion','map');
  assert.equal(h.state().view,'studio');
  assert.equal(h.state().research.agentWorkspace.activeStage,'discussion');
  assert.equal(h.state().research.agentWorkspace.sideTab,'context');
  assert.match(h.element('main').innerHTML,/Reviewed copy from Results/);
  assert.deepEqual(h.state().draft,fixture.before.draft,'Map navigation and handoffs preserve the author manuscript and citations.');
  assert.equal(h.networkCalls(),0,'Map actions do not call AI or external services.');
});

test('real app map opens a scoped workspace and persists reviewed progress without approving new citations',async()=>{
  const fixture=await legacyFixture(),h=harness(fixture.raw,true,{modules:['research-map.js']});
  await h.click('dismiss-intro');await h.click('view','map');
  await h.click('select','results','map');
  assert.equal(h.state().view,'map');assert.equal(h.state().research.mapUI.selected,'results');
  const original=h.state().draft;
  await h.click('open','results','map');assert.equal(h.state().view,'studio');
  assert.equal(h.state().research.agentWorkspace.activeStage,'results');
  await h.click('demo','0',true);await h.click('view','map');
  assert.match(h.element('main').innerHTML,/Results: Draft\. Select workspace/);
  await h.click('open','results','map');await h.click('review-output','',true);await h.click('view','map');
  assert.match(h.element('main').innerHTML,/Results: Reviewed\. Select workspace/);
  assert.match(h.element('main').innerHTML,/<strong>1<small> \/ 10<\/small>/);
  assert.deepEqual(h.state().draft,original,'Map/stage review does not edit the canonical manuscript or its citations.');
  await h.click('phase','write','map');await h.click('select','discussion','map');
  const reloaded=harness(h.raw(),true,{modules:['research-map.js']});
  assert.equal(reloaded.state().research.mapUI.layout,'workflow');
  assert.equal(reloaded.state().research.mapUI.activePhase,'write');
  assert.equal(reloaded.state().research.mapUI.selected,'discussion');
  await reloaded.click('switch-project',fixture.otherId);await reloaded.click('view','map');
  assert.equal(reloaded.state().research.mapUI.selected,'data');
  assert.equal(reloaded.state().research.mapUI.layout,'workflow');
  assert.equal(h.networkCalls()+reloaded.networkCalls(),0);
});

test('workflow shortcuts open the author manuscript, evidence review and sources without changing saved research',async()=>{
  const fixture=await legacyFixture(),h=harness(fixture.raw,true,{modules:['research-map.js']});
  await h.click('dismiss-intro');await h.click('view','map');
  const before=h.state();
  for(const view of ['review','sources','manuscript']){
    await h.click('navigate',view,'map');
    assert.equal(h.state().view,view);assert.equal(h.state().mode,'draft');
    assert.deepEqual(h.state().draft,before.draft);
    assert.deepEqual(h.state().papers,before.papers);
    assert.deepEqual(h.state().research.agentWorkspace,before.research.agentWorkspace);
    await h.click('view','map');
  }
  assert.equal(h.networkCalls(),0);
});

test('real app usage dashboard keeps illustrative activity separate from recorded usage and project state',async()=>{
  const fixture=await legacyFixture();
  const usage={status:{enabled:false,message:'No model connection.',limits:{perRunUsd:.1,dailyUsd:1,lifetimeUsd:10}},usage:{inputTokens:0,outputTokens:0,totalTokens:0,modelCalls:0,estimatedCostUsd:0}};
  const h=harness(fixture.raw,true,{modules:['meter.js'],usage});
  await h.click('view','usage');const original=h.raw();
  assert.match(h.element('main').innerHTML,/data-meter-mode="actual"/);
  assert.match(h.element('main').innerHTML,/No model usage recorded in this project/);
  await h.click('mode','demo','meter');
  assert.match(h.element('usageMeter').innerHTML,/Illustrative demo — fictitious data/);
  assert.match(h.element('usageMeter').innerHTML,/Five fictitious runs/);
  assert.equal(h.raw(),original,'Viewing illustrative usage does not write runs, charges, logs or budget changes into the project.');
  await h.click('mode','actual','meter');
  assert.match(h.element('usageMeter').innerHTML,/No model usage recorded in this project/);
  assert.doesNotMatch(h.element('usageMeter').innerHTML,/Five fictitious runs/);
  await h.click('open-stage','methods',true);await h.click('demo','0',true);await h.click('view','usage');
  assert.match(h.element('main').innerHTML,/No model usage recorded in this project/,'A prepared section response never becomes a measured model run.');
  assert.equal(h.modules.PherogentAgent.getUsageSnapshot().usage.totalTokens,0);
  assert.equal(h.networkCalls(),0);
});

test('full research walkthrough completes through real product actions in an isolated, resumable practice project',async()=>{
  const fixture=await legacyFixture(),options={modules:['research-map.js','research-tour.js']};
  let h=harness(fixture.raw,true,options);
  const original=h.state(),tourAction=action=>h.click(action,'','researchTour');
  const next=async expected=>{await tourAction('next');assert.equal(h.state().research.processTour.step,expected);};
  await h.click('process-tour');
  assert.equal(h.state().activeProjectId,fixture.originId,'Opening the invitation does not create or switch a project.');
  await tourAction('begin');
  const practiceId=h.state().activeProjectId;
  assert.notEqual(practiceId,fixture.originId);assert.equal(h.state().projectMeta.isProcessTutorial,true);
  assert.equal(h.state().research.processTour.status,'active');
  assert.equal(h.state().research.processTour.step,0);
  await next(0); // merely looking at the coach cannot complete the first mission
  await h.click('open-stage','data',true);await next(1);
  await next(1); // unchanged question cannot count as author scope-setting
  await h.input('researchQuestion','Which clone-specific measurements distinguish archive retrieval from a similar new state?',{researchField:'question'});
  await next(2);
  const source=h.element('practice-source');source.dataset={studioSource:'MED:27347753'};source.checked=true;
  await h.dispatch('change',source);await h.click('demo','0',true);await next(3);
  await h.click('demo','0',true);await next(3); // prepared output is not author review
  await tourAction('pause');assert.equal(h.state().research.processTour.status,'paused');
  h=harness(h.raw(),true,options);
  assert.equal(h.state().research.processTour.step,3);assert.equal(h.state().research.processTour.status,'paused');
  await tourAction('resume');assert.equal(h.state().research.processTour.status,'active');
  await h.click('review-output','',true);await next(4);
  await h.click('demo','0',true);await h.click('review-output','',true);await next(4);
  await h.click('handoff','',true);await h.click('confirm-handoff','discussion',true);await next(5);
  for(const nextStep of [6,7,8,9]){await h.click('demo','0',true);await next(nextStep);}
  await h.click('demo','0',true);await h.click('review-output','',true);await next(10);
  await h.click('insert-output','',true);await h.click('confirm-insert','',true);await next(10);
  await h.click('view','manuscript');await next(11);
  await h.click('demo','0',true);await next(11);
  await h.click('view','review');await h.click('approve-demo');
  if(h.element('dialog').open)await h.click('confirm-low-overlap');
  assert.ok(h.state().draft.claims.some(c=>c.decision?.type==='apply'));
  await next(12);
  await h.click('demo','0',true);await h.click('review-output','',true);await next(13);
  await h.click('export-menu');await next(13);
  assert.equal(h.state().research.processTour.status,'active','Opening Export without downloading is not completion.');
  await h.click('export-md');assert.ok(h.state().research.processTour.exportedFiles.length>0);
  await next(13);
  assert.equal(h.state().research.processTour.status,'completed');
  assert.equal(h.state().research.processTour.completed.length,14);assert.deepEqual(h.state().research.processTour.skipped,[]);
  await h.click('switch-project',fixture.originId);
  assert.deepEqual(h.state().draft,original.draft,'All practice actions, insertion and citation approval leave the author’s original manuscript unchanged.');
  assert.deepEqual(h.state().research.sourceNotes,original.research.sourceNotes);
  assert.equal(h.state().research.processTour,undefined,'The original project never receives practice progress.');
  assert.equal(h.networkCalls(),0);
});


test('Outputs handoff uses the saved reviewed revision, is project-scoped, and never changes manuscript or calls AI',async()=>{
  const base=harness();const original=base.state();
  original.draft.text='Existing manuscript must remain unchanged.';
  original.research.projectOutputs={version:1,items:[{id:'report-a',projectId:original.activeProjectId,type:'report',title:'Checked descriptive result',body:'Observed region counts are not biological replicate counts.',url:'',status:'reviewed',revision:2,provenance:'Code calculation · author review required',sourceRunId:'run-a',sourceSnapshot:{id:'run-a',kind:'calculation',study:'lee2014',usage:{modelCalls:0,totalTokens:0}}}]};
  const h=harness(JSON.stringify(original),true,{modules:['project-outputs.js']});
  const data={projectId:original.activeProjectId,stageId:'results',output:{id:'report-a',revision:2,body:'FORGED EVENT TEXT'}};
  await h.emit('pherogent:link-output',{...data,projectId:'different-project'});
  await h.emit('pherogent:link-output',{...data,stageId:'unknown'});
  await h.emit('pherogent:link-output',{...data,output:{id:'report-a',revision:1}});
  assert.equal(h.state().research.agentWorkspace.agents.results.inputs.length,0);
  await h.emit('pherogent:link-output',data);
  const saved=h.state(),input=saved.research.agentWorkspace.agents.results.inputs[0];
  assert.equal(saved.draft.text,original.draft.text);assert.equal(input.outputRef.revision,2);
  assert.match(input.text,/Observed region counts/);assert.doesNotMatch(input.text,/FORGED/);
  assert.equal(input.sourceSnapshot.id,'run-a');assert.equal(input.provenance,'Author-reviewed output snapshot');
  const markdown=h.modules.PherogentResearch.markdown({project:saved.projectMeta,research:saved.research,draft:saved.draft,papers:[]});
  assert.match(markdown,/Checked descriptive result/,'Research Markdown includes saved outputs through the real application modules.');
  assert.match(markdown,/Observed region counts/);assert.match(markdown,/run-a/);
  await h.emit('pherogent:link-output',data);
  assert.equal(h.state().research.agentWorkspace.agents.results.inputs.length,1,'Duplicate saved version is not copied twice.');
  const changed=h.state();changed.research.projectOutputs.items[0].status='draft';changed.research.projectOutputs.items[0].revision=3;
  const reloaded=harness(JSON.stringify(changed),true,{modules:['project-outputs.js']});
  await reloaded.emit('pherogent:link-output',{...data,output:{id:'report-a',revision:3}});
  assert.equal(reloaded.state().research.agentWorkspace.agents.results.inputs.length,1);
  assert.equal(reloaded.state().research.agentWorkspace.agents.results.inputs[0].outputRef.revision,2,'Existing reviewed snapshot remains explicitly versioned.');
  assert.equal(h.networkCalls()+reloaded.networkCalls(),0);
});


test('local data calculation survives project reload, exports provenance and requires report review before linking',async()=>{
  const options={modules:['research-skills.js','data-analysis-engine.js','project-outputs.js']};
  const h=harness(undefined,true,options);await h.click('dismiss-intro');
  const original=h.state(),pid=original.activeProjectId;
  const table='sample_id,unit_id,time,feature,value\nA0,donor-a,0,f1,0.2\nA2,donor-a,2,f1,0.4\nA0,donor-a,0,f2,0.5\nA2,donor-a,2,f2,NA\n';
  const digest=require('node:crypto').createHash('sha256').update(table).digest('hex');
  const metadata={study:'Integration fixture',route:'treated',population:'Synthetic software-test measurements',modality:'DNAm',observationUnit:'biological_unit',independentUnits:null,destructiveSampling:true,lineage:'not_tracked',featuresAreReplicates:false};
  const prepared=h.modules.PherogentDataEngine.prepare(table,metadata,{fileName:'integration-fixture.csv',sha256:digest,origin:'synthetic'});
  const run=h.modules.PherogentDataEngine.calculate(prepared,{epsilon:.05});
  await h.emit('pherogent:study-workflow',{projectId:pid,kind:'calculation',summary:'Synthetic input integration check.',run:{...run,id:'data-integration-run',projectId:pid,workflow:'data-analysis'}});
  const saved=h.state();assert.equal(saved.research.studyRuns.length,1);
  const stored=saved.research.studyRuns[0];assert.equal(stored.id,'data-integration-run');assert.equal(stored.origin,'synthetic');assert.equal(stored.source.sha256,digest);
  assert.equal(stored.transition.observedPairs,1);assert.equal(stored.transition.missingPairs,1);
  assert.equal(stored.verification.status,'CHECKED');assert.deepEqual(saved.draft,original.draft);
  await h.emit('pherogent:study-workflow',{projectId:pid,kind:'calculation',run:stored});
  assert.equal(h.state().research.studyRuns.length,1,'Re-emitting a completed run cannot duplicate its history.');
  assert.equal(stored.rawText,undefined);assert.equal(stored.tensor,undefined,'Raw measurements are not persisted with the compact run.');
  const reloaded=harness(h.raw(),true,options);await reloaded.click('view','outputs');
  assert.match(reloaded.element('main').innerHTML,/Synthetic software test/);
  await reloaded.click('save-run',stored.id,'output');
  let report=reloaded.state().research.projectOutputs.items[0];assert.equal(report.status,'draft');
  assert.equal(report.sourceSnapshot.source.sha256,digest);assert.match(report.body,/Scientific interpretation/);
  await reloaded.emit('pherogent:link-output',{projectId:pid,stageId:'results',output:{id:report.id,revision:report.revision}});
  assert.equal(reloaded.state().research.agentWorkspace.agents.results.inputs.length,0);
  const copy=reloaded.state();copy.research.projectOutputs.items[0].status='reviewed';
  const approved=harness(JSON.stringify(copy),true,options);
  await approved.emit('pherogent:link-output',{projectId:pid,stageId:'results',output:{id:report.id,revision:report.revision}});
  const linked=approved.state().research.agentWorkspace.agents.results.inputs[0];
  assert.equal(linked.sourceSnapshot.source.sha256,digest);assert.match(linked.text,/Synthetic software test/);
  assert.deepEqual(approved.state().draft,original.draft);
  const markdown=approved.modules.PherogentResearch.markdown({project:approved.state().projectMeta,research:approved.state().research,draft:approved.state().draft,papers:[]});
  assert.match(markdown,new RegExp(digest));assert.match(markdown,/NOT_ASSESSED/);
  assert.equal(h.networkCalls()+reloaded.networkCalls()+approved.networkCalls(),0);
});
