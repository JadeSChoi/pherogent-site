'use strict';
(() => {
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=id=>document.getElementById(id), money=n=>'$'+Number(n||0).toFixed(2), num=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
  const list=v=>Array.isArray(v)?v:[];
  const cost=n=>'$'+num(n).toFixed(4);
  const allowedHosts=new Set(['europepmc.org','www.europepmc.org','pmc.ncbi.nlm.nih.gov','pubmed.ncbi.nlm.nih.gov','doi.org','www.nature.com','elifesciences.org']);
  function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&allowedHosts.has(u.hostname)?u.href:'';}catch{return '';}}
  const link=(text,url)=>safeLink(url)?`<a class="inline-link" href="${esc(safeLink(url))}" target="_blank" rel="noopener noreferrer">${esc(text)} ↗</a>`:'';
  const knownCount=n=>Number.isSafeInteger(n)&&n>=0?n.toLocaleString():'—';
  const fallbackLimits={lifetimeTokens:2000000,perRunTokens:40000,perRunUsd:.1,dailyUsd:1,lifetimeUsd:10,userRunsPerDay:3,maxSeconds:90,maxPapers:10,maxQueries:3,maxModelCalls:3};
  let adapter, status=null, statusLoading=false, statusFailed=false, session=null, controller=null, result=null, context=null, baseUsage=null, displayedUsage=null, reportedUsageAvailable=false, claimContext=null, historyOnly=false;
  const usage=u=>({inputTokens:num(u?.inputTokens),outputTokens:num(u?.outputTokens),totalTokens:num(u?.totalTokens),modelCalls:num(u?.modelCalls??u?.calls),estimatedCostUsd:num(u?.estimatedCostUsd),unknownCalls:num(u?.unknownCalls),usageUnknown:!!u?.usageUnknown});
  const addUsage=(a,b)=>Object.fromEntries(Object.keys(usage()).map(k=>[k,num(a?.[k])+num(b?.[k])]));
  function getUsageSnapshot(){
    const safeStatus=status?{enabled:!!status.enabled,canRun:!!status.canRun,signedIn:!!status.signedIn,needsSignIn:!!status.needsSignIn,reason:status.reason||null,message:typeof status.message==='string'?status.message:'',limits:status.limits||null,budget:status.budget||null}:null;
    return JSON.parse(JSON.stringify({status:safeStatus,loading:statusLoading,unavailable:statusFailed,running:!!session?.running,usage:reportedUsageAvailable?(displayedUsage||(status?.usage?usage(status.usage):null)):null,currentRun:session?.running?{id:session.id,projectId:session.projectId,at:session.at,status:session.status,usage:session.usage?usage(session.usage):null}:null}));
  }
  function publishUsage(){if(typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('pherogent:usage',{detail:getUsageSnapshot()}));}
  function updateCounter(u){
    displayedUsage=u&&typeof u==='object'&&!Array.isArray(u)?usage(u):null;reportedUsageAvailable=!!displayedUsage;publishUsage();const total=$('tokenTotal');if(total)total.textContent=displayedUsage?displayedUsage.totalTokens.toLocaleString():'—';
    const counter=$('tokenCounter');if(!counter)return;
    const stateText=!displayedUsage?'Usage unavailable':displayedUsage.unknownCalls||displayedUsage.usageUnknown?'Usage incomplete':session?.running?'AI working':status?.enabled?(status.canRun?'AI ready':'AI access limited'):statusFailed?'AI status unavailable':'AI connection pending';
    const label=counter.querySelector('.usage-connection');if(label)label.textContent=stateText;
    counter.setAttribute('aria-label',displayedUsage?`AI usage: ${displayedUsage.totalTokens} reported tokens. ${stateText}`:'AI usage unavailable. No usage total has been reported.');
  }
  async function refreshStatus(){
    if(statusLoading)return;statusLoading=true;statusFailed=false;publishUsage();
    try{const r=await fetch('/api/agent/status',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error();const body=await r.json();if(typeof body.enabled!=='boolean'||!body.limits)throw Error();status=body;reportedUsageAvailable=!!body.usage&&typeof body.usage==='object';if(!session?.running)updateCounter(body.usage);}
    catch{status=null;statusFailed=true;if(!session?.running)updateCounter(displayedUsage);}
    finally{statusLoading=false;renderStatus();publishUsage();}
  }
  function renderStatus(){
    const el=$('agentStatus');if(!el)return;
    const lim=status?.limits||fallbackLimits;
    const title=statusLoading?'Checking connection…':statusFailed?'AI status unavailable':status?.enabled?(status.canRun?'Ready to investigate':'AI access limited'):'AI connection pending';
    const message=statusLoading?'Checking the server’s spending controls.':statusFailed?'The research service could not be reached. No AI run has started.':status?.message||'The site owner still needs to connect the model securely. The prepared tutorial and live paper search remain available.';
    el.innerHTML=`<div class="agent-status-head"><span class="agent-status-dot ${status?.canRun?'ready':''}" aria-hidden="true"></span><strong>${esc(title)}</strong></div><p>${esc(message)}</p>${status?.reason==='not_configured'?'<p class="subtle">Live AI is off. The owner must securely configure the model connection before public checks can run.</p>':''}`;
    const caps=$('agentLimits');if(caps)caps.innerHTML=`<div><strong>${knownCount(lim.lifetimeTokens)}</strong><span>shared token allowance</span></div><div><strong>${knownCount(status?.budget?.remainingLifetimeTokens)}</strong><span>allowance remaining</span></div><div><strong>${knownCount(lim.perRunTokens)}</strong><span>tokens reserved / run</span></div>`;
    const budget=$('agentBudgetNote');if(budget)budget.textContent=status?.budget?`${knownCount(status.budget.lifetimeReservedTokens)} tokens reserved across all visitors · ${knownCount(status.budget.userRunsRemaining)} runs left for this browser today. Input + output tokens share one pool; it does not refill automatically. Backup spending limits: ${money(lim.dailyUsd)}/day and ${money(lim.lifetimeUsd)} total.`:'Public pool for all visitors; no approved email needed. Remaining allowance is unconfirmed until the server reports it. The pool does not refill automatically.';
    updateRunButton();
  }
  const copy=value=>JSON.parse(JSON.stringify(value));
  function bindingFrom(options){
    if(!options?.claim)return null;
    const claim=options.claim,ids=options.citedPaperIds||[];
    if(typeof claim.id!=='string'||!claim.id||typeof claim.text!=='string'||!claim.text.trim()||claim.text.length>2000||!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^(MED:[1-9][0-9]*|PMC:PMC[1-9][0-9]*)$/.test(id)))throw Error('Choose a valid manuscript sentence and up to three Europe PMC sources.');
    return {claim:{id:claim.id,text:claim.text},citedPaperIds:ids.slice(),...(options.studyDesign===true?{studyDesign:true}:{}),sourceSnapshots:options.sourceSnapshots&&typeof options.sourceSnapshots==='object'?copy(options.sourceSnapshots):{}};
  }
  function sameBinding(a,b){return !!a&&!!b&&a.id===b.id&&a.text===b.text;}
  function sourceIDsMatch(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&new Set(a).size===a.length&&new Set(b).size===b.length&&a.every(id=>b.includes(id));}
  function boundResultMatches(value,binding){return !!value&&value.pipelineVersion==='claim-check-v1'&&(!binding.studyDesign||value.studyDesignVersion==='same-cell-tracking-v1')&&sameBinding(value.claim,binding.claim)&&value.question===binding.claim.text&&sourceIDsMatch(value.claim?.citedPaperIds,binding.citedPaperIds)&&Array.isArray(value.evidence)&&value.evidence.every(e=>e.claimId===binding.claim.id&&e.claim===binding.claim.text);}
  function bindingIsCurrent(binding){return !binding||!adapter.isClaimCurrent||adapter.isClaimCurrent(context.projectId,binding);}
  function updateRunButton(){
    const b=$('agentRun');if(!b)return;
    const text=claimContext?claimContext.claim.text:($('agentQuestion')?.value||'').trim(),valid=!!text.trim()&&text.length<=2000;
    b.disabled=historyOnly||!!session?.running||statusLoading||!status?.canRun||!$('agentConsent')?.checked||!valid;
    const cancel=$('agentStop');if(cancel)cancel.hidden=!session?.running;
    const question=$('agentQuestion');if(question){question.disabled=!!session?.running;question.readOnly=!!claimContext||historyOnly;}
    const consent=$('agentConsent');if(consent)consent.disabled=!!session?.running||historyOnly;
    const count=$('agentQuestionCount');if(count)count.textContent=text.length+' / 2,000 characters';
  }
  function show(options={}){
    const nextContext=adapter.context();
    if(session?.running){
      if(session.projectId!==nextContext.projectId){adapter.toast('A research run is already active in another project. Stop it or wait for it to finish.');return false;}
      const dialog=$('agentDialog');if(!dialog.open)dialog.showModal();renderProgress();updateRunButton();
      adapter.toast('Your current check is still running. Its sentence and sources have not changed.');return false;
    }
    let saved=null,nextBinding;
    if(options.runId){saved=list(nextContext.runs).find(r=>r&&r.id===options.runId&&r.kind!=='section_chat');if(!saved){adapter.toast('That saved check is unavailable in this project.');return false;}}
    try{nextBinding=bindingFrom(saved?.claimContext||options);}catch(error){adapter.toast(error.message);return false;}
    adapter.beforeOpen?.();context=nextContext;claimContext=nextBinding;historyOnly=!!saved;result=saved?.result||null;
    session=saved?{...copy(saved),projectId:context.projectId,running:false,steps:list(saved.steps)}:null;
    const bound=!!claimContext,cited=!!claimContext?.citedPaperIds.length,question=bound?claimContext.claim.text:saved?.question||context.question||'';
    const mode=bound?(cited?'Check selected sources':'Find evidence for this sentence'):'One focused question';
    const intro=bound?(cited?'Reads your selected sources → checks the original sentence.':'Searches papers → checks the original sentence.'):'Plans searches → reads papers → checks passages.';
    const consentCopy=bound?(cited?'I agree to send this exact sentence and the selected source IDs to OpenAI, and fetch those papers from Europe PMC. Retrieved excerpts are sent to OpenAI. My complete manuscript is not sent.':'I agree to send this exact sentence to OpenAI, derived search queries to Europe PMC, and retrieved excerpts to OpenAI. My complete manuscript is not sent.'):'I agree to send this text to OpenAI and the resulting search queries to Europe PMC. My complete manuscript is not sent.';
    const dialog=$('agentDialog');
    $('agentBody').innerHTML=`<p class="agent-project">${esc(context.title)} · ${esc(mode)}</p><p><strong>${intro}</strong> ${claimContext?.studyDesign?'The same-cell study-design preview is on; it adds no model call. ':''}${bound?'The verdict applies to your unchanged sentence. Suggested wording is shown separately.':'This agent searches Europe PMC and checks evidence for the text you choose.'} It does not run experiments, answer the section chats or edit your manuscript.</p>${bound?`<div class="callout"><strong>${cited?'Selected source IDs':'Original manuscript sentence'}</strong><p>${cited?claimContext.citedPaperIds.map(esc).join(' · '):'This text is fixed for the check. Edit it in your manuscript to check different wording.'}</p>${cited?'<p>No broader search runs in this mode. You can request an additional search after reviewing the result.</p>':''}</div>`:''}${historyOnly?'<p class="callout">Saved check · opening it uses no AI tokens. Its assessment applies to the sentence and source material recorded at the time.</p>':''}<div id="agentStatus" class="agent-status" role="status"></div><div id="agentLimits" class="agent-limits"></div><p id="agentBudgetNote" class="subtle"></p><form id="agentForm"><label class="field">${bound?'Original sentence · fixed for this check':'Question or claim to investigate'}<textarea id="agentQuestion" rows="3" maxlength="2000" ${bound||historyOnly?'readonly':''} placeholder="What does the evidence establish, and what remains uncertain?">${esc(question)}</textarea></label><p id="agentQuestionCount" class="subtle agent-character-count"></p><label class="agent-consent"><input type="checkbox" id="agentConsent" ${historyOnly?'disabled':''}><span>${consentCopy}</span></label><div class="actions"><button type="submit" class="btn primary" id="agentRun" disabled>${cited?'Check selected sources':bound?'Find evidence':'Run research check'}</button><button type="button" class="btn" id="agentStop" data-agent-action="stop" hidden>Stop run</button><button type="button" class="btn ghost" data-agent-action="refresh">Refresh connection</button>${historyOnly?'<button type="button" class="btn" data-agent-action="new-check">Prepare a new check</button>':''}</div></form><p class="agent-limit-copy">Up to ${fallbackLimits.maxQueries} searches, ${fallbackLimits.maxPapers} papers and ${fallbackLimits.maxModelCalls} model calls. No automatic retries or background research. Each run reserves ${knownCount((status?.limits||fallbackLimits).perRunTokens)} tokens in advance, so the full pool allows at most ${Math.floor((status?.limits||fallbackLimits).lifetimeTokens/(status?.limits||fallbackLimits).perRunTokens)} runs. Unused, failed or stopped reservations are retained; reserved allowance is separate from actual reported usage.</p><div id="agentRunStatus" role="status" aria-live="polite"></div><section id="agentProgress" class="agent-progress" hidden><h3>Agent activity</h3><ol id="agentSteps"></ol><div id="agentRunUsage" class="subtle"></div></section><div id="agentResult"></div><details class="agent-history"><summary>Previous checks in this project</summary><div id="agentHistory"></div></details>`;
    // Assign values explicitly as well as in markup, so reopening never carries a stale composer.
    if($('agentQuestion'))$('agentQuestion').value=question;
    if($('agentConsent'))$('agentConsent').checked=false;
    if(!dialog.open)dialog.showModal();renderStatus();renderHistory();refreshStatus();
    if(saved){const invalid=!!(result&&claimContext&&!boundResultMatches(result,claimContext));if(invalid)result=null;renderProgress();renderResult();setRunMessage(invalid?'This saved result does not match its original sentence. No evidence from it can be applied.':saved.status==='completed'?'Saved check. Inspect its original sentence, source coverage and author decisions.':'This saved run did not complete. No automatic retry was made.',invalid||saved.status!=='completed');}
    return true;
  }
  function showSaved(runId){return show({runId});}
  function renderHistory(){const root=$('agentHistory');if(!root)return;const runs=list(adapter.context().runs).filter(r=>r&&r.kind!=='section_chat'&&typeof r.id==='string'&&typeof r.at==='string');root.innerHTML=runs.length?runs.slice().reverse().map((r,i)=>`<button class="agent-history-item" type="button" data-agent-action="history" data-run-id="${esc(r.id)}"><strong>${esc(r.question||'Research check')}</strong><span>${esc(r.status)} · ${esc(new Date(r.at).toLocaleString())}</span></button>`).join(''):'<p class="subtle">Completed checks will be saved in this browser with their source trail.</p>';}
  function setRunMessage(text,isError=false){const el=$('agentRunStatus');if(el){el.className='callout'+(isError?' error':'');el.textContent=text;}}
  function renderProgress(){
    const panel=$('agentProgress');if(!panel||!session)return;panel.hidden=false;
    $('agentSteps').innerHTML=session.steps.map(s=>`<li><span>${esc(s.actor||'System')}</span><div><strong>${esc(s.stage||'Research')}</strong><p>${esc(s.detail||'')}</p></div></li>`).join('');
    const u=session.usage;$('agentRunUsage').textContent=u?`${num(u.inputTokens).toLocaleString()} input + ${num(u.outputTokens).toLocaleString()} output tokens reported · ${num(u.calls??u.modelCalls)} model calls · ${cost(u.estimatedCostUsd)} conservative estimated model cost. ${Number.isFinite(session.durationMs)?(session.durationMs/1000).toFixed(1)+' seconds. ':''}${u.unknownCalls||u.usageUnknown?'Some call usage is unavailable.':''}`:'Usage appears when the model reports it. No simulated token count.';
  }
  function acceptEvent(event){
    if(!session||!event||typeof event!=='object')return;
    if(event.type==='start'){session.runId=String(event.runId||session.id);session.reserved=true;session.reservedTokens=Number.isSafeInteger(event.reservedTokens)?event.reservedTokens:null;setRunMessage(`Research is running. ${knownCount(session.reservedTokens)} tokens are reserved from the shared allowance, separately from actual usage.`);}
    else if(event.type==='step'){
      const step=event.step||event;
      // Tolerate older wrappers without treating usage records as activity text.
      if(step.type==='usage'){acceptEvent(step);return;}
      if(session.steps.length<50){session.steps.push(step);adapter.log(session.projectId,{type:'Agent activity',detail:String(step.detail||''),actor:step.actor==='AI'?'AI':'System',stage:String(step.stage||''),runId:session.id});renderProgress();}
    }else if(event.type==='usage'){session.usage=event.usage;updateCounter(addUsage(baseUsage,usage(event.usage)));renderProgress();}
    else if(event.type==='result'){
      if(!event.result||!Array.isArray(event.result.papers)||!Array.isArray(event.result.evidence))throw Error('The service returned an incomplete result. No findings were applied.');
      if(session.claimContext){
        if(!boundResultMatches(event.result,session.claimContext))throw Error('The result did not match the original sentence and selected sources. It was discarded; no findings were applied.');
      }
      result={...event.result,clientRunId:session.id};session.result=result;session.usage=result.usage||session.usage;session.status='completed';updateCounter(addUsage(baseUsage,usage(session.usage)));renderProgress();renderResult();
    }else if(event.type==='error'){const e=new Error(event.error?.message||'The research run stopped.');e.code=event.error?.code;throw e;}
  }
  async function run(){
    if(session?.running||historyOnly)return;const question=claimContext?claimContext.claim.text:$('agentQuestion')?.value.trim();if(!status?.canRun||!$('agentConsent')?.checked||!question?.trim()||question.length>2000)return;
    const ctx=adapter.context();if(ctx.projectId!==context.projectId){setRunMessage('The active project changed. Close this panel and open Investigate again.',true);return;}
    if(!bindingIsCurrent(claimContext)){setRunMessage('The sentence or selected source changed. Open its current version in the review inbox before starting another check.',true);return;}
    result=null;$('agentResult').innerHTML='';baseUsage=usage(status.usage);controller=new AbortController();session={id:crypto.randomUUID(),projectId:ctx.projectId,question,at:new Date().toISOString(),running:true,steps:[],usage:null,status:'running',reserved:false,dispatched:false,startedAt:Date.now(),...(claimContext?{kind:'claim_check',claimContext:copy(claimContext)}:{})};
    adapter.log(ctx.projectId,{type:'AI research requested',actor:'Author',detail:claimContext?'Author consented to check this unchanged sentence using selected source IDs or a bounded Europe PMC search.':'Author consented to send this selected question to OpenAI and derived searches to Europe PMC.',runId:session.id});
    updateRunButton();updateCounter(baseUsage);setRunMessage('Connecting to the research service…');renderProgress();
    try{
      session.dispatched=true;const response=await fetch('/api/check-claim',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:session.id,question,consent:true,...(session.claimContext?{claim:session.claimContext.claim,citedPaperIds:session.claimContext.citedPaperIds,...(session.claimContext.studyDesign?{studyDesign:true}:{})}:{})}),signal:controller.signal});
      if(!response.ok){session.dispatched=false;const e=await response.json().catch(()=>null);throw Error(e?.error?.message||'The server did not accept this run. No automatic retry was made.');}
      if(!response.body)throw Error('The server did not provide a research stream.');
      const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',bytes=0;
      try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>512000)throw Error('The response exceeded the workspace limit.');pending+=decoder.decode(chunk.value,{stream:true});let newline;while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline).trim();pending=pending.slice(newline+1);if(line)acceptEvent(JSON.parse(line));}}pending+=decoder.decode();if(pending.trim())acceptEvent(JSON.parse(pending));}
      finally{reader.releaseLock();}
      if(!result)throw Error('The connection ended before a complete result arrived. No automatic retry was made.');
      setRunMessage('Research check complete. Inspect the sources and decide what to save. Nothing in the manuscript was changed.');
    }catch(error){session.status=controller.signal.aborted?'stopped':'failed';setRunMessage(controller.signal.aborted?'Run stopped. Calls already sent may still incur charges; the reservation is retained.':error.message||'The run failed. No automatic retry was made.',true);adapter.log(session.projectId,{type:'AI research '+session.status,detail:controller.signal.aborted?'Author stopped the run. Usage may be incomplete; reserved allowance remains consumed.':String(error.message||'The request failed.'),actor:controller.signal.aborted?'Author':'System',runId:session.id});}
    finally{session.running=false;session.durationMs=Math.max(0,Date.now()-session.startedAt);$('agentConsent').checked=false;if(session.status!=='completed'&&session.dispatched){session.usage={...(session.usage||{}),usageUnknown:true};updateCounter(addUsage(baseUsage,usage(session.usage)));controller?.abort();}adapter.saveRun(session.projectId,{id:session.id,at:session.at,question:session.question,status:session.status,steps:session.steps,usage:session.usage,reserved:session.reserved,reservedTokens:session.reservedTokens??null,durationMs:session.durationMs,...(session.claimContext?{kind:'claim_check',claimContext:copy(session.claimContext)}:{}),result:session.result||null});updateRunButton();renderHistory();if(result)renderResult();await refreshStatus();}
  }
  function renderResult(){
    const el=$('agentResult');if(!el||!result)return;const summary=result.summary||{},papers=list(result.papers),cards=list(result.evidence);
    const section=(title,items)=>`<section class="agent-summary"><h3>${title}</h3>${list(items).length?'<ul>'+list(items).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p class="subtle">No finding recorded.</p>'}</section>`;
    const bound=result.claim,cited=result.scope?.mode==='cited_sources';
    const scope=bound?`<div class="callout"><strong>${cited?'Selected-source review':'Bounded evidence search'}</strong><p>${cited?'Only the selected source IDs were requested. A missing or inaccessible source is not evidence against the sentence.':'The search covered only the papers and excerpts recorded in this run.'}</p>${list(result.scope?.unavailablePaperIds).length?'<p>Sources not retrieved: '+result.scope.unavailablePaperIds.map(esc).join(', ')+'</p>':''}${list(result.scope?.unreadablePaperIds).length?'<p>No readable excerpt: '+result.scope.unreadablePaperIds.map(esc).join(', ')+'</p>':''}${cited?'<button type="button" class="btn small" data-agent-action="additional-search">Find additional evidence</button>':''}</div>`:'';
    const labels={supports:'Supports',partial:'Partly supports',unsupported:'Does not support',contradicts:'Contradicts'};
    el.innerHTML=`<div class="agent-result-heading"><span class="eyebrow">AI RESEARCH NOTE · AUTHOR REVIEW REQUIRED</span><h3>${esc(bound?.text||result.question)}</h3><p class="subtle">A focused search, not a systematic review. Source matching does not independently validate the AI’s interpretation.</p></div>${scope}${section('Findings supported by inspected sources',summary.established)}${section('Uncertainty & limitations',summary.uncertain)}${section('Questions to investigate next',summary.nextQuestions)}<div class="actions"><button type="button" class="btn primary" data-agent-action="save-notebook">Save findings to notebook</button><button type="button" class="btn" data-agent-action="save-sources">Save sources to library</button></div><div id="agentSaveNotice" role="status"></div><div class="agent-evidence-list">${cards.length?cards.map((e,i)=>{const p=papers.find(x=>x.id===e.paperId);return `<article class="agent-evidence"><div class="section-head"><span class="status ${esc(e.label)}">${esc(e.designCheck?.status==='unknown'&&e.label==='unsupported'?'Not assessable from excerpts':labels[e.label]||'Unreviewed')}</span><span class="subtle">${e.access==='full_text'?'Full-text excerpts':e.access==='abstract_only'?'Abstract only':'No abstract'}</span></div><h4>${esc(bound?.text||e.claim)}</h4><blockquote class="source-passage">${esc(e.quote)}</blockquote><p class="subtle">${esc(e.location)} · ${e.quoteVerified?'Exact passage matched by code':'Passage not verified'}</p><p><strong>${esc(p?.title||'Source unavailable')}</strong></p><p class="subtle">${esc(p?.journal)} · ${esc(p?.year)} · ${esc(e.studyType)} · ${esc(e.population)}</p><p>${esc(e.reason)}</p>${window.PherogentEvidence?.designText?.(e)?'<p class="callout">'+esc(window.PherogentEvidence.designText(e))+'</p>':''}${e.mismatchNotes?'<p><strong>Mismatch:</strong> '+esc(Array.isArray(e.mismatchNotes)?e.mismatchNotes.join('; '):e.mismatchNotes)+'</p>':''}${e.suggestedWording?'<div class="callout"><strong>Suggested wording</strong><p>'+esc(e.suggestedWording)+'</p></div>':''}<p class="subtle">${esc(e.coverage||'Interpretation applies only to the inspected material.')}</p><p class="agent-awaiting">${e.designCheck?'AI suggestion and code-based design check, waiting for your approval.':'Checked by AI, waiting for your approval.'}</p><div class="actions">${link('Open source',p?.url)}${adapter.canReview?.(session?.projectId||context.projectId,result,e)?`<button type="button" class="btn small" data-agent-action="review" data-index="${i}">Review this evidence</button>`:'<span class="subtle">Match this claim to a prepared manuscript sentence to review a citation.</span>'}</div></article>`;}).join(''):`<div class="empty-state">No supporting evidence card was verified in ${num(result.usage?.papersSearched)} papers searched. This does not establish that no evidence exists elsewhere.</div>`}</div>`;
  }
  function saveResult(kind){if(!result)return;const projectId=session?.projectId||context.projectId;const ok=kind==='notebook'?adapter.saveFindings(projectId,result):adapter.saveSources(projectId,result);const notice=$('agentSaveNotice');if(notice)notice.textContent=ok?(kind==='notebook'?'Findings saved to the originating project’s notebook. No manuscript edits made.':'Sources saved to the originating project’s library. No citations approved.'):'Nothing changed. The item may already be saved, or the project could not accept it.';}
  function showUsage(){
    const lim=status?.limits||fallbackLimits,b=status?.budget;
    const pool=`<div class="callout"><strong>Shared token allowance</strong><p>${knownCount(b?.remainingLifetimeTokens)} remaining of ${knownCount(lim.lifetimeTokens)} total input + output tokens · ${knownCount(b?.lifetimeReservedTokens)} reserved across all visitors.</p><p>${knownCount(lim.perRunTokens)} tokens are reserved before each run. Reservations are retained even if unused, failed or stopped; the pool never refills automatically. These are allowance figures, not measured usage.</p><p>Backup spending controls: ${money(lim.perRunUsd)} reserved per run · ${money(lim.dailyUsd)} per day for the site · ${money(lim.lifetimeUsd)} total.</p></div>`;
    if(!reportedUsageAvailable||!displayedUsage){adapter.modal('AI usage','<p>Usage is unavailable. No token count or model cost has been reported for this visitor. This is not a zero-usage reading.</p>'+pool);return;}
    const u=displayedUsage;
    adapter.modal('AI usage',`<p>${status?.enabled?'Model connection is enabled.':'AI connection pending or unavailable.'} Counts below are reported usage for this visitor.</p><div class="usage-metrics"><div><strong>${u.inputTokens.toLocaleString()}</strong><span>Input tokens</span></div><div><strong>${u.outputTokens.toLocaleString()}</strong><span>Output tokens</span></div><div><strong>${u.modelCalls}</strong><span>Model calls</span></div></div><p>Conservative estimated model cost: <strong>${cost(u.estimatedCostUsd)}</strong>. ${u.unknownCalls||u.usageUnknown?'Some call usage is unavailable; this is not a complete bill.':''}</p><p>Typing, the prepared tutorial and manual Europe PMC searches use no model tokens. An interrupted request may have usage that has not been reported.</p>${pool}`);
  }

  function init(a){
    adapter=a;const dialog=$('agentDialog');if(!dialog)return;
    $('agentForm')?.addEventListener('submit',e=>{e.preventDefault();run();});
    dialog.addEventListener('submit',e=>{if(e.target.id==='agentForm'){e.preventDefault();run();}});
    dialog.addEventListener('input',updateRunButton);
    dialog.addEventListener('cancel',()=>{if(session?.running)controller?.abort();});
    dialog.addEventListener('click',e=>{const button=e.target.closest('[data-agent-action]');if(!button)return;const action=button.dataset.agentAction;
      if(action==='close'){if(session?.running)controller?.abort();dialog.close();}
      else if(action==='stop')controller?.abort();
      else if(action==='refresh')refreshStatus();
      else if(action==='save-notebook')saveResult('notebook');
      else if(action==='save-sources')saveResult('sources');
      else if(action==='history')showSaved(button.dataset.runId);
      else if(action==='additional-search'||action==='new-check'){
        if(session?.running)return;
        const nextBinding=action==='additional-search'&&claimContext?{...copy(claimContext),citedPaperIds:[],sourceSnapshots:{}}:claimContext;
        if(!bindingIsCurrent(nextBinding)){adapter.toast('The sentence or selected source changed. Open its current version from the review inbox.');return;}
        if(action==='additional-search'&&nextBinding)show(nextBinding);
        else {const prior=claimContext?copy(claimContext):null,priorQuestion=$('agentQuestion')?.value;show(prior||{});if(!prior&&$('agentQuestion'))$('agentQuestion').value=priorQuestion||'';updateRunButton();}
      }
      else if(action==='review'){const evidence=result?.evidence?.[Number(button.dataset.index)];if(evidence&&adapter.reviewEvidence(session?.projectId||context.projectId,result,evidence))dialog.close();}
    });
    if(typeof fetch==='function')refreshStatus();
  }
  window.PherogentAgent={init,show,showSaved,showUsage,refreshStatus,safeLink,getUsageSnapshot};
})();
