'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(saved) {
  const events={},elements=new Map(),opened=[],openedPanels=[],logs=[],focusCalls=[],scrollCalls=[],navigated=[];
  let active='one',html='',networkCalls=0,modalOpen=false,focusTarget='visible';
  const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',focus(){focusCalls.push(id);},scrollIntoView(){scrollCalls.push(id);}});return elements.get(id);};
  const sandbox={window:{PherogentStudio:{openStage:(id,panel)=>{opened.push(id);openedPanels.push({id,panel});},icon:()=>'<svg aria-hidden="true"></svg>'}},
    document:{addEventListener(type,fn){(events[type]||=[]).push(fn);},getElementById:element,querySelector(selector){return focusTarget==='missing'?null:{focus(){focusCalls.push(selector);},closest(){return focusTarget==='hidden'?{}:null;}};}},
    fetch:async()=>{networkCalls++;throw Error('Research workflow interactions must remain local.');},console};
  vm.createContext(sandbox);
  for(const name of ['studio-data.js','research-map.js'])vm.runInContext(read(name),sandbox);
  const D=sandbox.window.PherogentStudioData,M=sandbox.window.PherogentMap;
  const project=id=>({view:'map',project:{id},research:{question:'A research question',agentWorkspace:D.create()},draft:{title:'Author project',text:'Original manuscript'},papers:[]});
  const projects=saved?plain(saved):{one:project('one'),two:project('two')};
  const context=()=>projects[active];
  const render=()=>{M.dispose?.();html=M.render(context());M.afterRender?.();return html;};
  M.init({context,navigate:view=>{navigated.push(view);context().view=view;},save(){},render,
    modal(title,body){modalOpen=true;element('dialog').innerHTML=body;},close(){modalOpen=false;},log:(...args)=>logs.push(args)});
  const dispatch=(type,target)=>(events[type]||[]).forEach(fn=>fn({target,preventDefault(){}}));
  const click=(action,arg='')=>{const el={dataset:{mapAction:action,mapArg:arg},closest:selector=>selector==='[data-map-action]'?el:null};dispatch('click',el);};
  render();
  return {D,M,context,projects,navigated,opened,openedPanels,logs,focusCalls,scrollCalls,setFocusTarget:value=>{focusTarget=value;},element,click,render,html:()=>html,networkCalls:()=>networkCalls,
    snapshot:()=>plain(projects),switchProject:id=>{active=id;render();},
    submitQuestion:text=>{element('mapQuestion').value=text;dispatch('submit',{id:'mapQuestionForm'});},modalOpen:()=>modalOpen};
}
const items=html=>(html.match(/class="flow-item(?: |")/g)||[]).length;

