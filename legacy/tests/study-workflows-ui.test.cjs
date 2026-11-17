'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
const dataset = JSON.parse(fs.readFileSync(path.join(root,'public/data/lee2014/data.json'),'utf8'));
function response(overrides = {}) {
  return {study:'rag1_lu2020',question:'Any question',evidence:[{id:'note-1',text:'A supplied source summary.',sourceUrl:'https://www.nature.com/articles/s41586-020-2975-4',recordKind:'study_design',score:.35,locator:{file:'notes.jsonl',line:1}}],trace:[{step:'Retrieve',status:'completed',detail:'One matching summary.'}],summary:'Source summaries are available. Numerical analysis was not run.',limitations:['No raw numerical matrix is included.'],usage:{modelCalls:0,totalTokens:0},...overrides};
}
function harness(options = {}) {
  const elements = new Map(), handlers = {}, requests = [], events = [];
  const el = (id,extra = {}) => {const value = {id,value:'',innerHTML:'',textContent:'',disabled:false,focus(){this.focused = true;},...extra};elements.set(id,value);return value;};
  for(const id of ['studyWorkflows','swRetrievalResult','swCalculationResult','swRun','swCalculate','swCollections','swPresets'])el(id);
  el('swQuestion',{value:'What does this study measure?'});el('swRoute',{value:'continued_low'});el('swEpsilon',{value:'.05'});
  const document = {getElementById:id=>elements.get(id)||null,querySelector:()=>null,addEventListener:(type,fn)=>{(handlers[type]||=[]).push(fn);},dispatchEvent:event=>events.push(event)};
  const sandbox = {window:{},document,URL,AbortController,console,setTimeout,Blob,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},fetch:async(url,init)=>{requests.push({url,init});return options.fetch ? options.fetch(url,init) : {ok:true,json:async()=>url.startsWith('/data/') ? structuredClone(dataset) : response()};}};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'public/lee-analysis.js'),'utf8'),sandbox);
  if(fs.existsSync(path.join(root,'public/research-skills.js')))vm.runInContext(fs.readFileSync(path.join(root,'public/research-skills.js'),'utf8'),sandbox);
  if(options.skills)sandbox.window.PherogentResearchSkills = options.skills;
  vm.runInContext(fs.readFileSync(path.join(root,'public/study-workflows.js'),'utf8'),sandbox);
  const dispatch = (type,target) => Promise.all((handlers[type]||[]).map(fn=>fn({target,preventDefault(){}})));
  const click = (kind,value) => {const target = {dataset:{[kind]:value},closest:selector=>selector === `[data-${kind.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}]` ? target : null};return dispatch('click',target);};
  return {ui:sandbox.window.PherogentStudyWorkflows,requests,events,elements,el,get:id=>elements.get(id),dispatch,click,skills:sandbox.window.PherogentResearchSkills};
}
test('opening Study Workflows spends nothing and keeps source summaries separate from real Lee calculations',()=>{
  const h=harness(),html=h.ui.render({project:{id:'project-a'}});h.ui.afterRender();
  assert.equal(h.requests.length,0);assert.match(html,/RAG 1/);assert.match(html,/RAG 2/);
  assert.match(html,/not full papers or raw datasets/);assert.match(html,/Separate Lee dataset/);
  assert.match(html,/No AI provider receives it/);assert.match(html,/All 7,890 regions/);
  assert.doesNotMatch(html,/data-sw-action="chat"/);
});
test('one form submission runs once, preserves input focus node and saves the originating project ID',async()=>{
  const h=harness();h.ui.render({project:{id:'project-a'}});const input=h.get('swQuestion');
  await h.dispatch('submit',{id:'swQuestionForm'});
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/studies/run');
  assert.deepEqual(JSON.parse(h.requests[0].init.body),{study:'rag1_lu2020',question:'What does this study measure?'});
  assert.equal(h.get('swQuestion'),input);assert.equal(h.get('swRun').disabled,false);
  assert.match(h.get('swRetrievalResult').innerHTML,/Supplied summary · not an exact quote/);
  assert.match(h.get('swRetrievalResult').innerHTML,/Use sources in References chat/);
  assert.equal(h.events[0].type,'pherogent:study-workflow');assert.equal(h.events[0].detail.projectId,'project-a');
  assert.equal(h.events[0].detail.run.projectId,'project-a');
  await h.click('swAction','chat');
  assert.equal(h.events[1].type,'pherogent:study-chat');assert.equal(h.requests.length,1,'Opening chat must not invoke the model.');
});
test('collection selection updates the question and sends the explicit new study only',async()=>{
  const h=harness({fetch:async()=>({ok:true,json:async()=>response({study:'rag2_gse293381'})})});h.ui.render();
  await h.click('swStudy','rag2_gse293381');
  assert.match(h.get('swQuestion').value,/same cells followed/);
  await h.click('swPreset','1');assert.match(h.get('swQuestion').value,/ATAC/);assert.equal(h.get('swQuestion').focused,true);
  await h.dispatch('submit',{id:'swQuestionForm'});
  assert.equal(JSON.parse(h.requests[0].init.body).study,'rag2_gse293381');
  assert.match(h.get('swRetrievalResult').innerHTML,/GSE293381/);
});
test('unknown search results remain empty and never offer an AI handoff with no evidence',async()=>{
  const h=harness({fetch:async()=>({ok:true,json:async()=>response({evidence:[],summary:'No matching summary.'})})});
  await h.dispatch('submit',{id:'swQuestionForm'});
  const html=h.get('swRetrievalResult').innerHTML;
  assert.match(html,/No matching source notes found/);assert.match(html,/does not prove that evidence does not exist elsewhere/);
  assert.doesNotMatch(html,/data-sw-action="chat"/);
  await h.click('swAction','chat');assert.equal(h.events.length,1);
});
test('source text, locations and labels are escaped and unsafe links are not clickable',async()=>{
  const h=harness({fetch:async()=>({ok:true,json:async()=>response({evidence:[{text:'<img src=x onerror=alert(1)>',sourceUrl:'javascript:alert(1)',recordKind:'<script>',locator:'<svg onload=alert(1)>',score:.2}]})})});
  await h.dispatch('submit',{id:'swQuestionForm'});const html=h.get('swRetrievalResult').innerHTML;
  assert.match(html,/&lt;img/);assert.match(html,/&lt;svg/);assert.doesNotMatch(html,/<img|<svg|<script|javascript:/);
  assert.match(html,/Source link unavailable/);assert.match(html,/not confidence in scientific support/);
});
test('requests cannot overlap and an old response cannot replace another view or change project attribution',async()=>{
  let release;const h=harness({fetch:()=>new Promise(resolve=>{release=resolve;})});h.ui.render({project:{id:'project-a'}});
  const old=h.get('swRetrievalResult'),pending=h.dispatch('submit',{id:'swQuestionForm'});
  await h.dispatch('submit',{id:'swQuestionForm'});assert.equal(h.requests.length,1);
  await h.click('swStudy','rag2_gse293381');assert.equal(JSON.parse(h.requests[0].init.body).study,'rag1_lu2020');
  h.elements.delete('swRetrievalResult');
  release({ok:true,json:async()=>response()});await pending;
  assert.match(old.innerHTML,/Running the selected study workflow/);
  assert.equal(h.events[0].detail.projectId,'project-a');
});
test('a missing or failed workflow result is explicit and is not saved as a successful run',async()=>{
  const h=harness({fetch:async()=>({ok:true,json:async()=>({study:'rag1_lu2020'})})});
  await h.dispatch('submit',{id:'swQuestionForm'});
  assert.match(h.get('swRetrievalResult').innerHTML,/incomplete record/);assert.equal(h.events.length,0);assert.equal(h.get('swRun').disabled,false);
});
test('calculation errors stop without reporting made-up skill outputs',async()=>{
  const h=harness({fetch:async()=>({ok:false})});
  await h.dispatch('submit',{id:'swCalculationForm'});
  assert.match(h.get('swCalculationResult').innerHTML,/Calculation stopped/);assert.equal(h.events.length,0);
  assert.equal(h.get('swCalculate').disabled,false);assert.ok(h.requests.every(r=>!r.url.startsWith('/api/')));
});
test('real Lee data runs all three skills and emits a compact, local-only calculation record',async()=>{
  const h=harness();assert.ok(h.skills,'The real skill module must exist for this integration test.');h.ui.render({project:{id:'lee-project'}});
  await h.dispatch('submit',{id:'swCalculationForm'});
  const html=h.get('swCalculationResult').innerHTML;
  assert.doesNotMatch(html,/Calculation stopped/);assert.match(html,/7,890/);assert.match(html,/Within tolerance does not mean exact equality/);
  assert.equal(h.events.length,1);const event=h.events[0];assert.equal(event.detail.kind,'calculation');assert.equal(event.detail.projectId,'lee-project');
  const run=event.detail.run;assert.equal(run.state.features,7890);assert.equal(run.rollup.intervals.length,5);assert.equal(run.transition.observedPairs,7890);
  assert.equal(run.usage.totalTokens,0);assert.equal(run.state.Z,undefined);assert.ok(JSON.stringify(run).length<60000);
  assert.ok(h.requests.every(r=>r.url==='/data/lee2014/data.json'));
  h.get('swRoute').value='low_withdrawal';await h.dispatch('submit',{id:'swCalculationForm'});
  assert.equal(h.requests.length,1,'The already validated source data should be reused.');
  assert.equal(h.events[1].detail.run.transition.from,8);assert.equal(h.events[1].detail.run.transition.to,21);
});

