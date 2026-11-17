'use strict';
(() => {
  // This dashboard reads usage already reported by the product. Its demo never
  // fetches, invokes an agent, alters limits, or mutates research records.
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
  const integer=v=>Number.isSafeInteger(v)&&v>=0?v:null;
  const count=v=>v===null?'—':v.toLocaleString();
  const money=(v,digits=2)=>v===null?'—':'$'+v.toFixed(digits);
  const list=v=>Array.isArray(v)?v:[];
  const fallback={lifetimeTokens:2000000,perRunTokens:40000,perRunUsd:.10,dailyUsd:1,lifetimeUsd:10,userRunsPerDay:3,maxQueries:3,maxPapers:10,maxModelCalls:3,maxSeconds:90};
  let adapter=null,demoMode=false,chartMetric='tokens',initialized=false;
  const sum=(items,key)=>items.reduce((total,item)=>total+(finite(item[key])??0),0);
  function measured(value){
    const input=integer(value?.inputTokens),output=integer(value?.outputTokens);
    return {input,output,total:integer(value?.totalTokens)??(input!==null&&output!==null?input+output:null),
      calls:integer(value?.modelCalls??value?.calls),cost:finite(value?.estimatedCostUsd),
      unknown:!!value?.usageUnknown||(integer(value?.unknownCalls)??0)>0,unknownCalls:integer(value?.unknownCalls)??0};
  }
  function savedRuns(ctx){
    const seen=new Set();
    return list(ctx?.research?.aiRuns).filter(run=>run&&typeof run.id==='string'&&!seen.has(run.id)&&(seen.add(run.id),true)).map(run=>({
      id:run.id,at:typeof run.at==='string'?run.at:'',status:typeof run.status==='string'?run.status:'unknown',
      question:typeof run.question==='string'?run.question:'Research check',
      agentId:typeof run.agentId==='string'?run.agentId:typeof run.stageId==='string'?run.stageId:null,
      metrics:measured(run.usage||run.result?.usage),reserved:run.reserved===true,
      reservedUsd:finite(run.usage?.reservedCostUsd??run.result?.usage?.reservedCostUsd),
      reservedTokens:integer(run.reservedTokens??run.usage?.reservedTokens??run.result?.usage?.reservedTokens)
    })).sort((a,b)=>(Date.parse(a.at)||0)-(Date.parse(b.at)||0));
  }
  function illustrativeRuns(){
    const data=[
      ['organizer','Map the research question',4200,680,.0148,'2026-10-19T09:20:00Z'],
      ['methods','Review proposed controls',7300,1100,.0248,'2026-10-20T10:10:00Z'],
      ['results','Separate results from hypotheses',8800,1350,.0304,'2026-10-21T14:35:00Z'],
      ['references','Inspect candidate passages',11600,1800,.0412,'2026-10-23T08:40:00Z'],
      ['discussion','Compare alternative explanations',6200,940,.0204,'2026-10-24T09:05:00Z']
    ];
    return data.map((r,i)=>({id:'illustration-'+(i+1),agentId:r[0],question:r[1],at:r[5],status:'completed',
      metrics:{input:r[2],output:r[3],total:r[2]+r[3],calls:3,cost:r[4],unknown:false,unknownCalls:0},reserved:true,reservedUsd:.1,reservedTokens:40000}));
  }
  function snapshot(){try{return adapter?.usage?.()||window.PherogentAgent?.getUsageSnapshot?.()||{};}catch{return {unavailable:true};}}
  function model(ctx,illustrative=demoMode){
    const runs=illustrative?illustrativeRuns():savedRuns(ctx),live=snapshot();
    const metrics=illustrative?{input:sum(runs.map(r=>r.metrics),'input'),output:sum(runs.map(r=>r.metrics),'output'),total:sum(runs.map(r=>r.metrics),'total'),calls:sum(runs.map(r=>r.metrics),'calls'),cost:sum(runs.map(r=>r.metrics),'cost'),unknown:false,unknownCalls:0}:measured(live.usage);
    const status=illustrative?{enabled:true,canRun:true,signedIn:false,limits:fallback,budget:{lifetimeReservedTokens:200000,remainingLifetimeTokens:fallback.lifetimeTokens-200000,dailyReservedUsd:.2,lifetimeReservedUsd:.5,remainingDailyUsd:.8,remainingLifetimeUsd:9.5,userRunsToday:2,userRunsRemaining:1}}:live.status;
    return {runs,live,metrics,status,illustrative,limits:status?.limits||fallback,scope:illustrative?'Fictitious example data':live.usage?'Reported for this visitor':'Visitor usage has not been confirmed'};
  }
  const agentLabel=id=>window.PherogentStudioData?.stages?.find(stage=>stage.id===id)?.label||({organizer:'Research organizer',methods:'Methods',results:'Results',references:'References',discussion:'Discussion'})[id]||id||'Unattributed research checks';
  const button=(label,action,arg='',cls='')=>`<button type="button" class="${cls}" data-meter-action="${action}" data-meter-arg="${esc(arg)}">${label}</button>`;
  const metricCard=(label,value,note,kind)=>`<article class="meter-stat"><span class="meter-stat-icon ${kind}" aria-hidden="true">${{tokens:'↗',cost:'$',calls:'◈',runs:'▤'}[kind]}</span><p>${label}</p><strong>${value}</strong><span>${note}</span></article>`;
  function series(runs,key){
    const days=new Map();
    for(const run of runs){const stamp=Date.parse(run.at),value=run.metrics[key];if(!Number.isFinite(stamp)||value===null)continue;const day=new Date(stamp).toISOString().slice(0,10);days.set(day,(days.get(day)||0)+value);}
    let total=0;return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([day,value])=>({day,value,total:total+=value}));
  }
  function chart(data){
    const costMode=chartMetric==='cost',points=series(data.runs,costMode?'cost':'total'),max=points.at(-1)?.total||0;
    const shown=points.length>14?points.filter((_,i)=>i===points.length-1||i%Math.ceil(points.length/13)===0):points;
    const coords=shown.map((point,i)=>[54+(shown.length===1?286:i*572/(shown.length-1)),206-(max?point.total/max:0)*166]);
    const poly=coords.map(p=>p.join(',')).join(' '),format=value=>costMode?money(value,4):count(value);
    const svg=`<svg class="meter-chart" viewBox="0 0 680 250" role="img" aria-labelledby="meterChartTitle meterChartDescription"><title id="meterChartTitle">Cumulative ${costMode?'estimated model cost':'reported tokens'} in ${data.illustrative?'the illustrative example':'this project’s saved runs'}</title><desc id="meterChartDescription">${points.length?'The line accumulates reported values by UTC date. A data table follows.':'No measured run values are available. No usage is simulated in actual mode.'}</desc><defs><linearGradient id="meterChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#628b71" stop-opacity=".20"/><stop offset="100%" stop-color="#628b71" stop-opacity=".015"/></linearGradient></defs>${[40,95,150,206].map(y=>`<line x1="54" y1="${y}" x2="626" y2="${y}" stroke="#e7ece5" stroke-dasharray="4 5"/>`).join('')}<text x="45" y="44" text-anchor="end">${esc(format(max))}</text><text x="45" y="210" text-anchor="end">${costMode?'$0':'0'}</text>${coords.length?`<polygon points="${coords[0][0]},206 ${poly} ${coords.at(-1)[0]},206" fill="url(#meterChartFill)"/><polyline points="${poly}" fill="none" stroke="#406d54" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${coords.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#406d54" stroke="white" stroke-width="2"/>`).join('')}<text x="54" y="236">${esc(shown[0].day)}</text><text x="626" y="236" text-anchor="end">${esc(shown.at(-1).day)}</text>`:'<text x="340" y="116" text-anchor="middle" class="meter-chart-empty">No measured runs yet</text><text x="340" y="140" text-anchor="middle">Your recorded activity will appear here.</text>'}</svg>`;
    return `<section class="meter-card meter-trend"><div class="meter-card-head"><div><h2>Usage over time</h2><p>${data.illustrative?'Illustrative example':'This project’s saved runs'} · cumulative · UTC</p></div><div class="meter-chart-switch" aria-label="Chart measurement">${['tokens','cost'].map(key=>`<button type="button" data-meter-action="metric" data-meter-arg="${key}" aria-pressed="${chartMetric===key}">${key==='tokens'?'Tokens':'Est. cost'}</button>`).join('')}</div></div>${svg}<div class="meter-chart-caption"><span class="meter-legend-dot"></span>${costMode?'Estimated model cost':'Reported tokens'}<span>Missing usage is not inferred.</span></div><details class="meter-chart-table"><summary>View chart data</summary><div class="meter-table-scroll"><table><caption>Cumulative saved-run ${costMode?'estimated cost':'reported tokens'}</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">That day</th><th scope="col">Cumulative</th></tr></thead><tbody>${points.length?points.map(p=>`<tr><th scope="row">${esc(p.day)}</th><td>${esc(format(p.value))}</td><td>${esc(format(p.total))}</td></tr>`).join(''):'<tr><td colspan="3">No measured data.</td></tr>'}</tbody></table></div></details></section>`;
  }
  function allowance(data){
    const budget=data.status?.budget,lim=data.limits,remaining=integer(budget?.remainingLifetimeTokens),total=integer(lim.lifetimeTokens),reserved=integer(budget?.lifetimeReservedTokens),confirmed=!!data.status?.limits;
    const percent=reserved!==null&&total?Math.min(100,Math.max(0,reserved/total*100)):null;
    return `<aside class="meter-allowance"><div class="meter-allowance-top"><span>${data.illustrative?'ILLUSTRATIVE TOKEN POOL':'SHARED TOKEN ALLOWANCE'}</span><span class="meter-shield" aria-hidden="true">✓</span></div><p>Tokens available to reserve</p><strong class="meter-remaining">${count(remaining)}</strong><span class="meter-allowance-sub">of ${count(total)} ${confirmed?'server limit':'configured limit'} · input + output · no automatic refill</span><div class="meter-allowance-track" ${percent!==null?`role="progressbar" aria-label="Shared token allowance reserved" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}"`:'aria-hidden="true"'}><span style="width:${percent??0}%"></span></div><div class="meter-allowance-line"><span>Tokens reserved site-wide</span><strong>${count(reserved)}</strong></div><div class="meter-allowance-line"><span>Daily dollar allowance left</span><strong>${money(finite(budget?.remainingDailyUsd))}</strong></div><div class="meter-allowance-line"><span>Total dollar allowance left</span><strong>${money(finite(budget?.remainingLifetimeUsd))}</strong></div><div class="meter-allowance-line"><span>Your runs left today</span><strong>${count(integer(budget?.userRunsRemaining))}</strong></div><div class="meter-allowance-note"><strong>Reservations are not charges.</strong><p>All visitors share this pool. Each accepted run reserves ${count(integer(lim.perRunTokens))} tokens and ${money(finite(lim.perRunUsd))} before it starts. Unused, failed and stopped reservations stay consumed. Actual reported usage appears separately.</p>${remaining===null?'<p>Remaining allowance is unconfirmed until the server reports it.</p>':''}</div></aside>`;
  }
  function byAgent(data){
    const groups=new Map();for(const run of data.runs){const key=run.agentId||'unattributed';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(run);}
    const rows=[...groups].map(([key,runs])=>{const metrics=runs.map(r=>r.metrics);return {key,label:agentLabel(key==='unattributed'?null:key),runs:runs.length,tokens:metrics.some(m=>m.total!==null)?sum(metrics,'total'):null,cost:metrics.some(m=>m.cost!==null)?sum(metrics,'cost'):null,calls:metrics.some(m=>m.calls!==null)?sum(metrics,'calls'):null,unknown:metrics.some(m=>m.unknown)};});
    return `<section class="meter-card meter-agents"><div class="meter-card-head"><div><h2>Usage by agent</h2><p>${data.illustrative?'Fictitious attribution for this preview':'This project · attribution only when stored with a run'}</p></div><span class="meter-pill">${rows.length} ${rows.length===1?'group':'groups'}</span></div><div class="meter-table-scroll"><table><caption>Model usage grouped by recorded agent</caption><thead><tr><th scope="col">Agent</th><th scope="col">Runs</th><th scope="col">Tokens</th><th scope="col">Est. cost</th></tr></thead><tbody>${rows.length?rows.map(row=>`<tr><th scope="row"><span class="meter-agent-avatar" aria-hidden="true">${esc(row.label.slice(0,1))}</span><span>${esc(row.label)}${row.unknown?'<small>Usage incomplete</small>':''}</span></th><td>${row.runs}</td><td>${count(row.tokens)}</td><td>${money(row.cost,4)}</td></tr>`).join(''):'<tr><td colspan="4" class="meter-table-empty">No model usage recorded in this project.</td></tr>'}</tbody></table></div><p class="meter-table-footnote">${data.illustrative?'This preview does not represent work performed by your agents.':'Section workspaces and prepared replies are not separately metered AI agents. A run without a stored agent identity stays unattributed.'}</p></section>`;
  }
  function history(data){
    return `<section class="meter-card meter-history"><div class="meter-card-head"><div><h2>Run history</h2><p>${data.illustrative?'Five fictitious runs · demonstration only':'Saved locally in this project · not a provider invoice'}</p></div><button type="button" class="btn small" data-meter-action="export" ${data.runs.length?'':'disabled'}>Export CSV ↓</button></div><div class="meter-table-scroll"><table><caption>${data.illustrative?'Illustrative':'Project'} research run history</caption><thead><tr><th scope="col">Research check</th><th scope="col">Status</th><th scope="col">Reported tokens</th><th scope="col">Est. cost</th><th scope="col">Allowance</th></tr></thead><tbody>${data.runs.length?data.runs.slice().reverse().map(run=>`<tr><th scope="row"><span class="meter-run-title">${esc(run.question)}</span><small>${esc(Number.isFinite(Date.parse(run.at))?new Date(run.at).toISOString().slice(0,16).replace('T',' ')+' UTC':'Date not recorded')}</small></th><td><span class="meter-status ${['completed','running','failed','stopped'].includes(run.status)?run.status:'unknown'}">${esc(run.status)}</span></td><td>${count(run.metrics.total)}${run.metrics.unknown?'<small>Incomplete</small>':''}</td><td>${money(run.metrics.cost,4)}</td><td>${run.reserved?(run.reservedTokens!==null?count(run.reservedTokens)+' tokens reserved':run.reservedUsd!==null?money(run.reservedUsd)+' reserved':'Reserved'):'Not confirmed'}</td></tr>`).join(''):'<tr><td colspan="5" class="meter-table-empty"><strong>Your first measured run starts this record.</strong><span>Writing, manual searches and prepared examples do not consume AI tokens.</span></td></tr>'}</tbody></table></div></section>`;
  }
  function body(ctx){
    const data=model(ctx),m=data.metrics,lim=data.limits;
    const stateLabel=data.illustrative?'Illustrative preview':data.live.loading?'Checking usage…':data.live.unavailable?'Usage status unavailable':data.live.running?'Research check running':data.status?.enabled?'Model connection enabled':'AI connection pending';
    return `<div class="meter-heading"><div><span class="eyebrow">WORKSPACE ACTIVITY</span><h1>Usage & costs</h1><p>A clear view of your AI activity, with spending limits built in.</p></div><div class="meter-mode" aria-label="Usage data source"><button type="button" data-meter-action="mode" data-meter-arg="actual" aria-pressed="${!data.illustrative}">Actual usage</button><button type="button" data-meter-action="mode" data-meter-arg="demo" aria-pressed="${data.illustrative}">Illustrative demo</button></div></div>
      ${data.illustrative?'<div class="meter-demo-notice" role="status"><strong>Illustrative demo — fictitious data.</strong> Explore how this dashboard looks with activity. No AI runs, token charges or budget changes occur.</div>':`<div class="meter-live-status"><span class="meter-live-dot ${data.status?.enabled?'connected':''}" aria-hidden="true"></span><strong>${esc(stateLabel)}</strong><span>${esc(data.status?.message||'The dashboard only displays reported usage. It cannot start a paid run.')}</span></div>`}
      <div class="meter-stats">${metricCard('Reported tokens',count(m.total),`${count(m.input)} input · ${count(m.output)} output`,'tokens')}${metricCard('Estimated model cost',money(m.cost,4),'Reported usage × conservative rates','cost')}${metricCard('Model calls',count(m.calls),m.unknown?'Some call usage is unavailable':'Provider-reported usage','calls')}${metricCard('Runs in this project',String(data.runs.length),'Local run history','runs')}</div><p class="meter-scope">${esc(data.scope)}. ${data.illustrative?'No amounts are real.':'The first three cards show server-reported values only; charts and history below cover this project’s saved runs.'}${m.unknown?' <strong>Totals are incomplete and may understate billed usage.</strong>':''}</p>
      <div class="meter-main-grid">${chart(data)}${allowance(data)}</div><div class="meter-secondary-grid">${byAgent(data)}<section class="meter-card meter-limits"><div class="meter-card-head"><div><h2>Limits that protect you</h2><p>${data.illustrative?'Illustrative settings':data.status?.limits?'Reported by the server':'Configured defaults · server unconfirmed'}</p></div><span aria-hidden="true" class="meter-lock">▣</span></div><dl><div><dt>Shared token pool</dt><dd>${count(integer(lim.lifetimeTokens))} total · no refill</dd></div><div><dt>Per accepted run</dt><dd>${count(integer(lim.perRunTokens))} tokens reserved</dd></div><div><dt>Across the entire site</dt><dd>${money(finite(lim.dailyUsd))} / UTC day</dd></div><div><dt>Dollar backup limit</dt><dd>${money(finite(lim.lifetimeUsd))} total</dd></div><div><dt>Per visitor browser</dt><dd>${count(integer(lim.userRunsPerDay))} runs / day</dd></div><div><dt>Each investigation</dt><dd>${count(integer(lim.maxQueries))} searches · ${count(integer(lim.maxPapers))} papers</dd></div><div><dt>Model calls / time</dt><dd>${count(integer(lim.maxModelCalls))} calls · ${count(integer(lim.maxSeconds))} seconds</dd></div></dl><p>These controls are enforced on the server. No approved email is needed. This dashboard cannot raise limits. It does not measure your ChatGPT subscription allowance.</p></section></div>${history(data)}<p class="meter-bottom-note">Estimated model cost is not a final invoice. New runs use the highest configured input rate without cache discounts. Unknown usage, provider adjustments and hosting charges are not included. ${data.illustrative?'Switch to Actual usage to see your own records.':'Prepared examples remain free of model-token use.'}</p>`;
  }
  function render(ctx={}){return `<div id="usageMeter" class="page meter-page" data-meter-mode="${demoMode?'demo':'actual'}">${body(ctx)}</div>`;}
  function refresh(){const root=document.getElementById('usageMeter');if(!root||!adapter)return;root.setAttribute('data-meter-mode',demoMode?'demo':'actual');root.innerHTML=body(adapter.context());}
  function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
  function toCSV(ctx={},illustrative=demoMode){
    const rows=model(ctx,illustrative).runs;
    const columns=['Data scope','Run ID','UTC timestamp','Question','Recorded agent','Status','Input tokens reported','Output tokens reported','Total tokens reported','Model calls reported','Estimated model cost USD','Usage incomplete','Reservation confirmed','Reserved USD if reported','Reserved tokens if reported'];
    return [columns,...rows.map(r=>[illustrative?'ILLUSTRATIVE FICTITIOUS DATA':'LOCAL PROJECT RECORD',r.id,r.at,r.question,agentLabel(r.agentId),r.status,r.metrics.input,r.metrics.output,r.metrics.total,r.metrics.calls,r.metrics.cost,r.metrics.unknown?'yes':'no',r.reserved?'yes':'unconfirmed',r.reservedUsd,r.reservedTokens])].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  }
  function init(a){adapter=a;if(initialized)return;initialized=true;
    document.addEventListener('click',event=>{const target=event.target.closest?.('[data-meter-action]');if(!target||!document.getElementById('usageMeter'))return;const {meterAction:action,meterArg:arg}=target.dataset;
      if(action==='mode'&&['actual','demo'].includes(arg)){demoMode=arg==='demo';refresh();}
      else if(action==='metric'&&['tokens','cost'].includes(arg)){chartMetric=arg;refresh();}
      else if(action==='export'&&model(adapter.context()).runs.length){adapter.download?.(demoMode?'pherogent-illustrative-usage.csv':'pherogent-project-usage.csv',toCSV(adapter.context()),'text/csv;charset=utf-8');}
    });
    window.addEventListener?.('pherogent:usage',()=>{if(!demoMode)refresh();});
  }
  function afterRender(){/* No request or simulated tick is needed to render usage. */}
  window.PherogentMeter={init,render,afterRender,toCSV};
})();