// A single workflow surface replaces all graph and outline entry points.
test('new projects expose four selectable phases and only the active phase workspaces',()=>{
  const h=harness(),ui=h.context().research.mapUI;
  assert.equal(ui.layout,'workflow');assert.equal(ui.activePhase,'plan');assert.equal(ui.selected,'data');
  assert.equal(h.M.groups.length,4);assert.equal(items(h.html()),2);
  assert.match(h.html(),/Data processing: Not started\. Select workspace/);
  assert.match(h.html(),/Methods: Not started\. Select workspace/);
  assert.doesNotMatch(h.html(),/data-map-action="layout"|data-graph-action|id="mapGraph"/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../app/workspace.html'),'utf8'),/src="research-graph\.js"/);
  const ids=plain(h.M.groups.flatMap(group=>group.ids));
  assert.equal(new Set(ids).size,10);
  assert.deepEqual(ids.slice().sort(),plain(h.D.stages.filter(stage=>stage.id!=='organizer').map(stage=>stage.id)).sort());
  assert.equal(h.networkCalls(),0);
});

test('legacy graph and outline preferences migrate without discarding research or archived layout data',()=>{
  for(const layout of ['graph','outline','tree','workflow']){
    const h=harness(),saved=h.snapshot(),graph={positions:{results:{x:760,y:210}},viewport:{x:4,y:8,scale:1.2},focus:true};
    saved.one.research.mapUI={layout,selected:'results',activePhase:'plan',collapsed:['plan'],graph};
    saved.one.research.agentWorkspace.agents.results.output={body:'Author result draft',status:'draft'};
    const before=plain(saved.one),loaded=harness(saved),ui=loaded.context().research.mapUI;
    assert.equal(ui.layout,'workflow');assert.equal(ui.activePhase,'develop');assert.equal(ui.selected,'results');
    assert.deepEqual(plain(ui.graph),graph,'Retired coordinates remain inert archived data.');
    assert.deepEqual(plain(loaded.context().research.agentWorkspace),before.research.agentWorkspace);
    assert.deepEqual(plain(loaded.context().draft),before.draft);
    assert.equal(items(loaded.html()),3);assert.equal(loaded.networkCalls(),0);
  }
});

test('phase navigation selects visible work and remembers a selection separately for each phase and project',()=>{
  const h=harness(),before=plain(h.context().research.agentWorkspace);
  h.context().research.agentWorkspace.agents.references.output={body:'Source notes to inspect',status:'draft'};
  h.click('phase','develop');
  assert.equal(h.context().research.mapUI.selected,'references','A previously unseen phase prioritizes a saved draft.');
  assert.equal(h.context().research.mapUI.activePhase,'develop');assert.equal(items(h.html()),3);
  h.click('select','figures');h.click('phase','write');
  assert.equal(h.context().research.mapUI.selected,'introduction');assert.equal(items(h.html()),2);
  h.click('phase','develop');assert.equal(h.context().research.mapUI.selected,'figures');
  const expected=plain(h.context().research.agentWorkspace);h.click('phase','not-a-phase');
  assert.equal(h.context().research.mapUI.activePhase,'develop');
  h.switchProject('two');assert.equal(h.context().research.mapUI.activePhase,'plan');assert.equal(h.context().research.mapUI.selected,'data');
  h.switchProject('one');assert.equal(h.context().research.mapUI.selected,'figures');
  const reloaded=harness(h.snapshot());assert.equal(reloaded.context().research.mapUI.activePhase,'develop');
  assert.equal(reloaded.context().research.mapUI.selected,'figures');
  assert.deepEqual(plain(reloaded.context().research.agentWorkspace),expected);
  assert.deepEqual(plain(h.projects.two.research.agentWorkspace),before);
  assert.equal(h.opened.length,0);assert.equal(h.networkCalls()+reloaded.networkCalls(),0);
});

test('following suggested routes switches phase and reveals the destination without transferring content',()=>{
  const h=harness(),before=plain(h.context().research.agentWorkspace);
  for(const stage of h.D.stages){
    const route=h.M.routeFor(stage.id);
    for(const id of route.next)assert.ok(h.M.routeFor(id).from.includes(stage.id));
    for(const id of route.from)assert.ok(h.M.routeFor(id).next.includes(stage.id));
  }
  h.click('select','results');h.click('filter','drafts');h.click('select','discussion');
  assert.equal(h.context().research.mapUI.activePhase,'write');assert.equal(h.context().research.mapUI.selected,'discussion');
  assert.equal(h.context().research.mapUI.filter,'all','An explicit destination is made visible when a draft filter would hide it.');
  assert.match(h.html(),/Discussion: Not started\. Select workspace/);
  assert.deepEqual(plain(h.M.connections(h.context())),[]);
  assert.doesNotMatch(h.html(),/class="map-handoffs"/);
  assert.deepEqual(plain(h.context().research.agentWorkspace),before);
  h.click('select','organizer');assert.equal(h.context().research.mapUI.selected,'organizer');assert.equal(h.context().research.mapUI.activePhase,'write');
  assert.equal(h.opened.length,0);assert.equal(h.networkCalls(),0);
});

test('draft filtering is scoped to the active phase, preserves the inspector and has a way out',()=>{
  const h=harness(),agents=h.context().research.agentWorkspace.agents;
  agents.results.output={body:'Prepared result',status:'draft'};
  agents.methods.output={body:'Reviewed method',status:'reviewed'};
  h.click('select','methods');h.click('filter','drafts');
  assert.equal(h.context().research.mapUI.selected,'methods');assert.equal(items(h.html()),0);
  assert.match(h.html(),/No drafts/i);assert.match(h.html(),/Results/,'An existing draft in another phase remains reachable.');
  h.click('select','results');assert.equal(h.context().research.mapUI.activePhase,'develop');assert.equal(items(h.html()),1);
  h.click('filter','all');assert.equal(items(h.html()),3);
  h.click('filter','drafts');h.switchProject('two');assert.equal(h.context().research.mapUI.filter,'all');
  h.click('filter','drafts');assert.equal(items(h.html()),0);assert.match(h.html(),/data-map-action="filter" data-map-arg="all"/);
  h.switchProject('one');assert.equal(h.context().research.mapUI.filter,'drafts');
  assert.equal(harness(h.snapshot()).context().research.mapUI.filter,'drafts');
  assert.equal(h.networkCalls(),0);
});

test('author progress never treats empty reviewed flags or prepared drafts as completed research',()=>{
  const h=harness(),agents=h.context().research.agentWorkspace.agents;
  assert.equal(h.M.status({body:'',status:'reviewed'}),'Not started');
  assert.equal(h.M.status({body:'Prepared example',status:'draft'}),'Draft');
  assert.equal(h.M.status({body:'Author inspected text',status:'reviewed'}),'Reviewed');
  agents.data.output={body:'Prepared proposed plan',status:'draft',provenance:'Prepared example · no AI ran'};
  agents.results.output={body:'',status:'reviewed'};
  h.click('select','data');assert.match(h.html(),/Prepared example · no AI ran/);
  assert.equal(h.M.nextStage(h.context()),'data');
  for(const id of h.M.groups.flatMap(group=>group.ids))agents[id].output={body:'Reviewed local output',status:'reviewed'};
  assert.equal(h.M.nextStage(h.context()),'review');assert.equal(h.networkCalls(),0);
});

test('review and context controls open the requested panel while invalid destinations are inert',()=>{
  const h=harness(),before=plain(h.context().research.agentWorkspace);
  h.click('review-draft','results');h.click('context','methods');
  assert.deepEqual(h.openedPanels,[{id:'results',panel:'output'},{id:'methods',panel:'context'}]);
  const selected=h.context().research.mapUI.selected;
  h.click('open','unknown');h.click('select','unknown');h.click('context','unknown');
  assert.equal(h.opened.length,2);assert.equal(h.context().research.mapUI.selected,selected);
  assert.deepEqual(plain(h.context().research.agentWorkspace),before);assert.equal(h.networkCalls(),0);
});

test('selection restores keyboard focus and missing controls fall back to the inspector',()=>{
  const h=harness();h.click('select','results');
  assert.match(h.focusCalls.at(-1),/data-map-action="select".*data-map-arg="results"/);
  h.setFocusTarget('missing');h.click('select','methods');
  assert.equal(h.focusCalls.at(-1),'mapInspector');assert.equal(h.scrollCalls.at(-1),'mapInspector');
  h.click('inspect');assert.equal(h.focusCalls.at(-1),'mapInspector');assert.equal(h.opened.length,0);
});

test('navigation cannot launch AI, transfer content or approve a citation',()=>{
  const h=harness(),before=plain(h.context());
  for(const view of ['review','sources','manuscript']){h.context().view='map';h.click('navigate',view);}
  h.click('navigate','https://untrusted.invalid');h.click('navigate','investigate');
  h.click('layout','graph');h.click('layout','outline');
  assert.equal(h.context().research.mapUI.layout,'workflow');
  assert.deepEqual(h.navigated,['review','sources','manuscript']);assert.equal(h.opened.length,0);
  assert.deepEqual(plain(h.context().draft),before.draft);
  assert.deepEqual(plain(h.context().research.agentWorkspace),before.research.agentWorkspace);
  assert.equal(h.networkCalls(),0);
});

test('map escapes manuscript, question, output and input text, including the edit dialog',()=>{
  const h=harness(),attack='</textarea><img src=x onerror="alert(1)">';
  h.context().research.question=attack;h.context().draft.title=attack;
  const a=h.context().research.agentWorkspace.agents.results;
  a.output={title:attack,body:attack,status:'reviewed',provenance:attack};
  a.inputs=[{id:'unsafe-text',kind:'note',title:attack,text:attack}];
  h.click('select','results');const html=h.html();
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('</textarea><img'));
  h.click('edit-question');assert.equal(h.modalOpen(),true);
  assert.ok(h.element('dialog').innerHTML.includes('&lt;img'));
  assert.ok(!h.element('dialog').innerHTML.includes('<img src=x'));
  assert.equal(h.networkCalls(),0);
});

