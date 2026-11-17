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
  const sandbox = {window:{...(options.features||{}),innerWidth:options.width||1200,matchMedia:()=>({matches:!!options.mobile}),PherogentAgent:{refreshStatus(){}},PherogentStudyDesign:options.design,...(options.ocrReader?{PherogentOCR:{read:options.ocrReader}}:{}),...(options.attachmentReader?{PherogentAttachments:{ACCEPT:'.pdf,.docx,.txt,.md,.csv',read:options.attachmentReader}}:{})},document,URL,Blob,Intl,Date,Math,console,TextDecoder,AbortController,crypto:options.crypto||{randomUUID},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>fn(),
    fetch:async(url,init={})=>{if(url==='/api/agent/status')return Response.json(options.status||{enabled:false,canRun:false,message:'AI is not connected.',limits:{lifetimeTokens:2000000,perRunTokens:40000},budget:{remainingLifetimeTokens:2000000}});paidRequests++;if(options.fetch)return options.fetch(url,init);throw Error('Unexpected paid endpoint.');},
    navigator:{clipboard:{writeText:async text=>{if(options.clipboardError)throw Error('Clipboard blocked');clipboard.push(text);}}}
  };
  vm.createContext(sandbox);
  for (const file of ['reference-data.js','cell-demo.js','research-workspace.js','studio-data.js','studio.js']) vm.runInContext(read(file),sandbox);
  const D=sandbox.window.PherogentStudioData, S=sandbox.window.PherogentStudio;
  const project = (id,title) => ({project:{id,isSample:false},research:sandbox.window.PherogentResearch.defaults(),draft:{title,text:'Existing manuscript text.',baseText:'Existing manuscript text.',claims:[]},papers:[],logs:[],citationCount:0});
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

test('custom requests preview consent, preserve the composer when disconnected and do not invent an output',async()=>{
  const h=harness();
  await h.click('open-stage','results');
  const before=plain(h.model().agents.results.output);
  await h.input('studioComposer','Determine whether our data establishes cellular memory.');
  const renders=h.renderCount();
  await h.input('studioComposer','Determine whether our data establishes cellular memory. Keep the uncertainty.');
  assert.equal(h.renderCount(),renders,'Typing saves without rebuilding the page or losing focus.');
  await h.submit();
  assert.equal(h.paidRequests(),0);
  assert.deepEqual(plain(h.model().agents.results.output),before,'A saved custom request must not be answered with fabricated scientific output.');
  const messages=h.model().agents.results.messages;
  assert.ok(!messages.some(m=>m.text.includes('Keep the uncertainty.')),'No fake reply or sent message is appended before consent');
  assert.match(h.element('dialogContent').innerHTML,/Keep the uncertainty/);
  assert.match(h.element('studioAIStatus').innerHTML,/not connected/);
  assert.match(h.model().agents.results.composer,/Keep the uncertainty/);
  assert.equal(h.element('studioAIConfirm').disabled,true);
  h.element('studioAIConsent').checked=true;await h.click('confirm-ai');assert.equal(h.paidRequests(),0);
  await h.input('studioComposer','Unsent Results draft.');
  await h.click('open-stage','methods');
  assert.equal(h.model().agents.methods.composer,'');
  assert.ok(!h.model().agents.methods.messages.some(m=>m.text.includes('Keep the uncertainty.')));
  h.switchProject('other');
  assert.ok(!h.model().agents.results.messages.some(m=>m.text.includes('Keep the uncertainty.')));
  h.switchProject('origin');
  await h.click('open-stage','results');
  assert.equal(h.model().agents.results.composer,'Unsent Results draft.');
  assert.equal(h.paidRequests(),0);
});

test('prepared outputs require author review, and edits invalidate that review',async()=>{
  const h=harness();await h.click('open-stage','methods');
  await h.click('demo','0');
  let output=h.model().agents.methods.output;
  assert.ok(output.body.trim());
  assert.equal(output.status,'draft');
  assert.match(output.provenance,/prepared|example/i);
  await h.click('insert-output');
  assert.equal(h.inserted.length,0,'An unreviewed example cannot be inserted immediately.');
  await h.input('studioOutputBody','Author draft: proposed methods, no experiment has been performed.');
  await h.click('review-output');
  assert.equal(h.model().agents.methods.output.status,'reviewed');
  const renders=h.renderCount();
  await h.input('studioOutputBody','Revised author draft: preregister the protocol before collecting observations.');
  assert.equal(h.renderCount(),renders,'Editing an output must retain the editor element and cursor.');
  assert.equal(h.model().agents.methods.output.status,'draft','An edited draft cannot keep its old approval.');
  await h.click('review-output');await h.click('insert-output');
  assert.equal(h.inserted.length,0,'The author sees a confirmation before the manuscript is changed.');
  assert.equal(h.element('dialog').open,true);
  await h.click('confirm-insert');
  assert.equal(h.inserted.length,1);
  assert.equal(h.paidRequests(),0);
});

test('untrusted text is escaped in messages, outputs, context and exports keep provenance',async()=>{
  const h=harness();
  const attack='</textarea><img src=x onerror="alert(1)">';
  h.context().research.question=attack;
  await h.click('open-stage','results');await h.input('studioComposer',attack);await h.submit();
  await h.input('studioOutputTitle',attack);await h.input('studioOutputBody',attack);
  const html=h.S.render(h.context());
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('</textarea><img'));
  const exported=h.S.exportMarkdown(h.context());
  assert.match(exported,/prototype|prepared|no AI/i);
  assert.ok(exported.includes(attack),'Plain-text Markdown exports preserve the author’s literal text.');
  assert.equal(h.paidRequests(),0);
});

test('handoffs are explicit reviewed snapshots, not shared conversations or mutable drafts',async()=>{
  const h=harness();await h.click('open-stage','results');
  await h.input('studioComposer','This message belongs to Results only.');await h.submit();
  await h.input('studioOutputTitle','Measured finding and uncertainty');
  await h.input('studioOutputBody','The reviewed outcome concerns mice. The archive mechanism remains untested.');
  await h.click('confirm-handoff','discussion');
  assert.equal(h.model().agents.discussion.inputs.length,0,'Unreviewed drafts cannot be passed as reviewed inputs.');
  await h.click('review-output');
  const snapshot=plain(h.model().agents.results.output);
  await h.click('handoff');
  assert.equal(h.model().agents.discussion.inputs.length,0,'Opening the recipient picker must not pass anything.');
  await h.click('confirm-handoff','discussion');
  const input=h.model().agents.discussion.inputs[0];
  assert.equal(input.kind,'handoff');assert.equal(input.fromStage,'results');assert.equal(input.status,'reviewed');
  assert.equal(input.text,snapshot.body);assert.equal(input.title,snapshot.title);
  assert.ok(!h.model().agents.discussion.messages.some(m=>m.text.includes('Results only.')));
  await h.click('open-stage','results');
  await h.input('studioOutputBody','A later edit must not rewrite the copy in Discussion.');
  assert.equal(h.model().agents.discussion.inputs[0].text,snapshot.body,'A handoff is an immutable snapshot until the author passes a new one.');
  assert.equal(h.model().agents.results.output.status,'draft');
  assert.equal(h.paidRequests(),0);
});

