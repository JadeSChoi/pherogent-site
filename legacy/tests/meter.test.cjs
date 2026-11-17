'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(){
  const events={},windowEvents={},downloads=[],logs=[];let requests=0,saves=0;
  const root={innerHTML:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
  const ctx={project:{id:'own'},draft:{title:'My project'},research:{aiRuns:[],agentWorkspace:{agents:{references:{messages:[{text:'Prepared example'}]}}}}};
  let snap={status:null,usage:null,loading:false,unavailable:false,running:false};
  const sandbox={window:{addEventListener(name,fn){(windowEvents[name]||=[]).push(fn);}},document:{getElementById:id=>id==='usageMeter'?root:null,addEventListener(name,fn){(events[name]||=[]).push(fn);}},Date,Intl,Map,Set,JSON,Number,Array,Object,Math,
    fetch:async()=>{requests++;throw Error('Meter must never start network activity');}};
  vm.createContext(sandbox);vm.runInContext(read('meter.js'),sandbox);const M=sandbox.window.PherogentMeter;
  M.init({context:()=>ctx,usage:()=>snap,download:(...args)=>downloads.push(args),save:()=>saves++,log:(...args)=>logs.push(args)});
  const render=()=>root.innerHTML=M.render(ctx);
  const click=(action,arg)=>{const target={dataset:{meterAction:action,meterArg:arg},closest:()=>target};for(const fn of events.click||[])fn({target});};
  const publish=()=>{for(const fn of windowEvents['pherogent:usage']||[])fn({});};
  return {M,ctx,root,downloads,logs,render,click,publish,setSnapshot(v){snap=v;},requests:()=>requests,saves:()=>saves};
}
const status={enabled:true,signedIn:true,canRun:true,message:'Ready',limits:{lifetimeTokens:2000000,perRunTokens:40000,perRunUsd:.1,dailyUsd:1,lifetimeUsd:10,userRunsPerDay:3,maxQueries:3,maxPapers:10,maxModelCalls:3,maxSeconds:90},budget:{lifetimeReservedTokens:160000,remainingLifetimeTokens:1840000,dailyReservedUsd:.2,lifetimeReservedUsd:.4,remainingDailyUsd:.8,remainingLifetimeUsd:9.6,userRunsRemaining:1}};
const run=(id,overrides={})=>({id,at:'2026-10-24T12:00:00Z',question:'Does this source support the claim?',status:'completed',reserved:true,reservedTokens:40000,usage:{inputTokens:20,outputTokens:10,totalTokens:30,calls:1,estimatedCostUsd:.0008,reservedCostUsd:.1},...overrides});