test('editing the shared question is explicit, bounded and leaves the manuscript unchanged',()=>{
  const h=harness(),before=plain(h.context().draft);
  h.click('edit-question');h.submitQuestion('   ');
  assert.equal(h.context().research.question,'A research question');assert.equal(h.modalOpen(),true);
  h.submitQuestion('  Compare recovery mechanisms in mice.  ');
  assert.equal(h.context().research.question,'Compare recovery mechanisms in mice.');
  assert.equal(h.modalOpen(),false);assert.deepEqual(plain(h.context().draft),before);
  assert.equal(h.logs.length,1);assert.match(h.logs[0][1],/Author updated/);
  h.click('edit-question');h.submitQuestion('A'.repeat(2500));
  assert.equal(h.context().research.question.length,2000);
  assert.equal(h.networkCalls(),0);
});

test('only reviewed nonempty snapshots create real connections, even after the source is edited',()=>{
  const h=harness(),agents=h.context().research.agentWorkspace.agents;
  agents.results.output={body:'An updated, unreviewed source',status:'draft'};
  agents.discussion.inputs=[
    {kind:'handoff',fromStage:'results',status:'reviewed',title:'First reviewed copy',text:'Original reviewed finding'},
    {kind:'handoff',fromStage:'results',status:'reviewed',title:'Second reviewed copy',text:'Another reviewed finding'},
    {kind:'handoff',fromStage:'references',status:'reviewed',title:'Source check',text:'Reviewed source notes'},
    {kind:'handoff',fromStage:'results',status:'draft',text:'Not approved'},
    {kind:'handoff',fromStage:'unknown',status:'reviewed',text:'Unknown source'},
    {kind:'handoff',fromStage:'methods',status:'reviewed',text:' '},
    {kind:'note',fromStage:'methods',status:'reviewed',text:'An author note is not a handoff'},null
  ];
  assert.deepEqual(plain(h.M.connections(h.context())),[
    {from:'results',to:'discussion',count:2},{from:'references',to:'discussion',count:1}
  ]);
  const before=plain(agents);h.click('select','discussion');
  assert.match(h.html(),/3 passed by you/);
  assert.match(h.html(),/Open Discussion context: 2 reviewed copies from Results/);
  assert.match(h.html(),/Later edits to the source do not update these copies/);
  assert.match(h.html(),/Reviewed copy from Results/);
  h.click('context','discussion');assert.deepEqual(h.openedPanels,[{id:'discussion',panel:'context'}]);
  assert.deepEqual(plain(agents),before,'Showing a snapshot never synchronizes or edits its source.');
  assert.equal(h.networkCalls(),0);
});