test('a stale insertion confirmation cannot insert changed or cross-project content',async()=>{
  const h=harness();await h.click('open-stage','methods');
  await h.input('studioOutputTitle','Methods');await h.input('studioOutputBody','First reviewed protocol.');
  await h.click('review-output');await h.click('insert-output');
  await h.input('studioOutputBody','A different protocol that has not been reviewed.');
  await h.click('confirm-insert');
  assert.equal(h.inserted.length,0);
  assert.match(h.toasts.at(-1),/changed|review/i);
  await h.click('review-output');await h.click('insert-output');
  h.switchProject('other');await h.click('confirm-insert');
  assert.equal(h.inserted.length,0,'An old confirmation cannot insert a draft into another project.');
  assert.equal(h.paidRequests(),0);
});

test('selected source inputs are scoped and are not citation approval',async()=>{
  const h=harness();
  const source={id:'MED:33268865',title:'Mouse visual recovery',authors:['Lu Y'],year:2020,abstract:'An available abstract.',url:'https://europepmc.org/article/MED/33268865'};
  h.context().papers.push(source);await h.click('open-stage','references');await h.click('input-add');
  const target=h.element('source-checkbox');target.dataset={studioSource:source.id};target.checked=true;
  await h.dispatch('change',target);
  assert.equal(h.model().agents.references.inputs.length,1);
  assert.equal(h.model().agents.references.inputs[0].sourceId,source.id);
  assert.equal(h.context().citationCount,0);assert.deepEqual(h.context().draft.claims,[]);
  await h.click('open-stage','results');
  assert.equal(h.model().agents.results.inputs.length,0);
  assert.equal(h.logs.at(-1).type,'Agent sources changed');
  assert.match(h.logs.at(-1).detail,/No citations approved/);
  assert.equal(h.paidRequests(),0);
});


test('research check stays separate from consent-based section AI replies',async()=>{
  const h=harness();
  const nav=h.S.nav(h.context(),'studio');
  assert.match(nav,/data-action="investigate"[^>]*>[\s\S]*?Research check/);
  for(const id of ['organizer','references']){
    await h.click('open-stage',id);
    const html=h.S.render(h.context());
    assert.match(html,/data-action="investigate"[^>]*>Research check<\/button>/);
    assert.match(html,/Review before sending to AI/);
    await h.input('studioComposer','Help plan this section.');await h.submit();
    const preview=h.element('dialogContent').innerHTML;
    assert.match(preview,/does not run data analysis, experiments or literature searches/);
    assert.match(preview,/consume one shared run reservation/);
    await h.click('close-dialog');
  }
  assert.equal(h.paidRequests(),0,'Rendering or opening a section cannot start paid work.');
});

const readyAI={enabled:true,canRun:true,message:'Ready for a bounded AI reply.',limits:{lifetimeTokens:2000000,perRunTokens:40000},budget:{remainingLifetimeTokens:2000000}};
const usageAI={inputTokens:300,outputTokens:200,totalTokens:500,modelCalls:1,calls:1,estimatedCostUsd:.00315};
const resultAI=(stage='methods')=>({stage,reply:'This is a proposed protocol. No experiment has run.',suggestedDraft:{title:'Proposed methods',body:'Pre-register controls and measure both desired and harmful outcomes.'},usage:usageAI,steps:[]});
function sectionStream(result,extra=[]){return new Response([{type:'start',runId:'server-run',reservedTokens:40000,reservedUsd:.1},{type:'usage',usage:usageAI},{type:'result',result},...extra].map(v=>JSON.stringify(v)).join('\n')+'\n',{headers:{'content-type':'application/x-ndjson'}});}
async function consent(h,message='Plan the experiment with honest limits.') {await h.input('studioComposer',message);await h.submit();h.element('studioAIConsent').checked=true;await h.dispatch('change',h.element('studioAIConsent'));}

test('a real simulated section reply keeps suggestions separate until explicit author action',async()=>{
  let sent;const h=harness({status:readyAI,fetch:async(url,init)=>{assert.equal(url,'/api/agent/chat');sent=JSON.parse(init.body);return sectionStream(resultAI());}});
  await h.click('open-stage','methods');h.context().research.question='Can we distinguish history from selection?';
  await h.input('studioOutputBody','Keep this author draft until I choose otherwise.');
  h.model().agents.results.messages.push({id:'private-other-stage',role:'user',text:'DO NOT SEND ANOTHER STAGE',provenance:'Author'});
  const before=plain(h.model().agents.methods.output);await consent(h);
  assert.equal(h.paidRequests(),0);assert.equal(h.element('studioAIConfirm').disabled,false);
  await h.click('confirm-ai');assert.equal(h.paidRequests(),1);
  assert.equal(sent.stage,'methods');assert.equal(sent.consent,true);assert.equal(sent.message,'Plan the experiment with honest limits.');
  assert.ok(sent.context.includes('Can we distinguish history from selection?'));assert.ok(!sent.context.includes('DO NOT SEND ANOTHER STAGE'));assert.ok(!sent.context.includes('Existing manuscript text.'));
  const reply=h.model().agents.methods.messages.find(m=>m.kind==='ai');assert.ok(reply);assert.match(reply.provenance,/AI/);assert.deepEqual(plain(h.model().agents.methods.output),before);
  assert.equal(h.context().research.aiRuns[0].kind,'section_chat');assert.equal(h.context().research.aiRuns[0].usage.totalTokens,500);assert.equal(h.context().research.aiRuns[0].reservedTokens,40000);
  assert.ok(h.logs.some(l=>l.actor==='AI'));assert.equal(h.inserted.length,0);
  await h.click('preview-ai-draft',reply.id);await h.input('studioOutputBody','New author text while confirmation is open.');await h.click('confirm-ai-draft');
  assert.equal(h.model().agents.methods.output.body,'New author text while confirmation is open.');assert.match(h.toasts.at(-1),/changed/);
  await h.click('preview-ai-draft',reply.id);await h.click('confirm-ai-draft');
  assert.equal(h.model().agents.methods.output.body,reply.suggestedDraft.body);assert.equal(h.model().agents.methods.output.status,'draft');assert.equal(h.inserted.length,0);
  assert.equal(h.model().agents.methods.output.history.at(-1).body,'New author text while confirmation is open.');
  assert.match(h.S.exportMarkdown(h.context()),/AI · Author review required/);
});

test('a consent preview becomes invalid when the scoped context changes',async()=>{
  const h=harness({status:readyAI});await h.click('open-stage','methods');await consent(h);
  await h.input('studioOutputBody','Changed after consent preview.');await h.click('confirm-ai');
  assert.equal(h.paidRequests(),0);assert.match(h.toasts.at(-1),/context changed/i);assert.equal(h.model().agents.methods.composer,'Plan the experiment with honest limits.');
});

