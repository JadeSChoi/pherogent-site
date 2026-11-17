'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

const read = name => fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness(options={}) {
  const elements = new Map(), events = {}, logs = [], toasts = [], inserted = [], downloads = [], clipboard = [];
  let focused=null;
  const element = id => {
    if (!elements.has(id)) {
      const handlers = {}, attrs = {};
      const el = {id, value:'', textContent:'', innerHTML:'', dataset:{}, style:{}, hidden:false, open:false, disabled:false, checked:false, scrollHeight:100, scrollTop:0, selectionStart:0, selectionEnd:0, clicks:0,
        addEventListener(type,fn) {(handlers[type] ||= []).push(fn);},
        showModal() {this.open=true;}, close() {this.open=false;}, focus() {focused=this;}, select() {}, setSelectionRange(start,end) {this.selectionStart=start;this.selectionEnd=end;},click(){this.clicks++;},
        contains(target) {return target===this||this.id==='studioAddMenu'&&['studioMenuUpload','studioMenuContext','studioMenuHelp'].includes(target?.id);},
        getBoundingClientRect() {return this.id==='studioAddToggle'?{left:350,top:700,width:35,height:35}:{left:0,top:0,width:290,height:228};},
        setAttribute(name,value) {attrs[name]=String(value);}, getAttribute(name) {return attrs[name] ?? null;}, removeAttribute(name) {delete attrs[name];},
        querySelector: selector=>element(id+selector), querySelectorAll:()=>[],
        classList:{add(){},remove(){},toggle(){}},
        closest() {return null;},
        dispatch(type,event={}) {return Promise.all((handlers[type]||[]).map(fn=>fn({target:el,preventDefault(){},...event})));}
      };
      elements.set(id,el);
    }
    return elements.get(id);
  };
  const document = {getElementById:element, querySelector:element, querySelectorAll:()=>[],
    body:{classList:{add(){},remove(){},toggle(){}},appendChild(){}},
    addEventListener(type,fn) {(events[type] ||= []).push(fn);},
    createElement() {return {click(){},remove(){}};}
  };
  let paidRequests=0, active='origin', renderCount=0, currentView='studio', modalTitle='';
  const sandbox = {window:{innerWidth:options.width||1200,matchMedia:()=>({matches:!!options.mobile}),PherogentAgent:{refreshStatus(){}},...(options.ocrReader?{PherogentOCR:{read:options.ocrReader}}:{}),...(options.attachmentReader?{PherogentAttachments:{ACCEPT:'.pdf,.docx,.txt,.md,.csv',read:options.attachmentReader}}:{})},document,URL,Blob,Intl,Date,Math,console,TextDecoder,AbortController,crypto:options.crypto||{randomUUID},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn(),
    fetch:async(url,init={})=>{if(url==='/api/agent/status')return Response.json(options.status||{enabled:false,canRun:false,message:'AI is not connected.',limits:{lifetimeTokens:2000000,perRunTokens:40000},budget:{remainingLifetimeTokens:2000000}});paidRequests++;if(options.fetch)return options.fetch(url,init);throw Error('Unexpected paid endpoint.');},
    navigator:{clipboard:{writeText:async text=>{if(options.clipboardError)throw Error('Clipboard blocked');clipboard.push(text);}}}
  };
  vm.createContext(sandbox);
  for (const file of ['reference-data.js','cell-demo.js','research-workspace.js','studio-data.js','studio.js']) vm.runInContext(read(file),sandbox);
  const D=sandbox.window.PherogentStudioData, S=sandbox.window.PherogentStudio;
  const project = (id,title) => ({project:{id,isSample:false},research:sandbox.window.PherogentResearch.defaults(),evidenceRecords:[],draft:{title,text:'Existing manuscript text.',baseText:'Existing manuscript text.',claims:[]},papers:[],logs:[],citationCount:0});
  const projects={origin:project('origin','Original project'),other:project('other','Other project')};
  function context() {return projects[active];}
  function model() {return context().research.agentWorkspace;}
  function render() {
    renderCount++;
    element('main').innerHTML=S.render(context());
    const m=model();
    if (m) {const agent=m.agents[m.activeStage];if(agent){element('studioComposer').value=agent.composer;element('studioOutputBody').value=agent.output.body;element('studioOutputTitle').value=agent.output.title;}}
    S.afterRender?.();
  }
  const adapter={context,updateAgent(projectId,stageId,mutate){const a=projects[projectId]?.research?.agentWorkspace?.agents?.[stageId];if(!a)return false;mutate(a);return true;},logProject(projectId,event){logs.push({projectId,...event});},saveChatRun(projectId,run){const p=projects[projectId];(p.research.aiRuns||=[]).push(plain(run));},workspace:model,setWorkspace:value=>{context().research.agentWorkspace=value;},save(){},render,
    navigateStudio(){currentView='studio';render();},navigate(view){currentView=view;},
    modal(title,html){modalTitle=title;element('dialog').open=true;element('dialogContent').innerHTML=html;},
    close(){element('dialog').open=false;},log(type,detail,extra={}){logs.push({type,detail,...extra});},toast(value){toasts.push(value);},
    getDraft:()=>context().draft.text,
    appendOutput(...args){inserted.push(args);return true;},undoInsertion(){return true;},
    download(...args){downloads.push(args);}
  };
  S.init(adapter);render();
  const dispatch=(type,target,event={})=>Promise.all((events[type]||[]).map(fn=>fn({target,preventDefault(){},stopPropagation(){},key:'',shiftKey:false,...event})));
  const click=(name,arg='')=>{const button=element('action:'+name+':'+arg);button.dataset={studioAction:name,studioArg:arg};button.closest=selector=>selector==='[data-studio-action]'?button:null;button.setAttribute('data-arg',arg);return dispatch('click',button);};
  const input=async(id,value)=>{const target=element(id);target.value=value;await dispatch('input',target);};
  const submit=()=>dispatch('submit',element('studioChatForm'));
  return {D,S,context,model,projects,logs,toasts,inserted,downloads,clipboard,element,click,input,submit,render,dispatch,focused:()=>focused,
    switchProject(id){active=id;render();},paidRequests:()=>paidRequests,renderCount:()=>renderCount,currentView:()=>currentView,modalTitle:()=>modalTitle};
}