test('an old question dialog cannot update a newly selected project',()=>{
  const h=harness();h.click('edit-question');h.switchProject('two');
  h.submitQuestion('This belongs to the previous project.');
  assert.equal(h.projects.one.research.question,'A research question');
  assert.equal(h.projects.two.research.question,'A research question');
  assert.equal(h.modalOpen(),false);assert.equal(h.logs.length,0);
});

test('next action prioritizes changed writing and pending selected sentences without claiming full coverage',()=>{
  const h=harness(),ctx=h.context();
  ctx.research.agentWorkspace.agents.title.output={body:'Title draft',status:'draft'};
  ctx.draft={text:'Changed paragraph',baseText:'Old paragraph',claims:[{text:'Old paragraph',decision:{type:'keep'}}]};
  assert.match(h.M.nextAction(ctx).title,/Prepare/);
  assert.equal(h.M.nextAction(ctx).arg,'review');
  ctx.draft={text:'Current paragraph',baseText:'Current paragraph',claims:[{text:'Current paragraph'}, {text:'Another selected claim',decision:{type:'keep'}}]};
  assert.equal(h.M.nextAction(ctx).title,'1 selected sentence waiting for evidence review');
  assert.equal(h.M.nextAction(ctx).action,'navigate');
  const before=plain(ctx);h.M.nextAction(ctx);
  assert.deepEqual(plain(ctx),before,'Computing a recommendation is read-only.');
  assert.equal(h.networkCalls(),0);
});