test('async AI reply resolves the originating project and stage after repeated normalization',async()=>{
  let release;const pending=new Promise(r=>{release=r;});const h=harness({status:readyAI,fetch:async()=>pending});
  await h.click('open-stage','methods');await consent(h);const running=h.click('confirm-ai');
  await Promise.resolve();h.render();await h.click('open-stage','results');h.switchProject('other');h.render();
  release(sectionStream(resultAI()));await running;
  assert.ok(!h.model().agents.methods.messages.some(m=>m.kind==='ai'));
  assert.ok(!h.model().agents.results.messages.some(m=>m.kind==='ai'));
  assert.equal(h.projects.origin.research.agentWorkspace.agents.methods.messages.filter(m=>m.kind==='ai').length,1);
  assert.equal(h.projects.origin.research.aiRuns[0].status,'completed');assert.equal(h.projects.other.research.aiRuns?.length||0,0);
  h.switchProject('origin');await h.click('open-stage','methods');assert.match(h.element('main').innerHTML,/AI · Author review required/);
});

test('failed replies never retry or overwrite new typing or fabricate assistant text',async()=>{
  let release;const pending=new Promise(r=>{release=r;});const h=harness({status:readyAI,fetch:async()=>pending});
  await h.click('open-stage','methods');await consent(h);const running=h.click('confirm-ai');await Promise.resolve();
  await h.input('studioComposer','Keep this newer unsent message.');release(new Response('invalid stream'));await running;
  assert.equal(h.paidRequests(),1);assert.equal(h.model().agents.methods.composer,'Keep this newer unsent message.');assert.ok(!h.model().agents.methods.messages.some(m=>m.kind==='ai'));
  assert.equal(h.context().research.aiRuns[0].status,'failed');assert.equal(h.context().research.aiRuns[0].usage.usageUnknown,true);
  assert.equal(h.inserted.length,0);
});

test('stop aborts the only section request and retains honest incomplete usage',async()=>{
  const h=harness({status:readyAI,fetch:async(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('stopped')),{once:true}))});
  await h.click('open-stage','methods');await consent(h);const running=h.click('confirm-ai');await Promise.resolve();await h.click('stop-ai');await running;
  assert.equal(h.paidRequests(),1);assert.equal(h.context().research.aiRuns[0].status,'stopped');assert.ok(!h.model().agents.methods.messages.some(m=>m.kind==='ai'));
  assert.equal(h.model().agents.methods.composer,'Plan the experiment with honest limits.');
});

test('exact scoped context preview discloses clipping and escapes untrusted inputs',async()=>{
  let body;const h=harness({status:readyAI,fetch:async(_url,init)=>{body=JSON.parse(init.body);return sectionStream(resultAI());}});
  await h.click('open-stage','methods');h.model().agents.methods.inputs.push({id:'selected',title:'Selected note',text:'<img src=x onerror=bad> '+ 'z'.repeat(10000),provenance:'Author'});
  await consent(h);const preview=h.element('dialogContent').innerHTML;
  assert.match(preview,/6,000 characters · clipped/);assert.match(preview,/&lt;img/);assert.ok(!preview.includes('<img src=x'));
  await h.click('confirm-ai');assert.equal(body.context.length,6000);assert.ok(body.context.includes('<img src=x'));assert.equal(h.paidRequests(),1);
});

test('network failure before headers preserves unknown reservation and usage without retry',async()=>{
  const h=harness({status:readyAI,fetch:async()=>{throw Error('Network disconnected');}});await h.click('open-stage','methods');await consent(h);await h.click('confirm-ai');
  const run=h.context().research.aiRuns[0];assert.equal(h.paidRequests(),1);assert.equal(run.status,'failed');assert.equal(run.reservationUnknown,true);assert.equal(run.usage.usageUnknown,true);assert.equal(run.usage.totalTokens,undefined);assert.equal(run.reservedTokens,null);assert.match(h.element('studioAIRunState').innerHTML,/may have consumed a reservation/);
});