const makeRecord=(overrides={})=>({key:'run-one:MED:123',runId:'run-one',claimId:'claim-one',claim:'Reprogramming reverses aging in humans.',currentText:'Reprogramming restored a measured function in mice.',paperId:'MED:123',paper:{id:'MED:123',title:'A measured mouse outcome',url:'https://europepmc.org/article/MED/123'},evidence:{label:'partial',quote:'The treatment improved visual function in mice.',location:'Abstract',reason:'The population was mice, not people.',coverage:'Abstract excerpt only.',mismatchNotes:['Population mismatch']},status:'approved',fresh:true,checkedAt:'2026-10-31T00:00:00Z',fingerprint:'version-one',...overrides});

test('only current author-approved evidence can be explicitly attached, scoped to a workspace and project',async()=>{
  const h=harness();
  h.context().evidenceRecords=[makeRecord(),makeRecord({key:'unapproved',status:'awaiting_author'}),makeRecord({key:'stale',fresh:false}),makeRecord({key:'html',currentText:'<img src=x onerror=alert(1)>'})];
  await h.click('open-stage','results');await h.click('input-add');
  assert.equal(h.model().agents.results.inputs.length,0,'Opening the picker must not attach evidence.');
  const html=h.element('dialogContent').innerHTML;
  assert.match(html,/APPROVED EVIDENCE/);assert.ok(!html.includes('data-studio-arg="unapproved"'));assert.ok(!html.includes('data-studio-arg="stale"'));
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));
  await h.click('attach-evidence','unapproved');await h.click('attach-evidence','stale');
  assert.equal(h.model().agents.results.inputs.length,0);
  await h.click('attach-evidence','run-one:MED:123');
  const input=h.model().agents.results.inputs[0];
  assert.equal(input.kind,'note');assert.equal(input.evidenceRef.projectId,'origin');assert.equal(input.evidenceRef.fingerprint,'version-one');
  assert.match(input.text,/ORIGINAL SENTENCE CHECKED/);assert.match(input.text,/aging in humans/);assert.match(input.text,/function in mice/);
  assert.match(input.text,/Abstract excerpt only/);assert.match(input.text,/not independent scientific validation/);
  assert.equal(h.context().citationCount,0);assert.equal(h.inserted.length,0);assert.equal(h.paidRequests(),0);
  await h.click('attach-evidence','run-one:MED:123');assert.equal(h.model().agents.results.inputs.length,1,'Duplicate click does not attach duplicate.');
  await h.click('open-stage','discussion');assert.equal(h.model().agents.discussion.inputs.length,0);
  h.switchProject('other');assert.equal(h.model().agents.results.inputs.length,0);assert.equal(h.paidRequests(),0);
});