test('switching project aborts an old source request and clears its result before entering the new project',async()=>{
  let release;const h=harness({fetch:()=>new Promise(resolve=>{release=resolve;})});h.ui.render({project:{id:'project-a'}});
  const pending=h.dispatch('submit',{id:'swQuestionForm'});
  h.el('swRetrievalResult');h.ui.render({project:{id:'project-b'}});h.ui.afterRender();
  assert.equal(h.requests[0].init.signal.aborted,true);assert.equal(h.get('swRun').disabled,false);
  release({ok:true,json:async()=>response()});await pending;
  assert.match(h.get('swRetrievalResult').innerHTML,/will appear here/);assert.equal(h.events.length,0);
});
test('a pending Lee download cannot write a calculation into a different project',async()=>{
  let release;const h=harness({fetch:()=>new Promise(resolve=>{release=resolve;})});h.ui.render({project:{id:'project-a'}});
  const pending=h.dispatch('submit',{id:'swCalculationForm'});
  h.el('swCalculationResult');h.ui.render({project:{id:'project-b'}});h.ui.afterRender();
  release({ok:true,json:async()=>structuredClone(dataset)});await pending;
  assert.match(h.get('swCalculationResult').innerHTML,/Choose a route/);assert.equal(h.events.length,0);assert.equal(h.get('swCalculate').disabled,false);
});

test('saved retrieval is restored without spending tokens and every missing numerical skill is explicitly skipped',()=>{
  const h=harness(),run=response({kind:'retrieval',projectId:'project-a',skills:[{name:'EpiState-T',status:'NOT_RUN',reason:'No validated matrix.'}],trace:[{step:'Check calculation inputs',status:'blocked',detail:'No validated matrix.'}]});
  const html=h.ui.render({project:{id:'project-a'},research:{studyRuns:[run]}});
  assert.match(html,/Skipped — no numerical input/);assert.match(html,/Skipped — missing input/);
  assert.match(html,/EpiState-T/);assert.match(html,/No validated matrix/);assert.match(html,/data-arg="outputs"/);
  assert.equal(h.requests.length,0);assert.equal(h.events.length,0);
  const other=h.ui.render({project:{id:'project-b'},research:{studyRuns:[run]}});
  assert.doesNotMatch(other,/A supplied source summary/,'An imported foreign-project record must not be restored.');
});
