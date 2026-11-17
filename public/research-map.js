'use strict';
(() => {
  const D=window.PherogentStudioData,S=window.PherogentStudio;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const groups=[
    {id:'plan',label:'Plan',note:'Design & preparation',ids:['data','methods']},
    {id:'develop',label:'Build evidence',note:'Findings & sources',ids:['results','figures','references']},
    {id:'write',label:'Write',note:'Context & interpretation',ids:['introduction','discussion']},
    {id:'review',label:'Review & finish',note:'Summary & final checks',ids:['title','abstract','review']}
  ];
  const components=['sources','checks','analyses','outputs'];
  const routes={
    organizer:{from:[],next:['data','references']},data:{from:['organizer'],next:['methods']},
    methods:{from:['data'],next:['results']},results:{from:['methods'],next:['figures','discussion']},
    figures:{from:['results'],next:['discussion']},references:{from:['organizer'],next:['introduction','review']},
    introduction:{from:['references'],next:['discussion']},discussion:{from:['results','figures','introduction'],next:['title','abstract']},
    title:{from:['discussion'],next:['abstract']},abstract:{from:['discussion','title'],next:['review']},
    review:{from:['abstract','references'],next:[]}
  };
  const deliverables={
    organizer:'Research brief & decisions',data:'Data inventory & analysis plan',methods:'Study design & protocol',
    results:'Findings & source notes',figures:'Figure plan & captions',references:'Claim-to-source notes',
    introduction:'Context & research gap',discussion:'Interpretation & limitations',
    title:'Working title options',abstract:'Scoped manuscript summary',review:'Consistency & evidence checklist'
  };
  let bridge,questionProject;
  const validStage=id=>D.stages.some(stage=>stage.id===id);
  const phaseFor=id=>groups.find(group=>group.ids.includes(id));
  const state=()=>{
    const research=bridge.context().research,m=research.mapUI||{};
    let activePhase=groups.some(group=>group.id===m.activePhase)?m.activePhase:'plan';
    const selected=validStage(m.selected)?m.selected:groups.find(group=>group.id===activePhase).ids[0];
    activePhase=phaseFor(selected)?.id||activePhase;
    const phaseSelections={};
    for(const group of groups)if(group.ids.includes(m.phaseSelections?.[group.id]))phaseSelections[group.id]=m.phaseSelections[group.id];
    if(selected!=='organizer')phaseSelections[activePhase]=selected;
    // Keep previous layout data in saved projects, but retire the graph itself.
    return research.mapUI={...m,layout:'workflow',version:3,selected,activePhase,phaseSelections,component:components.includes(m.component)||m.component==='paper'?m.component:'sources',filter:m.filter==='drafts'?'drafts':'all'};
  };
  const agent=(ctx,id)=>ctx.research.agentWorkspace?.agents?.[id]||{};
  const output=(ctx,id)=>agent(ctx,id).output||{};
  const inputs=(ctx,id)=>Array.isArray(agent(ctx,id).inputs)?agent(ctx,id).inputs.filter(input=>input&&typeof input==='object'):[];
  const status=o=>!String(o.body||'').trim()?'Not started':o.status==='reviewed'?'Reviewed':'Draft';
  const btn=(label,action,arg='',cls='btn small',extra='')=>`<button type="button" class="${cls}" data-map-action="${action}" data-map-arg="${esc(arg)}" ${extra}>${label}</button>`;
  const icon=id=>S.icon?S.icon(id):'<span aria-hidden="true">◇</span>';
  const routeFor=id=>routes[id]||routes.organizer;
  const reviewedCopy=input=>input.kind==='handoff'&&validStage(input.fromStage)&&input.status==='reviewed'&&typeof input.text==='string'&&Boolean(input.text.trim());
  function connections(ctx){
    const links=[];
    for(const stage of D.stages){
      for(const input of inputs(ctx,stage.id).filter(reviewedCopy)){
        const found=links.find(link=>link.from===input.fromStage&&link.to===stage.id);
        if(found)found.count++;else links.push({from:input.fromStage,to:stage.id,count:1});
      }
    }
    return links;
  }
  function nextStage(ctx){
    const ids=groups.flatMap(group=>group.ids);
    return ids.find(id=>status(output(ctx,id))==='Draft')||ids.find(id=>status(output(ctx,id))==='Not started')||'review';
  }
  // A local recommendation from saved state, never an AI assessment or an execution queue.
  function nextAction(ctx){
    const ids=groups.flatMap(group=>group.ids),draft=ctx.draft||{},claims=Array.isArray(draft.claims)?draft.claims:[];
    if(String(draft.text||'').trim()&&(!claims.length||draft.baseText!==draft.text))return {action:'navigate',arg:'review',title:'Prepare your writing for evidence review',detail:'Your manuscript has new or changed text. Choose the sentences to check.',cta:'Open evidence review'};
    const pending=claims.filter(claim=>!claim.decision).length;
    if(pending)return {action:'navigate',arg:'review',title:`${pending} selected sentence${pending===1?'':'s'} waiting for evidence review`,detail:'Inspect the source passages and decide whether the wording is supported.',cta:'Review evidence'};
    const draftId=ids.find(id=>status(output(ctx,id))==='Draft');
    if(draftId)return {action:'review-draft',arg:draftId,title:`Review your ${D.stageFor(draftId).label.toLowerCase()} draft`,detail:/prepared|template/i.test(output(ctx,draftId).provenance||'')?'A prepared draft is saved here. Adapt it to your work before marking it reviewed.':'A saved draft is waiting for your review before you pass it to another section.',cta:'Review draft'};
    if(!String(ctx.research.question||'').trim())return {action:'edit-question',arg:'',title:'Give this project a research question',detail:'A clear question gives each workspace the same starting point.',cta:'Set question'};
    const withCopy=ids.find(id=>status(output(ctx,id))==='Not started'&&inputs(ctx,id).some(reviewedCopy));
    if(withCopy)return {action:'context',arg:withCopy,title:`Inspect the context for ${D.stageFor(withCopy).label.toLowerCase()}`,detail:'A reviewed copy is saved here. Read it before continuing this section.',cta:'View saved context'};
    const next=ids.find(id=>status(output(ctx,id))==='Not started');
    if(next)return {action:'open',arg:next,title:`Start ${D.stageFor(next).label.toLowerCase()}`,detail:`Work toward: ${deliverables[next].toLowerCase()}. You can start in any section.`,cta:'Open workspace'};
    return {action:'navigate',arg:'manuscript',title:'Review the assembled manuscript',detail:'Section drafts are reviewed. Check what you have actually added to the manuscript and its evidence.',cta:'Open manuscript'};
  }
  function phaseNav(ctx,ui){
    return `<nav class="flow-phase-nav" aria-label="Research phases">${groups.map((group,index)=>{
      const reviewed=group.ids.filter(id=>status(output(ctx,id))==='Reviewed').length,drafts=group.ids.filter(id=>status(output(ctx,id))==='Draft').length;
      const summary=drafts?`${drafts} draft${drafts===1?'':'s'} to review`:reviewed?`${reviewed} reviewed`:'Not started';
      return btn(`<span class="flow-phase-number">0${index+1}</span><span class="flow-phase-copy"><strong>${group.label}</strong><small>${group.ids.map(id=>D.stageFor(id).label).join(' · ')}</small></span><span class="flow-phase-status">${summary}</span><span class="flow-phase-progress" aria-hidden="true"><i style="width:${reviewed/group.ids.length*100}%"></i></span>`,'phase',group.id,'flow-phase',`data-phase="${group.id}" aria-pressed="${ui.activePhase===group.id}" aria-controls="flowPhaseWork" aria-label="${esc(group.label)}: ${group.ids.length} workspaces, ${summary}"`);
    }).join('')}</nav>`;
  }
  function workspaceRow(ctx,id,ui){
    const label=status(output(ctx,id)),items=inputs(ctx,id),copies=items.filter(reviewedCopy).length;
    return btn(`<span class="map-node-icon" aria-hidden="true">${icon(id)}</span><span class="flow-item-copy"><strong>${esc(D.stageFor(id).label)}</strong><span>${esc(deliverables[id])}</span><small>${items.length} input${items.length===1?'':'s'}${copies?` · ${copies} reviewed ${copies===1?'copy':'copies'}`:''}</small></span><span class="flow-item-status">${label==='Reviewed'?'✓ Reviewed':label==='Draft'?'● Draft':'Not started'}</span><span class="flow-item-chevron" aria-hidden="true">›</span>`,'select',id,`flow-item${ui.selected===id?' is-selected':''}${label==='Reviewed'?' is-reviewed':label==='Draft'?' is-draft':''}`,`aria-pressed="${ui.selected===id}" aria-label="${esc(D.stageFor(id).label)}: ${label}. Select workspace" aria-controls="mapInspector"`);
  }
  function phaseWork(ctx,ui){
    const group=groups.find(group=>group.id===ui.activePhase),index=groups.indexOf(group),drafts=group.ids.filter(id=>status(output(ctx,id))==='Draft');
    const visible=ui.filter==='drafts'?drafts:group.ids;
    const otherDraft=groups.flatMap(group=>group.ids).find(id=>!group.ids.includes(id)&&status(output(ctx,id))==='Draft');
    return `<section class="flow-section-list" id="flowPhaseWork" aria-labelledby="flowPhaseTitle"><header class="flow-section-head"><span class="eyebrow">Phase ${index+1} of ${groups.length}</span><h2 id="flowPhaseTitle">${group.label}</h2><p>${group.note}. Select a workspace to see its inputs and output.</p></header><div class="flow-filter" role="group" aria-label="Filter this phase">${btn('All workspaces','filter','all',ui.filter==='all'?'active':'',`aria-pressed="${ui.filter==='all'}"`)}${btn(`Drafts to review · ${drafts.length}`,'filter','drafts',ui.filter==='drafts'?'active':'',`aria-pressed="${ui.filter==='drafts'}"`)}</div><div class="flow-items">${visible.map(id=>workspaceRow(ctx,id,ui)).join('')||`<div class="map-empty flow-empty"><strong>No drafts to review in ${group.label}.</strong><span>${otherDraft?'Another phase has a draft waiting for you.':'Open a workspace to begin.'}</span><div class="actions">${btn('Show all workspaces','filter','all','btn small')}${otherDraft?btn(`View ${esc(D.stageFor(otherDraft).label)} draft`,'select',otherDraft,'btn small'):''}</div></div>`}</div><footer class="flow-phase-jump">${index>0?btn('← '+groups[index-1].label,'phase',groups[index-1].id,'studio-inline-link'):'<span>Start anywhere. Return as your work develops.</span>'}${index<groups.length-1?btn(groups[index+1].label+' →','phase',groups[index+1].id,'studio-inline-link'):btn('Open manuscript →','navigate','manuscript','studio-inline-link')}</footer></section>`;
  }
  function handoffs(ctx){
    const links=connections(ctx);
    if(!links.length)return '';
    return `<section class="map-handoffs" aria-label="Reviewed copies between workspaces"><div><span class="map-solid-line" aria-hidden="true"></span><strong>Reviewed copies</strong><span>${links.reduce((total,link)=>total+link.count,0)} passed by you</span></div><div class="map-handoff-links">${links.map(link=>btn(`${esc(D.stageFor(link.from).label)} <span aria-hidden="true">→</span> ${esc(D.stageFor(link.to).label)}${link.count>1?` <small>×${link.count}</small>`:''}`,'context',link.to,'map-handoff-link',`aria-label="Open ${esc(D.stageFor(link.to).label)} context: ${link.count} reviewed ${link.count===1?'copy':'copies'} from ${esc(D.stageFor(link.from).label)}"`)).join('')}</div><p>Saved snapshots. Later edits to the source do not update these copies.</p></section>`;
  }
  function inspector(ctx,ui){
    const stage=D.stageFor(ui.selected),o=output(ctx,stage.id),label=status(o),items=inputs(ctx,stage.id),body=String(o.body||''),route=routeFor(stage.id);
    const copies=connections(ctx).filter(link=>link.from===stage.id);
    return `<aside id="mapInspector" class="map-inspector" tabindex="-1" aria-label="Selected research workspace">
      <div class="map-inspector-summary"><div class="map-inspector-head"><span class="map-node-icon">${icon(stage.id)}</span><span class="eyebrow">Selected workspace</span><span class="map-inspector-status ${label==='Reviewed'?'is-reviewed':label==='Draft'?'is-draft':''}">${label==='Reviewed'?'✓ Reviewed by you':label==='Draft'?'● Draft to review':label}</span></div><h2>${esc(stage.label)}</h2><p>${esc(stage.description)}</p><div class="map-inspector-actions">${btn('Open workspace ↗','open',stage.id,'btn primary map-open-workspace')}${label==='Draft'?btn('Review draft','review-draft',stage.id,'btn map-review-draft'):label==='Reviewed'?btn('View reviewed output','review-draft',stage.id,'btn'):''}</div></div>
      <section class="map-preview"><div class="map-section-label"><h3>${body.trim()?'Saved output':'Work toward'}</h3>${body.trim()?btn('Open output','review-draft',stage.id,'studio-inline-link'):''}</div>${body.trim()?`<h4>${esc(o.title||deliverables[stage.id])}</h4><p>${esc(body.slice(0,260))}${body.length>260?'…':''}</p><small class="map-provenance">${esc(o.provenance||'Author')}</small>`:`<h4>${esc(deliverables[stage.id])}</h4><p class="map-muted">No output yet. Add your material or start a conversation in this workspace.</p>`}</section>
      <section class="map-inputs flow-context-path"><div class="map-section-label"><h3>Saved inputs <span>${items.length}</span></h3>${btn('View context','context',stage.id,'studio-inline-link')}</div><div class="map-input-list">${items.length?items.slice(0,3).map(input=>`<div><span aria-hidden="true">${reviewedCopy(input)?'↳':'·'}</span><span><strong>${esc(input.title||'Input')}</strong><small>${reviewedCopy(input)?'Reviewed copy from '+esc(D.stageFor(input.fromStage).label):input.kind==='source'?'Selected library source':input.kind==='handoff'?'Saved context · review not recorded':'Author-added context'}</small></span></div>`).join(''):'<p class="map-muted">No context added yet.</p>'}${items.length>3?`<p class="map-muted">+ ${items.length-3} more in context</p>`:''}</div>${route.from.length?`<div class="flow-suggested-inputs"><span>Possible inputs from</span>${route.from.map(id=>btn(esc(D.stageFor(id).label),'select',id,'map-route-chip')).join('')}</div>`:''}</section>
      <section class="workflow-step-list"><h3>Continue from here</h3>${route.next.length?route.next.map(id=>btn(`${esc(D.stageFor(id).label)} <span>→</span>`,'select',id,'workflow-step-button')).join(''):btn('Open manuscript →','navigate','manuscript','workflow-step-button')}<p>${copies.length?`${copies.reduce((n,link)=>n+link.count,0)} reviewed ${copies.reduce((n,link)=>n+link.count,0)===1?'copy has':'copies have'} been passed from this workspace.`:'Suggested destinations. No content is shared automatically.'}</p></section>
    </aside>`;
  }
  // These summaries describe saved records only. Selecting a card does not run work.
  function componentSummary(ctx){
    const research=ctx.research||{},runs=(Array.isArray(research.studyRuns)?research.studyRuns:[]).filter(run=>run&&typeof run==='object'&&(!run.projectId||run.projectId===ctx.project?.id));
    const retrievals=runs.filter(run=>run.kind==='retrieval'&&['retrieved','no_matches'].includes(run.status)&&Array.isArray(run.evidence));
    const calculations=runs.filter(run=>run.kind==='calculation'&&Number.isInteger(run.state?.features)&&run.state.features>0&&Array.isArray(run.rollup?.intervals)&&run.transition&&typeof run.transition==='object'&&(
      run.study==='lee2014'||run.workflow==='data-analysis'&&typeof run.study==='string'&&run.study.trim()&&typeof run.route==='string'&&['DNAm','RNA','ATAC'].includes(run.state.modality)&&Array.isArray(run.state.times)&&run.state.times.length>1&&Number.isInteger(run.transition.observedPairs)&&run.transition.observedPairs>0&&Number.isFinite(run.transition.meanDelta)&&run.verification?.status==='CHECKED'&&Array.isArray(run.verification.checks)
    ));
    const records=(Array.isArray(ctx.evidenceRecords)?ctx.evidenceRecords:[]).filter(item=>item&&typeof item==='object');
    const approved=records.filter(item=>item.fresh===true&&item.status==='approved').length;
    const drafts=D.stages.filter(stage=>stage.id!=='organizer'&&String(output(ctx,stage.id).body||'').trim());
    const reviewed=drafts.filter(stage=>output(ctx,stage.id).status==='reviewed').length;
    const papers=Array.isArray(ctx.papers)?ctx.papers.length:0;
    const artifacts=(Array.isArray(research.projectOutputs?.items)?research.projectOutputs.items:[]).filter(item=>item&&typeof item==='object').length;
    const notes=new Set(retrievals.flatMap(run=>run.evidence.filter(item=>item&&typeof item.id==='string').map(item=>String(run.study)+':'+item.id))).size;
    const latest=retrievals[0],calculation=calculations[0];
    const skipped=latest?.numericAnalysis==='NOT_RUN'||(Array.isArray(latest?.skills)&&latest.skills.some(skill=>skill?.status==='NOT_RUN'));
    const synthetic=calculation?.origin==='synthetic'||calculation?.source?.origin==='synthetic';
    const technicalChecks=Array.isArray(calculation?.verification?.checks)?calculation.verification.checks.filter(check=>check&&check.status==='CHECKED').length:0;
    return {retrievals,calculations,approved,drafts:drafts.length,reviewed,papers,notes,latest,calculation,skipped,artifacts,synthetic,technicalChecks};
  }
  function componentModels(ctx){
    const x=componentSummary(ctx),hasWriting=!!String(ctx.draft?.text||'').trim();
    const calc=x.calculation,study=calc?.study==='lee2014'?'Lee 2014':calc?.study;
    const calculationCount=calc?`${calc.state.features.toLocaleString('en-US')} ${calc.study==='lee2014'?'Lee regions':'features · '+study}${calc.state.modality?' · '+calc.state.modality:''} · ${x.calculations.length} saved calculation${x.calculations.length===1?'':'s'}`:'';
    const calculationResult=calc?(calc.study==='lee2014'?`The saved Lee calculation contains states, interval summaries, and the final transition at tolerance ${calc.epsilon}. It describes population measurements, not the same cells followed through time.`:`The saved ${study} calculation contains states, interval summaries, and an observed transition at tolerance ${calc.epsilon}. Uploaded measurements and sample mappings are author-declared.`)+(x.synthetic?' This is a synthetic software test, not experimental evidence.':'')+(calc.verification?` ${x.technicalChecks} technical checks recorded. These check input structure and arithmetic, not scientific validity.`:''):'';
    return [
      {id:'sources',title:'Sources',icon:'data',tag:'Papers & study collections',status:x.notes?'Retrieved':x.papers?'Saved':'Ready to add',count:`${x.papers} library papers · ${x.notes} retrieved notes`,description:'Keep each study and its materials together. Choose the evidence a task can use.',input:'Your question, saved papers, a study collection, or CSV/TSV measurements with sample metadata.',result:x.notes?`${x.notes} distinct source notes appear in saved study runs. These supplied summaries are not verified quotations.`:x.papers?`${x.papers} papers are saved in your library. Saving a paper does not approve a citation.`:'Lu 2020 and WIF1 source collections are available. No source retrieval is recorded for this project.',actions:[['Open source library','navigate','literature'],['Search study collections','navigate','study-workflows'],['Connect measurements','navigate','data-analysis']],next:'checks'},
      {id:'checks',title:'Checks',icon:'review',tag:'Evidence & study design',status:x.approved?'Author reviewed':'Needs review',count:`${x.approved} current evidence approvals`,description:'Inspect exact passages, assess the study design, and keep the author’s decision visible.',input:'A manuscript sentence, its candidate paper, and the actual source passage.',result:x.approved?`${x.approved} current evidence records carry author approval. This records a decision, not proof that the science is true.`:'No current author-approved evidence records. Source retrieval and registry checks do not establish that a claim is supported.',actions:[['Review evidence','navigate','review'],['Check study design','design-check','results']],next:'analyses'},
      {id:'analyses',title:'Analyses',icon:'results',tag:'Data & calculation tools',status:calc?(x.synthetic?'Synthetic test':'Calculated'):x.skipped?'Skipped':'Not run',count:calc?calculationCount:x.skipped?'Source notes have no numerical input':'Connect data or use the Lee example',description:'Connect measurements, run eligible calculations, and inspect their checks and limitations.',input:'CSV/TSV measurements, sample IDs, biological units, times, assay, route, and analysis settings. Source summaries alone are insufficient.',result:calc?calculationResult:x.skipped?'Skipped — no numerical input for the source-note run. EpiState-T, rollup, and transition were not computed. Connect measurements or use the separate Lee dataset.':'No completed calculation is saved in this project. Connect a dataset to see which tools can run, or use the real Lee example.',actions:[['Connect data & analyze','navigate','data-analysis'],['Explore Lee data','navigate','study-explorer'],['Plan an analysis','open','data']],next:'outputs'},
      {id:'outputs',title:'Outputs',icon:'abstract',tag:'Papers, reports & data records',status:x.drafts||hasWriting||x.artifacts?'In progress':'Ready to create',count:`${x.drafts} section drafts · ${x.artifacts} saved reports & data records`,description:'Turn saved findings into a paper or report. Keep its sources, calculations, and review history attached.',input:'Section drafts, linked evidence, and recorded calculations selected by you.',result:hasWriting?'Your manuscript has saved writing. Review section drafts and their evidence before adding further material.':x.drafts?`${x.drafts} section drafts are saved; ${x.reviewed} have been marked reviewed by you. Drafts are not automatically inserted into the manuscript.`:'Your project paper is ready for writing. Create supporting reports or data records in Outputs.',actions:[['Open project outputs','navigate','outputs'],['Open manuscript','navigate','manuscript']],next:null}
    ];
  }
  function componentMap(ctx,ui){
    const items=componentModels(ctx),selected=items.find(item=>item.id===ui.component)||items[0];
    const x=componentSummary(ctx);
    const trace=x.latest?`<div class="pipeline-run-note"><span class="eyebrow">Latest source workflow</span><strong>${esc(x.latest.study==='rag1_lu2020'?'Lu 2020':x.latest.study==='rag2_gse293381'?'WIF1':x.latest.study)}</strong><p>${x.latest.evidence.length} notes returned · source summaries, not verified quotes.</p>${x.skipped?'<span class="pipeline-skipped">Skipped — no numerical input</span>':''}</div>`:'';
    return `<section class="pipeline-desk" aria-label="Connected research workflow"><div class="pipeline-map"><div class="pipeline-map-heading"><span class="eyebrow">Your research, connected</span><h2>From sources to a reviewable output.</h2><p>Select a stage to inspect its materials and next actions.</p></div><div class="pipeline-nodes">${items.map((item,index)=>btn(`<span class="pipeline-node-index">0${index+1}</span><span class="pipeline-node-copy"><span class="pipeline-node-label">${esc(item.tag)}</span><strong>${item.title}</strong><small>${esc(item.count)}</small></span><span class="pipeline-state${item.status==='Skipped'?' is-skipped':''}">${esc(item.status)}</span>`,'component',item.id,'pipeline-node',`aria-pressed="${selected.id===item.id}" aria-controls="workflowInspector" aria-label="${item.title}: ${esc(item.status)}. Inspect stage"`)).join('')}</div><p class="pipeline-caption">Connections show where work can go. Nothing is shared or run automatically.</p></div><aside id="workflowInspector" class="pipeline-inspector" tabindex="-1" aria-label="Selected workflow stage"><div class="pipeline-inspector-heading"><span class="map-node-icon">${icon(selected.icon)}</span><span class="eyebrow">Selected stage</span><span class="pipeline-state${selected.status==='Skipped'?' is-skipped':''}">${esc(selected.status)}</span></div><h2>${selected.title}</h2><p class="pipeline-intro">${esc(selected.description)}</p><dl class="pipeline-io"><div><dt>Needs</dt><dd>${esc(selected.input)}</dd></div><div><dt>Saved result</dt><dd>${esc(selected.result)}</dd></div></dl><div class="pipeline-actions">${selected.actions.map(([label,action,arg],index)=>btn(esc(label)+' ↗',action,arg,index===0?'btn primary':'btn')).join('')}</div>${selected.id==='analyses'||selected.id==='sources'?trace:''}${selected.next?`<div class="pipeline-next"><span>Continue with</span>${btn(componentModels(ctx).find(item=>item.id===selected.next).title+' →','component',selected.next,'studio-inline-link')}</div>`:'<div class="pipeline-next"><span>Sources and review decisions stay linked to the work.</span></div>'}</aside></section>`;
  }
  function render(ctx){
    const ui=state(),stages=D.stages.filter(stage=>stage.id!=='organizer'),reviewed=stages.filter(stage=>status(output(ctx,stage.id))==='Reviewed').length,drafts=stages.filter(stage=>status(output(ctx,stage.id))==='Draft').length,next=nextAction(ctx),tour=ctx.research.processTour;
    return `<div class="research-map-page is-workflow is-phase-flow is-connected-flow">
      <header class="map-page-head"><div><span class="eyebrow">${esc(ctx.draft.title||'Untitled project')}</span><h1>Research workflow</h1><p class="pipeline-subtitle">A clear home for your sources, checks, analyses, and writing.</p></div><div class="actions"><button class="btn map-tour-button" type="button" data-action="process-tour">${tour?.status==='paused'||tour?.status==='active'?'Resume walkthrough':'Walkthrough'}</button>${btn('Project outputs ↗','navigate','outputs','btn primary')}</div></header>
      <div class="flow-summary"><div class="flow-question"><span class="eyebrow">Research question</span><h2>${esc(ctx.research.question||'What question will this paper answer?')}</h2><div class="actions">${btn('Edit question','edit-question','','studio-inline-link')}${btn('Project brief ↗','select','organizer','studio-inline-link',`aria-pressed="${ui.selected==='organizer'}"`)}</div></div><div class="flow-counts"><span><strong>${reviewed}<small> / ${stages.length}</small></strong>drafts reviewed</span><span><strong>${drafts}</strong>in progress</span><span><strong>${ctx.papers?.length||0}</strong>sources</span></div></div>
      <div class="flow-next"><span class="map-node-icon" aria-hidden="true">${icon('review')}</span><div><small>Next useful step · from saved work</small><strong>${esc(next.title)}</strong><p>${esc(next.detail)}</p></div>${btn(esc(next.cta)+' ↗',next.action,next.arg,'btn')}</div>
      ${componentMap(ctx,ui)}
      <details class="pipeline-paper-sections"${ui.component==='paper'?' open':''}><summary><span>${icon('abstract')}<strong>Paper sections</strong><small>Conversations, drafts, and reviewed handoffs</small></span><span aria-hidden="true">⌄</span></summary><div class="pipeline-paper-body">${phaseNav(ctx,ui)}<div class="flow-workbench">${phaseWork(ctx,ui)}<div class="map-selected-shortcut">${btn(`${esc(D.stageFor(ui.selected).label)} <span>View details ↓</span>`,'inspect','','btn')}</div>${inspector(ctx,ui)}</div></div></details>
      ${handoffs(ctx)}<footer class="flow-legend"><span>Retrieved = source notes found</span><span>Calculated = numerical output saved</span><span>Reviewed = your decision</span><p>Review status records author actions, not scientific validity.</p></footer></div>`;
  }
  function editQuestion(){
    const ctx=bridge.context();questionProject=ctx.project?.id;
    bridge.modal('Define your research question',`<form id="mapQuestionForm"><label class="field">Research question<textarea id="mapQuestion" rows="4" maxlength="2000" required>${esc(ctx.research.question||'')}</textarea></label><p class="subtle">This shared brief gives every workspace the same starting point. It does not change your manuscript.</p><div class="actions"><button class="btn primary" type="submit">Save question</button>${btn('Cancel','close')}</div></form>`);
  }
  function redraw(action,arg){
    bridge.save();bridge.render();
    // Native controls are replaced by the app render. Restore keyboard focus in place.
    const target=document.querySelector?.(`[data-map-action="${action}"][data-map-arg="${arg}"]`);
    if(target&&!target.closest?.('[hidden]'))target.focus?.({preventScroll:true});
    else if(action==='select'){const panel=document.getElementById('mapInspector');panel?.focus?.({preventScroll:true});panel?.scrollIntoView?.({block:'nearest',behavior:'auto'});}
  }
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-map-action]');if(!el||!bridge)return;
    const ui=state(),arg=el.dataset.mapArg,action=el.dataset.mapAction;
    switch(action){
      case 'select':if(!validStage(arg))break;ui.component='paper';ui.selected=arg;if(phaseFor(arg)){ui.activePhase=phaseFor(arg).id;ui.phaseSelections[ui.activePhase]=arg;}if(status(output(bridge.context(),arg))!=='Draft')ui.filter='all';redraw(action,arg);break;
      case 'phase':{const group=groups.find(group=>group.id===arg);if(!group)break;ui.component='paper';ui.activePhase=arg;ui.selected=ui.phaseSelections[arg]||group.ids.find(id=>status(output(bridge.context(),id))==='Draft')||group.ids[0];ui.phaseSelections[arg]=ui.selected;ui.filter='all';redraw(action,arg);break;}
      case 'component':if(!components.includes(arg))break;ui.component=arg;redraw(action,arg);break;
      case 'navigate':if(['review','sources','literature','manuscript','outputs','study-workflows','study-explorer','data-analysis'].includes(arg))bridge.navigate?.(arg);break;
      case 'design-check':S.openStage('results');document.querySelector?.('[data-studio-action="check-design"]')?.click?.();break;
      case 'inspect':{const panel=document.getElementById('mapInspector');panel?.focus?.({preventScroll:true});panel?.scrollIntoView?.({block:'start',behavior:'auto'});break;}
      case 'open':if(validStage(arg))S.openStage(arg);break;
      case 'review-draft':if(validStage(arg))S.openStage(arg,'output');break;
      case 'context':if(validStage(arg))S.openStage(arg,'context');break;
      case 'filter':if(!['all','drafts'].includes(arg))break;ui.filter=arg;redraw(action,arg);break;
      case 'edit-question':editQuestion();break;
      case 'close':questionProject=undefined;bridge.close();break;
    }
  });
  document.addEventListener('submit',event=>{
    if(!bridge||event.target.id!=='mapQuestionForm')return;event.preventDefault();
    const ctx=bridge.context();if(ctx.project?.id!==questionProject){bridge.close();return;}
    const text=document.getElementById('mapQuestion').value.trim();if(!text)return;
    ctx.research.question=text.slice(0,2000);questionProject=undefined;
    bridge.log('Research question updated','Author updated the shared project question.');bridge.save();bridge.close();bridge.render();
  });
  window.PherogentMap={init:adapter=>{bridge=adapter;},render,afterRender:()=>{},dispose:()=>{},groups,status,nextStage,nextAction,deliverables,connections,routeFor,componentSummary,componentModels};
})();