test('evidence snapshots survive normalization, stay immutable, and changed sources block sending',async()=>{
  const h=harness({status:{enabled:true,canRun:true,message:'Ready',limits:{},budget:{}}});
  h.context().evidenceRecords=[makeRecord()];await h.click('open-stage','discussion');await h.click('attach-evidence','run-one:MED:123');
  const before=plain(h.model().agents.discussion.inputs[0]);
  h.context().research.agentWorkspace=h.D.normalize(h.model(),h.context());
  assert.deepEqual(plain(h.model().agents.discussion.inputs[0]),before);
  h.context().evidenceRecords[0]=makeRecord({fingerprint:'version-two',evidence:{quote:'A different quoted passage.'}});
  h.render();
  assert.deepEqual(plain(h.model().agents.discussion.inputs[0]),before,'A new check cannot overwrite previously selected text.');
  assert.match(h.element('main').innerHTML,/Needs rechecking/);
  await h.input('studioComposer','Use this evidence to discuss the result.');await h.submit();
  assert.equal(h.paidRequests(),0);assert.match(h.toasts.at(-1),/rechecking/);assert.match(h.model().agents.discussion.composer,/Use this evidence/);
  const exported=h.S.exportMarkdown(h.context());assert.match(exported,/NEEDS RECHECKING/);assert.match(exported,/The treatment improved visual function in mice/);
  await h.click('inspect-input',before.id);assert.match(h.element('dialogContent').innerHTML,/Needs rechecking/);
  await h.click('remove-input',before.id);await h.click('attach-evidence','run-one:MED:123');
  assert.equal(h.model().agents.discussion.inputs[0].evidenceRef.fingerprint,'version-two');
  assert.match(h.model().agents.discussion.inputs[0].text,/A different quoted passage/);
});

test('approval changes after consent preview prevent dispatch even when saved context text is unchanged',async()=>{
  const h=harness({status:{enabled:true,canRun:true,message:'Ready',limits:{},budget:{}}});
  h.context().evidenceRecords=[makeRecord()];await h.click('open-stage','references');await h.click('attach-evidence','run-one:MED:123');
  await h.input('studioComposer','Explain the limits of this source.');await h.submit();
  assert.match(h.element('dialogContent').innerHTML,/EXACT SOURCE PASSAGE/);assert.equal(h.paidRequests(),0);
  h.context().evidenceRecords[0].status='awaiting_author';
  h.element('studioAIConsent').checked=true;await h.click('confirm-ai');
  assert.equal(h.paidRequests(),0);assert.match(h.toasts.at(-1),/Evidence changed/);
  assert.ok(!h.model().agents.references.messages.some(m=>m.role==='user'));
});

test('missing evidence and copied inputs from another project fail closed',async()=>{
  const h=harness({status:{enabled:true,canRun:true,message:'Ready',limits:{},budget:{}}});
  h.context().evidenceRecords=[makeRecord()];await h.click('open-stage','results');await h.click('attach-evidence','run-one:MED:123');
  const snapshot=plain(h.model().agents.results.inputs[0]);
  h.context().evidenceRecords=[];await h.input('studioComposer','Use the result.');await h.submit();assert.equal(h.paidRequests(),0);assert.match(h.toasts.at(-1),/rechecking/);
  h.switchProject('other');await h.click('open-stage','results');h.context().evidenceRecords=[makeRecord()];h.model().agents.results.inputs.push(snapshot);
  await h.input('studioComposer','Use the imported result.');await h.submit();assert.equal(h.paidRequests(),0);assert.match(h.toasts.at(-1),/rechecking/);
  assert.match(h.S.nav(h.context(),'review'),/Evidence inbox/);
});

test('approved evidence handed to a writing workspace distinguishes a model’s label from the study-design decision',async()=>{
  const h=harness();const rec=makeRecord();
  rec.evidence.designCheck={rule:'same-cell-tracking-v1',status:'incompatible',reason:'Bulk measurements did not track the same cells.',modelLabel:'supports',adjusted:true};
  rec.evidence.label='unsupported';h.context().evidenceRecords=[rec];
  await h.click('open-stage','results');await h.click('attach-evidence',rec.key);
  const text=h.model().agents.results.inputs[0].text;
  assert.match(text,/FINAL ASSESSMENT OF ORIGINAL SENTENCE\nunsupported/);assert.match(text,/STUDY DESIGN CHECK \(code\)[\s\S]*Bulk measurements/);
  assert.match(text,/INITIAL AI LABEL \(before the design check\)\nsupports/);assert.equal(h.paidRequests(),0);
});
