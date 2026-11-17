'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(){
  const elements=new Map(),handlers={},events=[],logs=[],downloads=[];let active='a',renders=0,modal='';
  const el=id=>{if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',focus(){}});return elements.get(id);};
  const document={getElementById:id=>elements.get(id)||null,addEventListener:(type,fn)=>(handlers[type]||=[]).push(fn),dispatchEvent:event=>events.push(event)};
  const sandbox={window:{PherogentStudioData:{stageFor:id=>({id,label:id})}},document,URL,Date,Math,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},fetch(){throw Error('Outputs must not make network requests.');}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/project-outputs.js'),'utf8'),sandbox);
  const projects={a:{project:{id:'a'},research:{studyRuns:[]},draft:{title:'Project A',text:'Original manuscript.'},citationCount:0},b:{project:{id:'b'},research:{studyRuns:[]},draft:{title:'Project B',text:''}}};
  const ui=sandbox.window.PherogentOutputs;ui.init({context:()=>projects[active],save(){},render(){renders++;},modal(title,html){modal=html;el('projectOutputForm');el('outputLinkForm');},close(){},log(...args){logs.push(args);},toast(){},download(...args){downloads.push(args);},navigate(){},openStage(){}});
  const dispatch=(type,target)=>{for(const fn of handlers[type]||[])fn({target,preventDefault(){}});};
  const click=(action,arg='')=>{const target={dataset:{outputAction:action,outputArg:arg},closest:s=>s==='[data-output-action]'?target:null};dispatch('click',target);};
  const fill=(title,body,url='')=>{el('outputRecordTitle').value=title;el('outputRecordBody').value=body;el('outputRecordUrl').value=url;el('outputRecordError');};
  return {ui,projects,events,logs,downloads,el,click,fill,dispatch,modal:()=>modal,renderCount:()=>renders,ctx:()=>projects[active],switchProject:id=>{active=id;}};
}
function item(extra={}){return {id:'item-1',projectId:'a',type:'report',title:'Report',body:'Measured result.',url:'',status:'draft',revision:1,provenance:'Author',...extra};}
function run(extra={}){return {id:'run-1',projectId:'a',kind:'retrieval',study:'rag1_lu2020',question:'What was measured?',evidence:[{id:'note-1',text:'Supplied study summary.',sourceUrl:'https://example.com/paper',locator:{file:'notes.jsonl',line:1}}],limitations:['Not a raw numerical dataset.'],usage:{modelCalls:0,totalTokens:0},...extra};}
test('opening outputs preserves paper and exposes sections without network or manuscript mutations',()=>{
  const h=harness(),before=JSON.stringify(h.ctx());const html=h.ui.render(h.ctx());
  assert.match(html,/Research outputs/);assert.match(html,/RESEARCH PAPER/);assert.match(html,/data-output-arg="results"/);assert.match(html,/Dataset records.*do not host a database/);
  assert.equal(JSON.stringify(h.ctx()),before);assert.equal(h.events.length,0);assert.equal(h.logs.length,0);
});
test('normalization scopes records to project, rejects unsafe source links and preserves known metadata',()=>{
  const h=harness(),value={version:1,extra:'kept',items:[item({sourceSnapshot:{id:'immutable'}}),item({id:'foreign',projectId:'b'}),item({id:'unsafe',url:'javascript:alert(1)'}),item({id:'credential',url:'https://name:secret@example.com'}),null]};
  const result=h.ui.normalize(value,'a');assert.equal(result.extra,'kept');assert.equal(result.items.length,3);assert.equal(result.items[0].sourceSnapshot.id,'immutable');assert.equal(result.items[1].url,'');assert.equal(result.items[2].url,'');assert.equal(h.ui.normalize(value,'b').items.length,1);
});
test('editing a reviewed report resets review, increments revision and leaves source snapshot unchanged',()=>{
  const h=harness(),source={id:'run-1',number:17},old=item({status:'reviewed',reviewedAt:'old',sourceSnapshot:source});
  const next=h.ui.update(old,{body:'Changed interpretation.'});assert.equal(next.status,'draft');assert.equal(next.reviewedAt,null);assert.equal(next.revision,2);assert.equal(old.status,'reviewed');assert.deepEqual(plain(next.sourceSnapshot),source);assert.equal(h.ui.update(old,{body:old.body}).revision,1);
});
test('new records are saved only to active project and invalid URLs do not save',()=>{
  const h=harness();h.click('new','dataset');h.fill('Dataset','Observed samples.','javascript:alert(1)');h.dispatch('submit',h.el('projectOutputForm'));
  assert.equal(h.ui.records(h.ctx()).length,0);assert.match(h.el('outputRecordError').textContent,/http or https/);
  h.fill('Dataset','Observed samples.','https://example.com/data');h.dispatch('submit',h.el('projectOutputForm'));
  assert.equal(h.ui.records(h.ctx()).length,1);assert.equal(h.ui.records(h.ctx())[0].type,'dataset');assert.equal(h.ui.records(h.ctx())[0].status,'draft');assert.equal(h.ctx().draft.text,'Original manuscript.');
  h.click('new','report');h.fill('Unsaved report','Body');h.switchProject('b');h.dispatch('submit',h.el('projectOutputForm'));assert.equal(h.ui.records(h.ctx()).length,0);assert.equal(h.ui.records(h.projects.a).length,1);
});
test('save run keeps a deep provenance snapshot after run history changes and prevents duplicate copies',()=>{
  const h=harness();h.ctx().research.studyRuns=[run()];h.click('save-run','run-1');
  let saved=h.ui.records(h.ctx())[0];assert.equal(saved.sourceRunId,'run-1');assert.equal(saved.status,'draft');assert.match(saved.body,/Numerical analysis was skipped/);assert.equal(saved.sourceSnapshot.evidence[0].text,'Supplied study summary.');
  h.ctx().research.studyRuns[0].evidence[0].text='Changed source';h.click('save-run','run-1');assert.equal(h.ui.records(h.ctx()).length,1);h.ctx().research.studyRuns=[];saved=h.ui.records(h.ctx())[0];assert.equal(saved.sourceSnapshot.evidence[0].text,'Supplied study summary.');
  assert.match(h.ui.exportMarkdown(h.ctx()),/Source run: run-1/);
});
test('calculation reports retain numerical distinction and invalid calculations are refused',()=>{
  const h=harness(),value=run({kind:'calculation',study:'lee2014',route:'continued_low',epsilon:.05,state:{features:7890,times:[0,2],observedValues:15780,totalSlots:15780},rollup:{intervals:[]},transition:{from:0,to:2,observedPairs:7890,withinTolerance:7500,exactEqual:3,source:{file:'data.json'}}});
  const report=h.ui.reportFromRun(value,'a');assert.match(report.body,/Within tolerance: 7500/);assert.match(report.body,/Exactly equal: 3/);assert.match(report.body,/not independent biological replicates/);assert.equal(h.ui.reportFromRun({...value,state:null},'a'),null);assert.equal(h.ui.reportFromRun(value,'b'),null);
});
test('only current reviewed revision may link, and it dispatches an immutable explicit copy',()=>{
  const h=harness();h.ctx().research.projectOutputs={version:1,items:[item()]};h.click('link','item-1');assert.equal(h.ui.linkOutput('results'),false);assert.equal(h.events.length,0);
  h.ctx().research.projectOutputs.items[0].status='reviewed';h.click('link','item-1');assert.match(h.modal(),/will not send a message to AI/);assert.equal(h.ui.linkOutput('results'),true);
  assert.equal(h.events[0].type,'pherogent:link-output');assert.equal(h.events[0].detail.projectId,'a');assert.equal(h.events[0].detail.stageId,'results');assert.equal(h.events[0].detail.output.revision,1);
  h.ctx().research.projectOutputs.items[0].body='later';assert.equal(h.events[0].detail.output.body,'Measured result.');
  h.click('link','item-1');h.ctx().research.projectOutputs.items[0].revision=2;assert.equal(h.ui.linkOutput('methods'),false);assert.equal(h.events.length,1);
  h.click('link','item-1');h.switchProject('b');assert.equal(h.ui.linkOutput('results'),false);assert.equal(h.events.length,1);
});
test('unsafe text is escaped in records and editor; review requires actual content',()=>{
  const h=harness();h.ctx().research.projectOutputs={items:[item({title:'<img src=x onerror=alert(1)>',body:'</textarea><script>attack</script>',url:'javascript:alert(1)'})]};
  const html=h.ui.render(h.ctx());assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img|javascript:/);h.click('edit','item-1');assert.match(h.modal(),/&lt;\/textarea&gt;/);assert.doesNotMatch(h.modal(),/<script>/);
  h.fill('Reviewed','');h.click('save-reviewed');assert.equal(h.ui.records(h.ctx())[0].status,'draft');assert.match(h.el('outputRecordError').textContent,/content you reviewed/);
  h.fill('Reviewed','I reviewed these limitations.');h.click('save-reviewed');assert.equal(h.ui.records(h.ctx())[0].status,'reviewed');assert.equal(h.ctx().draft.text,'Original manuscript.');
});
test('exports include provenance and snapshots but never change review or manuscript',()=>{
  const h=harness();h.ctx().research.projectOutputs={items:[item({sourceRunId:'run-1',sourceSnapshot:{id:'run-1'}})]};h.click('export','item-1');h.click('export-json','item-1');
  assert.match(h.downloads[0][1],/Origin: Author/);assert.equal(JSON.parse(h.downloads[1][1]).sourceSnapshot.id,'run-1');assert.equal(h.ui.records(h.ctx())[0].status,'draft');assert.equal(h.ctx().draft.text,'Original manuscript.');
});
test('zero-match runs remain explicit in cards and saved reports',()=>{
  const h=harness(),empty=run({status:'no_matches',evidence:[]});h.ctx().research.studyRuns=[empty];
  const html=h.ui.render(h.ctx());assert.match(html,/No matching notes/);assert.doesNotMatch(html,/class="outputs-run-kind">Source notes retrieved/);
  const report=h.ui.reportFromRun(empty,'a');assert.match(report.body,/No matching source notes were returned/);assert.match(report.body,/does not establish.*absent from the wider literature/);
});
test('normalization retains rejected originals and invalidates review after text or URL repairs',()=>{
  const h=harness(),long=item({title:'T'.repeat(181),status:'reviewed',reviewedAt:'before'}),unsafe=item({id:'unsafe',url:'javascript:alert(1)',status:'reviewed'}),invalid={id:'broken',body:42};
  const result=h.ui.normalize({items:[long,unsafe,invalid]},'a');assert.equal(result.items[0].status,'draft');assert.equal(result.items[1].status,'draft');assert.equal(result.items[0].reviewedAt,null);
  assert.equal(result.recovery.repairedItems[0].original.title.length,181);assert.equal(result.recovery.repairedItems[1].original.url,'javascript:alert(1)');assert.equal(result.recovery.discardedItems[0].body,42);
  const second=h.ui.normalize(result,'a');assert.equal(second.recovery.repairedItems.length,2,'Re-normalizing a repaired record does not duplicate recovery copies.');
  h.ctx().research.projectOutputs={items:[item()]};assert.match(h.ui.projectMarkdown(h.ctx()),/# Report/);assert.equal(h.ui.getRecord(h.ctx(),'item-1').id,'item-1');assert.equal(h.ui.getRecord(h.projects.b,'item-1'),null);
});
function uploadedRun(extra={}) {
  return run({kind:'calculation',study:'Donor assay',route:'treated',origin:'computed',epsilon:.05,
    source:{fileName:'measurements.csv',sha256:'a'.repeat(64),origin:'user_upload'},
    state:{study:'Donor assay',route:'treated',modality:'RNA',units:3,features:2,times:[0,2],observedValues:11,totalSlots:12,observationUnit:'biological_unit',independentUnits:null,destructiveSampling:true,lineage:'not_tracked',population:'Fibroblasts',sampleCount:6},
    rollup:{intervals:[{from:0,to:2,fromSampleIds:['sample-0'],toSampleIds:['sample-2'],observedPairs:5,missingPairs:1,meanDelta:.2,meanAbsoluteDelta:.25,status:'COMPUTED'}]},
    transition:{from:0,to:2,observedPairs:5,missingPairs:1,meanDelta:.2,withinTolerance:2,exactEqual:1,source:[{file:'measurements.csv',sampleId:'sample-2',rowStart:8,rowEnd:13}]},
    verification:{status:'CHECKED',scope:'Input structure and deterministic calculation only',checks:[{name:'Independent units',status:'INDETERMINATE',detail:'Not independently established.'}]},
    limitations:['Descriptive only.'],...extra});
}
test('uploaded calculations retain actual assay, design, checks, schedule and file provenance without Lee labels',()=>{
  const h=harness(),value=uploadedRun(),report=h.ui.reportFromRun(value,'a');
  assert.match(report.title,/Donor assay/);assert.doesNotMatch(report.title,/Lee/);assert.match(report.body,/Assay: RNA/);assert.match(report.body,/Independent biological units: Unknown/);assert.match(report.body,/sample-0/);assert.match(report.body,/sample-2/);assert.match(report.body,/measurements.csv/);assert.match(report.body,/a{64}/);assert.match(report.body,/INDETERMINATE/);assert.match(report.body,/not whether the scientific interpretation is true/);assert.match(report.body,/Missing pairs: 1/);
  assert.deepEqual(plain(report.sourceSnapshot),value);assert.equal(report.status,'draft');assert.equal(report.origin,'computed');assert.equal(h.ui.originInfo(report).label,'Calculated by Pherogent');
  h.ctx().research.studyRuns=[value];assert.match(h.ui.render(h.ctx()),/Calculated by Pherogent/);assert.doesNotMatch(h.ui.render(h.ctx()),/Lee 2014 · treated/);
});
test('synthetic, reported, proposed and author categories remain separate from review status',()=>{
  const h=harness(),synthetic=h.ui.reportFromRun(uploadedRun({origin:'synthetic',source:{fileName:'template.csv',origin:'synthetic'}}),'a');
  assert.equal(h.ui.originInfo(synthetic).label,'Synthetic software test');assert.match(synthetic.body,/not a biological result/);
  const reported=h.ui.reportFromRun(run(),'a');assert.equal(h.ui.originInfo(reported).label,'Reported by a paper');assert.match(reported.body,/original paper was not independently checked/);
  assert.equal(h.ui.originInfo(item({origin:'proposed',status:'reviewed'})).label,'Proposed analysis');
  assert.equal(h.ui.originInfo(item({origin:'computed',provenance:'Calculated by Pherogent'})).label,'Author','An arbitrary author label cannot claim computed source provenance.');
  h.ctx().research.projectOutputs={items:[synthetic,reported,item({id:'proposal',origin:'proposed'})]};const html=h.ui.render(h.ctx());assert.match(html,/Synthetic software test/);assert.match(html,/Reported by a paper/);assert.match(html,/Proposed analysis/);assert.match(html,/Draft/);
});
test('edited calculation prose is marked author-edited while original numerical snapshot remains intact',()=>{
  const h=harness(),value=h.ui.reportFromRun(uploadedRun(),'a');value.status='reviewed';
  const updated=h.ui.update(value,{body:'My interpretation has changed.'});assert.equal(updated.authorEdited,true);assert.equal(updated.status,'draft');assert.equal(updated.revision,2);assert.equal(updated.sourceSnapshot.transition.meanDelta,.2);assert.equal(h.ui.originInfo(updated).label,'Calculated by Pherogent');
  assert.match(h.ui.markdown(updated),/Author-edited report/);assert.match(h.ui.markdown(updated),/edits have not been recalculated/);
  h.ctx().research.projectOutputs={items:[updated]};assert.match(h.ui.render(h.ctx()),/Author-edited report · source snapshot unchanged/);
});
test('authors can label a plan but cannot select a computed or paper source category',()=>{
  const h=harness();h.click('new','report');assert.match(h.modal(),/Proposed analysis — no result yet/);assert.doesNotMatch(h.modal(),/<option value="computed"/);
  h.fill('Planned assay','Collect matched measurements.');h.el('outputRecordOrigin').value='proposed';h.dispatch('submit',h.el('projectOutputForm'));const saved=h.ui.records(h.ctx())[0];assert.equal(saved.origin,'proposed');assert.match(h.ui.markdown(saved),/Origin: Proposed analysis/);
  h.click('new','report');h.fill('Manual claim','A body');h.el('outputRecordOrigin').value='computed';h.dispatch('submit',h.el('projectOutputForm'));assert.equal(h.ui.records(h.ctx())[0].origin,'author');
});
test('large locator previews disclose omissions while JSON snapshot keeps every locator',()=>{
  const h=harness(),sources=Array.from({length:20},(_,i)=>({file:'measurements.csv',sampleId:'sample-'+i,row:i+2})),value=uploadedRun();value.transition.source=sources;
  const report=h.ui.reportFromRun(value,'a');assert.match(report.body,/Preview only/);assert.match(report.body,/full list remains in the attached source snapshot/);assert.equal(report.sourceSnapshot.transition.source.length,20);
  const oversized=uploadedRun({extra:'x'.repeat(60001)});assert.equal(h.ui.reportFromRun(oversized,'a'),null,'Oversized snapshots refuse rather than silently truncating.');
});