test('secure UUID fallback opens consent without randomUUID and keeps disconnected AI off',async()=>{
  let entropyCalls=0;const cryptoFallback={getRandomValues(bytes){entropyCalls++;bytes.fill(17);return bytes;}};
  const off=harness({crypto:cryptoFallback});await off.click('open-stage','methods');await consent(off);await off.click('confirm-ai');assert.equal(off.paidRequests(),0);assert.match(off.element('dialogContent').innerHTML,/Exact message to send/);assert.equal(off.model().agents.methods.composer,'Plan the experiment with honest limits.');
  let sent;const on=harness({crypto:cryptoFallback,status:readyAI,fetch:async(_url,init)=>{sent=JSON.parse(init.body);return sectionStream(resultAI());}});await on.click('open-stage','methods');await consent(on);await on.click('confirm-ai');assert.match(sent.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(entropyCalls,2);
});
test('missing secure randomness fails before consent or paid dispatch with a useful message',async()=>{
  const h=harness({crypto:{},status:readyAI});await h.click('open-stage','methods');await h.input('studioComposer','Keep this request.');await h.submit();assert.equal(h.paidRequests(),0);assert.equal(h.model().agents.methods.composer,'Keep this request.');assert.match(h.toasts.at(-1),/Secure request IDs.*No AI request was sent/);
});

const localFile=(name,text='Local source text.')=>({name,size:text.length,lastModified:1,extracted:text});
const readLocal=async file=>({text:file.extracted,kind:file.name.split('.').at(-1),note:'Text extracted locally; no AI has run.',clipped:false});
function attach(h,files){const input=h.element('studioAttachmentFiles');input.files=files;return h.dispatch('change',input);}
const attachmentHTML=h=>h.element('studioAttachments').innerHTML;
function attachmentIds(h,action='remove-attachment'){
  const re=new RegExp('data-studio-action="'+action+'" data-studio-arg="([^"]+)"','g');
  return [...attachmentHTML(h).matchAll(re)].map(match=>match[1]);
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('file selection shows local reading, preview and removal before any AI request',async()=>{
  const reading=deferred();let reads=0;
  const h=harness({status:readyAI,attachmentReader:async file=>{reads++;await reading.promise;return readLocal(file);}});
  await h.click('open-stage','methods');await h.input('studioComposer','Review this source.');
  const file=localFile('<img src=x onerror=bad>.pdf','A finding with <script>untrusted text</script>.');
  const loading=attach(h,[file]);
  assert.match(attachmentHTML(h),/Reading locally/);assert.match(attachmentHTML(h),/&lt;img/);
  assert.ok(!attachmentHTML(h).includes('<img src=x'));
  assert.equal(h.element('#studioChatForm button[type="submit"]').disabled,true);
  await h.submit();assert.equal(h.paidRequests(),0);assert.match(h.toasts.at(-1),/Wait for files/);
  reading.resolve();await loading;assert.equal(reads,1);
  assert.match(attachmentHTML(h),/data-status="ready"/);assert.equal(h.element('#studioChatForm button[type="submit"]').disabled,false);
  const id=attachmentIds(h,'preview-attachment')[0];await h.click('preview-attachment',id);
  assert.equal(h.modalTitle(),'Preview attachment');assert.match(h.element('dialogContent').innerHTML,/&lt;script&gt;/);
  assert.match(h.element('dialogContent').innerHTML,/only consented text is sent/);
  await h.input('studioAttachmentText','An author-selected passage.');await h.click('save-attachment');
  await h.submit();assert.match(h.element('dialogContent').innerHTML,/An author-selected passage/);
  assert.match(h.element('dialogContent').innerHTML,/Images, formatting and the original files are not sent/);
  await h.click('close-dialog');await h.click('remove-attachment',id);
  assert.equal(attachmentIds(h).length,0);assert.equal(h.paidRequests(),0);
  assert.equal(h.model().agents.methods.composer,'Review this source.');
});

test('drag and drop reserves three slots before reads finish and removed files stay removed',async()=>{
  const waits=new Map(),reads=[];
  const h=harness({attachmentReader:file=>{reads.push(file.name);const d=deferred();waits.set(file.name,{...d,file});return d.promise;}});
  const target={closest:selector=>selector==='[data-studio-dropzone]'?{}:null};let prevented=0;
  const files=[localFile('one.pdf'),localFile('two.docx'),localFile('three.csv')];
  const dropped=h.dispatch('drop',target,{dataTransfer:{types:['Files'],files},preventDefault(){prevented++;}});
  assert.equal(prevented,1);assert.equal(attachmentIds(h).length,3);assert.equal(reads.length,3);
  await attach(h,[localFile('four.txt')]);assert.equal(reads.length,3);assert.match(h.toasts.at(-1),/up to three/);
  const removedId=attachmentIds(h)[0];await h.click('remove-attachment',removedId);assert.equal(attachmentIds(h).length,2);
  await attach(h,[localFile('replacement.txt')]);assert.equal(reads.length,3);assert.match(h.toasts.at(-1),/already being read/);
  waits.get('one.pdf').resolve(await readLocal(files[0]));await new Promise(resolve=>setImmediate(resolve));
  const added=attach(h,[localFile('replacement.txt')]);assert.equal(reads.length,4);assert.equal(attachmentIds(h).length,3);
  for(const d of waits.values())d.resolve(await readLocal(d.file));
  await Promise.all([dropped,added]);
  assert.equal(attachmentIds(h).length,3);assert.ok(!attachmentHTML(h).includes('one.pdf'));
  assert.match(attachmentHTML(h),/replacement.txt/);assert.equal(h.paidRequests(),0);
  await h.dispatch('drop',target,{dataTransfer:{types:['text/plain'],files:[localFile('ignored.txt')]},preventDefault(){throw Error('Text drops are not file imports');}});
  assert.equal(reads.length,4);
});

test('pending reads and attachments stay with their original project and agent across rerenders',async()=>{
  const reading=deferred();
  const h=harness({attachmentReader:async file=>{await reading.promise;return readLocal(file);}});
  await h.click('open-stage','methods');const pending=attach(h,[localFile('methods-only.pdf','Original methods evidence.')]);
  h.render();await h.click('open-stage','results');h.switchProject('other');h.render();
  reading.resolve();await pending;
  assert.equal(attachmentIds(h).length,0);assert.ok(!JSON.stringify(h.projects).includes('Original methods evidence.'),'Unsent attachment text is not persisted in any project');
  h.switchProject('origin');await h.click('open-stage','results');assert.equal(attachmentIds(h).length,0);
  await h.click('open-stage','methods');assert.match(attachmentHTML(h),/methods-only.pdf/);
  const id=attachmentIds(h,'preview-attachment')[0];await h.click('preview-attachment',id);assert.match(h.element('dialogContent').innerHTML,/Original methods evidence/);
  assert.equal(h.paidRequests(),0);
});

test('three long attachments share the bounded consent context and preserve exactly what was sent',async()=>{
  let sent;
  const h=harness({status:readyAI,attachmentReader:readLocal,fetch:async(_url,init)=>{sent=JSON.parse(init.body);return sectionStream(resultAI());}});
  await h.click('open-stage','methods');await h.input('studioOutputBody','DRAFT '.repeat(1800));
  const files=['alpha.pdf','beta.docx','gamma.csv'].map((name,i)=>localFile(name,'SOURCE_'+i+' '+String(i).repeat(11980)));
  await attach(h,files);await consent(h,'Compare these three source excerpts.');
  const preview=h.element('dialogContent').innerHTML;
  assert.match(preview,/3 attachment excerpts to send/);assert.match(preview,/6,000 characters · clipped/);
  for(const file of files)assert.ok(preview.includes(file.name));
  assert.equal(h.paidRequests(),0);
  await h.click('confirm-ai');assert.equal(sent.context.length,6000);
  for(let i=0;i<3;i++)assert.ok(sent.context.includes('SOURCE_'+i),'Every selected attachment contributes text');
  assert.deepEqual(Object.keys(sent).sort(),['consent','context','message','requestId','stage']);
  assert.equal(attachmentIds(h).length,0);
  const author=h.model().agents.methods.messages.find(m=>m.role==='user'&&m.runId);
  assert.equal(author.attachments.length,3);assert.ok(author.attachments.every(f=>f.clipped&&f.text.length<1400));
  for(const file of author.attachments)assert.ok(sent.context.includes(file.text));
  assert.deepEqual(plain(h.context().research.aiRuns[0].attachments),plain(author.attachments));
  const exported=h.S.exportMarkdown(h.context());
  for(const file of author.attachments){assert.ok(exported.includes('Attachment: '+file.name));assert.ok(exported.includes(file.text));}
  assert.equal(h.inserted.length,0);assert.equal(h.context().draft.text,'Existing manuscript text.');
  assert.match(h.element('main').innerHTML,/Text excerpt sent · partial/);
});

test('editing only a clipped-away attachment tail still invalidates the consent preview',async()=>{
  const h=harness({status:readyAI,attachmentReader:readLocal});await h.click('open-stage','methods');
  const prefix='Stable beginning. '+ 'a'.repeat(6000);await attach(h,[localFile('paper.pdf',prefix+'OLD TAIL')]);
  await consent(h);
  const id=attachmentIds(h,'preview-attachment')[0];await h.click('preview-attachment',id);
  await h.input('studioAttachmentText',prefix+'NEW TAIL');await h.click('save-attachment');
  // The underlying consent checkbox remains checked in this test harness, but
  // changing material outside the outgoing excerpt must still invalidate it.
  await h.click('confirm-ai');assert.equal(h.paidRequests(),0);assert.match(h.toasts.at(-1),/context.*changed/i);
  assert.equal(h.model().agents.methods.composer,'Plan the experiment with honest limits.');
});

test('unreadable attachments block dispatch and can be removed without losing the message',async()=>{
  const h=harness({status:readyAI,attachmentReader:async()=>{throw Error('No readable text. This may be a scanned PDF.');}});
  await h.click('open-stage','methods');await h.input('studioComposer','Keep this question.');await attach(h,[localFile('scan.pdf')]);
  assert.match(attachmentHTML(h),/data-status="error"/);assert.match(attachmentHTML(h),/scanned PDF/);
  await h.submit();assert.equal(h.paidRequests(),0);assert.equal(h.element('#studioChatForm button[type="submit"]').disabled,true);
  await h.click('remove-attachment',attachmentIds(h)[0]);await h.submit();
  assert.match(h.element('dialogContent').innerHTML,/Keep this question/);assert.equal(h.paidRequests(),0);
});

test('failed attachment turns restore their queue unless newer attachments are already present',async()=>{
  for(const addNew of [false,true]){
    const response=deferred();const h=harness({status:readyAI,attachmentReader:readLocal,fetch:async()=>response.promise});
    await h.click('open-stage','methods');await attach(h,[localFile('original.pdf','Evidence sent before failure.')]);await consent(h,'Read this evidence.');
    const running=h.click('confirm-ai');await Promise.resolve();assert.equal(attachmentIds(h).length,0);
    if(addNew){await h.input('studioComposer','A newer unsent question.');await attach(h,[localFile('newer.txt','New unsent evidence.')]);}
    response.resolve(new Response('invalid stream'));await running;
    assert.equal(h.paidRequests(),1);assert.equal(h.context().research.aiRuns[0].status,'failed');
    assert.equal(h.context().research.aiRuns[0].attachments[0].name,'original.pdf');
    assert.match(h.S.exportMarkdown(h.context()),/Evidence sent before failure/);
    assert.equal(attachmentIds(h).length,1);assert.match(attachmentHTML(h),addNew?/newer.txt/:/original.pdf/);
    if(addNew){assert.ok(!attachmentHTML(h).includes('original.pdf'));assert.equal(h.model().agents.methods.composer,'A newer unsent question.');}
    else assert.equal(h.model().agents.methods.composer,'Read this evidence.');
    assert.ok(!h.model().agents.methods.messages.some(m=>m.kind==='ai'));
  }
});

test('chat is focused by default while drafts, context and active tutorial remain accessible',async()=>{
  const h=harness();await h.click('open-stage','methods');
  assert.match(h.element('main').innerHTML,/data-side-open="false"/);assert.doesNotMatch(h.element('main').innerHTML,/<details class="studio-examples" open>/);
  await h.click('open-panel','output');assert.match(h.element('main').innerHTML,/data-side-open="true"/);assert.equal(h.model().sideTab,'output');
  await h.click('close-panel');assert.match(h.element('main').innerHTML,/data-side-open="false"/);
  await h.click('open-panel','context');assert.equal(h.model().sideTab,'context');assert.match(h.element('main').innerHTML,/data-side-open="true"/);
  h.context().project.isProcessTutorial=true;h.context().research.processTour={status:'active'};await h.click('open-stage','methods');
  assert.match(h.element('main').innerHTML,/data-side-open="true"/);assert.match(h.element('main').innerHTML,/<details class="studio-examples" open>/);
  assert.match(h.element('main').innerHTML,/data-studio-action="demo"/);assert.equal(h.paidRequests(),0);
});


test('failed files can be replaced with an author-provided excerpt without pretending extraction succeeded',async()=>{
  const h=harness({status:readyAI,attachmentReader:async()=>{throw Error('Unsupported file.');}});
  await h.click('open-stage','methods');await h.input('studioComposer','Check this passage.');await attach(h,[localFile('legacy.doc')]);
  const id=attachmentIds(h,'paste-attachment')[0];assert.ok(id);
  await h.click('paste-attachment',id);assert.match(h.element('dialogContent').innerHTML,/not extracted or verified/);
  await h.input('studioAttachmentText','Manually copied experimental passage.');await h.click('save-attachment');
  assert.match(attachmentHTML(h),/MANUAL TEXT/);assert.doesNotMatch(attachmentHTML(h),/data-status="error"/);
  await h.click('preview-attachment',id);assert.match(h.element('dialogContent').innerHTML,/Author-provided text/);
  await h.submit();assert.match(h.element('dialogContent').innerHTML,/Manually copied experimental passage/);assert.equal(h.paidRequests(),0);
});

test('OCR is explicit, uses no paid endpoint and previews its result before sending',async()=>{
  let calls=0;
  const h=harness({status:readyAI,attachmentReader:async()=>{throw Error('Scan needs OCR.');},ocrReader:async(_file,{onProgress})=>{calls++;onProgress('Reading page 1 of 1…');return {text:'Recognized source text.',kind:'PDF OCR',clipped:false,note:'OCR text; review for mistakes.'};}});
  await h.click('open-stage','methods');await attach(h,[localFile('scan.pdf')]);
  assert.equal(calls,0);const id=attachmentIds(h,'ocr-preview')[0];assert.ok(id);
  await h.click('ocr-preview',id);assert.match(h.element('dialogContent').innerHTML,/first three PDF pages/);assert.equal(calls,0);
  await h.click('ocr-start',id);assert.equal(calls,1);assert.equal(h.paidRequests(),0);assert.match(attachmentHTML(h),/PDF OCR/);
  await h.click('preview-attachment',id);assert.match(h.element('dialogContent').innerHTML,/Recognized source text/);assert.match(h.element('dialogContent').innerHTML,/review for mistakes/);
  assert.ok(!JSON.stringify(h.projects).includes('Recognized source text'),'Unsent OCR text remains ephemeral');
});

test('removing an OCR job aborts it and cannot resurrect the card',async()=>{
  const finished=deferred();let signal;
  const h=harness({attachmentReader:async()=>{throw Error('Scan.');},ocrReader:async(_file,options)=>{signal=options.signal;await finished.promise;return {text:'Removed text',kind:'OCR',note:'review'};}});
  await h.click('open-stage','methods');await attach(h,[localFile('scan.pdf')]);const id=attachmentIds(h,'ocr-preview')[0];
  const pending=h.click('ocr-start',id);await Promise.resolve();await h.click('remove-attachment',id);assert.equal(signal.aborted,true);
  finished.resolve();await pending;assert.equal(attachmentIds(h).length,0);assert.equal(h.paidRequests(),0);
});

test('a failed OCR reread keeps a successful original excerpt and excludes overlapping scans',async()=>{
  const finished=deferred();let calls=0;
  const h=harness({attachmentReader:readLocal,ocrReader:async()=>{calls++;await finished.promise;throw Error('Recognition timed out.');}});
  await h.click('open-stage','methods');await attach(h,[localFile('first.pdf','Original text.'),localFile('second.pdf','Another text.')]);
  const [first,second]=attachmentIds(h,'ocr-preview');const pending=h.click('ocr-start',first);await Promise.resolve();await h.click('ocr-start',second);assert.equal(calls,1);
  finished.resolve();await pending;await h.click('preview-attachment',first);assert.match(h.element('dialogContent').innerHTML,/Original text/);assert.match(h.toasts.join(' '),/earlier excerpt was kept/);
});

test('OCR completion stays in its originating workspace and raw retry storage is bounded',async()=>{
  const finished=deferred();
  const h=harness({attachmentReader:readLocal,ocrReader:async()=>{await finished.promise;return {text:'Methods scan text.',kind:'OCR',note:'Review'};}});
  await h.click('open-stage','methods');await attach(h,[localFile('methods.pdf')]);const id=attachmentIds(h,'ocr-preview')[0];const pending=h.click('ocr-start',id);
  await h.click('open-stage','results');await attach(h,[localFile('one.pdf'),localFile('two.pdf')]);await attach(h,[localFile('three.pdf')]);
  assert.equal(attachmentIds(h,'ocr-preview').length,3);finished.resolve();await pending;assert.ok(!attachmentHTML(h).includes('Methods scan text.'));
  await h.click('open-stage','methods');assert.equal(attachmentIds(h,'ocr-preview').length,0,'Only three original files are retained');await h.click('preview-attachment',id);assert.match(h.element('dialogContent').innerHTML,/Methods scan text/);
});

test('connection and file help clearly distinguish tools, OCR and paid AI',async()=>{
  const h=harness();assert.match(h.S.nav(h.context(),'studio'),/Connections/);
  await h.click('connections');assert.match(h.element('dialogContent').innerHTML,/read-only tools/);assert.match(h.element('dialogContent').innerHTML,/do not run a paid AI call/);assert.match(h.element('dialogContent').innerHTML,/drafts and attachments stored in your browser/);
  await h.click('attachment-help');assert.match(h.element('dialogContent').innerHTML,/20 MB/);assert.match(h.element('dialogContent').innerHTML,/Read scan/);assert.equal(h.paidRequests(),0);
});


test('partial extraction and OCR limitations are disclosed in the exact AI context',async()=>{
  const h=harness({status:readyAI,attachmentReader:async()=>({text:'Visible page text.',kind:'PDF OCR',partial:true,clipped:false,note:'OCR may contain errors. Page 2 could not be read.'})});
  await h.click('open-stage','methods');await attach(h,[localFile('partial.pdf')]);assert.match(attachmentHTML(h),/partial extraction/);
  await consent(h);assert.match(h.element('dialogContent').innerHTML,/PARTIAL EXTRACTION/);assert.match(h.element('dialogContent').innerHTML,/Page 2 could not be read/);assert.equal(h.paidRequests(),0);
});

test('Add opens a real menu without opening the file picker or rerendering the message',async()=>{
  const h=harness({attachmentReader:async()=>({text:'Local excerpt',kind:'text',note:''})});
  await h.input('studioComposer','A draft with a cursor in the middle.');
  const composer=h.element('studioComposer');composer.setSelectionRange(12,18);
  await attach(h,[{name:'notes.txt',size:100,lastModified:1}]);
  const before=h.renderCount(),cards=h.element('studioAttachments').innerHTML;
  const html=h.S.render(h.context());
  assert.match(html,/id="studioAddToggle"[^>]*aria-haspopup="menu"/);
  assert.match(html,/id="studioMenuUpload" role="menuitem" tabindex="-1"/);
  assert.match(html,/id="studioMenuContext" role="menuitem" tabindex="-1"/);
  assert.match(html,/id="studioMenuHelp" role="menuitem" tabindex="-1"/);
  await h.click('toggle-add-menu');
  assert.equal(h.element('studioAddMenu').hidden,false);
  assert.equal(h.element('studioAddToggle').getAttribute('aria-expanded'),'true');
  assert.equal(h.focused().id,'studioMenuUpload');
  assert.equal(h.element('studioAttachmentFiles').clicks,0,'Only choosing Upload files should open the native picker.');
  assert.equal(h.renderCount(),before);
  assert.equal(composer.value,'A draft with a cursor in the middle.');
  assert.equal(composer.selectionStart,12);assert.equal(composer.selectionEnd,18);
  assert.equal(h.element('studioAttachments').innerHTML,cards);
  await h.dispatch('keydown',h.element('studioMenuUpload'),{key:'Escape'});
  assert.equal(h.element('studioAddMenu').hidden,true);
  assert.equal(h.element('studioAddToggle').getAttribute('aria-expanded'),'false');
  assert.equal(h.focused().id,'studioAddToggle');
  assert.equal(h.renderCount(),before);assert.equal(h.paidRequests(),0);
});

test('the Add menu supports keyboard movement, Escape, Tab and outside interaction',async()=>{
  const h=harness();let prevented=0;
  await h.dispatch('keydown',h.element('studioAddToggle'),{key:'ArrowUp',preventDefault(){prevented++;}});
  assert.equal(h.focused().id,'studioMenuHelp');
  await h.dispatch('keydown',h.element('studioMenuHelp'),{key:'ArrowDown'});
  assert.equal(h.focused().id,'studioMenuUpload');
  await h.dispatch('keydown',h.element('studioMenuUpload'),{key:'End'});
  assert.equal(h.focused().id,'studioMenuHelp');
  await h.dispatch('keydown',h.element('studioMenuHelp'),{key:'Home'});
  assert.equal(h.focused().id,'studioMenuUpload');
  await h.dispatch('keydown',h.element('studioMenuUpload'),{key:'ArrowUp'});
  assert.equal(h.focused().id,'studioMenuHelp');
  await h.dispatch('keydown',h.element('studioMenuHelp'),{key:'Tab',preventDefault(){prevented++;}});
  assert.equal(h.element('studioAddMenu').hidden,true);
  assert.equal(h.focused().id,'studioAddToggle');
  assert.equal(prevented,1,'Tab must keep native movement rather than trapping focus in the menu.');
  await h.click('toggle-add-menu');
  await h.dispatch('pointerdown',h.element('studioMenuContext'));
  assert.equal(h.element('studioAddMenu').hidden,false,'Pointer interaction within the menu must not dismiss before the chosen action.');
  h.element('studioComposer').focus();
  await h.dispatch('pointerdown',h.element('studioComposer'));
  assert.equal(h.element('studioAddMenu').hidden,true);
  assert.equal(h.focused().id,'studioComposer','Outside clicks must not steal focus back from the field being clicked.');
  await h.click('toggle-add-menu');
  await h.dispatch('focusin',h.element('studioOutputBody'));
  assert.equal(h.element('studioAddMenu').hidden,true);
});

test('Upload files alone invokes the picker and cancel preserves the pending message',async()=>{
  const h=harness();await h.input('studioComposer','Unsent question.');
  await h.click('toggle-add-menu');await h.click('attach-files');
  assert.equal(h.element('studioAttachmentFiles').clicks,1);
  assert.equal(h.element('studioAddMenu').hidden,true);
  assert.equal(h.focused().id,'studioAddToggle');
  await h.dispatch('cancel',h.element('studioAttachmentFiles'));
  assert.equal(h.model().agents.organizer.composer,'Unsent question.');
  assert.equal(h.focused().id,'studioAddToggle');
  assert.equal(h.paidRequests(),0);
  await h.click('toggle-add-menu');await h.click('input-add');
  assert.match(h.modalTitle(),/Add context/);
  assert.match(h.element('dialogContent').innerHTML,/studioNoteForm/);
  assert.equal(h.element('studioAttachmentFiles').clicks,1);
  await h.click('close-dialog');await h.click('toggle-add-menu');await h.click('attachment-help');
  assert.equal(h.modalTitle(),'Files you can use');
  assert.equal(h.element('studioAttachmentFiles').clicks,1);
});

test('menus close on section, project and page changes without clearing scoped text or attachments',async()=>{
  const h=harness({attachmentReader:async()=>({text:'Original file text',kind:'text'})});
  await h.input('studioComposer','Keep the original composer.');
  await attach(h,[{name:'original.txt',size:100,lastModified:1}]);
  await h.click('toggle-add-menu');await h.click('open-stage','results');
  assert.equal(h.element('studioAddMenu').hidden,true);
  assert.equal(h.focused().id,'studioComposer');
  await h.click('toggle-add-menu');h.switchProject('other');
  assert.equal(h.element('studioAddMenu').hidden,true);
  await h.click('toggle-add-menu');await h.dispatch('click',h.element('outside-navigation'));
  assert.equal(h.element('studioAddMenu').hidden,true);
  h.switchProject('origin');await h.click('open-stage','organizer');
  assert.equal(h.element('studioComposer').value,'Keep the original composer.');
  assert.match(h.element('studioAttachments').innerHTML,/original.txt/);
});

test('Enter opens only consent while Shift+Enter and IME completion do not submit',async()=>{
  const h=harness();await h.input('studioComposer','A question awaiting review.');const composer=h.element('studioComposer');
  let prevented=0;const event={key:'Enter',preventDefault(){prevented++;}};
  await h.dispatch('keydown',composer,{...event,shiftKey:true});
  await h.dispatch('keydown',composer,{...event,isComposing:true});
  await h.dispatch('keydown',composer,{...event,keyCode:229});
  await h.dispatch('keydown',composer,{...event,which:229});
  await h.dispatch('compositionstart',composer);await h.dispatch('keydown',composer,event);
  assert.equal(prevented,0);assert.equal(h.element('dialog').open,false);
  await h.dispatch('compositionend',composer);await h.dispatch('keydown',composer,event);
  assert.equal(prevented,1);assert.equal(h.element('dialog').open,true);
  assert.match(h.modalTitle(),/^Send to /);
  assert.match(h.element('dialogContent').innerHTML,/A question awaiting review/);
  assert.equal(h.paidRequests(),0,'A keyboard shortcut cannot bypass the exact-text approval dialog.');
});

test('composer auto-height grows, caps and shrinks in place with a smaller mobile cap',async()=>{
  const h=harness(),composer=h.element('studioComposer'),renders=h.renderCount();
  composer.setSelectionRange(4,4);composer.scrollHeight=120;await h.input('studioComposer','Multiline text.');
  assert.equal(composer.style.height,'120px');assert.equal(composer.style.overflowY,'hidden');
  composer.scrollHeight=700;await h.input('studioComposer','A longer draft.');
  assert.equal(composer.style.height,'200px');assert.equal(composer.style.overflowY,'auto');
  composer.scrollHeight=25;await h.input('studioComposer','Short');
  assert.equal(composer.style.height,'56px');assert.equal(composer.style.overflowY,'hidden');
  assert.equal(h.renderCount(),renders);assert.equal(composer.selectionStart,4);
  const mobile=harness({mobile:true});mobile.element('studioComposer').scrollHeight=700;
  await mobile.input('studioComposer','A long draft on a narrow screen.');
  assert.equal(mobile.element('studioComposer').style.height,'140px');
});

test('copy reply copies exact AI and prepared text with success feedback and no manuscript edit',async()=>{
  const h=harness();await h.click('open-stage','methods');await h.click('demo','0');
  const example=h.model().agents.methods.messages.find(m=>m.kind==='example');
  const before=plain(h.model().agents.methods.output);
  await h.click('copy-reply',example.id);
  assert.deepEqual(h.clipboard,[example.text]);assert.match(h.toasts.at(-1),/Reply copied/);
  assert.equal(h.element('action:copy-reply:'+example.id).textContent,'Copied');
  h.model().agents.methods.messages.push({id:'real-reply',role:'assistant',kind:'ai',text:'Exact answer.\nPreserve this line and <literal> text.',provenance:'AI · Author review required'});
  const html=h.S.render(h.context());assert.match(html,/data-studio-action="copy-reply" data-studio-arg="real-reply"/);
  await h.click('copy-reply','real-reply');
  assert.equal(h.clipboard[1],'Exact answer.\nPreserve this line and <literal> text.');
  assert.deepEqual(plain(h.model().agents.methods.output),before);
  assert.equal(h.inserted.length,0);assert.equal(h.paidRequests(),0);
  h.switchProject('other');await h.click('copy-reply','real-reply');
  assert.equal(h.clipboard.length,2,'A stale reply button cannot copy another project’s message.');
});

test('blocked clipboard reports failure without claiming the reply was copied',async()=>{
  const h=harness({clipboardError:true});await h.click('open-stage','methods');await h.click('demo','0');
  const example=h.model().agents.methods.messages.find(m=>m.kind==='example');
  await h.click('copy-reply',example.id);
  assert.equal(h.clipboard.length,0);assert.match(h.toasts.at(-1),/Could not copy/);
  assert.notEqual(h.element('action:copy-reply:'+example.id).textContent,'Copied');
  assert.equal(h.element('action:copy-reply:'+example.id).disabled,false);
});

test('map links can open the requested draft or context panel in one render',()=>{
  const h=harness(),before=h.renderCount();h.S.openStage('methods','output');
  assert.equal(h.model().activeStage,'methods');assert.equal(h.model().sideTab,'output');
  assert.match(h.element('main').innerHTML,/data-mobile-panel="output" data-side-open="true"/);
  assert.equal(h.renderCount(),before+1);
  h.S.openStage('results','context');assert.equal(h.model().sideTab,'context');
  assert.match(h.element('main').innerHTML,/data-mobile-panel="context" data-side-open="true"/);
  h.S.openStage('organizer');assert.match(h.element('main').innerHTML,/data-mobile-panel="chat" data-side-open="false"/);
});

test('local study design checker distinguishes same-cell scope, keeps author text separate from examples and never sends or edits',async()=>{
  const design=await import('../public/study-design.js'),h=harness({design});
  const check=()=>h.dispatch('submit',h.element('studyDesignForm'));
  const result=()=>h.element('designOutcome');
  for(const stage of ['methods','discussion']){await h.click('open-stage',stage);assert.doesNotMatch(h.element('main').innerHTML,/data-studio-action="check-design"/);}
  for(const stage of ['results','references']){
    await h.click('open-stage',stage);assert.match(h.element('main').innerHTML,/Check study design/);
    await h.input('studioOutputBody','My unaltered manuscript sentence.');
    const before=plain(h.model().agents[stage]);
    await h.click('check-design');assert.equal(h.modalTitle(),'Check study design');assert.match(h.element('dialogContent').innerHTML,/No AI tokens/);
    await h.click('design-draft');assert.equal(h.element('designClaim').value,before.output.body);
    await h.input('designClaim','Author example text');await h.input('designPassage','Original passage that must not be overwritten.');
    await h.click('design-mode','cells');await check();assert.equal(result().getAttribute('data-result'),'incompatible');
    assert.match(h.element('designOrigin').textContent,/paraphrase, not a quotation/);
    await h.input('designPassage','Bulk study methods were not described here.');assert.equal(result().hidden,true);
    await check();assert.equal(result().getAttribute('data-result'),'unknown');
    await h.input('designPassage','We used time-lapse microscopy to track the same individual cells across all time points.');
    await check();assert.equal(result().getAttribute('data-result'),'compatible');assert.match(result().innerHTML,/Check separately/);
    await h.click('design-mode','locus');await check();assert.equal(result().getAttribute('data-result'),'not_applicable');
    assert.match(result().innerHTML,/Verify the numbers/);
    await h.click('design-mode','author');assert.equal(h.element('designClaim').value,'Author example text');
    assert.equal(h.element('designPassage').value,'Original passage that must not be overwritten.');
    assert.deepEqual(plain(h.model().agents[stage]),before);assert.equal(h.inserted.length,0);
    await h.click('close-dialog');await h.click('check-design');assert.equal(h.element('designClaim').value,'');assert.equal(h.element('designPassage').value,'');await h.click('close-dialog');
  }
  assert.equal(h.paidRequests(),0);
});

test('paid chat study design is optional per send and scoped to Results and References',async()=>{
  const bodies=[];const h=harness({status:readyAI,fetch:async(url,init)=>{assert.equal(url,'/api/agent/chat');const body=JSON.parse(init.body);bodies.push(body);return sectionStream(resultAI(body.stage));}});
  for(const stage of ['results','references','methods']){
    await h.click('open-stage',stage);await consent(h);
    const offered=stage!=='methods';assert.equal(h.element('dialogContent').innerHTML.includes('id="studioDesignOpt"'),offered);
    if(offered)assert.equal(h.element('studioDesignOpt').checked,false);
    h.element('studioDesignOpt').checked=true;await h.click('confirm-ai');
    assert.equal(!!bodies.at(-1).studyDesign,offered);
    if(offered){await consent(h);assert.equal(h.element('studioDesignOpt').checked,false);await h.click('confirm-ai');assert.equal('studyDesign' in bodies.at(-1),false);}
  }
  assert.equal(h.paidRequests(),5);
});


test('research navigation groups work into four areas and nests existing paper sections without changing their data',async()=>{
  const h=harness({features:{PherogentMap:{},PherogentStudyWorkflows:{},PherogentLeeStudy:{},PherogentMeter:{},PherogentDataLab:{}}});
  h.context().draft.title='<img src=x> Our study';
  await h.click('open-stage','methods');
  await h.input('studioComposer','Keep this unsent protocol question.');
  await h.input('studioOutputBody','Our author-written protocol.');
  const before=plain(h.model());
  const nav=h.S.nav(h.context(),'studio');
  const positions=['Sources','Checks','Analyses','Outputs'].map(label=>nav.indexOf('aria-label="'+label+'"'));
  assert.ok(positions.every((value,index)=>value>=0&&(index===0||value>positions[index-1])));
  assert.match(nav,/data-arg="outputs"[^>]*>[\s\S]*?All outputs/);
  assert.match(nav,/data-arg="data-analysis"[^>]*>[\s\S]*?Data &amp; results/);
  const paper=nav.match(/<details id="studioPaperNav"[\s\S]*?<\/details>/)?.[0];
  assert.ok(paper);
  assert.match(paper,/&lt;img src=x&gt; Our study/);
  assert.ok(!paper.includes('<img src=x>'));
  assert.match(paper,/data-arg="manuscript"/);
  for(const id of ['title','abstract','introduction','methods','results','figures','discussion','references']) {
    assert.match(paper,new RegExp('data-studio-arg="'+id+'"'));
    assert.equal((nav.match(new RegExp('data-studio-arg="'+id+'"','g'))||[]).length,1);
  }
  assert.match(paper,/data-studio-arg="methods" aria-current="page"/);
  assert.deepEqual(plain(h.model()),before,'Navigation must not migrate, clear or copy research data.');
  assert.equal(h.paidRequests(),0);
  const analysisNav=h.S.nav(h.context(),'study-workflows');
  assert.equal((analysisNav.match(/aria-current="page"/g)||[]).length,1,'The shared study screen has one active navigation item.');
});

test('paper tree collapse is project scoped and opening a paper task reveals its location',async()=>{
  const h=harness(),details=h.element('studioPaperNav');
  details.dataset={navProject:'origin'};details.open=false;
  await h.dispatch('toggle',details);
  let nav=h.S.nav(h.context(),'map');
  assert.doesNotMatch(nav,/<details id="studioPaperNav"[^>]* open/);
  h.switchProject('other');
  assert.match(h.S.nav(h.context(),'map'),/<details id="studioPaperNav"[^>]* open/);
  h.switchProject('origin');
  assert.doesNotMatch(h.S.nav(h.context(),'map'),/<details id="studioPaperNav"[^>]* open/);
  await h.click('open-stage','results');
  assert.match(h.S.nav(h.context(),'studio'),/<details id="studioPaperNav"[^>]* open/);
  assert.equal(h.paidRequests(),0);
});

test('context shows shared brief separately from task inputs and linked result snapshots',async()=>{
  const h=harness();await h.click('open-stage','results');
  h.model().agents.results.inputs.push(
    {id:'note',kind:'note',title:'Local methods note',text:'Author supplied text'},
    {id:'copy',kind:'handoff',title:'Reviewed protocol',text:'Frozen copy',fromStage:'methods',status:'reviewed'}
  );
  h.model().agents.methods.inputs.push({id:'private',kind:'note',title:'A different task only',text:'Not included'});
  h.context().papers.push({id:'paper',title:'Unselected library paper'});
  await h.click('open-panel','context');
  const html=h.element('main').innerHTML;
  assert.match(html,/Project-wide/);assert.match(html,/This task/);assert.match(html,/Linked result/);
  assert.match(html,/1 saved papers · 0 selected here/);
  assert.match(html,/library is not included automatically/);
  assert.ok(!html.includes('A different task only'));
  assert.ok(!html.includes('Unselected library paper'));
  assert.equal(h.paidRequests(),0);
});


test('reviewed output snapshots are labelled as linked results with their saved version and provenance',async()=>{
  const h=harness();await h.click('open-stage','results');
  h.model().agents.results.inputs.push({id:'report-copy',kind:'note',title:'Analysis report',text:'A frozen reviewed report.',provenance:'Author-reviewed output snapshot',outputRef:{id:'report-one',revision:3,projectId:'origin'}});
  await h.click('open-panel','context');
  const html=h.element('main').innerHTML;
  assert.match(html,/Linked result/);
  assert.match(html,/Reviewed output · saved version 3; later edits do not update this copy/);
  assert.equal(h.model().agents.results.inputs[0].kind,'note');
  await h.click('inspect-input','report-copy');
  assert.match(h.element('dialogContent').innerHTML,/Author-reviewed output snapshot/);
  assert.match(h.element('dialogContent').innerHTML,/saved version 3/);
  assert.match(h.element('dialogContent').innerHTML,/A frozen reviewed report/);
  assert.equal(h.paidRequests(),0);
});