test('recommendations distinguish drafts, reviewed context, missing briefs and all-reviewed sections',()=>{
  const h=harness(),ctx=h.context(),agents=ctx.research.agentWorkspace.agents;
  ctx.draft={text:'',baseText:'',claims:[]};
  agents.results.output={body:'Prepared example output',status:'draft',provenance:'Prepared example · no AI ran'};
  let next=h.M.nextAction(ctx);
  assert.equal(next.action,'review-draft');assert.equal(next.arg,'results');assert.match(next.detail,/prepared draft/);
  agents.results.output={body:'',status:'reviewed'};ctx.research.question='';
  assert.equal(h.M.nextAction(ctx).action,'edit-question');
  ctx.research.question='A scoped question';
  agents.discussion.inputs=[{kind:'handoff',fromStage:'results',status:'draft',text:'Unreviewed'}, {kind:'handoff',fromStage:'invalid',status:'reviewed',text:'Invalid'}];
  assert.equal(h.M.nextAction(ctx).arg,'data');
  agents.discussion.inputs.push({kind:'handoff',fromStage:'results',status:'reviewed',text:'Historical reviewed snapshot'});
  next=h.M.nextAction(ctx);assert.equal(next.action,'context');assert.equal(next.arg,'discussion');
  for(const id of h.M.groups.flatMap(group=>group.ids))agents[id].output={body:'Reviewed output',status:'reviewed'};
  next=h.M.nextAction(ctx);assert.equal(next.arg,'manuscript');assert.match(next.detail,/actually added/);
  assert.doesNotMatch(next.title,/complete|validated|ready to publish/i);
});

test('connected workflow makes sources, checks, analyses and outputs inspectable without running anything',()=>{
  const h=harness(),before=plain(h.context().research.agentWorkspace);
  assert.equal(h.context().research.mapUI.component,'sources');
  assert.match(h.html(),/Sources: Ready to add\. Inspect stage/);
  assert.match(h.html(),/Checks: Needs review\. Inspect stage/);
  assert.match(h.html(),/Analyses: Not run\. Inspect stage/);
  assert.match(h.html(),/Outputs: In progress\. Inspect stage/);
  assert.match(h.html(),/class="pipeline-paper-sections"><summary>/,'The section explorer is initially collapsed.');
  h.click('component','analyses');assert.equal(h.context().research.mapUI.component,'analyses');
  assert.match(h.html(),/No completed calculation is saved/);
  assert.match(h.html(),/data-map-action="navigate" data-map-arg="study-explorer"/);
  h.click('component','invalid');assert.equal(h.context().research.mapUI.component,'analyses');
  h.click('select','results');assert.equal(h.context().research.mapUI.component,'paper');
  assert.match(h.html(),/class="pipeline-paper-sections" open/);
  h.click('component','outputs');assert.match(h.html(),/data-map-arg="outputs"/);
  assert.deepEqual(plain(h.context().research.agentWorkspace),before);
  assert.equal(h.opened.length,0);assert.equal(h.networkCalls(),0);
});

