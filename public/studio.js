'use strict';
(() => {
  const D = window.PherogentStudioData;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => 'studio-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  const $ = id => document.getElementById(id);
  function secureRequestId() {
    const source=typeof crypto==='object'?crypto:null;
    if(typeof source?.randomUUID==='function')return source.randomUUID();
    if(typeof source?.getRandomValues!=='function')throw Error('Secure request IDs are unavailable in this browser. Open Pherogent over HTTPS in an up-to-date browser. No AI request was sent.');
    const bytes=source.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
  }

  let bridge, mobilePanel = 'chat', sideOpen = false, pendingInsertion = null, pendingExample = null, pendingChat = null, chatRun = null, pendingSuggestion = null, attachmentPreview = null, attachmentPickerTarget = null, readingFiles = 0;
  let addMenuOpen = false, composing = false;
  let designSession=null;
  const addMenuIds = ['studioMenuUpload','studioMenuContext','studioMenuHelp'];
  // Pending files stay in memory, scoped to one project and agent. Raw files are
  // never put in localStorage; only the excerpts actually sent join the record.
  const attachmentQueues = new Map();
  const attachmentFiles = new Map(), ocrJobs = new Map();
  let ocrBusy = false;
  // Keep at most three original files, in memory only, for optional local OCR.
  function retainFile(id,file) {
    if(!(/\.(pdf|png|jpe?g)$/i.test(String(file.name).trim())||['application/pdf','image/png','image/jpeg'].includes(file.type))||file.size>(window.PherogentAttachments?.LIMITS?.maxFileBytes||20*1024*1024))return;
    attachmentFiles.set(id,file);
    while(attachmentFiles.size>3)attachmentFiles.delete(attachmentFiles.keys().next().value);
  }
  const queueKey = (projectId,stageId) => JSON.stringify([projectId,stageId]);
  const queue = (projectId=context().project.id,stageId=stage().id) => {
    const key=queueKey(projectId,stageId);if(!attachmentQueues.has(key))attachmentQueues.set(key,[]);return attachmentQueues.get(key);
  };
  const attachmentSignature = files => JSON.stringify(files.map(f=>[f.id,f.name,f.status,f.text,f.note]));
  const guidedPractice = () => context().project.isProcessTutorial===true && context().research.processTour?.status==='active';
  const context = () => bridge.context();
  function model() {
    let value = bridge.workspace();
    if (!value || value.version !== 1 || !value.agents) { value = D.normalize(value, context()); bridge.setWorkspace(value); }
    return value;
  }
  const current = () => model().agents[model().activeStage];
  const stage = () => D.stageFor(model().activeStage);
  const button = (label, action, arg = '', cls = 'btn small', extra = '') => `<button type="button" class="${cls}" data-studio-action="${action}" data-studio-arg="${esc(arg)}" ${extra}>${label}</button>`;
  const oldButton = (label, view, cls = 'btn small') => `<button type="button" class="${cls}" data-action="view" data-arg="${view}">${label}</button>`;
  const researchButton = (cls = 'btn small', content = 'Research check') => window.PherogentAgent ? `<button type="button" class="${cls}" data-action="investigate" aria-label="Research check">${content}</button>` : '';
  const icons = {
    organizer:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    data:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    methods:'<path d="M9 3h6M10 3v7L4 20h16L14 10V3M8 15h8"/>',
    results:'<path d="M4 3v17h17M8 16v-4M13 16V7M18 16v-7"/>',
    figures:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m4 18 6-6 4 3 3-5 4 5"/>',
    title:'<path d="M4 5h16M12 5v15M8 20h8"/>',
    introduction:'<path d="M12 5c-4-3-8-2-9-1v15c3-2 6-2 9 0 3-2 6-2 9 0V4c-3-2-6-1-9 1v14"/>',
    discussion:'<path d="M20 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3l4 3v-3h6a2 2 0 0 0 2-2ZM7 8h9M7 12h6"/>',
    abstract:'<path d="M6 3h9l4 4v14H6V3ZM14 3v5h5M9 12h7M9 16h5"/>',
    references:'<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',
    review:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    send:'<path d="m5 12 7-7 7 7M12 5v15"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    upload:'<path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>'
  };
  function icon(id) { return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id] || icons.abstract}</svg>`; }
  const outputLabel = output => !output?.body?.trim() ? 'Not started' : output.status === 'reviewed' ? 'Reviewed by you' : 'Draft';
  const paperStages = ['title','abstract','introduction','methods','results','figures','discussion','references'];
  const navigationState = new Map();
  function nav(ctx, view) {
    const m = model(), projectId=ctx.project?.id || 'current';
    const saved=navigationState.get(projectId)||{};
    const page=(id,label,glyph='abstract',detail='')=>`<button type="button" class="studio-nav-item${view===id&&label!=='Study collections'?' active':''}" data-action="view" data-arg="${id}" ${view===id&&label!=='Study collections'?'aria-current="page"':''}><span class="studio-nav-icon">${icon(glyph)}</span><span class="studio-nav-copy">${esc(label)}${detail?`<small>${esc(detail)}</small>`:''}</span>${id==='literature'?`<span class="nav-count">${ctx.papers.length}</span>`:''}</button>`;
    const task=(id,label)=>{
      const s=D.stageFor(id), output=m.agents[id].output, active=view==='studio' && m.activeStage===id;
      return button(`<span class="studio-nav-icon">${icon(id)}</span><span class="studio-nav-copy">${esc(label||s.label)}</span><span class="studio-nav-dot ${output?.status==='reviewed'?'reviewed':output?.body?'draft':''}" title="${outputLabel(output)}"></span>`, 'open-stage', id, 'studio-nav-item'+(active?' active':''), active?'aria-current="page"':'');
    };
    const group=(number,label,content)=>`<section class="studio-nav-section" aria-label="${label}"><div class="studio-section-label"><span>${number}</span>${label}</div><div class="studio-nav-group">${content}</div></section>`;
    return `<div class="studio-nav-group studio-nav-home">${window.PherogentMap?page('map','Research workflow','organizer'):''}${task('organizer','Project brief')}</div>`
      +group('01','Sources',page('literature','Library','introduction')+(window.PherogentStudyWorkflows?page('study-workflows','Study collections','data'):''))
      +group('02','Checks',researchButton('studio-nav-item',`<span class="studio-nav-icon">${icon('references')}</span><span class="studio-nav-copy">Research check</span>`)+page('review','Evidence inbox','references')+task('review'))
      +group('03','Analyses',(window.PherogentDataLab?page('data-analysis','Data & results','data'):'')+(window.PherogentStudyWorkflows?page('study-workflows','Study analyses','results'):'' )+(window.PherogentLeeStudy?page('study-explorer','Study explorer','data'):'')+task('data')+page('analysis','Notebook','discussion'))
      +group('04','Outputs',page('outputs','All outputs','abstract')+`<details id="studioPaperNav" class="studio-paper-nav" data-nav-project="${esc(projectId)}" ${saved.paper!==false?'open':''}><summary><span class="studio-nav-icon">${icon('abstract')}</span><span><strong>Research paper</strong><small>${esc(ctx.draft?.title||'Untitled paper')}</small></span><span class="studio-nav-chevron" aria-hidden="true">›</span></summary><div class="studio-paper-sections">${page('manuscript','Full manuscript','abstract')}${paperStages.map(id=>task(id)).join('')}</div></details>`)
      +`<details id="studioToolsNav" class="studio-tools-nav" data-nav-project="${esc(projectId)}" ${saved.tools===true?'open':''}><summary>Workspace tools<span class="studio-nav-chevron" aria-hidden="true">›</span></summary><div class="studio-nav-group">${page('activity','Activity','review')}${window.PherogentMeter?page('usage','Usage & budget','results'):''}${button(`<span class="studio-nav-icon">${icon('references')}</span><span class="studio-nav-copy">Connections</span>`,'connections','','studio-nav-item')}</div></details>`;
  }
  // Keep disclosure choices while moving between tasks; no research data changes.
  document.addEventListener('toggle',event=>{
    const el=event.target;if(!['studioPaperNav','studioToolsNav'].includes(el?.id))return;
    const projectId=el.dataset?.navProject;if(!projectId)return;
    navigationState.set(projectId,{...(navigationState.get(projectId)||{}),[el.id==='studioPaperNav'?'paper':'tools']:el.open});
  },true);
  function messageHTML(message) {
    const author=message.role==='user', ai=message.kind==='ai', prepared=message.provenance?.includes('Prepared') || message.kind==='example';
    const files=Array.isArray(message.attachments)?message.attachments:[];
    return `<article class="studio-message" data-role="${author?'author':ai?'ai':prepared?'example':'system'}"><div class="studio-message-avatar">${author?'Y':icon(stage().id)}</div><div class="studio-message-content"><div class="studio-message-meta"><strong>${author?'You':esc(stage().role)}</strong><span>${author?'Author':ai?'AI · Author review required':prepared?'Prepared example · no AI ran':'System · no AI ran'}</span></div>${files.length?`<div class="studio-message-files">${files.map(file=>`<details class="studio-sent-file"><summary>${icon('abstract')} ${esc(file.name)} <small>Text excerpt sent${file.clipped?' · partial':''}</small></summary><pre>${esc(file.text)}</pre></details>`).join('')}</div>`:''}<div class="studio-message-body">${esc(message.text)}</div>${!author&&(ai||prepared)?`<div class="studio-reply-actions">${button(icon('copy')+'<span>Copy reply</span>','copy-reply',message.id,'studio-copy-reply','aria-label="Copy reply"')}${ai&&message.suggestedDraft?button('Use as section draft','preview-ai-draft',message.id,'btn small'):''}</div>`:''}${message.outputTitle?`<button type="button" class="studio-output-inline" data-studio-action="show-output"><span>${icon('abstract')}</span><span><strong>${esc(message.outputTitle)}</strong><small>Editable section draft · open output</small></span><span aria-hidden="true">↗</span></button>`:''}</div></article>`;
  }
  function stageMap() {
    const m=model();
    return `<div class="studio-stage-map" aria-label="Research stages">${['data','methods','results','abstract'].map(id=>{
      const s=D.stageFor(id);return button(`<span class="studio-map-icon">${icon(id)}</span><span><strong>${esc(s.label)}</strong><small>${outputLabel(m.agents[id].output)}</small></span><span aria-hidden="true">↗</span>`,'open-stage',id,'studio-stage-tile');
    }).join('')}</div>`;
  }
  function outputHTML() {
    const a=current(),o=a.output,s=stage();
    return `<div class="studio-output-meta"><span class="studio-status ${o.status==='reviewed'?'reviewed':''}" id="studioOutputStatus">${outputLabel(o)}</span><span>${esc(o.provenance || 'Author')}</span></div>
      <label class="studio-context-label" for="studioOutputTitle">SECTION OUTPUT</label><input id="studioOutputTitle" class="studio-output-title" maxlength="180" aria-label="Output title" placeholder="${esc(s.label)} draft" value="${esc(o.title)}">
      <label class="sr-only" for="studioOutputBody">Section output</label><textarea id="studioOutputBody" class="studio-output-editor" maxlength="20000" placeholder="Your working draft lives here. Write directly, or try a prepared example in the chat.">${esc(o.body)}</textarea>
      <div class="studio-note">${s.id==='results' || s.id==='data'?'No dataset has been analyzed. Record only results you can substantiate.':s.id==='references'?'Reviewing this draft does not verify sources or approve citations. Use Evidence review for that.':'You control this draft. Nothing enters the manuscript automatically.'}</div>
      <div class="studio-output-actions">${button('Mark reviewed','review-output','','btn small primary',!o.body.trim()||o.status==='reviewed'?'disabled':'')}${button('Add to manuscript','insert-output','','btn small',!o.body.trim()||o.status!=='reviewed'?'disabled':'')}</div>
      <div class="studio-output-actions secondary">${button('Pass to another agent ↗','handoff','','studio-inline-link',!o.body.trim()||o.status!=='reviewed'?'disabled':'')}${button('Export draft','export-output','','studio-inline-link',!o.body.trim()?'disabled':'')}</div>
      ${model().lastInsertion ? `<div class="studio-note">Last addition can be undone while the manuscript is unchanged. ${button('Undo addition','undo-insertion','','studio-inline-link')}</div>`:''}
      ${o.history?.length?`<details class="studio-history"><summary>Earlier draft (${o.history.length})</summary>${button('Restore previous draft','restore-output','','btn small ghost')}</details>`:''}`;
  }
  function evidenceState(input,ctx=context()) {
    if(!input.evidenceRef)return null;
    const ref=input.evidenceRef,records=Array.isArray(ctx.evidenceRecords)?ctx.evidenceRecords:[];
    const record=records.find(item=>item.key===ref.key);
    const valid=typeof ref.key==='string'&&typeof ref.fingerprint==='string'&&ref.fingerprint.length>0
      &&ref.projectId===ctx.project.id&&record?.fresh===true&&record.status==='approved'&&record.fingerprint===ref.fingerprint;
    return {valid,record,reason:valid?'Author-approved evidence snapshot.':record?.reason||'The sentence, source or author decision changed. Recheck the evidence before using this saved copy.'};
  }
  const staleEvidence=(ctx,a)=>a.inputs.filter(input=>input.evidenceRef&&!evidenceState(input,ctx)?.valid);
  function evidenceSnapshot(record) {
    const e=record.evidence||{},paper=record.paper||{},gate=e.designCheck?.rule==='same-cell-tracking-v1'?e.designCheck:null;
    const assessment=gate?[
      'FINAL ASSESSMENT OF ORIGINAL SENTENCE\n'+String(e.label||'Not recorded'),
      'STUDY DESIGN CHECK (code)\n'+String(designLabels[gate.status]||gate.status)+'. '+String(gate.reason||''),
      'INITIAL AI LABEL (before the design check)\n'+String(gate.modelLabel||'Not recorded')
    ].join('\n\n'):'AI ASSESSMENT OF ORIGINAL SENTENCE\n'+String(e.label||'Not recorded');
    return ['ORIGINAL SENTENCE CHECKED\n'+String(record.claim||''),
      'AUTHOR-APPROVED WORDING\n'+String(record.currentText||record.claim||''),
      assessment,
      'EXACT SOURCE PASSAGE\n'+String(e.quote||''),
      'SOURCE\n'+String(paper.title||record.paperId||'')+'\n'+String(paper.url||''),
      'PASSAGE LOCATION\n'+String(e.location||'Not recorded'),
      'LIMITATIONS\n'+[e.reason,e.coverage,...(Array.isArray(e.mismatchNotes)?e.mismatchNotes:[])].filter(Boolean).join('\n'),
      'AUTHOR DECISION\nApproved by the author. This is not independent scientific validation. The assessment applies to the original sentence; revised wording was approved by the author.',
      'Evidence record: '+String(record.key)+'\nChecked: '+String(record.checkedAt||'Not recorded')].join('\n\n');
  }
  function addEvidence(key) {
    const ctx=context(),record=(Array.isArray(ctx.evidenceRecords)?ctx.evidenceRecords:[]).find(item=>item.key===key);
    if(!record||!record.fresh||record.status!=='approved'||typeof record.fingerprint!=='string'||!record.fingerprint){bridge.toast('This evidence needs a current author approval before it can be attached.');return;}
    const a=current();
    if(a.inputs.some(input=>input.evidenceRef?.key===key&&input.evidenceRef.fingerprint===record.fingerprint)){bridge.toast('This exact evidence snapshot is already attached.');return;}
    if(a.inputs.length>=40){bridge.toast('Each agent can hold up to 40 inputs.');return;}
    const text=evidenceSnapshot(record);
    if(text.length>20000){bridge.toast('This evidence record is too large for section context. Use a shorter author note with its source instead.');return;}
    a.inputs.push({id:uid(),kind:'note',title:('Evidence: '+String(record.currentText||record.claim||record.paperId)).slice(0,180),text,
      provenance:'Author-approved evidence snapshot',evidenceRef:{key,fingerprint:record.fingerprint,projectId:ctx.project.id},at:new Date().toISOString()});
    saveChange('Approved evidence attached','Author attached evidence record '+key+' to '+stage().label+'. This is an explicit copy; no AI ran and no manuscript text changed.');
    bridge.close();model().sideTab='context';sideOpen=true;mobilePanel='context';bridge.render();
  }
  // This form is local scratch space. Nothing is added to a manuscript, approved,
  // transmitted, or kept after the next opening. Samples never replace the author's text.
  const designModes=['author','cells','locus'];
  const designScope=()=>['results','references'].includes(stage().id);
  const bulkExample='Bulk assays measured samples from the same three donors at each time point. The cells were destroyed during measurement. The same individual cells were not tracked.';
  const designLabels={incompatible:'This design cannot establish the claim',unknown:'Not enough information to assess',compatible:'Same-cell tracking is described',not_applicable:'Same-cell tracking is not required here'};
  function openDesign() {
    if(!designScope())return;
    const draft=current().output?.body?.trim()||'';
    designSession={projectId:context().project.id,stageId:stage().id,mode:'author',fields:{
      author:{claim:'',passage:''},
      cells:{claim:'The same individual fibroblasts recovered after factor withdrawal.',passage:bulkExample},
      locus:{claim:'For donor O2, methylation at cg06036945 moved closer to its starting value after withdrawal.',passage:bulkExample+' At this locus in donor O2, the three reported values were 0.097, 0.312 and 0.122.'}
    }};
    bridge.modal('Check study design',`<div class="studio-design"><p class="studio-design-intro">Does this sentence require following the same cells over time? Check the claim against what the study actually measured.</p>
      <div class="studio-design-picker" role="group" aria-label="Choose your text or a worked example">${[['author','Your text'],['cells','Cell recovery example'],['locus','One-site example']].map(([v,t])=>button(t,'design-mode',v,'btn small',`id="designMode-${v}" aria-pressed="${v==='author'}"`)).join('')}</div>
      <p id="designOrigin" class="studio-design-origin"></p><form id="studyDesignForm">
      <label for="designClaim">Manuscript sentence</label><textarea id="designClaim" rows="2" required maxlength="1200" placeholder="Paste one sentence you want to check."></textarea>
      ${draft&&draft.length<=1200?button('Use my section draft','design-draft','','studio-inline-link','id="designUseDraft"'):''}
      <label for="designPassage">Methods or evidence excerpt <small>Optional</small></label><textarea id="designPassage" rows="3" maxlength="12000" placeholder="Paste the passage describing how the samples or cells were measured."></textarea>
      <div class="studio-design-footer"><span>Runs on this device · No AI tokens</span><button type="submit" class="btn primary">Check this claim</button></div></form>
      <div id="designOutcome" class="studio-design-outcome" role="status" aria-live="polite" aria-atomic="true" hidden></div></div>`);
    selectDesignMode('author',false);
  }
  function activeDesign(){
    return designSession && $('dialog')?.open && $('studyDesignForm') && designSession.projectId===context().project.id && designSession.stageId===stage().id && designScope();
  }
  function clearDesignOutcome(){const el=$('designOutcome');if(el){el.hidden=true;el.textContent='';el.removeAttribute('data-result');}}
  function selectDesignMode(mode,remember=true) {
    if(!activeDesign()||!designModes.includes(mode))return;
    if(remember)designSession.fields[designSession.mode]={claim:$('designClaim').value,passage:$('designPassage').value};
    designSession.mode=mode;
    const fields=designSession.fields[mode];$('designClaim').value=fields.claim;$('designPassage').value=fields.passage;
    for(const v of designModes)$('designMode-'+v).setAttribute('aria-pressed',String(mode===v));
    $('designOrigin').textContent=mode==='author'?'Use a source passage if you have one. Your draft and citations stay unchanged.':'Editable teaching example adapted from the EpiState-T report. The methods description is a paraphrase, not a quotation.';
    if($('designUseDraft'))$('designUseDraft').hidden=mode!=='author';clearDesignOutcome();
  }
  function runDesign(){
    if(!activeDesign())return;
    const claim=$('designClaim').value.trim(),passage=$('designPassage').value.trim(),panel=$('designOutcome');
    const show=(status,title,body,foot='')=>{panel.hidden=false;panel.setAttribute('data-result',status);panel.innerHTML=`<small>Study design check</small><strong>${esc(title)}</strong><p>${esc(body)}</p>${foot?'<p class="design-next">'+esc(foot)+'</p>':''}`;};
    if(!claim){show('unknown','Add a manuscript sentence','Enter one claim or choose a worked example.');$('designClaim').focus();return;}
    const check=window.PherogentStudyDesign?.evaluate?.({claim,passage});
    if(!check||!Object.hasOwn(designLabels,check.status)){show('unknown','Study design check unavailable','No assessment was made. Reload this page to try again.');return;}
    const foot={incompatible:'State the result at the level the study measured, or cite a study that followed the same individual cells.',unknown:'Look for how individual cells were identified across time points. A missing detail does not show that the claim is false.',compatible:'This clears the tracking requirement only. Check separately whether the results show the outcome claimed.',not_applicable:'This rule only checks claims about the same individual cells. Verify the numbers, passage and interpretation separately.'}[check.status];
    show(check.status,designLabels[check.status],check.reason,foot);
  }
  function contextHTML(ctx) {
    const a=current(), inputs=a.inputs||[], paperIds=new Set(inputs.filter(i=>i.kind==='source').map(i=>i.sourceId));
    return `<section class="studio-context-card"><div class="studio-context-heading"><span class="studio-context-label">SHARED PROJECT BRIEF</span><span class="studio-scope-badge">Project-wide</span></div><strong>${esc(ctx.draft.title)}</strong><p>${esc(ctx.research.question || 'Set the question you want to investigate.')}</p>${oldButton('Edit research brief','plan','studio-inline-link')}</section>
      <section class="studio-context-card"><div class="section-head"><span class="studio-context-label">INPUTS FOR THIS TASK</span><span class="studio-tag">${inputs.length}</span></div><p class="subtle">Selected sources, notes and linked results for ${esc(stage().label)}. The rest of your library is not included automatically.</p>${inputs.length?inputs.map(input=>{const evidence=evidenceState(input,ctx);return `<div class="studio-source-item${evidence&&!evidence.valid?' evidence-stale':''}"><span>${icon(input.evidenceRef?'references':input.kind==='source'?'references':input.kind==='handoff'||input.outputRef?'review':'abstract')}</span><div><span class="studio-scope-badge">${input.kind==='handoff'||input.outputRef?'Linked result':input.evidenceRef?'Evidence snapshot':'This task'}</span><strong>${esc(input.title||input.name||'Untitled input')}</strong><small>${evidence?(evidence.valid?'Author-approved evidence · saved copy':'Needs rechecking · blocked from AI'):input.outputRef?'Reviewed output · saved version '+esc(input.outputRef.revision)+'; later edits do not update this copy.':input.kind==='handoff'?'Reviewed copy from '+esc(D.stageFor(input.fromStage)?.label||input.fromStage):input.kind==='source'?'Selected project source':input.kind==='file'?'Local text file · not analyzed':'Author note'}</small><div class="actions">${button('Inspect','inspect-input',input.id,'studio-inline-link')}${evidence&&!evidence.valid?oldButton('Open evidence inbox','review','studio-inline-link'):''}${button('Detach','remove-input',input.id,'studio-inline-link')}</div></div></div>`;}).join(''):'<div class="studio-empty"><p>No local inputs yet.</p><span>Add a source or note to give this agent a focused context.</span></div>'}${button('+ Add input','input-add','','btn small')}</section>
      <section class="studio-context-card"><span class="studio-context-label">PROJECT LIBRARY</span><p class="subtle">${ctx.papers.length} saved papers · ${paperIds.size} selected here</p>${oldButton('Search live literature ↗','literature','studio-inline-link')}</section>
      <section class="studio-context-card"><span class="studio-context-label">CONTEXT BOUNDARY</span><p class="subtle">Other task conversations stay separate. Linked results are saved copies; later edits do not silently change them. You review the exact context before sending to AI.</p></section>`;
  }
  function render(ctx) {
    closeAddMenu();composing=false;
    const normalized=D.normalize(bridge.workspace(),ctx);bridge.setWorkspace(normalized);
    const m=model(),s=stage(),a=current(),guided=guidedPractice(),showSide=sideOpen;
    const messages=a.messages.filter(message=>message.id!=='welcome-'+s.id);
    const empty=`<div class="studio-empty-chat"><span class="studio-empty-emblem">${icon(s.id)}</span><h2>${s.id==='organizer'?'What are we researching?':'Let’s work on your '+esc(s.label.toLowerCase())+'.'}</h2><p>${esc(s.description)}</p><span>Ask a question, add your notes, or attach a document below.</span></div>`;
    return `<section class="studio-root" data-mobile-panel="${mobilePanel}" data-side-open="${showSide}" data-studio-dropzone><div class="studio-heading"><div>${window.PherogentMap?oldButton('← Research workflow','map','studio-map-back'):''}<h1>${esc(s.label)} <span class="studio-heading-label">agent</span></h1></div><div class="studio-heading-actions">${designScope()?button('Check study design','check-design','','btn small studio-design-launch','aria-haspopup="dialog"'): ''}${['organizer','references'].includes(s.id)?researchButton():''}${s.id==='references'?oldButton('Evidence inbox ↗','review'):''}${button('Draft','open-panel','output','btn small ghost',`aria-pressed="${showSide&&m.sideTab==='output'}"`)}${button('Context'+(a.inputs.length?' · '+a.inputs.length:''),'open-panel','context','btn small ghost',`aria-pressed="${showSide&&m.sideTab==='context'}"`)}${button('Guide','tour-start','','btn small ghost')}</div></div>
      <div class="studio-mobile-tabs" role="tablist" aria-label="Agent panels">${['chat','output','context'].map(panel=>button(panel==='output'?'Draft':panel[0].toUpperCase()+panel.slice(1),'mobile-tab',panel,'',`role="tab" aria-selected="${mobilePanel===panel}"`)).join('')}</div>
      <div class="studio-layout"><section class="studio-conversation" aria-label="${esc(s.label)} conversation"><div class="studio-chat-head"><span>${esc(s.role)}</span><span class="studio-tag">Your approval comes first</span></div><div class="studio-messages" id="studioMessages" role="log" aria-live="polite" aria-relevant="additions">${messages.length?messages.map(messageHTML).join(''):empty}</div>
      <div id="studioAIRunState"></div><details class="studio-examples" ${guided?'open':''}><summary>Prepared examples <span>· no AI tokens</span></summary><div class="studio-prompts">${s.prompts.map((prompt,i)=>button(esc(prompt),'demo',String(i),'studio-prompt')).join('')}</div></details>
      <form id="studioChatForm" class="studio-composer"><div id="studioAttachments" class="studio-attachments" aria-label="Attachments for this message" aria-live="polite">${attachmentCards()}</div><label class="sr-only" for="studioComposer">Message ${esc(s.role)}</label><textarea id="studioComposer" rows="2" maxlength="4000" aria-describedby="studioComposerKeys" placeholder="Ask anything about ${esc(s.label.toLowerCase())}…">${esc(a.composer)}</textarea><div class="studio-composer-bottom">${button(icon('plus'),'toggle-add-menu','','studio-input-button','id="studioAddToggle" aria-label="Add to message" title="Add to message" aria-haspopup="menu" aria-controls="studioAddMenu" aria-expanded="false"')}${addMenuHTML()}${button('Add context','input-add','','studio-context-button')}<span class="studio-composer-hint"><span id="studioComposerKeys" class="studio-composer-keys">Enter to send · Shift+Enter for a new line</span><span id="studioComposerCount">${a.composer.length}</span>/4,000</span><button class="studio-send" type="submit" aria-label="Send message" ${a.composer.trim()&&!queue().some(f=>f.status!=='ready')?'':'disabled'}>${icon('send')}</button></div><input type="file" id="studioAttachmentFiles" multiple accept="${esc(window.PherogentAttachments?.ACCEPT||'.pdf,.docx,.txt,.md,.csv,.tsv,.json')}" hidden><p class="studio-drop-hint">PDF, Word, Excel, slides or text · 3 files, ${Math.round((window.PherogentAttachments?.LIMITS?.maxFileBytes||20*1024*1024)/1024/1024)} MB each · ${button('File help','attachment-help','','studio-inline-link')}</p></form><p class="studio-chat-footnote">Review before sending to AI. Attachments send text excerpts only. <strong>AI can make mistakes.</strong></p></section>
      <aside class="studio-side" aria-label="Agent output and context"><div class="studio-side-tabs" role="tablist" aria-label="Output and context">${['output','context'].map(tab=>button(tab==='output'?'Draft':'Context','side-tab',tab,'',`role="tab" aria-selected="${m.sideTab===tab}"`)).join('')}${button('×','close-panel','','studio-side-close','aria-label="Close side panel"')}</div><div class="studio-panel-content" id="studioPanelContent">${m.sideTab==='context'?contextHTML(ctx):outputHTML()}</div></aside></div>${tourHTML()}</section>`;
  }
  function refreshOutputControls() {
    const o=current().output;
    if($('studioOutputStatus')){$('studioOutputStatus').textContent=outputLabel(o);$('studioOutputStatus').className='studio-status'+(o.status==='reviewed'?' reviewed':'');}
    document.querySelectorAll('[data-studio-action="review-output"]').forEach(el=>el.disabled=!o.body.trim()||o.status==='reviewed');
    for(const action of ['insert-output','handoff'])document.querySelectorAll(`[data-studio-action="${action}"]`).forEach(el=>el.disabled=!o.body.trim()||o.status!=='reviewed');
    document.querySelectorAll('[data-studio-action="export-output"]').forEach(el=>el.disabled=!o.body.trim());
  }
  function addMessage(role,text,extra={}) {
    const a=current();a.messages.push({id:uid(),role,text,at:new Date().toISOString(),provenance:role==='user'?'Author':'Prototype · no AI ran',...extra});
  }
  function hasRoomForMessages() { if(current().messages.length>97){bridge.toast('This conversation has reached 100 messages. Export this project before starting a new one.');return false;}return true; }
  function saveChange(type,detail,extra={}) {bridge.log(type,detail,{stage:model().activeStage,...extra});bridge.save();}
  function openStage(id,panel) {
    if(!D.stages.some(s=>s.id===id))return;
    closeAddMenu();
    if(paperStages.includes(id)){const key=context().project?.id||'current';navigationState.set(key,{...(navigationState.get(key)||{}),paper:true});}
    model().activeStage=id;pendingInsertion=null;pendingExample=null;pendingChat=null;pendingSuggestion=null;mobilePanel=guidedPractice()&&current().output.body?model().sideTab:'chat';sideOpen=guidedPractice();
    if(['output','context'].includes(panel)){model().sideTab=panel;sideOpen=true;mobilePanel=panel;}
    bridge.close();bridge.navigateStudio();
    if(mobilePanel==='chat')$('studioComposer')?.focus({preventScroll:true});
    document.body?.classList?.remove('nav-open');
  }
  function addMenuHTML() {
    return `<div id="studioAddMenu" class="studio-add-menu" role="menu" aria-label="Add to message" popover="manual" hidden>${button(icon('upload')+'<span><strong>Upload files</strong><small>PDF, documents, spreadsheets & more</small></span>','attach-files','','studio-add-item','id="studioMenuUpload" role="menuitem" tabindex="-1"')}${button(icon('references')+'<span><strong>Add sources or notes</strong><small>Choose context for this agent</small></span>','input-add','','studio-add-item','id="studioMenuContext" role="menuitem" tabindex="-1"')}${button(icon('help')+'<span><strong>File help</strong><small>Supported formats & scanned files</small></span>','attachment-help','','studio-add-item','id="studioMenuHelp" role="menuitem" tabindex="-1"')}<p>Files are read on your device. You review before sending.</p></div>`;
  }
  function closeAddMenu(returnFocus=false) {
    const wasOpen=addMenuOpen;addMenuOpen=false;
    const menu=$('studioAddMenu');
    if(menu){if(wasOpen&&typeof menu.hidePopover==='function')try{menu.hidePopover();}catch{}menu.hidden=true;}
    $('studioAddToggle')?.setAttribute('aria-expanded','false');
    if(wasOpen&&returnFocus)$('studioAddToggle')?.focus({preventScroll:true});
  }
  function openAddMenu(index=0) {
    const menu=$('studioAddMenu'),toggle=$('studioAddToggle');if(!menu||!toggle)return;
    addMenuOpen=true;menu.hidden=false;toggle.setAttribute('aria-expanded','true');
    if(typeof menu.showPopover==='function')try{menu.showPopover();}catch{}
    const anchor=toggle.getBoundingClientRect?.(),size=menu.getBoundingClientRect?.();
    if(anchor&&size&&menu.style){const width=window.innerWidth||document.documentElement?.clientWidth||1024;menu.style.left=Math.max(12,Math.min(anchor.left,width-size.width-12))+'px';menu.style.top=Math.max(12,anchor.top-size.height-10)+'px';}
    $(addMenuIds[index])?.focus({preventScroll:true});
  }
  function resizeComposer() {
    const textarea=$('studioComposer');if(!textarea?.style)return;
    const max=window.matchMedia?.('(max-width: 700px)')?.matches?140:200;
    textarea.style.height='auto';
    textarea.style.height=Math.max(56,Math.min(max,textarea.scrollHeight))+'px';
    textarea.style.overflowY=textarea.scrollHeight>max?'auto':'hidden';
  }
  async function copyReply(id,trigger) {
    const message=current().messages.find(m=>m.id===id&&m.role!=='user'&&(m.kind==='ai'||m.kind==='example'||m.provenance?.includes('Prepared')));
    if(!message||trigger.disabled)return;
    const label=trigger.innerHTML;trigger.disabled=true;
    try{
      if(typeof navigator.clipboard?.writeText!=='function')throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(message.text);
      trigger.textContent='Copied';trigger.setAttribute('aria-label','Reply copied');bridge.toast('Reply copied.');
      setTimeout(()=>{trigger.innerHTML=label;trigger.setAttribute('aria-label','Copy reply');},1800);
    }catch{bridge.toast('Could not copy. Select the reply text and copy it manually.');}
    finally{trigger.disabled=false;}
  }
  function attachmentCards() {
    return queue().map(file=>`<div class="studio-file-card" data-status="${file.status}"><span class="studio-file-icon" aria-hidden="true">${icon('abstract')}</span><div class="studio-file-copy"><strong>${esc(file.name)}</strong><small>${file.status==='reading'?esc(file.progress||'Reading locally…'):file.status==='error'?esc(file.error):`${esc(file.kind.toUpperCase())} · ${file.text.length.toLocaleString()} characters${file.clipped?' · partial extraction':''}`}</small></div><div class="studio-file-actions">${file.status==='ready'?button('Preview','preview-attachment',file.id,'studio-file-preview',`aria-label="Preview ${esc(file.name)}"`):''}${file.status!=='reading'&&attachmentFiles.has(file.id)&&window.PherogentOCR?button('Read scan','ocr-preview',file.id,'studio-file-preview',`aria-label="Read scan (OCR): ${esc(file.name)}"`):''}${file.status==='error'?button('Paste text','paste-attachment',file.id,'studio-file-preview'):''}${button('×','remove-attachment',file.id,'studio-file-remove',`aria-label="Remove ${esc(file.name)}"`)}</div></div>`).join('');
  }
  function attachmentHelp() {
    bridge.modal('Files you can use',`<div class="studio-attachment-preview"><p>Attach up to three files, 20 MB each. They are read on this device before you decide what to send.</p><ul><li><strong>PDF and DOCX:</strong> extract readable text. A damaged PDF page may be skipped and flagged.</li><li><strong>XLSX and PPTX:</strong> read worksheet values and slide text. Formulas, macros, figures and analysis are not run.</li><li><strong>Text and code:</strong> common plain-text formats, including CSV, Markdown, UTF-8 and UTF-16.</li><li><strong>Scans, PNG and JPEG:</strong> choose <strong>Read scan</strong> for local English text recognition (OCR). First three PDF pages or one image; review for mistakes.</li></ul><p>Password-protected files need an unlocked copy. Older .doc, .xls and .ppt files need to be exported to a modern format. If a file still fails, <strong>Paste text</strong> lets you supply the relevant passage.</p><p class="subtle">Only a bounded excerpt is sent after your approval. The AI does not receive the original file, images or the entire document. File reading and OCR do not use the site's AI token allowance.</p>${button('Got it','close-dialog','','btn primary')}</div>`);
  }
  function connectionsDialog() {
    bridge.modal('Connections',`<div class="studio-attachment-preview"><span class="studio-tag">MCP · read-only tools</span><h3>Use Pherogent’s tools from ChatGPT</h3><p>MCP is a shared language that lets AI apps call tools. This connector offers Europe PMC paper search, paper excerpts and exact-quote matching.</p><p>In ChatGPT, open <strong>Plugins → Personal → Created by you</strong>, find this Pherogent site and choose <strong>Install</strong> or <strong>Connect</strong>. The site owner’s connector is private; visitors do not automatically get it.</p><div class="callout"><strong>Try asking:</strong> “Use Pherogent to find papers on cellular reprogramming. Read the strongest source and check whether this exact quote occurs in it.”</div><p>These tools do not run a paid AI call on Pherogent, change your manuscript, or read drafts and attachments stored in your browser. ChatGPT’s own usage rules still apply.</p><p class="subtle">Searches go to Europe PMC. Paper content is treated as untrusted source material. Exact wording matches do not establish that a claim is scientifically supported. Separate daily tool limits protect this service.</p>${button('Close','close-dialog','','btn primary')}</div>`);
  }
  function ocrPreview(id) {
    const file=queue().find(f=>f.id===id),raw=attachmentFiles.get(id);if(!file||!raw||file.status==='reading')return;
    if(ocrBusy){bridge.toast('One scan is already being read. Wait for it to finish.');return;}
    bridge.modal('Read scan on this device?',`<div class="studio-attachment-preview"><h3>${esc(file.name)}</h3><p>Recognize printed English text from the first three PDF pages or one PNG/JPEG image. This can take up to a minute and may miss columns, symbols, handwriting or other languages.</p><p>Your file stays on this device. No AI tokens are used. Any existing excerpt will be replaced only if reading succeeds; review the result before sending.</p><div class="actions">${button('Read scan (OCR)','ocr-start',id,'btn primary')}${button('Cancel','close-dialog')}</div></div>`);
  }
  async function readScan(id) {
    const projectId=context().project.id,stageId=stage().id,item=queue().find(f=>f.id===id),raw=attachmentFiles.get(id);
    if(!item||!raw||item.status==='reading'||ocrBusy||!window.PherogentOCR)return;
    if(readingFiles>=3){bridge.toast('Wait for the other files to finish reading.');return;}
    const previous={text:item.text,kind:item.kind,note:item.note,clipped:item.clipped,status:item.status,error:item.error};
    const controller=new AbortController();ocrJobs.set(id,controller);ocrBusy=true;readingFiles++;
    Object.assign(item,{status:'reading',progress:'Starting local text recognition…'});bridge.close();refreshAttachments();
    const stillQueued=()=>queue(projectId,stageId).includes(item);
    const refresh=()=>{if(context().project.id===projectId&&stage().id===stageId)refreshAttachments();};
    try{
      const result=await window.PherogentOCR.read(raw,{signal:controller.signal,onProgress:message=>{if(stillQueued()){item.progress=String(message).slice(0,150);refresh();}}});
      if(stillQueued()&&!controller.signal.aborted){Object.assign(item,result,{status:'ready',error:'',progress:'',clipped:!!(result.clipped||result.partial)});bridge.toast('Scan read locally. Preview the text and check for mistakes.');}
    }catch(error){if(stillQueued()){const reason=String(error.message||'Text recognition failed.').slice(0,300);if(previous.status==='ready'){Object.assign(item,previous);bridge.toast(reason+' Your earlier excerpt was kept.');}else Object.assign(item,{status:'error',error:reason,progress:''});}}
    finally{ocrBusy=false;readingFiles--;ocrJobs.delete(id);refresh();}
  }
  function refreshAttachments() {
    if($('studioAttachments'))$('studioAttachments').innerHTML=attachmentCards();
    const sendButton=document.querySelector('#studioChatForm button[type="submit"]');
    if(sendButton){sendButton.disabled=!current().composer.trim()||queue().some(f=>f.status!=='ready')||!!chatRun?.running;sendButton.setAttribute('aria-label',chatRun?.running?'Waiting for AI reply':'Send message');sendButton.setAttribute('aria-busy',String(!!chatRun?.running));}
  }
  async function attachFiles(files,target=null) {
    if(!window.PherogentAttachments){bridge.toast('File reading could not load. Refresh the page and try again.');return;}
    const projectId=target?.projectId||context().project.id,stageId=target?.stageId||stage().id,items=queue(projectId,stageId),work=[];
    for(const file of Array.from(files||[])){
      if(items.length>=3){bridge.toast('Attach up to three files per message. Remove a file to add another.');break;}
      if(readingFiles>=3){bridge.toast('Three files are already being read. Wait for them to finish before adding more.');break;}
      const name=String(file.name||'Untitled file').replace(/[\x00-\x1f\x7f]/g,'').slice(0,180);
      if(items.some(f=>f.name===name&&f.size===file.size&&f.modified===file.lastModified)){bridge.toast(name+' is already attached.');continue;}
      const item={id:uid(),name,size:file.size,modified:file.lastModified,status:'reading',text:'',kind:'file',note:'',clipped:false};
      items.push(item);retainFile(item.id,file);readingFiles++;work.push({file,item});
    }
    refreshAttachments();
    // Reserve all slots first. Each result resolves by immutable queue identity,
    // so changing projects or removing a pending card cannot redirect its text.
    await Promise.all(work.map(async({file,item})=>{
      try{const result=await window.PherogentAttachments.read(file);if(!queue(projectId,stageId).includes(item))return;Object.assign(item,result,{status:'ready',clipped:!!(result.clipped||result.partial)});}
      catch(error){if(queue(projectId,stageId).includes(item))Object.assign(item,{status:'error',error:String(error.message||'This file could not be read.').slice(0,300)});}
      finally{readingFiles--;}
      if(context().project.id===projectId&&stage().id===stageId)refreshAttachments();
    }));
  }
  function previewAttachment(id,manual=false) {
    const file=queue().find(f=>f.id===id&&(f.status==='ready'||manual&&f.status==='error'));if(!file)return;
    attachmentPreview={id,projectId:context().project.id,stageId:stage().id,manual};
    bridge.modal('Preview attachment',`<div class="studio-attachment-preview"><h3>${esc(file.name)}</h3><p>${esc(manual?'Paste a passage yourself. It will be labelled as author-provided, not extracted or verified against the file.':file.note||'Text extracted locally. No AI request has been made.')}</p><p class="subtle">${file.clipped?'This is a partial extraction. ':''}Choose the passage most relevant to your question. The send preview shows the exact, shorter excerpt included in the 6,000-character context limit. Original files stay on this device; only consented text is sent. Unsent attachments clear when you refresh or close this tab.</p><label class="field">Text to use (up to 12,000 characters)<textarea id="studioAttachmentText" rows="12" maxlength="12000">${esc(file.text)}</textarea></label><div class="actions">${button('Save excerpt','save-attachment','','btn primary')}${button('Close','close-dialog')}</div></div>`);
  }
  function saveAttachment() {
    const p=attachmentPreview;if(!p||p.projectId!==context().project.id||p.stageId!==stage().id)return;
    const file=queue().find(f=>f.id===p.id),text=$('studioAttachmentText')?.value.trim().slice(0,12000);if(!file||!text){bridge.toast('Keep a readable text excerpt, or remove this attachment.');return;}
    if(file.text!==text||p.manual){file.text=text;file.note=p.manual?'Author-provided text. File reading failed; this excerpt has not been checked against the file.':'Author-selected or edited text excerpt. Original file content has not been verified.';}
    if(p.manual)Object.assign(file,{status:'ready',kind:'Manual text',clipped:true,error:''});
    attachmentPreview=null;bridge.close();refreshAttachments();
  }
  function chatContext(ctx,a,files=queue()) {
    const studyInputs=a.inputs.filter(i=>i.studyWorkflow===true).slice(0,1);
    const parts=[...studyInputs.map(i=>'STUDY CONTEXT (supplied summaries; not verified quotations)\n'+String(i.text||'')), 'PROJECT QUESTION\n'+String(ctx.research.question||''),'CURRENT SECTION DRAFT ('+String(a.output.provenance||'Author')+'; '+String(a.output.status||'draft')+')\n'+String(a.output.body||'')];
    const recent=a.messages.filter(m=>m.kind==='ai'||m.role==='user').slice(-4);
    if(recent.length)parts.push('RECENT SECTION CONVERSATION\n'+recent.map(m=>(m.role==='user'?'Author':'AI')+': '+m.text+(Array.isArray(m.attachments)?m.attachments.map(f=>'\nATTACHED EXCERPT: '+String(f.name)+'\nREADING NOTE: '+String(f.note||'Text excerpt only.').slice(0,500)+'\n'+String(f.text||'')).join(''):'')).join('\n\n'));
    for(const input of a.inputs) {
      if(studyInputs.includes(input))continue;
      if(input.evidenceRef&&!evidenceState(input,ctx)?.valid)continue;
      const paper=input.kind==='source'?ctx.papers.find(p=>p.id===input.sourceId):null;
      const text=paper?[paper.title,paper.abstract||paper.abstractText||paper.sourceText||paper.evidence_excerpt||'No source text available.'].join('\n'):input.text||input.body||input.content||'';
      parts.push('SELECTED INPUT: '+String(input.title||input.name||input.sourceId||'Untitled')+' ('+String(input.provenance||'Author-selected')+(paper?.prepared?'; prepared source example':'')+')\n'+String(text));
    }
    const full=parts.join('\n\n');
    if(!files.length)return {text:full.slice(0,6000),clipped:full.length>6000,attachments:[]};
    const share=Math.floor(4200/files.length);
    const attachments=files.map(file=>{
      const header='ATTACHMENT EXCERPT: '+file.name+' ('+file.kind+'; author-supplied text, unverified'+(file.clipped||file.partial?'; PARTIAL EXTRACTION':'')+')\nREADING NOTE: '+String(file.note||'Text excerpt only; not the complete document.').slice(0,500)+'\n';
      const text=file.text.slice(0,Math.max(0,share-header.length));
      return {id:file.id,name:file.name,kind:file.kind,text,clipped:!!file.clipped||text.length<file.text.length,note:file.note,block:header+text};
    });
    const fileText=attachments.map(file=>file.block).join('\n\n');
    const remaining=6000-fileText.length-2;
    return {text:fileText+'\n\n'+full.slice(0,remaining),clipped:attachments.some(f=>f.clipped)||full.length>remaining,attachments:attachments.map(({block,...file})=>file)};
  }
  const chatLog=(p,type,detail,actor='System')=>bridge.logProject?.(p.projectId,{type,detail,actor,stage:p.stage,runId:p.id});
  function chatStatusHTML(p) {
    if(p.loading)return 'Checking the model connection and shared allowance…';
    const s=p.status,b=s?.budget,l=s?.limits;
    if(!s)return 'Connection could not be checked. Nothing was sent to AI. Refresh to try again.';
    const count=v=>Number.isSafeInteger(v)?v.toLocaleString():'—';
    return `${esc(s.message||'Connection status unavailable.')}<br>${count(b?.remainingLifetimeTokens)} shared tokens remain · ${count(l?.perRunTokens)} reserved per turn. Reservations are retained after failures or unused tokens; actual usage is recorded separately.`;
  }
  function updateChatConsent() {
    const p=pendingChat;if(!p)return;const status=$('studioAIStatus');if(status)status.innerHTML=chatStatusHTML(p);
    const confirm=$('studioAIConfirm');if(confirm)confirm.disabled=!!chatRun?.running||p.loading||!p.status?.canRun||!$('studioAIConsent')?.checked;
  }
  async function refreshChatStatus(p=pendingChat) {
    if(!p||p.loading)return;p.loading=true;updateChatConsent();
    try{const response=await fetch('/api/agent/status',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error();const value=await response.json();if(typeof value.canRun!=='boolean')throw Error();p.status=value;}
    catch{p.status=null;}finally{p.loading=false;if(pendingChat===p)updateChatConsent();}
  }
  function send() {
    const a=current(),text=a.composer.trim();if(!text||!hasRoomForMessages())return;
    if(chatRun?.running){bridge.toast('A section reply is already running. Stop it or wait for it to finish.');return;}
    if(queue().some(file=>file.status!=='ready')){bridge.toast('Wait for files to finish reading, or remove files that could not be read.');return;}
    const ctx=context();
    if(staleEvidence(ctx,a).length){bridge.toast('An attached evidence record needs rechecking. Review it in the Evidence inbox, then detach the old copy and attach the current approval before sending.');model().sideTab='context';sideOpen=true;mobilePanel='context';bridge.render();return;}
    const excerpt=chatContext(ctx,a);
    let requestId;try{requestId=secureRequestId();}catch(error){bridge.toast(error.message);return;}
    pendingChat={id:requestId,projectId:ctx.project.id,stage:stage().id,message:text,context:excerpt.text,clipped:excerpt.clipped,attachments:excerpt.attachments,attachmentSignature:attachmentSignature(queue()),stagedFiles:clone(queue()),status:null,loading:false};
    bridge.modal('Send to '+stage().role+'?',`<p>This makes one AI request for <strong>${esc(stage().label)}</strong>. It can help reason and draft; it does not run data analysis, experiments or literature searches. Your manuscript is not changed.</p><div class="callout" id="studioAIStatus" role="status">Checking connection…</div>${excerpt.attachments.length?`<section class="studio-consent-files"><strong>${excerpt.attachments.length} attachment excerpt${excerpt.attachments.length===1?'':'s'} to send</strong><ul>${excerpt.attachments.map(file=>`<li>${esc(file.name)} · ${file.text.length.toLocaleString()} characters${file.clipped?' · partial excerpt':''}</li>`).join('')}</ul><p class="subtle">Only the text shown below goes to OpenAI. Images, formatting and the original files are not sent. Unsent portions have not been read by the AI.</p></section>`:''}<label class="field">Exact message to send<textarea rows="3" readonly>${esc(text)}</textarea></label><details><summary>Exact context to send (${excerpt.text.length.toLocaleString()} characters${excerpt.clipped?' · clipped':''})</summary><pre style="white-space:pre-wrap;max-height:230px;overflow:auto">${esc(excerpt.text)}</pre></details><p class="subtle">${excerpt.attachments.length?'Attachment excerpts come first, followed by a shortened project and section context.':'Only the research question, this section’s draft, recent section messages and explicitly selected inputs are included, in that order.'} ${excerpt.clipped?'The context is clipped to the 6,000-character limit; parts of documents or earlier context may be omitted. Inspect the exact preview before sending.':'No other agents’ conversations or complete manuscript are included.'}</p>${designScope()?'<label class="agent-consent studio-design-opt"><input type="checkbox" id="studioDesignOpt"><span><strong>Apply the study-design check (preview)</strong><small>Checks claims about the same individual cells. For this chat, attach one methods excerpt without other selected sources. Without a clear tracking design, the check withholds those claims. No extra AI call.</small></span></label>':''}<label class="agent-consent"><input type="checkbox" id="studioAIConsent"><span>I agree to send this exact message and context to OpenAI and consume one shared run reservation.</span></label><div class="actions">${button('Send to AI','confirm-ai','','btn primary','id="studioAIConfirm" disabled')}${button('Refresh connection','refresh-ai')}${button('Cancel','close-dialog')}</div>`);
    if($('studioAIConsent'))$('studioAIConsent').checked=false;
    if(designScope()&&$('studioDesignOpt'))$('studioDesignOpt').checked=false;
    return refreshChatStatus(pendingChat);
  }
  const validSuggestion=value=>value===null || !!value&&typeof value==='object'&&typeof value.title==='string'&&value.title.length<=180&&typeof value.body==='string'&&value.body.length<=6000;
  function paintChatRun(p) {
    if(context().project.id!==p.projectId||stage().id!==p.stage)return;
    const panel=$('studioAIRunState');if(panel)panel.innerHTML=`<p role="status">${esc(p.running?'AI reply in progress…':p.status==='completed'?'AI reply received. Review it before use.':p.error||'The reply did not complete.')}</p>${p.running?button('Stop reply','stop-ai','','btn small'):''}`;
  }
  async function confirmChat() {
    const p=pendingChat;
    if(!p||p.loading||!p.status?.canRun||!$('studioAIConsent')?.checked||chatRun?.running)return;
    if(p.projectId!==context().project.id||p.stage!==stage().id||p.message!==current().composer.trim()){bridge.toast('The project or message changed. Review the message again before sending.');pendingChat=null;bridge.close();return;}
    if(staleEvidence(context(),current()).length){bridge.toast('Evidence changed after the preview. Recheck it before sending. Nothing was sent to AI.');pendingChat=null;bridge.close();bridge.render();return;}
    const nowContext=chatContext(context(),current()).text;
    if(nowContext!==p.context||attachmentSignature(queue())!==p.attachmentSignature){bridge.toast('The context changed, including its attachments. Review the updated preview before sending.');pendingChat=null;bridge.close();return;}
    const run={...p,studyDesign:designScope()&&$('studioDesignOpt')?.checked===true,at:new Date().toISOString(),running:true,status:'running',controller:new AbortController(),usage:null,reserved:false,reservedTokens:null,steps:[],result:null,accepted:false,dispatched:false,reservationUnknown:false};
    chatRun=run;pendingChat=null;
    attachmentQueues.set(queueKey(run.projectId,run.stage),[]);
    bridge.updateAgent?.(run.projectId,run.stage,a=>{a.messages.push({id:uid(),role:'user',text:run.message,at:run.at,provenance:'Author',runId:run.id,attachments:clone(run.attachments)});if(a.composer.trim()===run.message)a.composer='';});
    chatLog(run,'AI section reply requested','Author consented to the exact section message and scoped context.'+(run.studyDesign?' Author opted into the study-design preview.':''),'Author');bridge.close();bridge.render();
    const accept=event=>{
      if(event.type==='start'){run.accepted=true;run.reserved=true;run.reservedTokens=Number.isSafeInteger(event.reservedTokens)?event.reservedTokens:null;}
      else if(event.type==='usage'){run.usage=event.usage;}
      else if(event.type==='step'){const step=event.step||event;if(run.steps.length<30){run.steps.push(step);chatLog(run,'AI section activity',String(step.detail||step.stage||'Section step').slice(0,3000),step.actor==='AI'?'AI':'System');}}
      else if(event.type==='error'){if(event.usage)run.usage=event.usage;throw Error(event.error?.message||'The AI reply stopped. No automatic retry was made.');}
      else if(event.type==='result'){
        const r=event.result;
        if(run.result||!r||r.stage!==run.stage||typeof r.reply!=='string'||!r.reply.trim()||r.reply.length>6000||!validSuggestion(r.suggestedDraft))throw Error('The AI reply failed validation. No draft was applied.');
        run.result=r;run.usage=r.usage||run.usage;
      }
    };
    try {
      run.dispatched=true;
      const response=await fetch('/api/agent/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:run.id,consent:true,stage:run.stage,message:run.message,context:run.context,...(run.studyDesign?{studyDesign:true}:{})}),signal:run.controller.signal});
      if(!response.ok){const error=await response.json().catch(()=>null);const knownRejections=new Set(['method_not_allowed','origin_rejected','invalid_content_type','visitor_session_required','not_configured','budget_unavailable','pricing_review_required','invalid_request','request_too_large','consent_required','invalid_stage','invalid_message','invalid_context','duplicate_request','token_budget_exhausted','lifetime_budget_exhausted','daily_budget_exhausted','visitor_daily_limit','run_in_progress','visitor_rate_limit','site_busy','cancelled']);if(knownRejections.has(error?.error?.code))run.dispatched=false;throw Error(error?.error?.message||'The server did not confirm this request. No automatic retry was made.');}
      run.accepted=true;if(!response.body)throw Error('The server did not return an AI response stream.');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0;
      try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>256000)throw Error('The AI response exceeded the safe limit.');buffer+=decoder.decode(chunk.value,{stream:true});let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(line)accept(JSON.parse(line));}}buffer+=decoder.decode();if(buffer.trim())accept(JSON.parse(buffer));}finally{reader.releaseLock();}
      if(run.controller.signal.aborted)throw Error('Stopped by the author.');
      if(!run.result)throw Error('The connection ended without a complete reply. No automatic retry was made.');
      const applied=bridge.updateAgent?.(run.projectId,run.stage,a=>a.messages.push({id:uid(),role:'assistant',text:run.result.reply,at:new Date().toISOString(),provenance:'AI · Author review required',kind:'ai',runId:run.id,suggestedDraft:clone(run.result.suggestedDraft),usage:clone(run.usage)}));
      if(!applied)throw Error('The originating project could not be found. The run record preserves the reply.');
      run.status='completed';chatLog(run,'AI section reply received','The model returned a section reply. Suggested text awaits author review.','AI');
    } catch(error) {
      run.status=run.controller.signal.aborted?'stopped':'failed';run.error=run.controller.signal.aborted?'Reply stopped. Submitted calls may still use tokens; reservations are retained.':String(error.message||'The AI reply failed. No automatic retry was made.');
      if(run.dispatched){run.usage={...(run.usage||{}),usageUnknown:true};run.reservationUnknown=!run.reserved;if(run.reservationUnknown)run.error+=' The server may have consumed a reservation; refresh usage to check.';}
      // Restore the original text only when that would not overwrite new typing.
      bridge.updateAgent?.(run.projectId,run.stage,a=>{if(!a.composer)a.composer=run.message;});
      if(!queue(run.projectId,run.stage).length)attachmentQueues.set(queueKey(run.projectId,run.stage),clone(run.stagedFiles));
      chatLog(run,'AI section reply '+run.status,run.error);run.controller.abort();
    } finally {
      run.running=false;
      bridge.saveChatRun?.(run.projectId,{id:run.id,kind:'section_chat',stage:run.stage,...(run.studyDesign?{studyDesign:true}:{}),agent:D.stageFor(run.stage).role,question:run.message,attachments:clone(run.attachments),at:run.at,status:run.status,steps:run.steps,usage:run.usage,reserved:run.reserved,reservedTokens:run.reservedTokens,reservationUnknown:run.reservationUnknown,result:run.result});
      bridge.render();paintChatRun(run);window.PherogentAgent?.refreshStatus?.();
      if(context().project.id!==run.projectId||stage().id!==run.stage)bridge.toast(run.status==='completed'?'AI reply saved to the originating project and section.':run.error);
    }
  }
  function previewSuggestion(messageId) {
    const message=current().messages.find(m=>m.id===messageId&&m.kind==='ai');if(!message||!message.suggestedDraft||!validSuggestion(message.suggestedDraft))return;
    pendingSuggestion={projectId:context().project.id,stage:stage().id,messageId,suggestion:clone(message.suggestedDraft),before:clone(current().output)};
    bridge.modal('Use AI suggestion as the section draft?',`<p>This replaces this section’s working draft. The earlier draft is retained. The new draft still needs your review and does not change the manuscript or approve citations.</p><label class="field">Suggested draft<textarea rows="10" readonly>${esc(message.suggestedDraft.title+'\n\n'+message.suggestedDraft.body)}</textarea></label><div class="actions">${button('Use as section draft','confirm-ai-draft','','btn primary')}${button('Cancel','close-dialog')}</div>`);
  }
  function applySuggestion() {
    const p=pendingSuggestion,m=current().messages.find(m=>m.id===p?.messageId),o=current().output;
    if(!p||p.projectId!==context().project.id||p.stage!==stage().id||!m||JSON.stringify(m.suggestedDraft)!==JSON.stringify(p.suggestion)||JSON.stringify(o)!==JSON.stringify(p.before)){bridge.toast('The draft or selection changed. Review the suggestion again.');pendingSuggestion=null;bridge.close();return;}
    if(o.body.trim())o.history=[...(o.history||[]),{title:o.title,body:o.body,provenance:o.provenance,at:new Date().toISOString()}].slice(-20);
    Object.assign(o,{title:p.suggestion.title,body:p.suggestion.body,status:'draft',provenance:'AI suggestion · selected by author'});model().sideTab='output';sideOpen=true;mobilePanel='output';pendingSuggestion=null;saveChange('AI suggestion selected','Author copied an AI suggestion into the section draft. Review still required.');bridge.close();bridge.render();
  }
  function example(index,confirmed=false) {
    const s=stage(),prompt=s.prompts[Number(index)];if(!prompt||!hasRoomForMessages())return;if(chatRun?.running&&chatRun.projectId===context().project.id&&chatRun.stage===s.id){bridge.toast('Wait for the active AI reply or stop it before loading an example.');return;}
    const a=current();
    if(a.output.body.trim()&&!confirmed){pendingExample={projectId:context().project.id,stage:s.id,index};bridge.modal('Load a prepared example?',`<p>This replaces the current section output with a prepared example. Your current draft will remain in Earlier draft. Your manuscript is unchanged.</p><div class="actions">${button('Load example','confirm-example','','btn primary')}${button('Cancel','close-dialog')}</div>`);return;}
    const reply=D.demoReply(s.id,prompt,context());
    if(a.output.body.trim())a.output.history=[...(a.output.history||[]),{title:a.output.title,body:a.output.body,provenance:a.output.provenance,at:new Date().toISOString()}].slice(-10);
    addMessage('user',prompt,{provenance:'Author selected example'});
    addMessage('assistant',reply.text,{provenance:'Prepared example · no AI ran',kind:'example',outputTitle:reply.outputTitle});
    Object.assign(a.output,{title:reply.outputTitle,body:reply.outputBody,status:'draft',provenance:'Prepared example · no AI ran'});
    model().sideTab='output';sideOpen=true;mobilePanel=guidedPractice()?'output':'chat';saveChange('Prepared agent example opened',s.label+' example loaded. No AI or data analysis ran.',{actor:'Prototype'});bridge.close();bridge.render();
  }
  function reviewOutput() {const o=current().output;if(!o.body.trim())return;o.status='reviewed';saveChange('Section output reviewed','Author marked '+stage().label+' output reviewed. This does not approve evidence or verify scientific claims.');bridge.render();bridge.toast('Marked reviewed. Add it to the manuscript or pass a copy to another agent.');}
  function insertOutput() {
    const o=current().output;if(!o.body.trim()||o.status!=='reviewed')return;
    pendingInsertion={projectId:context().project.id,stage:stage().id,title:o.title||stage().label,body:o.body,provenance:o.provenance};
    bridge.modal('Add this output to your manuscript?',`<p>A copy will be added at the end. Your existing writing stays intact. Source mentions in this output are not approved citations.</p><label class="field">Text to add<textarea rows="9" readonly>${esc('## '+pendingInsertion.title+'\n\n'+o.body)}</textarea></label><p class="subtle">Origin: ${esc(o.provenance)}. Later draft edits do not update this copy.</p><div class="actions">${button('Add a copy to manuscript','confirm-insert','','btn primary')}${button('Cancel','close-dialog')}</div>`);
  }
  function confirmInsert() {
    const p=pendingInsertion,o=current().output;
    if(!p||p.projectId!==context().project.id||p.stage!==stage().id||p.body!==o.body||p.title!==(o.title||stage().label)||o.status!=='reviewed'){bridge.toast('The output changed. Review it again before inserting.');bridge.close();return;}
    if(bridge.appendOutput(p)){bridge.close();pendingInsertion=null;bridge.render();bridge.toast('A copy was added to the manuscript. You can undo this addition.');}
  }
  function handoff() {
    if(current().output.status!=='reviewed'||!current().output.body.trim())return;
    bridge.modal('Pass a reviewed output',`<p>Choose the agent that should use this output. This adds a clearly attributed snapshot to its context; it does not run AI or share the conversation.</p><div class="studio-handoff-list">${D.stages.filter(s=>s.id!==stage().id).map(s=>button(`<span>${icon(s.id)}</span><span><strong>${esc(s.label)}</strong><small>${esc(s.description)}</small></span><span>↗</span>`,'confirm-handoff',s.id,'studio-handoff')).join('')}</div>`);
  }
  function confirmHandoff(id) {
    const m=model(),from=stage(),o=current().output,target=m.agents[id];if(!target||id===from.id||o.status!=='reviewed'||!o.body.trim())return;
    if(target.inputs.length>=40){bridge.toast('This agent already has 40 inputs. Detach an input first.');return;}
    if(target.inputs.some(i=>i.kind==='handoff'&&i.fromStage===from.id&&i.text===o.body&&i.title===o.title)){bridge.toast('That exact output is already in this agent’s context.');bridge.close();return;}
    target.inputs.push({id:uid(),kind:'handoff',fromStage:from.id,title:o.title||from.label,text:o.body,provenance:o.provenance,status:'reviewed',at:new Date().toISOString()});
    saveChange('Output passed to agent','Author passed a reviewed copy from '+from.label+' to '+D.stageFor(id).label+'. No AI ran.');
    m.activeStage=id;m.sideTab='context';sideOpen=true;mobilePanel='context';bridge.close();bridge.navigateStudio();bridge.toast('Reviewed copy added to '+D.stageFor(id).label+' context.');
  }
  function inputDialog() {
    const a=current(),ctx=context(),approved=(Array.isArray(ctx.evidenceRecords)?ctx.evidenceRecords:[]).filter(record=>record.fresh===true&&record.status==='approved');
    bridge.modal('Add context to '+stage().label,`<p>Inputs are saved in this browser and scoped to this agent. No file is uploaded or analyzed.</p><div class="studio-context-card"><span class="studio-context-label">APPROVED EVIDENCE</span><p class="subtle">Attach a source passage and your approved wording together. Later edits mark this saved copy as needing rechecking.</p>${approved.length?approved.map(record=>{const attached=a.inputs.some(input=>input.evidenceRef?.key===record.key&&input.evidenceRef.fingerprint===record.fingerprint);return `<div class="studio-approved-evidence"><strong>${esc(record.currentText||record.claim)}</strong><p class="subtle">${esc(record.paper?.title||record.paperId)}</p>${button(attached?'Already attached':'Use in this workspace','attach-evidence',record.key,'btn small',attached?'disabled':'')}</div>`;}).join(''):`<p class="subtle">No current author-approved AI evidence records yet.</p>${oldButton('Open evidence inbox','review')}`}</div><div class="studio-context-card"><span class="studio-context-label">SELECT FROM YOUR LIBRARY</span>${ctx.papers.length?ctx.papers.map(p=>`<label class="studio-source-check"><input type="checkbox" data-studio-source="${esc(p.id)}" ${a.inputs.some(i=>i.kind==='source'&&i.sourceId===p.id)?'checked':''}><span><strong>${esc(p.title)}</strong><small>${esc(p.year||'')} · Source candidate, not an approved citation</small></span></label>`).join(''):`<p>Your library is empty.</p>${oldButton('Find papers','literature')}`}</div>
      <form id="studioNoteForm"><label class="field">Input name<input id="studioNoteTitle" required maxlength="180" placeholder="e.g. Inclusion criteria"></label><label class="field">Note or data excerpt<textarea id="studioNoteText" required rows="4" maxlength="20000" placeholder="Paste context for this agent…"></textarea></label><div class="actions"><button type="submit" class="btn primary">Add note</button>${button('Import .txt, .md or .csv','import-input')}${button('Done','close-dialog')}</div><input type="file" id="studioInputFile" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" hidden></form>`);
  }
  function addNote() {const title=$('studioNoteTitle')?.value.trim(),text=$('studioNoteText')?.value.trim();if(!title||!text)return;if(current().inputs.length>=40){bridge.toast('Each agent can hold up to 40 inputs.');return;}current().inputs.push({id:uid(),kind:'note',title:title.slice(0,180),text:text.slice(0,20000),provenance:'Author'});saveChange('Agent context added','Author added a local note to '+stage().label+'.');bridge.close();model().sideTab='context';sideOpen=true;mobilePanel='context';bridge.render();}
  function inspectInput(id) {const input=current().inputs.find(i=>i.id===id);if(!input)return;const p=input.kind==='source'?context().papers.find(p=>p.id===input.sourceId):null,evidence=evidenceState(input);bridge.modal(input.title||'Agent input',`${evidence&&!evidence.valid?`<div class="callout evidence-stale"><strong>Needs rechecking</strong><p>${esc(evidence.reason)}</p>${oldButton('Open evidence inbox','review')}</div>`:''}<p class="subtle">${esc(input.provenance||'Author-selected input')}${input.outputRef?' · Reviewed output · saved version '+esc(input.outputRef.revision)+'; later edits do not update this copy.':''}${input.kind==='handoff'?' · Snapshot; original conversations are not included.':''}${evidence?' · Saved snapshot; later checks do not rewrite this text.':''}</p><label class="field">Saved context<textarea rows="10" readonly>${esc(p?[p.title,p.abstract||p.evidence_excerpt||'No source text available. Inspect the paper before citing.'].join('\n\n'):input.text||'')}</textarea></label><div class="actions">${button('Close','close-dialog')}</div>`);}
  const tourSteps=[
    {stage:'organizer',title:'One paper. A team of focused agents.',text:'Choose a research or writing stage in the left sidebar. Each agent keeps its own conversation and inputs.'},
    {stage:'results',title:'Talk to the Results agent',text:'Use the chat box just as you would in a familiar AI tool. Try an example to see a prepared response and section draft. No AI runs in this prototype.'},
    {stage:'results',panel:'output',title:'Your output is a working document',text:'Edit the output beside the conversation, then mark it reviewed. You decide when to add a copy to the manuscript.'},
    {stage:'methods',panel:'context',title:'Give each agent the right context',text:'Add selected papers, local notes or text files. A reviewed output can be passed to another agent as a clearly attributed copy.'},
    {stage:'references',title:'Evidence stays connected',text:'The References agent helps organize the work. Open Evidence review for the existing live search, exact-passage checks and author citation approval.'}
  ];
  function tourHTML() {if(window.PherogentResearchTour)return '';const step=model().tour?.step;if(!model().tour?.active||!Number.isInteger(step)||!tourSteps[step])return '';const t=tourSteps[step];return `<aside class="studio-coach" role="region" aria-label="Workspace tour"><div class="studio-coach-top"><span>WORKSPACE TOUR · ${step+1}/${tourSteps.length}</span>${button('×','tour-close','','icon-button','aria-label="Close workspace tour"')}</div><h3>${t.title}</h3><p>${t.text}</p><div class="actions">${step?button('Back','tour-back'):''}${button(step===tourSteps.length-1?'Finish tour':'Next','tour-next','','btn small primary')}</div></aside>`;}
  function moveTour(step) {const m=model();if(step>=tourSteps.length){m.tour={active:false,step:0,completed:true};bridge.render();return;}m.tour={active:true,step};m.activeStage=tourSteps[step].stage;m.sideTab=tourSteps[step].panel||'output';mobilePanel=tourSteps[step].panel||'chat';sideOpen=!!tourSteps[step].panel;bridge.close();bridge.navigateStudio();}
  function welcome() {bridge.modal('Welcome to your research workspace',`<span class="eyebrow">PHEROGENT · INTERACTIVE PROTOTYPE</span><p class="intro-lead">Your research team, from data to paper.</p><p>Work with a focused agent for every part of the paper. Keep the conversation, the context and an editable output together.</p><div class="info-grid"><div><strong>Choose an agent</strong><p>Data, methods, results and every writing stage.</p></div><div><strong>Build its context</strong><p>Your sources and notes, scoped to the task.</p></div><div><strong>Review its output</strong><p>Edit, pass it on, or add it to your manuscript.</p></div></div><div class="actions">${button('Try the full research walkthrough','tour-start','','btn primary')}<button class="btn" data-action="open-sample">Open sample project</button><button class="btn ghost" data-action="dismiss-intro">Explore on my own</button></div><div class="actions"><button class="studio-inline-link" data-action="start-tutorial">Practice evidence review</button><button class="studio-inline-link" data-action="about">What works in this version</button></div><p class="subtle">Chats and drafts save locally. Prepared examples use no AI. Sending to AI requires a working model connection, available shared allowance and your consent to the exact context preview.</p>`);}
  function exportMarkdown(ctx) {
    const m=D.normalize(ctx.research.agentWorkspace,ctx);
    return '# '+ctx.draft.title+' — agent workspaces\n\nSection conversations may contain author text, prepared examples and AI replies. Each message retains its origin. AI replies require author review and do not establish that data analysis, experiments or source verification ran.\n\n'+D.stages.map(s=>{const a=m.agents[s.id];return '## '+s.label+'\n\n### Output\n\nStatus: '+outputLabel(a.output)+'\nOrigin: '+a.output.provenance+'\n\n'+(a.output.body||'No output yet.')+'\n\n### Context\n\n'+a.inputs.map(i=>'- '+(i.title||i.name||'Input')+' ('+i.kind+')'+(i.fromStage?' — from '+i.fromStage:'')+(i.evidenceRef?' — evidence '+i.evidenceRef.key+'; '+(evidenceState(i,ctx)?.valid?'current author approval':'NEEDS RECHECKING; do not reuse as current evidence'):'')+'\n'+(i.text||i.sourceId||'')).join('\n\n')+'\n\n### Conversation\n\n'+a.messages.map(message=>'**'+(message.role==='user'?'Author':message.provenance||'Prototype · no AI ran')+'**\n\n'+message.text+(Array.isArray(message.attachments)?message.attachments.map(file=>'\n\nAttachment: '+file.name+' (text excerpt sent'+(file.clipped?'; partial':'')+')\n'+file.text).join(''):'')+(message.suggestedDraft?'\n\nAI draft suggestion (separate from reviewed section output):\n'+message.suggestedDraft.title+'\n'+message.suggestedDraft.body:'')).join('\n\n');}).join('\n\n---\n\n');
  }
  function afterRender() {closeAddMenu();resizeComposer();refreshAttachments();if(chatRun)paintChatRun(chatRun);const messages=$('studioMessages');if(messages)messages.scrollTop=messages.scrollHeight;document.body?.classList?.remove('nav-open');const toggle=$('mobileMenuToggle');if(toggle)toggle.setAttribute('aria-expanded','false');}
  document.addEventListener('submit',event=>{if(!bridge)return;if(event.target.id==='studyDesignForm'){event.preventDefault();return runDesign();}if(event.target.id==='studioChatForm'){event.preventDefault();return send();}if(event.target.id==='studioNoteForm'){event.preventDefault();addNote();}});
  document.addEventListener('input',event=>{
    if(!bridge)return;const id=event.target.id;if(id==='designClaim'||id==='designPassage'){clearDesignOutcome();return;}if(id==='studioAIConsent')updateChatConsent();
    if(id==='studioComposer'){current().composer=event.target.value.slice(0,4000);bridge.save();resizeComposer();if($('studioComposerCount'))$('studioComposerCount').textContent=current().composer.length;const sendButton=document.querySelector('#studioChatForm button[type="submit"]');if(sendButton)sendButton.disabled=!current().composer.trim()||queue().some(file=>file.status!=='ready')||!!chatRun?.running;}
    if(id==='studioOutputTitle'||id==='studioOutputBody'){const o=current().output;o[id==='studioOutputTitle'?'title':'body']=event.target.value.slice(0,id==='studioOutputTitle'?180:20000);o.status='draft';if(o.provenance?.startsWith('Prepared'))o.provenance='Prepared example · edited by author';else o.provenance='Author';bridge.save();refreshOutputControls();}
  });
  document.addEventListener('compositionstart',event=>{if(event.target.id==='studioComposer')composing=true;});
  document.addEventListener('compositionend',event=>{if(event.target.id==='studioComposer')composing=false;});
  document.addEventListener('keydown',event=>{
    if(!bridge)return;
    if(event.key==='Escape'){
      if(addMenuOpen){event.preventDefault();closeAddMenu(true);return;}
      document.body?.classList?.remove('nav-open');$('mobileMenuToggle')?.setAttribute('aria-expanded','false');
    }
    if(event.target.id==='studioAddToggle'&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openAddMenu(event.key==='ArrowUp'?addMenuIds.length-1:0);return;}
    if(addMenuOpen){
      const index=addMenuIds.indexOf(event.target.id);
      if(index>=0&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?addMenuIds.length-1:(index+(event.key==='ArrowDown'?1:-1)+addMenuIds.length)%addMenuIds.length;$(addMenuIds[next])?.focus({preventScroll:true});return;}
      // Let the browser continue its normal tab order from the trigger.
      if(event.key==='Tab')closeAddMenu(true);
    }
    if(event.target.id==='studioComposer'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&!composing&&event.keyCode!==229&&event.which!==229){event.preventDefault();return send();}
  });
  document.addEventListener('pointerdown',event=>{if(addMenuOpen&&!$('studioAddMenu')?.contains?.(event.target)&&!$('studioAddToggle')?.contains?.(event.target))closeAddMenu();});
  document.addEventListener('focusin',event=>{if(addMenuOpen&&!$('studioAddMenu')?.contains?.(event.target)&&event.target!==$('studioAddToggle'))closeAddMenu();});
  document.addEventListener('scroll',event=>{if(addMenuOpen&&!$('studioAddMenu')?.contains?.(event.target))closeAddMenu();},true);
  window.addEventListener?.('resize',()=>{closeAddMenu();resizeComposer();});
  document.addEventListener('cancel',event=>{if(event.target.id==='studioAttachmentFiles'){attachmentPickerTarget=null;$('studioAddToggle')?.focus({preventScroll:true});}},true);
  for(const type of ['dragenter','dragover','dragleave','drop'])document.addEventListener(type,event=>{
    if(!bridge||!event.target?.closest?.('[data-studio-dropzone]'))return;
    if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
    event.preventDefault();
    const composer=$('studioChatForm');if(composer)composer.setAttribute('data-dragging',String(type==='dragenter'||type==='dragover'));
    if(type==='drop'){event.stopPropagation();return attachFiles(event.dataTransfer.files);}
  });
  document.addEventListener('change',async event=>{
    if(!bridge)return;if(event.target.id==='studioAIConsent')updateChatConsent();
    if(event.target.dataset?.studioSource){const id=event.target.dataset.studioSource,p=context().papers.find(p=>p.id===id);if(!p)return;const a=current();if(event.target.checked){if(a.inputs.some(i=>i.kind==='source'&&i.sourceId===id))return;if(a.inputs.length>=40){event.target.checked=false;bridge.toast('Each agent can hold up to 40 inputs.');return;}a.inputs.push({id:uid(),kind:'source',sourceId:id,title:p.title,provenance:'Author-selected source'});}else a.inputs=a.inputs.filter(i=>!(i.kind==='source'&&i.sourceId===id));saveChange('Agent sources changed','Author changed selected sources for '+stage().label+'. No citations approved.');}
    if(event.target.id==='studioOutputBody'||event.target.id==='studioOutputTitle')saveChange('Section draft edited','Author edited '+stage().label+' draft; review status cleared.');
    if(event.target.id==='studioAttachmentFiles'){const files=Array.from(event.target.files||[]),target=attachmentPickerTarget;attachmentPickerTarget=null;event.target.value='';return attachFiles(files,target);}
    if(event.target.id==='studioInputFile'){const file=event.target.files?.[0],projectId=context().project.id,stageId=stage().id;if(!file)return;if(!/\.(txt|md|csv)$/i.test(file.name)||file.size>100000){bridge.toast('Choose a .txt, .md or .csv file smaller than 100 KB.');return;}try{const text=await file.text();if(context().project.id!==projectId||stage().id!==stageId){bridge.toast('Import cancelled because the workspace changed.');return;}if(text.length>20000){bridge.toast('Use an excerpt of at most 20,000 characters.');return;}if(current().inputs.length>=40){bridge.toast('Each agent can hold up to 40 inputs.');return;}current().inputs.push({id:uid(),kind:'file',title:file.name.slice(0,180),text,provenance:'Local file · not analyzed'});saveChange('Local input imported','Author added '+file.name.slice(0,180)+' to '+stage().label+'. No upload or analysis.');bridge.close();model().sideTab='context';sideOpen=true;mobilePanel='context';bridge.render();}catch{bridge.toast('Could not read this file. Try a plain text excerpt.');}}
  });
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-studio-action]');if(!bridge)return;
    if(addMenuOpen&&el?.dataset.studioAction!=='toggle-add-menu')closeAddMenu(el?.dataset.studioAction==='attach-files');
    if(!el)return;const action=el.dataset.studioAction,arg=el.dataset.studioArg;
    try{switch(action){
      case 'open-stage':openStage(arg);break;
      case 'check-design':openDesign();break;
      case 'design-mode':selectDesignMode(arg);break;
      case 'design-draft':{if(activeDesign()&&designSession.mode==='author'){const text=current().output?.body?.trim()||'';if(text&&text.length<=1200){$('designClaim').value=text;clearDesignOutcome();$('designClaim').focus();}}break;}
      case 'side-tab':if(['output','context'].includes(arg)){model().sideTab=arg;mobilePanel=arg;sideOpen=true;bridge.render();}break;
      case 'mobile-tab':if(['chat','output','context'].includes(arg)){mobilePanel=arg;sideOpen=arg!=='chat';if(arg!=='chat')model().sideTab=arg;bridge.render();}break;
      case 'show-output':model().sideTab='output';mobilePanel='output';sideOpen=true;bridge.render();break;
      case 'demo':example(arg);break;
      case 'confirm-example':if(pendingExample?.projectId===context().project.id&&pendingExample.stage===stage().id){const index=pendingExample.index;pendingExample=null;example(index,true);}break;
      case 'review-output':reviewOutput();break;
      case 'insert-output':insertOutput();break;
      case 'confirm-insert':confirmInsert();break;
      case 'handoff':handoff();break;
      case 'confirm-handoff':confirmHandoff(arg);break;
      case 'input-add':inputDialog();break;
      case 'attach-evidence':addEvidence(arg);break;
      case 'toggle-add-menu':if(addMenuOpen)closeAddMenu(true);else openAddMenu();break;
      case 'copy-reply':return copyReply(arg,el);
      case 'attach-files':attachmentPickerTarget={projectId:context().project.id,stageId:stage().id};$('studioAttachmentFiles')?.click();break;
      case 'preview-attachment':previewAttachment(arg);break;
      case 'paste-attachment':previewAttachment(arg,true);break;
      case 'attachment-help':attachmentHelp();break;
      case 'connections':connectionsDialog();break;
      case 'ocr-preview':ocrPreview(arg);break;
      case 'ocr-start':return readScan(arg);
      case 'save-attachment':saveAttachment();break;
      case 'remove-attachment':ocrJobs.get(arg)?.abort();attachmentFiles.delete(arg);attachmentQueues.set(queueKey(context().project.id,stage().id),queue().filter(file=>file.id!==arg));refreshAttachments();break;
      case 'open-panel':if(['output','context'].includes(arg)){sideOpen=!(sideOpen&&model().sideTab===arg);model().sideTab=arg;mobilePanel=sideOpen?arg:'chat';bridge.render();}break;
      case 'close-panel':sideOpen=false;mobilePanel='chat';bridge.render();break;
      case 'inspect-input':inspectInput(arg);break;
      case 'remove-input':current().inputs=current().inputs.filter(i=>i.id!==arg);saveChange('Input detached','Author removed an input from '+stage().label+' context. Project sources were retained.');bridge.render();break;
      case 'import-input':$('studioInputFile')?.click();break;
      case 'save-note':addNote();break;
      case 'close-dialog':pendingInsertion=null;pendingExample=null;pendingChat=null;pendingSuggestion=null;bridge.close();bridge.render();break;
      case 'confirm-ai':return confirmChat();
      case 'refresh-ai':return refreshChatStatus();
      case 'stop-ai':chatRun?.controller.abort();break;
      case 'preview-ai-draft':previewSuggestion(arg);break;
      case 'confirm-ai-draft':applySuggestion();break;
      case 'restore-output':{const o=current().output,previous=o.history?.pop();if(previous){const currentCopy={title:o.title,body:o.body,provenance:o.provenance,at:new Date().toISOString()};Object.assign(o,{...previous,status:'draft'});o.history.push(currentCopy);saveChange('Earlier section draft restored','Author restored a prior '+stage().label+' output. Review required again.');bridge.render();}break;}
      case 'export-output':{const o=current().output;bridge.download('pherogent-'+stage().id+'-draft.md','# '+o.title+'\n\n'+o.body+'\n\n---\nStatus: '+outputLabel(o)+'\nOrigin: '+o.provenance+'\nSection draft; source mentions are not approved citations.','text/markdown');break;}
      case 'export-studio':bridge.download('pherogent-agent-workspaces.md',exportMarkdown(context()),'text/markdown');break;
      case 'undo-insertion':if(bridge.undoInsertion()){bridge.render();bridge.toast('Manuscript addition undone.');}break;
      case 'tour-start':if(window.PherogentResearchTour&&bridge.startResearchTour){bridge.startResearchTour();}else moveTour(0);break;
      case 'tour-next':moveTour((model().tour?.step||0)+1);break;
      case 'tour-back':moveTour(Math.max(0,(model().tour?.step||0)-1));break;
      case 'tour-close':model().tour={...model().tour,active:false};bridge.render();break;
      case 'toggle-nav':{const open=document.body.classList.toggle('nav-open');$('mobileMenuToggle')?.setAttribute('aria-expanded',String(open));break;}
      case 'close-nav':document.body?.classList?.remove('nav-open');$('mobileMenuToggle')?.setAttribute('aria-expanded','false');break;
    }}catch(error){bridge.toast(error.message||'This action could not finish.');}
  });
  window.PherogentStudio={init:adapter=>{bridge=adapter;},render,nav,afterRender,welcome,exportMarkdown,openStage,icon};
})();
