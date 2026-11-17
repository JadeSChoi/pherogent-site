'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const lee=JSON.parse(fs.readFileSync(path.join(root,'public/data/lee2014/data.json'),'utf8'));
function harness(options={}){
 const elements=new Map(),handlers={},events=[],requests=[],downloads=[],notices=[],navigation=[];
 const projects={a:{project:{id:'a'},draft:{title:'Project A'},research:{studyRuns:[]}},b:{project:{id:'b'},draft:{title:'Project B'},research:{studyRuns:[]}}};let active='a';
 const el=(id,extra={})=>{const value={id,value:'',checked:false,innerHTML:'',textContent:'',disabled:false,setAttribute(){},classList:{toggle(){}},...extra};elements.set(id,value);return value;};
 for(const id of ['dataAnalysis','dlTabs','dlPanel','dlError','dlValidate','dlInputStatus','dlFileLabel','dlFileDetail','dlConfirm','dlIndependentUnits'])el(id);
 const document={getElementById:id=>elements.get(id)||null,addEventListener:(type,fn)=>(handlers[type]||=[]).push(fn),dispatchEvent:event=>{events.push(event);if(event.type==='pherogent:study-workflow')projects[event.detail.projectId].research.studyRuns.unshift(event.detail.run);}};
 const sandbox={window:{crypto:options.crypto||webcrypto},document,TextEncoder,TextDecoder,Uint8Array,Date,Math,JSON,console,CustomEvent:class{constructor(type,opt){this.type=type;this.detail=opt.detail;}},fetch:async(...args)=>{requests.push(args);return options.fetch?options.fetch(...args):{ok:true,json:async()=>structuredClone(lee)};}};
 vm.createContext(sandbox);for(const file of ['lee-analysis.js','research-skills.js','data-analysis-engine.js','data-analysis.js'])vm.runInContext(fs.readFileSync(path.join(root,'public',file),'utf8'),sandbox);
 const ui=sandbox.window.PherogentDataLab;
 ui.init({context:()=>projects[active],navigate:value=>navigation.push(value),toast:value=>notices.push(value),download:(...args)=>downloads.push(args),save(){},render(){},log(){}});
 const dispatch=(type,target,extra={})=>Promise.all((handlers[type]||[]).map(fn=>fn({target,preventDefault(){},...extra})));
 const click=action=>{const target={dataset:{dlAction:action},closest:s=>s==='[data-dl-action]'?target:null};return dispatch('click',target);};
 const input=(id,value)=>dispatch('input',el(id,{value}));
 const change=(id,value,extra={})=>dispatch('change',el(id,{value,...extra}));
 const submit=id=>dispatch('submit',{id});
 ui.render(projects.a);
 return {ui,projects,events,requests,downloads,notices,navigation,elements,el,dispatch,click,input,change,submit,switchProject:id=>{active=id;},ctx:()=>projects[active],html:()=>ui.render(projects[active]),panel:()=>elements.get('dlPanel').innerHTML};
}
async function synthetic(h){await h.click('synthetic');await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');}
test('opening data workspace has no AI/network activity and explains local privacy',()=>{
 const h=harness(),html=h.html();assert.match(html,/Connect your data/);assert.match(html,/0 AI calls/);assert.match(html,/Measurements stay in memory/);assert.match(html,/Lee 2014/);assert.equal(h.requests.length,0);assert.equal(h.events.length,0);
});
test('synthetic format example requires mapping confirmation then computes and saves real arithmetic',async()=>{
 const h=harness();await h.click('synthetic');await h.submit('dlConnectForm');assert.match(h.elements.get('dlError').innerHTML,/Confirm the sample/);assert.equal(h.events.length,0);
 await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');assert.match(h.panel(),/Available analyses|AVAILABLE ANALYSES/);assert.match(h.panel(),/SYNTHETIC INPUT/);
 await h.change('dlInterval','0');await h.submit('dlRunForm');assert.equal(h.events.length,1);const run=h.events[0].detail.run;
 assert.equal(run.workflow,'data-analysis');assert.equal(run.projectId,'a');assert.equal(run.origin,'synthetic');assert.equal(run.transition.observedPairs,2);assert.ok(Math.abs(run.transition.meanDelta-.1)<1e-12);assert.equal(run.transition.exactEqual,1);assert.equal(run.source.sha256.length,64);assert.equal(run.usage.totalTokens,0);
 assert.match(h.panel(),/SYNTHETIC SOFTWARE TEST/);assert.match(h.panel(),/Author review in Outputs/);assert.equal(h.requests.length,0);
 await h.click('outputs');assert.deepEqual(h.navigation,['outputs']);assert.equal(h.events.length,1);await h.click('export');assert.equal(JSON.parse(h.downloads[0][1]).source.sha256,run.source.sha256);
});
test('editing synthetic example preserves synthetic provenance and input element focus node',async()=>{
 const h=harness();await h.click('synthetic');const text=h.ui.template.replace('0.20','0.25');const node=h.el('dlPaste',{value:text});await h.dispatch('input',node);assert.equal(h.elements.get('dlPaste'),node);
 await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');await h.submit('dlRunForm');assert.equal(h.events[0].detail.run.origin,'synthetic');
});
test('real Lee example loads full data, calculations use all7890regions, no provider calls',async()=>{
 const h=harness();await h.click('lee');assert.equal(h.requests.length,1);assert.equal(h.requests[0][0],'/data/lee2014/data.json');assert.match(h.panel(),/7,890/);
 await h.submit('dlRunForm');const run=h.events[0].detail.run;assert.equal(run.state.features,7890);assert.equal(run.transition.observedPairs,7890);assert.equal(run.origin,'computed');assert.equal(run.source.origin,'public_dataset');assert.match(h.panel(),/CALCULATED BY PHEROGENT/);assert.ok(JSON.stringify(run).length<60000);
});
test('raw uploads stay local and invalid uploads do not make a successful run',async()=>{
 const h=harness();await h.change('dlFile','',{files:[{name:'bad.pdf',size:3,arrayBuffer:async()=>new ArrayBuffer(3)}]});assert.match(h.elements.get('dlError').innerHTML,/csv or .tsv/);assert.equal(h.events.length,0);assert.equal(h.requests.length,0);
 await h.change('dlFile','',{files:[{name:'large.csv',size:2097153,arrayBuffer:async()=>new ArrayBuffer(0)}]});assert.match(h.elements.get('dlError').innerHTML,/2 MB/);
});
test('uploaded source hash matches actual bytes and reports use author-supplied metadata',async()=>{
 const h=harness(),bytes=new TextEncoder().encode(h.ui.template.replace(/SYNTHETIC_/g,'CUSTOM_'));
 await h.change('dlFile','',{files:[{name:'measurements.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}]});
 await h.input('dlStudy','My study');await h.input('dlRoute','ArmA');await h.input('dlPopulation','Declared culture');await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');await h.submit('dlRunForm');
 const run=h.events[0].detail.run;assert.equal(run.study,'My study');assert.equal(run.source.fileName,'measurements.csv');assert.equal(run.source.origin,'user_upload');assert.equal(h.requests.length,0);assert.match(h.panel(),/does not authenticate the study/);
});
test('old async load cannot write to a switched project even without module re-render',async()=>{
 let release;const h=harness({fetch:()=>new Promise(resolve=>{release=resolve;})});const pending=h.click('lee');h.switchProject('b');release({ok:true,json:async()=>lee});await pending;assert.equal(h.events.length,0);assert.match(h.html(),/Connect your data/);assert.match(h.html(),/data-dl-phase="analyses" disabled/);
});
test('project switch during hashing discards old result and confirmation',async()=>{
 let release;const crypto={subtle:{digest:()=>new Promise(resolve=>{release=resolve;})}};const h=harness({crypto});await h.click('synthetic');await h.change('dlConfirm','',{checked:true});const pending=h.submit('dlConnectForm');h.switchProject('b');release(new Uint8Array(32).buffer);await pending;assert.equal(h.events.length,0);assert.match(h.html(),/Connect your data/);assert.doesNotMatch(h.html(),/SYNTHETIC INPUT/);
});
test('saved summaries restore without retaining raw data and settings edits invalidate visible result',async()=>{
 const h=harness();await synthetic(h);await h.submit('dlRunForm');assert.equal(h.events.length,1);h.switchProject('b');h.html();h.switchProject('a');assert.match(h.html(),/Saved result restored/);assert.match(h.html(),/Synthetic software test|SYNTHETIC SOFTWARE TEST/);
 await h.click('lee');await h.submit('dlRunForm');await h.click('analyses');await h.change('dlTolerance','0.1');assert.match(h.elements.get('dlTabs').innerHTML,/data-dl-phase="results" disabled/);await h.submit('dlRunForm');assert.equal(h.events.at(-1).detail.run.epsilon,.1);
});
test('text and source fields render escaped and declaration checks do not use pass icons',async()=>{
 const h=harness();await synthetic(h);await h.click('edit');await h.input('dlStudy','<img src=x onerror=alert(1)>');await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');await h.submit('dlRunForm');assert.match(h.panel(),/&lt;img/);assert.doesNotMatch(h.panel(),/<img/);assert.match(h.panel(),/NOT_ASSESSED/);assert.match(h.panel(),/class="uncertain" aria-hidden="true">—/);
});

test('downloaded synthetic fixture stays synthetic when uploaded again',async()=>{
 const h=harness(),bytes=new TextEncoder().encode(h.ui.template);await h.change('dlFile','',{files:[{name:'template.csv',size:bytes.length,arrayBuffer:async()=>bytes.buffer}]});await h.input('dlStudy','Template roundtrip');await h.input('dlRoute','Example');await h.input('dlPopulation','Example population');await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');await h.submit('dlRunForm');assert.equal(h.events[0].detail.run.origin,'synthetic');
});
test('rejected replacement clears old input and project hook preserves saved-run restoration',async()=>{
 const h=harness();await synthetic(h);await h.submit('dlRunForm');await h.click('edit');await h.change('dlFile','',{files:[{name:'bad.pdf',size:3}]});await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');assert.match(h.elements.get('dlError').innerHTML,/Choose a CSV/);assert.equal(h.events.length,1);
 h.ui.onProjectChange('b');h.switchProject('b');h.html();h.ui.onProjectChange('a');h.switchProject('a');assert.match(h.html(),/Saved result restored/);
});
test('nonzero tiny differences remain visible rather than rounding to zero',async()=>{
 const h=harness();await h.click('synthetic');await h.input('dlPaste',h.ui.template.replace('0.53','0.50000001'));await h.change('dlConfirm','',{checked:true});await h.submit('dlConnectForm');await h.submit('dlRunForm');assert.match(h.panel(),/1\.000e-8/);
});