test('saved source runs report skipped numerical work instead of completed analysis',()=>{
  const h=harness(),ctx=h.context();
  ctx.research.studyRuns=[
    {kind:'retrieval',projectId:'one',study:'rag1_lu2020',status:'retrieved',evidence:[{id:'n1'},{id:'n2'}],numericAnalysis:'NOT_RUN',skills:[{name:'EpiState-T',status:'NOT_RUN'}]},
    {kind:'retrieval',projectId:'one',study:'rag1_lu2020',status:'retrieved',evidence:[{id:'n1'}],numericAnalysis:'NOT_RUN'},
    {kind:'retrieval',projectId:'one',study:'rag2_gse293381',status:'retrieved',evidence:[{id:'n1'}],numericAnalysis:'NOT_RUN'},
    {kind:'calculation',projectId:'two',study:'lee2014',state:{features:7890},rollup:{intervals:[]},transition:{}},
    null,{kind:'calculation',projectId:'one',state:{features:7890}}
  ];
  const summary=h.M.componentSummary(ctx);
  assert.equal(summary.notes,3,'Repeated notes are counted once per study.');
  assert.equal(summary.calculations.length,0,'Other-project and incomplete calculations do not count.');
  h.click('component','analyses');
  assert.match(h.html(),/Analyses: Skipped\. Inspect stage/);
  assert.match(h.html(),/Skipped — no numerical input/);
  assert.match(h.html(),/were not computed/);
  assert.doesNotMatch(h.html(),/Analyses: Calculated/);
  const before=plain(ctx);h.M.componentSummary(ctx);h.M.componentModels(ctx);
  assert.deepEqual(plain(ctx),before);assert.equal(h.networkCalls(),0);
});

test('a real saved Lee calculation is separate from withheld source-note analyses',()=>{
  const h=harness(),ctx=h.context();
  ctx.research.studyRuns=[
    {kind:'retrieval',study:'rag2_gse293381',status:'retrieved',evidence:[{id:'w1'}],numericAnalysis:'NOT_RUN'},
    {kind:'calculation',study:'lee2014',projectId:'one',epsilon:.05,state:{features:7890},rollup:{intervals:[{from:0,to:2}]},transition:{observedPairs:7890}}
  ];
  h.click('component','analyses');
  assert.match(h.html(),/Analyses: Calculated\. Inspect stage/);
  assert.match(h.html(),/7,890 Lee regions/);
  assert.match(h.html(),/saved Lee calculation/);
  assert.match(h.html(),/Latest source workflow/);
  assert.match(h.html(),/Skipped — no numerical input/,'The separate WIF1 source run remains explicitly skipped.');
  assert.equal(h.M.componentSummary(ctx).calculations.length,1);
});

test('only fresh author approvals count as checked evidence and output records never count as calculations',()=>{
  const h=harness(),ctx=h.context();
  ctx.evidenceRecords=[{fresh:true,status:'approved'},{fresh:false,status:'approved'},{fresh:true,status:'pending'},null];
  ctx.research.projectOutputs={version:1,items:[{id:'report',type:'report'},{id:'dataset',type:'dataset'}]};
  const summary=h.M.componentSummary(ctx);
  assert.equal(summary.approved,1);assert.equal(summary.artifacts,2);assert.equal(summary.calculations.length,0);
  h.click('component','checks');assert.match(h.html(),/1 current evidence approvals/);
  assert.match(h.html(),/not proof that the science is true/);
  h.click('component','outputs');assert.match(h.html(),/2 saved reports &amp; data records/);
  assert.equal(h.networkCalls(),0);
});

test('component selection stays project-specific and workflow destinations are allowlisted',()=>{
  const h=harness();h.click('component','outputs');h.switchProject('two');
  assert.equal(h.context().research.mapUI.component,'sources');h.switchProject('one');
  assert.equal(h.context().research.mapUI.component,'outputs');
  for(const view of ['literature','study-workflows','study-explorer','outputs'])h.click('navigate',view);
  h.click('navigate','https://example.invalid');h.click('navigate','investigate');
  assert.deepEqual(h.navigated,['literature','study-workflows','study-explorer','outputs']);
  assert.equal(h.networkCalls(),0);
});


test('malformed imported run metadata does not crash the workflow map',()=>{
  const h=harness(),ctx=h.context();
  ctx.research.studyRuns=[{kind:'retrieval',study:'rag1_lu2020',status:'retrieved',evidence:[null,{id:'safe'}],skills:{status:'NOT_RUN'}},null,{kind:'calculation',state:'invalid'}];
  ctx.research.projectOutputs={items:'invalid'};
  ctx.evidenceRecords='invalid';
  assert.doesNotThrow(()=>h.render());
  assert.equal(h.M.componentSummary(ctx).artifacts,0);
  assert.equal(h.M.componentSummary(ctx).calculations.length,0);
  assert.equal(h.networkCalls(),0);
});

