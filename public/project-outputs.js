'use strict';
(() => {
  // Browser-local records. This module never invokes an AI or edits the manuscript.
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const sections = ['title','abstract','introduction','methods','results','figures','discussion','references'];
  const types = {report:'Technical report',dataset:'Dataset record'};
  const limit = 30;
  let bridge, editor = null, linkSession = null;
  const $ = id => document.getElementById(id);
  const id = () => 'output-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9);
  const now = () => new Date().toISOString();
  const btn = (label,action,arg='',cls='btn small',extra='') => `<button type="button" class="${cls}" data-output-action="${action}" data-output-arg="${esc(arg)}" ${extra}>${label}</button>`;
  function safeUrl(value) {
    try { const url = new URL(String(value || '')); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function normalize(value,projectId) {
    const source = record(value) ? value : {}, seen = new Set(), items=[],discarded=[],repaired=[];
    const recovery=record(source.recovery)?{...source.recovery}:{};
    if(value!=null&&!record(value))recovery.original=value;
    if('items' in source&&!Array.isArray(source.items))recovery.items=source.items;
    for(const item of Array.isArray(source.items)?source.items:[]) {
      if(!record(item) || typeof item.id !== 'string' || !item.id || seen.has(item.id) || !types[item.type] || item.projectId !== projectId || typeof item.title !== 'string' || typeof item.body !== 'string'||items.length>=limit){discarded.push(item);continue;}
      seen.add(item.id);
      const title=item.title.slice(0,180),body=item.body.slice(0,20000),url=safeUrl(item.url),changed=title!==item.title||body!==item.body||url!==(item.url||'');
      if(changed)repaired.push({id:item.id,original:item});
      items.push({...item,title,body,url,status:!changed&&item.status==='reviewed'?'reviewed':'draft',...(changed?{reviewedAt:null}:{}),revision:Number.isSafeInteger(item.revision)&&item.revision>0?item.revision:1});
    }
    if(discarded.length)recovery.discardedItems=[...(Array.isArray(recovery.discardedItems)?recovery.discardedItems:[]),...discarded];
    if(repaired.length)recovery.repairedItems=[...(Array.isArray(recovery.repairedItems)?recovery.repairedItems:[]),...repaired];
    return {...source,version:1,items,...(Object.keys(recovery).length?{recovery}:{})};
  }
  const context = () => bridge.context();
  function state(ctx=context()) { return ctx.research.projectOutputs = normalize(ctx.research.projectOutputs,ctx.project.id); }
  function records(ctx) { return normalize(ctx.research?.projectOutputs,ctx.project?.id).items; }
  function getRecord(ctx,arg) { return records(ctx).find(item=>item.id===arg)||null; }
  function update(item,fields) {
    const title = String(fields.title ?? item.title).trim().slice(0,180), body = String(fields.body ?? item.body).slice(0,20000), url = safeUrl(fields.url ?? item.url);
    const origin = item.sourceRunId ? item.origin : fields.origin==='proposed' ? 'proposed' : fields.origin==='author' ? 'author' : item.origin;
    const changed = title!==item.title || body!==item.body || url!==item.url || origin!==item.origin;
    return {...item,title,body,url,...(origin?{origin}:{}),...(changed?{status:'draft',reviewedAt:null,revision:item.revision+1,updatedAt:now(),...(item.sourceRunId?{authorEdited:true}:{})}:{} )};
  }
  function studyName(run) {return run.study==='lee2014'?'Lee 2014':String(run.state?.studyLabel||run.study||'Uploaded study');}
  function runOrigin(run) {
    if(run.origin==='synthetic'||run.source?.origin==='synthetic'||run.source?.synthetic===true)return {key:'synthetic',label:'Synthetic software test',note:'Artificial example data. This is a software check, not a biological result.'};
    if(run.kind==='calculation')return {key:'computed',label:'Calculated by Pherogent',note:'Descriptive calculation by code. Scientific support still requires judgment.'};
    if(run.kind==='retrieval'&&run.evidence?.length)return {key:'reported',label:'Reported by a paper',note:'Retrieved supplied summaries; the original paper was not independently checked.'};
    return {key:'search',label:'No matching notes',note:'An empty search is not evidence that no relevant paper exists.'};
  }
  function originInfo(item) {
    if(record(item.sourceSnapshot)&&['calculation','retrieval'].includes(item.sourceSnapshot.kind))return runOrigin(item.sourceSnapshot);
    if(item.origin==='proposed')return {key:'proposed',label:'Proposed analysis',note:'A plan for future work. No result is claimed.'};
    return {key:'author',label:'Author',note:'Content entered by the author.'};
  }
  function listPreview(values,max=12) {
    if(!Array.isArray(values))return values;
    return values.length>max?{total:values.length,shown:values.slice(0,max),note:'Preview only. The full list remains in the attached source snapshot; export this report as JSON.'}:values;
  }
  function runText(run) {
    const calculated = run.kind==='calculation' && record(run.state) && record(run.rollup) && record(run.transition);
    if(calculated) {
      const t=run.transition,s=run.state;
      const origin=runOrigin(run),sampleSchedule=(run.rollup.intervals||[]).map(interval=>({from:interval.from,to:interval.to,fromSampleIds:listPreview(interval.fromSampleIds),toSampleIds:listPreview(interval.toSampleIds),observedPairs:interval.observedPairs,missingPairs:interval.missingPairs,meanDelta:interval.meanDelta,meanAbsoluteDelta:interval.meanAbsoluteDelta,status:interval.status}));
      return ['# Descriptive calculation — '+studyName(run),origin.label+'\n'+origin.note,`Study: ${studyName(run)}\nRoute: ${run.route}\nAssay: ${s.modality||run.modality||'Not recorded'}\nTolerance: ${run.epsilon}`,
        `Observed features: ${s.features}\nObserved visits: ${(s.times||[]).join(', ')}\nObserved values: ${s.observedValues} / ${s.totalSlots}\nObservation unit: ${s.observationUnit||'Not recorded'}\nIndependent biological units: ${s.independentUnits==null?'Unknown':s.independentUnits}`,
        `Selected interval: ${t.from} → ${t.to}\nObserved pairs: ${t.observedPairs}\nMissing pairs: ${t.missingPairs??'Not recorded'}\nMean change: ${t.meanDelta??'Not estimable'}\nWithin tolerance: ${t.withinTolerance}\nExactly equal: ${t.exactEqual}`,
        '## Observed sample schedule\n'+JSON.stringify(listPreview(sampleSchedule),null,2),
        '## Calculation checks\n'+(record(run.verification)?JSON.stringify(run.verification,null,2):'Legacy calculation record: checks were not separately recorded. Consult its input and source record.')+'\nThese checks concern declared inputs and calculation structure, not whether the scientific interpretation is true.',
        '## Interpretation limits\n'+(Array.isArray(run.limitations)?run.limitations:[]).map(item=>'- '+item).join('\n'),
        'Within tolerance does not establish exact equality. These are descriptive feature counts, not independent biological replicates.',
        '## Source record\n'+JSON.stringify({study:run.study,route:run.route,input:run.source||null,source:listPreview(t.source),sourceGroupCount:t.sourceGroupCount,omittedSourceGroups:t.omittedSourceGroups,design:{units:s.units,population:s.population,sampleCount:s.sampleCount,destructiveSampling:s.destructiveSampling,lineage:s.lineage},recordedAt:run.recordedAt||run.createdAt},null,2),
        'Computed by local code. No AI model ran. Author review is still required.'].join('\n\n');
    }
    const notes=Array.isArray(run.evidence)?run.evidence:[];
    return [notes.length?'# Retrieved study notes':'# Study search — no matching notes',`Collection: ${run.study}\nQuestion: ${run.question||''}`,
      notes.length?`${notes.length} source notes returned.`:'No matching source notes were returned. This does not establish that supporting evidence is absent from the wider literature.',
      'These are supplied source summaries, not word-for-word quotations. The original paper was not independently checked. Numerical analysis was skipped: this run used source notes.',
      ...(Array.isArray(run.evidence)?run.evidence:[]).map((item,i)=>`## Source note ${i+1}\n${item.text||''}\n\nSource: ${safeUrl(item.sourceUrl)||'Link unavailable'}\nLocator: ${typeof item.locator==='string'?item.locator:JSON.stringify(item.locator||{})}`),
      '## Limitations\n'+(Array.isArray(run.limitations)?run.limitations:[]).map(item=>'- '+item).join('\n'),
      'Retrieved by code. No AI model ran. Check the original source before citing.'].join('\n\n');
  }
  function reportFromRun(run,projectId) {
    if(!record(run)||!['retrieval','calculation'].includes(run.kind)||typeof run.id!=='string'||!run.id||run.projectId&&run.projectId!==projectId)return null;
    if(run.kind==='calculation'&&(!record(run.state)||!record(run.rollup)||!record(run.transition)))return null;
    if(run.kind==='calculation'&&(!Array.isArray(run.state.times)||!Array.isArray(run.rollup.intervals)))return null;
    if(run.kind==='retrieval'&&(!Array.isArray(run.evidence)||run.evidence.some(item=>!record(item)||typeof item.text!=='string')))return null;
    if(JSON.stringify(run).length>60000)return null;
    const body=runText(run);if(body.length>20000)return null;
    const origin=runOrigin(run),title=run.kind==='calculation'?studyName(run)+' · '+String(run.route||'Calculation'):'Study notes · '+String(run.study||'Collection');
    return {id:id(),projectId,type:'report',title:title.slice(0,180),body,url:'',status:'draft',revision:1,createdAt:now(),updatedAt:now(),origin:origin.key,provenance:origin.label+' · '+origin.note,authorEdited:false,sourceRunId:run.id,sourceSnapshot:clone(run)};
  }
  function markdown(item) {const origin=originInfo(item);return ['# '+item.title,types[item.type]+' · '+(item.status==='reviewed'?'Reviewed by author':'Draft')+' · Revision '+item.revision,'Origin: '+origin.label+'\n'+origin.note,item.authorEdited?'Author-edited report. The attached source snapshot is unchanged; these edits have not been recalculated.':'',item.url?'Source link: '+item.url:'',item.body,item.sourceRunId?'Source run: '+item.sourceRunId:'','Author review records a decision, not scientific validation.'].filter(Boolean).join('\n\n')+'\n';}
  function exportMarkdown(ctx) {return records(ctx).map(item=>markdown(item)).join('\n---\n\n');}
  function paperCard(ctx) {
    const agents=ctx.research.agentWorkspace?.agents||{},reviewed=sections.filter(s=>agents[s]?.output?.body?.trim()&&agents[s].output.status==='reviewed').length;
    return `<section class="outputs-paper" aria-labelledby="outputsPaperTitle"><div class="outputs-paper-head"><div><span class="outputs-eyebrow">RESEARCH PAPER · THIS PROJECT</span><h2 id="outputsPaperTitle">${esc(ctx.draft.title||'Untitled research paper')}</h2><p>Each section keeps its own conversation, inputs and working draft.</p></div><span class="outputs-status">${reviewed} / ${sections.length} section drafts reviewed</span></div><div class="outputs-sections">${sections.map(s=>{
      const o=agents[s]?.output||{},label=window.PherogentStudioData?.stageFor(s)?.label||s,filled=!!o.body?.trim();
      return btn(`<span class="outputs-section-icon" aria-hidden="true">${window.PherogentStudio?.icon?.(s)||'▤'}</span><span><strong>${esc(label)}</strong><small>${filled?o.status==='reviewed'?'Reviewed by you':'Draft to review':'Not started'}</small></span><span aria-hidden="true">↗</span>`,'section',s,'outputs-section');
    }).join('')}</div><div class="outputs-paper-footer"><span>${String(ctx.draft.text||'').trim().split(/\s+/).filter(Boolean).length} manuscript words · ${ctx.citationCount||0} approved references</span><div class="actions">${btn('Check evidence','navigate','review','btn small')}${btn('Open manuscript ↗','navigate','manuscript','btn small primary')}</div></div><p class="outputs-footnote">Section drafts enter the manuscript only after your approval and an explicit addition.</p></section>`;
  }
  function itemCard(item) {
    const origin=originInfo(item);
    return `<article class="outputs-item"><div class="outputs-item-top"><span class="outputs-eyebrow">${types[item.type].toUpperCase()}</span><span class="outputs-status ${item.status==='reviewed'?'is-reviewed':''}">${item.status==='reviewed'?'Reviewed by you':'Draft'}</span></div><div class="outputs-provenance is-${origin.key}"><strong>${esc(origin.label)}</strong><span>${esc(origin.note)}</span></div><h3>${esc(item.title)}</h3><p class="outputs-excerpt">${esc(item.body.slice(0,200)||'Add a description and source information.')}${item.body.length>200?'…':''}</p><div class="outputs-item-origin">${item.authorEdited?'Author-edited report · source snapshot unchanged':'Original record'} · v${item.revision}</div>${item.url?`<a class="outputs-source-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>`:''}<div class="outputs-item-actions">${btn('Open record','edit',item.id)}${btn('Link to a section','link',item.id,'btn small ghost',item.status!=='reviewed'?'disabled title="Review this output before linking it"':'')}${btn('Export','export',item.id,'btn small ghost')}</div></article>`;
  }
  function render(ctx) {
    const items=records(ctx),runs=(Array.isArray(ctx.research.studyRuns)?ctx.research.studyRuns:[]).filter(run=>record(run)&&['retrieval','calculation'].includes(run.kind)&&typeof run.id==='string'&&(!run.projectId||run.projectId===ctx.project.id)),saved=new Set(items.map(item=>item.sourceRunId));
    return `<div class="project-outputs" id="projectOutputs"><header class="outputs-heading"><div><span class="outputs-eyebrow">${esc(ctx.draft.title||'YOUR PROJECT')}</span><h1>Research outputs</h1><p>Turn your sources and analyses into work you can review and share.</p></div><div class="actions">${btn('New report','new','report','btn primary')}${btn('Add dataset record','new','dataset','btn')}</div></header>${paperCard(ctx)}<div class="outputs-lower"><section class="outputs-records" aria-labelledby="outputsRecordsTitle"><header class="outputs-section-head"><div><h2 id="outputsRecordsTitle">Reports & datasets</h2><p>Saved in this project. Review a record before linking it to a section.</p></div><span class="outputs-count">${items.length}</span></header>${items.length?`<div class="outputs-record-grid">${items.map(itemCard).join('')}</div>`:`<div class="outputs-empty"><span aria-hidden="true">▤</span><h3>Give your findings a home</h3><p>Write a technical report, record a dataset, or save a completed study run.</p>${btn('Write a report','new','report','btn small')}</div>`}</section><aside class="outputs-runs" aria-labelledby="outputsRunsTitle"><div class="outputs-section-head"><div><span class="outputs-eyebrow">TRACEABLE INPUTS</span><h2 id="outputsRunsTitle">Recent study runs</h2></div></div>${runs.length?runs.slice(0,5).map(run=>`<article class="outputs-run"><span class="outputs-run-kind">${esc(runOrigin(run).label)}</span><h3>${esc(run.kind==='calculation'?studyName(run)+' · '+run.route:run.question||run.study)}</h3><p>${run.kind==='calculation'?esc(runOrigin(run).note):'Numerical analysis skipped — source notes only.'}</p>${btn(saved.has(run.id)?'Report saved':'Save as report','save-run',run.id,'btn small',saved.has(run.id)?'disabled':'')}</article>`).join(''):`<p class="outputs-empty-run">Your completed retrievals and calculations appear here.</p>${btn('Connect data & analyze ↗','navigate','data-analysis','btn small')}`}<p class="outputs-footnote">Saving a report copies the run record. No new analysis or AI call is made.</p></aside></div><footer class="outputs-footer"><span>Dataset records contain descriptions and links; they do not host a database.</span><button type="button" class="studio-inline-link" data-action="new-project">Start another paper in a new project ↗</button></footer></div>`;
  }
  function find(arg) { return state().items.find(item=>item.id===arg); }
  function log(type,detail,extra={}) {bridge.log(type,detail,{actor:'Author',...extra});bridge.save();}
  function openEditor(type,arg='') {
    const item=arg?find(arg):null;if(arg&&!item||!types[type||item?.type])return;
    if(!item&&state().items.length>=limit){bridge.toast('This project has 30 output records. Export your work before starting another project.');return;}
    const value=item||{type,title:'',body:'',url:''};editor={projectId:context().project.id,id:item?.id||null,type:value.type};linkSession=null;
    bridge.modal(item?'Edit '+types[value.type].toLowerCase():'New '+types[value.type].toLowerCase(),`<form id="projectOutputForm" class="outputs-form">${item?.sourceRunId?`<div class="outputs-provenance is-${originInfo(item).key}"><strong>${esc(originInfo(item).label)}</strong><span>${esc(originInfo(item).note)}</span></div>`:`<label for="outputRecordOrigin">Content type<select id="outputRecordOrigin"><option value="author"${value.origin!=='proposed'?' selected':''}>Author note</option><option value="proposed"${value.origin==='proposed'?' selected':''}>Proposed analysis — no result yet</option></select></label>`}<label for="outputRecordTitle">Title<input id="outputRecordTitle" required maxlength="180" value="${esc(value.title)}" placeholder="${value.type==='report'?'e.g. Route comparison report':'e.g. Lee 2014 source workbook'}"></label><label for="outputRecordBody">${value.type==='report'?'Report':'Dataset description'}<textarea id="outputRecordBody" rows="10" maxlength="20000" placeholder="${value.type==='report'?'Record findings, sources and limitations…':'Describe the source, variables, observation units and access conditions…'}">${esc(value.body)}</textarea></label><label for="outputRecordUrl">Source link <small>Optional · https://</small><input id="outputRecordUrl" type="url" maxlength="2000" value="${esc(value.url)}" placeholder="https://"></label>${item?.sourceRunId?`<p class="outputs-origin-note">Includes an unchanged snapshot of study run ${esc(item.sourceRunId)}. Editing this report does not change or rerun its source record. Edits are labeled as author-edited text.</p>`:''}<p class="outputs-footnote">Saved on this device. Editing a reviewed record makes it a draft again.</p><div class="outputs-form-actions"><span id="outputRecordError" role="alert"></span><div class="actions">${item?btn('Export JSON','export-json',item.id,'btn small ghost'):''}${item&&item.status!=='reviewed'?btn('Save & mark reviewed','save-reviewed','','btn small'):''}<button type="submit" class="btn primary">Save draft</button></div></div></form>`);
    $('outputRecordTitle')?.focus?.();
  }
  function saveEditor(reviewed=false) {
    if(!editor||editor.projectId!==context().project.id||!$('projectOutputForm'))return;
    const title=$('outputRecordTitle')?.value?.trim()||'',body=$('outputRecordBody')?.value||'',url=$('outputRecordUrl')?.value?.trim()||'';
    const error=!title?'Add a title.':title.length>180||body.length>20000?'Shorten this record to the field limits.':url&&!safeUrl(url)?'Use a complete http or https source URL without credentials.':reviewed&&!body.trim()?'Add the content you reviewed before marking it reviewed.':'';
    if(error){if($('outputRecordError'))$('outputRecordError').textContent=error;return;}
    const items=state().items,old=editor.id?items.find(item=>item.id===editor.id):null;
    if(editor.id&&!old)return;
    if(!old&&items.length>=limit){bridge.toast('This project has reached its output record limit.');return;}
    const base=old||{id:id(),projectId:editor.projectId,type:editor.type,title:'',body:'',url:'',status:'draft',revision:0,createdAt:now(),provenance:'Author'};
    const origin=base.sourceRunId?base.origin:$('outputRecordOrigin')?.value==='proposed'?'proposed':'author';
    let value=update(base,{title,body,url,origin});
    if(reviewed)value={...value,status:'reviewed',reviewedAt:now()};
    // The Save draft action is explicit, including for previously reviewed content.
    else value={...value,status:'draft',reviewedAt:null};
    if(old)items[items.indexOf(old)]=value;else items.unshift(value);
    log(reviewed?'Output reviewed':'Output saved',`${types[value.type]} “${value.title}” ${reviewed?'reviewed by the author':'saved as a draft'}. No AI ran and the manuscript is unchanged.`,{outputId:value.id,revision:value.revision});
    editor=null;bridge.close();bridge.render();bridge.toast(reviewed?'Output reviewed. You can now link it to a section.':'Output saved as a draft.');
  }
  function saveRun(arg) {
    const ctx=context(),run=(Array.isArray(ctx.research.studyRuns)?ctx.research.studyRuns:[]).find(run=>record(run)&&run.id===arg),items=state().items;
    if(!run||items.some(item=>item.sourceRunId===arg))return;
    if(items.length>=limit){bridge.toast('This project has reached its output record limit.');return;}
    const value=reportFromRun(run,ctx.project.id);if(!value){bridge.toast('This run cannot fit in a report. Export the original run instead.');return;}
    items.unshift(value);log('Study run saved as report','Author saved a report and source snapshot from '+arg+'. No new analysis or AI call was made.',{outputId:value.id,runId:arg});bridge.render();openEditor('report',value.id);
  }
  function openLink(arg) {
    const item=find(arg);if(!item||item.status!=='reviewed')return;
    linkSession={projectId:context().project.id,id:item.id,revision:item.revision};editor=null;
    bridge.modal('Link a reviewed output',`<form id="outputLinkForm" class="outputs-form"><p>Add a saved copy of <strong>${esc(item.title)}</strong> to one section’s context. Its source record stays attached.</p><label for="outputLinkStage">Destination section<select id="outputLinkStage">${sections.map(stage=>`<option value="${stage}" ${stage==='results'?'selected':''}>${esc(window.PherogentStudioData?.stageFor(stage)?.label||stage)}</option>`).join('')}</select></label><p class="outputs-footnote">Later edits do not update the copy. This will not send a message to AI or insert manuscript text.</p><button type="submit" class="btn primary">Link to section</button></form>`);
  }
  function linkOutput(stageId) {
    if(!linkSession||linkSession.projectId!==context().project.id||!sections.includes(stageId))return false;
    const item=find(linkSession.id);if(!item||item.status!=='reviewed'||item.revision!==linkSession.revision)return false;
    document.dispatchEvent(new CustomEvent('pherogent:link-output',{detail:{projectId:linkSession.projectId,stageId,output:clone(item)}}));
    linkSession=null;return true;
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('[data-output-action]');if(!target||!bridge)return;
    const {outputAction:action,outputArg:arg}=target.dataset;
    if(action==='section'&&sections.includes(arg))bridge.openStage(arg);
    else if(action==='navigate'&&['review','manuscript','study-workflows','data-analysis'].includes(arg))bridge.navigate(arg);
    else if(action==='new'&&types[arg])openEditor(arg);
    else if(action==='edit'){const item=find(arg);if(item)openEditor(item.type,item.id);}
    else if(action==='save-reviewed')saveEditor(true);
    else if(action==='save-run')saveRun(arg);
    else if(action==='link')openLink(arg);
    else if(action==='export'||action==='export-json'){const item=find(arg);if(item)bridge.download('pherogent-'+item.type+'-'+item.id+(action==='export-json'?'.json':'.md'),action==='export-json'?JSON.stringify(item,null,2)+'\n':markdown(item),action==='export-json'?'application/json':'text/markdown');}
  });
  document.addEventListener('submit',event=>{
    if(!bridge)return;
    if(event.target.id==='projectOutputForm'){event.preventDefault();saveEditor(false);}
    if(event.target.id==='outputLinkForm'){event.preventDefault();linkOutput($('outputLinkStage')?.value);}
  });
  window.PherogentOutputs={init:adapter=>{bridge=adapter;},render,afterRender:()=>{},normalize,records,getRecord,update,reportFromRun,runText,markdown,exportMarkdown,projectMarkdown:exportMarkdown,safeUrl,sections,linkOutput,originInfo,runOrigin};
})();
