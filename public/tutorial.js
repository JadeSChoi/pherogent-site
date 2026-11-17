'use strict';
/* Optional, action-driven onboarding. The adapter owns project mutations;
   this module never calls literature APIs, invents findings, or approves work. */
(() => {
  const PAPER_ID = 'MED:33268865';
  const QUERY = 'EXT_ID:33268865 AND SRC:MED';
  const CONTENT_VERSION = window.PHEROGENT_CELL_DEMO?.version || null;
  const currentContent = t => !CONTENT_VERSION || t.contentVersion === CONTENT_VERSION;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const steps = [
    { id:'question', name:'Set the question', view:'overview', icon:'01', title:'Can reversal recover a past state?', text:'Practice with the Cellular Blockchain paper’s question: does reversal retrieve a preserved state, or create a new state that resembles it? We’ll check one claim against a published study.', task:'Read the research question. You can edit it, then continue.', next:'Find a paper' },
    { id:'search', name:'Find evidence', view:'literature', icon:'02', title:'Start with a real source.', text:'Start with Lu’s study of visual recovery in mice, a useful source for the reversal question. Click Search papers to request its record from Europe PMC.', task:'Run the search using the highlighted control.', next:'Inspect the result' },
    { id:'source', name:'Save a source', view:'literature', icon:'03', title:'Read before you collect.', text:'Open the result and inspect the abstract. The study reports functional recovery in mice. Keep that observation separate from the proposed archive-reading mechanism, then save the source.', task:'Click Inspect abstract, then Save to project sources.', next:'Make a reading note' },
    { id:'notebook', name:'Capture a finding', view:'literature', icon:'04', title:'Separate the result from the explanation.', text:'Record the measured result and what remains unresolved. Improved vision is not, by itself, proof that cells read a stored archive. Choose Add note to notebook to keep this distinction.', task:'Add a reading note and send it to your notebook.', next:'Write a sentence' },
    { id:'draft', name:'Write a claim', view:'manuscript', icon:'05', title:'Give the evidence something to check.', text:'Use the example sentence or write your own. The example deliberately presents archive reading as established. Your task is to narrow it to the functional result the source actually reports.', task:'Add a sentence, then click Prepare sentences for review.', next:'Check its evidence' },
    { id:'passage', name:'Verify a passage', view:'review', icon:'06', title:'The quote has to be real.', text:'Choose an exact passage from the source. The plain-code check confirms those words are present; it does not decide scientific support.', task:'Paste a matching passage. The example also supplies prepared review notes you can edit.', next:'Make the decision' },
    { id:'approval', name:'Approve the wording', view:'review', icon:'07', title:'You have the final say.', text:'Check the quote and proposed wording. Keep the measured mouse result; leave archive retrieval as a hypothesis needing separate tests. Only your click changes the manuscript.', task:'Review the fields, then click Apply wording + citation.', next:'See your finished work' },
    { id:'complete', name:'Your first research loop', view:'overview', icon:'✓', title:'A checked claim. An open hypothesis.', text:'You found a source, recorded a limitation and approved a narrower claim. Archive retrieval remains an open hypothesis. Keep exploring this practice project or return to your own work.', task:'Your decisions are saved in Activity. Export your work any time.', next:'Explore the workspace' }
  ];
  function normalize(value) {
    const input = record(value) ? value : {}, result = {...input,version:1,status:'idle',step:0,projectId:null,returnProjectId:null};
    const recovery = record(input.recovery) ? {...input.recovery} : {};
    if (['idle','active','paused','completed'].includes(input.status)) result.status = input.status;
    else if ('status' in input) recovery.status = input.status;
    if (Number.isInteger(input.step) && input.step >= 0 && input.step < steps.length) result.step = input.step;
    else if ('step' in input) recovery.step = input.step;
    for (const key of ['projectId','returnProjectId']) {
      if (typeof input[key] === 'string' && input[key].trim()) result[key] = input[key];
      else if (input[key] != null) recovery[key] = input[key];
    }
    if (['active','paused'].includes(result.status) && !result.projectId) result.status = 'idle';
    if (value != null && !record(value)) recovery.original = value;
    if ('recovery' in input && !record(input.recovery)) recovery.previousRecovery = input.recovery;
    if (Object.keys(recovery).length) result.recovery = recovery;
    return result;
  }
  const paper = s => Array.isArray(s.papers) ? s.papers.find(p => p?.id === PAPER_ID) : s.papers?.[PAPER_ID];
  const textMatch = (quote, source) => !!String(quote || '').trim() && String(source || '').replace(/\s+/g,' ').includes(String(quote).trim().replace(/\s+/g,' '));
  function getScrollOffset(rect, bounds) {
    if (rect.bottom - rect.top > bounds.bottom - bounds.top || rect.top < bounds.top) return rect.top - bounds.top;
    return rect.bottom > bounds.bottom ? rect.bottom - bounds.bottom : 0;
  }
  function getStepStatus(s = {}, index = normalize(s.tutorial).step) {
    const owner = normalize(s.tutorial);
    if (!owner.projectId || s.activeProjectId !== owner.projectId || !s.projectMeta?.isTutorial) return {ready:false,message:'Open the practice project to continue this tutorial.'};
    const source = paper(s), note = s.research?.sourceNotes?.[PAPER_ID]?.note || '', c = s.currentClaim || s.draft?.claims?.[0];
    const fresh = !!s.draft && s.draft.text === s.draft.baseText;
    switch (index) {
      case 0: return {ready:!!s.research?.question?.trim(),message:'A focused question gives the project direction.'};
      case 1: return {ready:!!source || !!s.search?.papers?.some(p => p.id === PAPER_ID),message:source?.prepared ? 'Prepared source selected. No live search is being claimed.' : s.search?.papers?.some(p => p.id === PAPER_ID) ? 'The live record arrived. It is a candidate, not a verified reference.' : s.search?.loading ? 'Waiting for Europe PMC to respond…' : s.search?.error ? 'The search is unavailable. Retry or use the clearly labelled prepared source.' : 'Search for the example paper to unlock the next mission.'};
      case 2: return {ready:!!source,message:source ? source.prepared ? 'Prepared source saved to this practice project.' : 'Source saved. It has not been approved as a citation.' : 'Inspect the result and save it to your collection.'};
      case 3: return {ready:note.trim().length >= 10 && !!s.research?.analysisNotes?.includes(note.trim()),message:note.trim().length >= 10 && s.research?.analysisNotes?.includes(note.trim()) ? 'Your reading note is now in the notebook.' : 'A useful note names the population, outcome or limitation.'};
      case 4: return {ready:fresh && (s.draft?.claims?.length || 0) > 0,message:fresh && s.draft?.claims?.length ? 'Sentence prepared. No scientific judgment was made.' : 'Preparing organizes your sentence for an evidence review.'};
      case 5: {const ready=fresh && !!c && c.candidate === PAPER_ID && textMatch(c.manual?.quote,source?.abstract || source?.evidence_excerpt);return {ready,message:ready ? 'Exact passage found in the available source text.' : 'A passage must match the available source text before continuing.'};}
      case 6: {const ready=fresh && !!c && c.decision?.type === 'apply' && c.decision.paperId === PAPER_ID && Number(s.citationCount) > 0;return {ready,message:ready ? 'Your wording and citation are approved. Undo remains available.' : 'The tutorial never approves for you. Make the decision in the app.'};}
      case 7: return {ready:true,message:'Practice complete · no AI model was used.'};
      default: return {ready:false,message:'Choose a tutorial mission.'};
    }
  }
  let api = null, host = null, coach = null, ring = null, notice = null, live = null;
  let scheduled = false, inTransition = false, lastKey = '', lastTarget = null, previousFocus = null, nextFocus = false, stepScroll = false, restoreEntry = false, raf = null, listenersAttached = false;
  const snapshot = () => api?.snapshot?.() || {};
  const tour = () => normalize(snapshot().tutorial);
  function persist(next) { api?.saveTutorial?.(normalize(next)); }
  function cleanHighlight() {
    if (lastTarget) { lastTarget.classList?.remove('tour-highlight-target'); lastTarget = null; }
    if (ring) ring.hidden = true;
  }
  function isVisible(node) { return !!node && !node.hidden && node.getClientRects?.().length > 0; }
  function query(selector) { return typeof document !== 'undefined' ? document.querySelector(selector) : null; }
  function ensureHost() {
    if (typeof document === 'undefined' || !document.body) return false;
    host = document.getElementById('tutorialRoot');
    if (!host) { host = document.createElement('div');host.id = 'tutorialRoot';document.body.appendChild(host); }
    if (!host.querySelector('#tutorialCoach')) {
      host.innerHTML = '<div id="tutorialSpotlight" class="tour-spotlight" hidden aria-hidden="true"></div><section id="tutorialCoach" class="tour-coach" role="dialog" aria-modal="false" aria-labelledby="tutorialTitle" aria-describedby="tutorialDescription" tabindex="-1" hidden></section><button type="button" id="tutorialResume" class="tour-resume" data-tour-action="resume" hidden><span class="tour-resume-icon" aria-hidden="true">▷</span><span>Resume tutorial<small>Your progress is saved</small></span><span aria-hidden="true">↗</span></button><div id="tutorialAnnouncements" class="sr-only" role="status" aria-live="polite"></div>';
    }
    coach = host.querySelector('#tutorialCoach');ring = host.querySelector('#tutorialSpotlight');live = host.querySelector('#tutorialAnnouncements');
    return true;
  }
  function init(adapter) {
    api = adapter;
    const initialTour = normalize(snapshot().tutorial);
    if (initialTour.status === 'active' && !currentContent(initialTour)) {
      persist({...initialTour,status:'paused'});
      api.toast?.('An updated tutorial is ready. Your earlier practice project is saved.');
    }
    stepScroll = normalize(snapshot().tutorial).status === 'active';
    restoreEntry = stepScroll;
    if (!ensureHost()) return;
    if (!listenersAttached) {
      document.addEventListener('click',handleClick);
      document.addEventListener('keydown',event => { if(event.key === 'Escape' && tour().status === 'active' && !query('dialog[open]')) { event.preventDefault();pause(); } });
      window.addEventListener('resize',requestPosition,{passive:true});
      window.addEventListener('scroll',requestPosition,{passive:true,capture:true});
      document.addEventListener('input',refresh);
      document.addEventListener('change',refresh);
      listenersAttached = true;
    }
    refresh();
  }
  function enterStep(index, focus=true) {
    const before = snapshot(), t = normalize(before.tutorial);
    if (!api || t.status !== 'active' || before.activeProjectId !== t.projectId) return;
    inTransition = true;
    try {
      api.closeDialog?.();
      persist({...t,step:index});
      const s = snapshot();
      if (s.view !== steps[index].view) api.navigate?.(steps[index].view);
      if (index === 1 && !paper(snapshot()) && !(snapshot().search?.papers?.length)) api.prefillQuery?.(QUERY);
      if (index === 5 && !snapshot().currentClaim?.decision) api.openTutorialEvidence?.();
      nextFocus = focus;stepScroll = true;lastKey = '';
    } finally {inTransition = false;refresh();}
  }
  function start() {
    if (!api) return;
    const current = tour();
    if (!currentContent(current)) {restart();return;}
    if (current.projectId && ['active','paused'].includes(current.status)) {resume();return;}
    restart();
  }
  function restart() {
    if (!api) return;
    previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
    const s = snapshot(), old = normalize(s.tutorial), returnId = s.projectMeta?.isTutorial ? old.returnProjectId : s.activeProjectId;
    inTransition = true;
    try {
      api.closeDialog?.();
      const id = api.createTutorialProject?.();
      if (!id) return;
      persist({version:1,status:'active',step:0,projectId:id,returnProjectId:returnId || null,...(CONTENT_VERSION ? {contentVersion:CONTENT_VERSION} : {})});
    } finally {inTransition = false;}
    enterStep(0);
  }
  function resume() {
    if (!api) return;
    const t = tour();
    if (!currentContent(t)) {restart();return;}
    if (!t.projectId || t.status === 'idle' || t.status === 'completed') {restart();return;}
    inTransition = true;
    try {
      api.closeDialog?.();
      if (snapshot().activeProjectId !== t.projectId) api.switchProject?.(t.projectId);
      if (snapshot().activeProjectId !== t.projectId) {persist({...t,status:'paused'});api.toast?.('The practice project could not be opened. Restart the tutorial from Help.');return;}
      persist({...t,status:'active'});
    } finally {inTransition=false;}
    if (snapshot().activeProjectId === t.projectId) enterStep(t.step);
  }
  function pause() {
    const t=tour();if(t.status !== 'active')return;
    persist({...t,status:'paused'});lastKey='';refresh();
    api?.toast?.('Tutorial paused. Your progress is saved.');
    if (previousFocus?.isConnected) previousFocus.focus?.({preventScroll:true});
  }
  function finish(returnToProject=false) {
    const t=tour();persist({...t,status:'completed'});lastKey='';
    if (returnToProject && t.returnProjectId && t.returnProjectId !== snapshot().activeProjectId) api.switchProject?.(t.returnProjectId);
    refresh();api.toast?.('Tutorial complete. Explore freely or start a project of your own.');
  }
  function handleClick(event) {
    const button=event.target?.closest?.('[data-tour-action]');if(!button)return;
    const action=button.dataset.tourAction,t=tour();
    event.preventDefault();
    if(action==='resume')return resume();
    if(action==='pause')return pause();
    if(action==='restart')return restart();
    if(action==='finish')return finish();
    if(action==='return')return finish(true);
    if(t.status!=='active'||snapshot().activeProjectId!==t.projectId)return;
    if(action==='next') {if(getStepStatus(snapshot(),t.step).ready)enterStep(Math.min(t.step+1,steps.length-1));return;}
    if(action==='back') {if(t.step>0)enterStep(t.step-1);return;}
    if(action==='return-step')return enterStep(t.step,false);
    const helpers={'prepared-paper':'usePreparedPaper','example-note':'useExampleNote','example-draft':'useExampleDraft','example-evidence':'useExampleEvidence'};
    if(helpers[action]){api[helpers[action]]?.();stepScroll=true;lastKey='';refresh();}
  }
  function refresh() {
    if(!api || scheduled || inTransition)return;
    scheduled=true;
    const queue=typeof queueMicrotask==='function'?queueMicrotask:fn=>Promise.resolve().then(fn);
    queue(()=>{scheduled=false;draw();});
  }
  function button(label,action,cls='',disabled=false,id='') {return `<button type="button"${id?` id="${id}"`:''} class="tour-button ${cls}" data-tour-action="${action}"${disabled?' disabled':''}>${label}</button>`;}
  function expectedView(index,view) {
    if(index===3)return ['literature','analysis'].includes(view);
    if(index===4)return ['manuscript','review'].includes(view);
    return steps[index]?.view===view;
  }
  function targetFor(s,index) {
    switch(index){
      case 0:return query('#researchQuestion') || query('.product-brief');
      case 1:return query('#paperSearch');
      case 2:return paper(s)?query('.collection-paper'):query('#searchResults .paper-result');
      case 3:return s.view==='analysis'?query('#researchAnalysisNotes'):(s.research?.sourceNotes?.[PAPER_ID]?.note?.trim().length>=10?query('[data-action="source-to-notebook"][data-arg="MED:33268865"]'):query('[data-source-note="MED:33268865"]'));
      case 4:return s.view==='review'?query('#reviewResults .queue'):(s.draft?.text?.trim()?query('[data-action="prepare"]'):query('#draftText'));
      case 5:return query('#evidenceQuote')?.closest('.field') || query('.evidence-panel');
      case 6:return s.currentClaim?.decision?query('.reference-list'):query('#manualApprove');
      case 7:return query('.product-metrics') || query('.page-head');
      default:return null;
    }
  }
  function helperHTML(s,index,ready) {
    if(index===1 && !ready && !s.search?.loading)return button('Use prepared paper instead','prepared-paper','tour-text-button')+'<span class="tour-hint">Works offline · labelled prepared throughout</span>';
    if(index===2 && !ready && !(s.search?.papers?.length))return button('Use prepared paper','prepared-paper','tour-secondary');
    if(index===3 && !ready)return button('Use example reading note','example-note','tour-secondary')+'<span class="tour-hint">Prepared text. You can edit it.</span>';
    if(index===4 && !ready && !s.draft?.claims?.some(c=>c.decision))return button(s.draft?.text?.trim()?'Replace with the practice sentence':'Insert the practice sentence','example-draft','tour-secondary')+(s.draft?.text?.trim()?'<span class="tour-hint">Replaces only this practice draft. Your projects stay separate.</span>':'');
    if((index===5 || index===6) && !s.currentClaim?.decision && (!s.currentClaim?.manual?.quote || s.currentClaim?.manual?.verdict==='unreviewed'))return button('Use example passage & review','example-evidence','tour-secondary')+'<span class="tour-hint">Prepared suggestions, not an AI assessment.</span>';
    return '';
  }
  function dialogTip(s,t) {
    const dialog=query('dialog[open]');
    document.querySelectorAll('.tour-dialog-tip').forEach(n=>{if(n.parentElement!==dialog)n.remove();});
    if(!dialog)return false;
    let text='The tutorial is waiting here. Finish or close this dialog to continue.';
    if(t.step===2 && query('#dialog [data-action="save-paper"]'))text='MISSION 03 · Read the abstract, then choose “Save to project sources.” Your work is still just a source candidate.';
    let tip=dialog.querySelector('.tour-dialog-tip');
    if(!tip){tip=document.createElement('div');tip.className='tour-dialog-tip';tip.setAttribute('role','status');dialog.appendChild(tip);}
    tip.textContent=text;
    return true;
  }
  function draw() {
    if(!ensureHost())return;
    const s=snapshot(),t=normalize(s.tutorial),resumeButton=host.querySelector('#tutorialResume');
    // Search results and query are session-only. Restore the practice query once
    // after the first app render on reload, never during ordinary typing refreshes.
    if(restoreEntry){
      restoreEntry=false;
      if(t.status==='active' && s.activeProjectId===t.projectId && s.projectMeta?.isTutorial && [1,2].includes(t.step) && s.view==='literature' && !paper(s) && !s.search?.loading && !s.search?.papers?.length)api.prefillQuery?.(QUERY);
    }
    if(t.status==='active' && (s.activeProjectId!==t.projectId || !s.projectMeta?.isTutorial)){
      persist({...t,status:'paused'});lastKey='';draw();return;
    }
    if(t.status!=='active'){
      coach.hidden=true;cleanHighlight();document.body.classList.remove('tutorial-active');document.body.style.removeProperty('--tutorial-sheet-height');
      resumeButton.hidden=t.status!=='paused';document.querySelectorAll('.tour-dialog-tip').forEach(n=>n.remove());lastKey='';return;
    }
    resumeButton.hidden=true;
    if(dialogTip(s,t)){coach.hidden=true;cleanHighlight();document.body.classList.remove('tutorial-active');return;}
    document.body.classList.add('tutorial-active');
    coach.hidden=false;
    const step=steps[t.step],status=getStepStatus(s,t.step),rightView=expectedView(t.step,s.view);
    const sourceCount=Array.isArray(s.papers)?s.papers.length:Object.keys(s.papers||{}).length, approvedCount=Math.max(0,Number(s.citationCount)||0);
    const description=t.step===7?(paper(s)?.prepared?'You used a prepared source and approved a narrower claim about functional recovery. Archive retrieval remains an open hypothesis; no experiment or AI analysis ran.':step.text):step.text;
    const helper=helperHTML(s,t.step,status.ready),key=JSON.stringify([t.step,status.ready,status.message,rightView,helper,s.view,t.returnProjectId,sourceCount,approvedCount,description]);
    if(key!==lastKey){
      const focusedAction=coach.contains(document.activeElement)?document.activeElement.dataset?.tourAction:null;
      const progress=t.step===7?100:Math.round(t.step/7*100);
      coach.innerHTML=`<div class="tour-topline"><span class="tour-brand"><span class="tour-spark" aria-hidden="true">✦</span> FIELD GUIDE</span><button type="button" id="tutorialPause" class="tour-close" data-tour-action="pause" aria-label="Pause tutorial" title="Pause tutorial">×</button></div><div class="tour-progress" id="tutorialProgress" role="progressbar" aria-label="Tutorial progress" aria-valuemin="0" aria-valuemax="7" aria-valuenow="${Math.min(t.step,7)}"><span style="width:${progress}%"></span></div><div class="tour-chapter"><span class="tour-step-icon${t.step===7?' complete':''}" aria-hidden="true">${step.icon}</span><span>${t.step===7?'PRACTICE COMPLETE':`MISSION ${t.step+1} OF 7`}<strong>${esc(step.name)}</strong></span></div><h2 id="tutorialTitle">${esc(step.title)}</h2><p id="tutorialDescription">${esc(description)}</p>${rightView?`<div class="tour-task${status.ready?' is-ready':''}"><span aria-hidden="true">${status.ready?'✓':'○'}</span><span>${esc(status.ready?status.message:step.task)}</span></div>${helper?`<div class="tour-helpers">${helper}</div>`:''}${s.search?.error&&t.step===1?'<p class="tour-error">Live search did not finish. You can retry or practice with the prepared record.</p>':''}`:`<div class="tour-task"><span aria-hidden="true">↗</span><span>You’re exploring ${esc(s.view==='analysis'?'the notebook':'another section')}. Your mission is saved.</span></div>${button('Return to this mission','return-step','tour-secondary')}`}${t.step===7?`<div class="tour-finish-stats"><span><strong>${sourceCount}</strong>saved ${sourceCount===1?'source':'sources'}</span><span><strong>${approvedCount}</strong>approved ${approvedCount===1?'reference':'references'}</span><span><strong>0</strong>AI calls</span></div><div class="tour-footer">${button('Explore the workspace','finish','tour-primary')}${t.returnProjectId?button('Return to my project','return','tour-text-button'):''}</div>`:`<div class="tour-footer"><div class="tour-footer-row">${button('← Back','back','tour-back',t.step===0)}${button(step.next+' <span aria-hidden="true">→</span>','next','tour-primary',!status.ready||!rightView,'tutorialNext')}</div><button type="button" class="tour-skip" data-tour-action="pause">Skip tutorial · keep my progress</button></div>`}<p class="tour-footnote">${t.step===1?'Only clicking Search sends the query to Europe PMC.':'Practice project · saved in this browser'}</p>`;
      if(live)live.textContent=`${t.step===7?'Tutorial complete':`Mission ${t.step+1} of 7`}. ${step.title} ${status.ready?status.message:step.task}`;
      lastKey=key;
      if(focusedAction && !nextFocus)coach.querySelector(`[data-tour-action="${focusedAction}"]`)?.focus({preventScroll:true});
    }
    cleanHighlight();
    const target=rightView?targetFor(s,t.step):null;
    if(isVisible(target)){lastTarget=target;target.classList.add('tour-highlight-target');}
    // Set the sheet's real height and page padding before scrolling. Otherwise a
    // near-bottom target can hit the old scroll limit and remain under the sheet.
    position();
    if(stepScroll && lastTarget){
      stepScroll=false;
      if(viewportWidth()<850){
        let rect=lastTarget.getBoundingClientRect();
        // Keep the note and its next action together when they fit on screen.
        if(t.step===3 && lastTarget.matches?.('[data-source-note]')){
          const footer=lastTarget.closest('.collection-paper')?.querySelector('.source-note-footer');
          if(isVisible(footer))rect={top:rect.top,bottom:footer.getBoundingClientRect().bottom};
        }
        const header=query('.topbar');
        const pinned=header && ['fixed','sticky'].includes(window.getComputedStyle(header).position);
        const top=pinned?Math.max(16,header.getBoundingClientRect().bottom+14):16;
        const offset=getScrollOffset(rect,{top,bottom:Math.max(top+40,coach.getBoundingClientRect().top-20)});
        if(offset)window.scrollBy({top:offset,behavior:'auto'});
      }else lastTarget.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
      position();
    }
    if(nextFocus){nextFocus=false;coach.focus({preventScroll:true});}
  }
  function requestPosition(){if(raf)return;raf=window.requestAnimationFrame(()=>{raf=null;position();});}
  function viewportWidth(){return document.documentElement.clientWidth || window.innerWidth;}
  function position(){
    if(!coach||coach.hidden)return;
    const vw=viewportWidth(),vh=window.innerHeight,gap=18,margin=18,mobile=vw<850;
    const rect=isVisible(lastTarget)?lastTarget.getBoundingClientRect():null;
    const width=Math.min(mobile?vw-24:352,vw-24);coach.style.width=width+'px';
    const height=Math.min(coach.getBoundingClientRect().height,vh-24);
    if(mobile){
      coach.style.left='12px';coach.style.top='auto';coach.style.bottom='12px';
      document.body.style.setProperty('--tutorial-sheet-height',(height+34)+'px');
    }else{
      document.body.style.removeProperty('--tutorial-sheet-height');coach.style.bottom='auto';
      let left=vw-width-margin,top=Math.max(86,(vh-height)/2);
      if(rect){
        if(rect.left>=width+gap+margin)left=rect.left-width-gap;
        else if(vw-rect.right>=width+gap+margin)left=rect.right+gap;
        else if(vh-rect.bottom>height+gap+margin){left=Math.max(margin,Math.min(vw-width-margin,rect.left));top=rect.bottom+gap;}
        else if(rect.top>height+gap+margin){left=Math.max(margin,Math.min(vw-width-margin,rect.left));top=rect.top-height-gap;}
        else{left=margin;top=vh-height-margin;}
        if(rect.left>=width+gap+margin || vw-rect.right>=width+gap+margin)top=Math.max(86,Math.min(rect.top,vh-height-margin));
      }
      coach.style.left=Math.max(12,left)+'px';coach.style.top=Math.max(12,Math.min(top,vh-height-12))+'px';
    }
    if(rect){
      const pad=7;ring.hidden=false;ring.style.left=Math.max(3,rect.left-pad)+'px';ring.style.top=(rect.top-pad)+'px';ring.style.width=Math.min(vw-6,rect.width+pad*2)+'px';ring.style.height=(rect.height+pad*2)+'px';
    }else ring.hidden=true;
  }
  window.PherogentTutorial={init,refresh,start,resume,pause,restart,normalize,steps,getStepStatus,getScrollOffset};
})();