function importedCalculation(extra={}) {
  return {kind:'calculation',workflow:'data-analysis',projectId:'one',study:'Donor time course',route:'treated',origin:'computed',epsilon:.05,
    state:{features:2,modality:'DNAm',times:[0,2],units:3},rollup:{intervals:[{from:0,to:2,observedPairs:6,meanDelta:.1}]},
    transition:{observedPairs:6,meanDelta:.1},source:{fileName:'assays.csv',origin:'user_upload'},
    verification:{status:'CHECKED',scope:'Input structure and deterministic calculation only',checks:[{name:'Schema',status:'CHECKED'},{name:'Arithmetic',status:'CHECKED'},{name:'Independent units',status:'INDETERMINATE'}]},...extra};
}

test('uploaded calculations show the actual study and assay with technical checks only',()=>{
  const h=harness(),ctx=h.context();ctx.research.studyRuns=[importedCalculation()];
  const before=plain(ctx.research);h.click('component','analyses');
  assert.match(h.html(),/Analyses: Calculated\. Inspect stage/);
  assert.match(h.html(),/2 features · Donor time course · DNAm/);
  assert.match(h.html(),/sample mappings are author-declared/);
  assert.match(h.html(),/2 technical checks recorded/);
  assert.match(h.html(),/not scientific validity/);
  assert.match(h.html(),/Connect data &amp; analyze/);
  assert.match(h.html(),/data-map-arg="data-analysis"/);
  assert.doesNotMatch(h.html(),/saved Lee calculation|scientifically verified/i);
  assert.equal(h.M.componentSummary(ctx).calculations.length,1);
  assert.deepEqual(plain(ctx.research.studyRuns),before.studyRuns);
  assert.equal(h.networkCalls(),0);
});

test('synthetic calculations remain software tests rather than completed experimental analyses',()=>{
  const h=harness(),ctx=h.context();ctx.research.studyRuns=[importedCalculation({origin:'synthetic',study:'Synthetic interval fixture'})];
  h.click('component','analyses');assert.match(h.html(),/Analyses: Synthetic test\. Inspect stage/);
  assert.match(h.html(),/synthetic software test, not experimental evidence/);
  assert.doesNotMatch(h.html(),/Analyses: Calculated\. Inspect stage/);
  ctx.research.studyRuns=[importedCalculation({source:{origin:'synthetic'}})];h.render();
  assert.match(h.html(),/Analyses: Synthetic test\. Inspect stage/);
  assert.equal(h.networkCalls(),0);
});

test('incomplete, foreign and refused uploaded calculations never imply a successful run',()=>{
  const h=harness(),ctx=h.context();
  ctx.research.studyRuns=[importedCalculation({projectId:'two'}),importedCalculation({study:''}),importedCalculation({verification:{status:'REFUSED',checks:[]}}),importedCalculation({transition:{observedPairs:0,meanDelta:null}}),importedCalculation({state:{features:2,modality:'wrong',times:[0,2]}}),importedCalculation({workflow:'unknown'})];
  h.click('component','analyses');assert.equal(h.M.componentSummary(ctx).calculations.length,0);
  assert.match(h.html(),/Analyses: Not run\. Inspect stage/);
  assert.doesNotMatch(h.html(),/technical checks recorded/);
  h.click('component','sources');assert.match(h.html(),/Connect measurements/);
  h.click('navigate','data-analysis');h.click('navigate','javascript:alert(1)');
  assert.deepEqual(h.navigated,['data-analysis']);assert.equal(h.networkCalls(),0);
});

test('uploaded study names are escaped in workflow counts and inspector details',()=>{
  const h=harness();h.context().research.studyRuns=[importedCalculation({study:'<img src=x onerror=alert(1)>'})];
  h.click('component','analyses');assert.match(h.html(),/&lt;img/);assert.doesNotMatch(h.html(),/<img|onerror="/);
});