test('actual mode has no invented usage, remaining allowance, or agent attribution',()=>{
  const h=harness(),html=h.render();
  assert.match(html,/data-meter-mode="actual"/);assert.match(html,/No measured runs yet/);assert.match(html,/No model usage recorded/);
  assert.match(html,/Configured defaults · server unconfirmed/);assert.match(html,/meter-remaining">—</);assert.match(html,/Remaining allowance is unconfirmed/);
  assert.match(html,/does not measure your ChatGPT subscription allowance/);assert.match(html,/prepared replies are not separately metered/);
  assert.ok(!html.includes('4,880'));assert.equal(h.requests(),0);assert.equal(h.saves(),0);
});

test('anonymous visitor usage is reported without requiring sign-in',()=>{
  const h=harness();h.setSnapshot({status:{...status,signedIn:false,enabled:false,message:'Public pool available'},usage:{inputTokens:0,outputTokens:0,totalTokens:0,modelCalls:0,estimatedCostUsd:0}});
  const html=h.render();assert.match(html,/Reported for this visitor/);assert.ok(!html.includes('Reported for this signed-in visitor'));assert.equal(h.requests(),0);
});

test('visitor totals, local project values and server reservations remain distinct',()=>{
  const h=harness();h.ctx.research.aiRuns=[run('a'),run('b',{status:'failed',usage:{inputTokens:40,outputTokens:0,totalTokens:40,calls:1,estimatedCostUsd:.0002,unknownCalls:1,reservedCostUsd:.1}})];
  h.setSnapshot({status,usage:{inputTokens:600,outputTokens:150,totalTokens:750,modelCalls:8,estimatedCostUsd:.012,unknownCalls:1},running:false});
  const html=h.render();assert.match(html,/>750</);assert.match(html,/>\$0\.0120</);assert.match(html,/>\$0\.80</);assert.match(html,/>160,000</);assert.match(html,/meter-remaining">1,840,000</);
  assert.match(html,/Unattributed research checks/);assert.match(html,/>70</);assert.match(html,/Usage incomplete/);assert.match(html,/Totals are incomplete/);assert.match(html,/Reservations are not charges/);
  assert.match(html,/input · 150 output/);assert.equal(h.requests(),0);
  const other={research:{aiRuns:[]}};assert.match(h.M.render(other),/No model usage recorded/,'Project chart/history never inherit another project’s runs');
});

test('illustrative mode is explicit, local, reversible and cannot change real records',()=>{
  const h=harness();h.ctx.research.aiRuns=[run('my-run')];h.setSnapshot({status,usage:{inputTokens:20,outputTokens:10,totalTokens:30,modelCalls:1,estimatedCostUsd:.0008}});h.render();
  const before=JSON.stringify(h.ctx);h.click('mode','demo');
  assert.match(h.root.innerHTML,/Illustrative demo — fictitious data/);assert.match(h.root.innerHTML,/No AI runs, token charges or budget changes occur/);assert.match(h.root.innerHTML,/Research organizer/);assert.match(h.root.innerHTML,/meter-remaining">1,800,000</);assert.match(h.root.innerHTML,/Tokens reserved site-wide<\/span><strong>200,000</);
  h.click('metric','cost');assert.match(h.root.innerHTML,/Cumulative estimated model cost/);
  h.click('export');assert.equal(h.downloads[0][0],'pherogent-illustrative-usage.csv');assert.match(h.downloads[0][1],/ILLUSTRATIVE FICTITIOUS DATA/);assert.ok(!h.downloads[0][1].includes('my-run'));
  h.publish();assert.match(h.root.innerHTML,/Illustrative demo — fictitious data/,'Live updates cannot silently switch the demo’s source');
  h.click('mode','actual');assert.ok(!h.root.innerHTML.includes('Illustrative demo — fictitious data'));assert.match(h.root.innerHTML,/>30</);
  assert.equal(JSON.stringify(h.ctx),before);assert.equal(h.requests(),0);assert.equal(h.saves(),0);assert.equal(h.logs.length,0);
});

test('history escapes hostile text and CSV neutralizes formula injection',()=>{
  const h=harness(),attack='=HYPERLINK("https://example.org","click")';
  h.ctx.research.aiRuns=[run('x',{question:attack,agentId:'<img src=x onerror=alert(1)>',status:'</span><script>evil()</script>'}),run('x')];
  let html=h.render();assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<script>evil'));assert.match(html,/&lt;img/);
  const csv=h.M.toCSV(h.ctx);assert.match(csv,/'=HYPERLINK/);assert.equal(csv.split('\r\n').filter(Boolean).length,2,'Duplicate run identities are not double-counted');
  h.click('export');assert.equal(h.downloads[0][0],'pherogent-project-usage.csv');assert.match(h.downloads[0][1],/LOCAL PROJECT RECORD/);assert.equal(h.requests(),0);
});

test('missing or invalid reported numbers stay unknown and chart has an accessible data table',()=>{
  const h=harness();h.ctx.research.aiRuns=[run('bad',{at:'invalid',usage:{inputTokens:-1,outputTokens:Infinity,totalTokens:'123',estimatedCostUsd:null,calls:NaN}})];
  const html=h.render();assert.match(html,/No measured runs yet/);assert.match(html,/Date not recorded/);assert.match(html,/role="img" aria-labelledby="meterChartTitle meterChartDescription"/);assert.match(html,/View chart data/);assert.match(html,/<caption>Cumulative saved-run reported tokens/);
  const csv=h.M.toCSV(h.ctx);assert.ok(!csv.includes('Infinity'));assert.ok(!csv.includes('NaN'));assert.ok(!csv.includes('"123"'));
});

test('usage snapshot is a defensive copy and never exposes request text or secret-like status extras',async()=>{
  const elements=new Map(),notifications=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',checked:false,setAttribute(){},querySelector:()=>({textContent:''}),addEventListener(){},open:false});return elements.get(id);};
  const sandbox={window:{dispatchEvent:event=>notifications.push(event)},document:{getElementById:element},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},URL,Date,JSON,Intl,Set,Number,Object,Array,Math,
    fetch:async()=>({ok:true,json:async()=>({...status,OPENAI_API_KEY:'must-not-escape',usage:{inputTokens:10,outputTokens:2,totalTokens:12,modelCalls:1,estimatedCostUsd:.0001}})})};
  vm.createContext(sandbox);vm.runInContext(read('agent.js'),sandbox);const A=sandbox.window.PherogentAgent;
  assert.equal(A.getUsageSnapshot().usage,null,'No server response must not imply measured zero usage');
  await A.refreshStatus();const snap=A.getUsageSnapshot();assert.equal(snap.usage.totalTokens,12);assert.equal(snap.status.budget.remainingDailyUsd,.8);
  assert.ok(!JSON.stringify(snap).includes('must-not-escape'));assert.ok(!('question' in snap));
  snap.status.budget.remainingDailyUsd=999;snap.usage.totalTokens=999;
  assert.equal(A.getUsageSnapshot().status.budget.remainingDailyUsd,.8);assert.equal(A.getUsageSnapshot().usage.totalTokens,12);
  assert.ok(notifications.some(e=>e.type==='pherogent:usage'));
});


test('global token allowance is not presented as visitor usage and never refills automatically',()=>{
  const h=harness();h.setSnapshot({status:{...status,signedIn:false},usage:{inputTokens:20,outputTokens:10,totalTokens:30,modelCalls:1,estimatedCostUsd:.0008}});
  const html=h.render();
  assert.match(html,/Shared token pool<\/dt><dd>2,000,000 total · no refill/);
  assert.match(html,/SHARED TOKEN ALLOWANCE/);assert.match(html,/Tokens available to reserve/);
  assert.match(html,/meter-remaining">1,840,000</);assert.match(html,/160,000<\/strong>/);
  assert.match(html,/input \+ output · no automatic refill/);
  assert.match(html,/All visitors share this pool/);assert.match(html,/Unused, failed and stopped reservations stay consumed/);
  assert.match(html,/No approved email is needed/);assert.doesNotMatch(html,/Per signed-in visitor|resets at midnight UTC/);
  assert.match(html,/>30<\/strong>/,'Visitor count is independent of 160,000 reserved tokens');
  h.ctx.research.aiRuns=[run('token-reservation')];const csv=h.M.toCSV(h.ctx);
  assert.match(csv,/Reserved tokens if reported/);assert.match(csv,/"40000"/);
  assert.equal(h.requests(),0);
});

test('empty token balance blocks no UI controls itself and remains separate from missing balance',()=>{
  const h=harness();h.setSnapshot({status:{...status,canRun:false,reason:'token_budget_exhausted',budget:{...status.budget,remainingLifetimeTokens:0,lifetimeReservedTokens:2000000}},usage:{inputTokens:20,outputTokens:10,totalTokens:30,modelCalls:1,estimatedCostUsd:.0008}});
  const html=h.render();assert.match(html,/meter-remaining">0</);assert.match(html,/aria-valuenow="100"/);assert.equal(h.requests(),0);
  h.setSnapshot({status:{...status,budget:{remainingDailyUsd:1}},usage:null});
  const unknown=h.render();assert.match(unknown,/meter-remaining">—</);assert.doesNotMatch(unknown,/aria-valuenow="0"/);
});
