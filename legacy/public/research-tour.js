'use strict';
(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const steps=[
    {id:'map',stage:'organizer',title:'Meet your manuscript team',text:'Each section has its own conversation, inputs and output. Open Data processing in the sidebar to explore a focused agent workspace.',task:'Open a section agent from the sidebar.',button:'Open Data processing'},
    {id:'question',view:'plan',title:'Make the question your own',text:'Edit the research question in this practice project. Add a specific scope or comparison. Your original projects are kept separate.',task:'Change and save the research question by typing.',button:'Edit research question'},
    {id:'data',stage:'data',title:'Give the Data agent context',text:'Use Add input to select a paper from the prepared library. Close the input window, then choose a prepared example below the chat to create a data-checking plan.',task:'Attach one prepared source and open a Data example.',button:'Open Data processing'},
    {id:'methods',stage:'methods',title:'Plan a reproducible method',text:'Choose a Methods example. Read the proposed design in Output, then select Mark reviewed. These are planning notes; no experiment has run.',task:'Create a Methods output and mark it reviewed.',button:'Open Methods'},
    {id:'results',stage:'results',title:'Pass a finding to the next agent',text:'Open a Results example and review its output. Select Pass to another agent, then Discussion. This passes a reviewed copy, not the whole conversation.',task:'Review a Results output and pass it to Discussion.',button:'Open Results'},
    {id:'figures',stage:'figures',title:'Give the evidence a visual plan',text:'Choose a Figures & tables example to create an editable storyboard. It proposes diagrams and captions; it does not generate experimental plots.',task:'Create a Figures & tables output.',button:'Open Figures & tables'},
    {id:'discussion',stage:'discussion',title:'Interpret without overclaiming',text:'The Results handoff is in this agent’s Context. Choose a Discussion example to separate interpretations, competing explanations and limitations.',task:'Create a Discussion output with the Results handoff present.',button:'Open Discussion'},
    {id:'introduction',stage:'introduction',title:'Build the argument from the gap',text:'Choose an Introduction example. Its output connects the background to the research question while keeping the proposed mechanism separate from established findings.',task:'Create an Introduction output.',button:'Open Introduction'},
    {id:'title',stage:'title',title:'Name the actual contribution',text:'Choose a Title example. Compare the working options and edit them if you like. A framework or hypothesis should not be titled as a proven mechanism.',task:'Create a Title output.',button:'Open Title'},
    {id:'abstract',stage:'abstract',title:'Write a scoped abstract',text:'Choose an Abstract example, inspect the draft in Output and mark it reviewed. The prepared abstract explicitly says that no new experiment or data analysis is reported.',task:'Create an Abstract output and mark it reviewed.',button:'Open Abstract'},
    {id:'manuscript',stage:'abstract',title:'Bring a reviewed section into the paper',text:'In Abstract Output, select Add to manuscript and confirm Add a copy. Then open Manuscript to inspect the assembled writing. The copy remains under your control.',task:'Add the reviewed abstract and open the manuscript.',button:'Open Abstract output'},
    {id:'references',stage:'references',title:'Approve a reference against its evidence',text:'Open a References example, then Evidence review. Select the prepared lineage-reconstruction sentence, inspect the paper’s passage and approve its citation. A reviewed section draft is not citation approval.',task:'Create a Reference output and approve one evidence-backed citation.',button:'Open References'},
    {id:'review',stage:'review',title:'Make the final checks explicit',text:'Choose a Final review example. Read its checklist and mark the output reviewed. This records your review of the checklist; it does not certify the paper’s science.',task:'Create a Final review output and mark it reviewed.',button:'Open Final review'},
    {id:'export',title:'Take your work with you',text:'Open Export and download the manuscript, agent workspaces or a workspace backup. Your practice stays saved in this browser; an export gives you a separate copy.',task:'Download an export from the practice project.',button:'Open export options'}
  ];
  const ids=new Set(steps.map(step=>step.id));
  const defaults=()=>({version:1,status:'idle',step:0,completed:[],skipped:[],baselineDraft:'',baselineQuestion:'',visitedStages:[],exportedFiles:[],projectId:null,minimized:false,showChecklist:false,dismissed:false});
  function normalize(value){
    if(!record(value))return value==null?defaults():{...defaults(),recovery:{original:clone(value)}};
    const n={...clone(value),...defaults()};
    const recovery=record(value.recovery)?clone(value.recovery):{};
    for(const [key,item]of Object.entries(value))if(!(key in n))n[key]=clone(item);
    n.status=['idle','active','paused','completed'].includes(value.status)?value.status:'idle';
    n.step=Number.isInteger(value.step)&&value.step>=0&&value.step<steps.length?value.step:0;
    const list=(items,max=100)=>Array.isArray(items)?[...new Set(items.filter(x=>typeof x==='string'))].slice(0,max):[];
    n.completed=list(value.completed,steps.length).filter(id=>ids.has(id));
    n.skipped=list(value.skipped,steps.length).filter(id=>ids.has(id)&&!n.completed.includes(id));
    n.visitedStages=list(value.visitedStages,30);n.exportedFiles=list(value.exportedFiles,20);
    n.baselineDraft=typeof value.baselineDraft==='string'?value.baselineDraft.slice(0,20000):'';
    n.baselineQuestion=typeof value.baselineQuestion==='string'?value.baselineQuestion.slice(0,20000):'';
    n.projectId=typeof value.projectId==='string'?value.projectId:null;
    n.minimized=value.minimized===true;n.showChecklist=value.showChecklist===true;n.dismissed=value.dismissed===true;
    for(const key of ['version','status','step','completed','skipped','baselineDraft','baselineQuestion','visitedStages','exportedFiles','projectId'])if(key in value&&JSON.stringify(value[key])!==JSON.stringify(n[key]))recovery[key]=clone(value[key]);
    if(Object.keys(recovery).length)n.recovery=recovery;
    return n;
  }
  const agent=(workspace,id)=>record(workspace?.agents?.[id])?workspace.agents[id]:{};
  const output=(workspace,id)=>agent(workspace,id).output||{};
  const hasOutput=(workspace,id)=>typeof output(workspace,id).body==='string'&&output(workspace,id).body.trim().length>0;
  const reviewed=(workspace,id)=>hasOutput(workspace,id)&&output(workspace,id).status==='reviewed';
  const hasHandoff=(workspace,from,to)=>(agent(workspace,to).inputs||[]).some(input=>input?.kind==='handoff'&&input.fromStage===from&&typeof input.text==='string'&&input.text.trim());
  function canAdvance(stepOrId,ctx={},workspace={},progress={}){
    const id=typeof stepOrId==='number'?steps[stepOrId]?.id:typeof stepOrId==='string'?stepOrId:stepOrId?.id;
    const draft=ctx.draft||{};
    switch(id){
      case'map':return (progress.visitedStages||[]).some(stage=>stage!=='organizer');
      case'question':return typeof ctx.research?.question==='string'&&!!ctx.research.question.trim()&&ctx.research.question!==progress.baselineQuestion;
      case'data':return hasOutput(workspace,'data')&&(agent(workspace,'data').inputs||[]).some(input=>input?.kind==='source'&&typeof input.sourceId==='string');
      case'methods':return reviewed(workspace,'methods');
      case'results':return reviewed(workspace,'results')&&hasHandoff(workspace,'results','discussion');
      case'figures':return hasOutput(workspace,'figures');
      case'discussion':return hasOutput(workspace,'discussion')&&hasHandoff(workspace,'results','discussion');
      case'introduction':return hasOutput(workspace,'introduction');
      case'title':return hasOutput(workspace,'title');
      case'abstract':return reviewed(workspace,'abstract');
      case'manuscript':return ctx.view==='manuscript'&&reviewed(workspace,'abstract')&&typeof draft.text==='string'&&draft.text!==progress.baselineDraft&&draft.text.includes(output(workspace,'abstract').body);
      case'references':return hasOutput(workspace,'references')&&draft.text===draft.baseText&&Array.isArray(draft.claims)&&draft.claims.some(claim=>claim?.decision?.type==='apply'&&claim.decision.after===claim.text&&typeof claim.decision.paperId==='string');
      case'review':return reviewed(workspace,'review');
      case'export':return Array.isArray(progress.exportedFiles)&&progress.exportedFiles.length>0;
      default:return false;
    }
  }
  let bridge=null,listening=false,refreshing=false,pending=false,lastSignature='',busy=false;
  const context=()=>bridge?.context?.()||{};
  const workspace=()=>bridge?.workspace?.()||{};
  const inPractice=ctx=>ctx?.project?.isProcessTutorial===true;
  function progress(){const ctx=context();return inPractice(ctx)&&record(ctx.research?.processTour)?ctx.research.processTour:null;}
  function save(){bridge?.save?.();}
  function root(){let el=document.getElementById('researchTourRoot');if(!el){el=document.createElement('div');el.id='researchTourRoot';document.body.appendChild(el);}return el;}
  function schedule(){if(pending)return;pending=true;Promise.resolve().then(()=>{pending=false;onRender();});}
  function button(label,action,cls='',disabled=false){return `<button type="button" class="research-tour-button ${cls}" data-research-tour-action="${action}"${action==='minimize'?' aria-label="Minimize practice guide"':''}${disabled?' disabled':''}>${label}</button>`;}
  function clearHighlight(){document.querySelectorAll?.('.research-tour-target').forEach(el=>el.classList.remove('research-tour-target'));}
  function targetSelector(step,ctx,w){
    if(step.id==='map')return '[data-studio-action="open-stage"][data-studio-arg="data"]';
    if(step.id==='question')return '#researchQuestion';
    if(step.id==='export')return '[data-action="export-menu"]';
    if(step.id==='references'&&hasOutput(w,'references'))return ctx.view==='review'?'[data-action="approve-demo"], #manualApprove':'[data-action="view"][data-arg="review"]';
    if(step.id==='manuscript')return ctx.view==='manuscript'?'#draftText':'[data-studio-action="insert-output"]';
    if(step.id==='data'&&!(agent(w,'data').inputs||[]).some(input=>input.kind==='source'))return '[data-studio-action="input-add"]';
    if(step.stage&&w.activeStage!==step.stage)return `[data-studio-action="open-stage"][data-studio-arg="${step.stage}"]`;
    if(step.stage&&!hasOutput(w,step.stage))return '.studio-prompt';
    if(['methods','results','abstract','review'].includes(step.id)&&!reviewed(w,step.stage))return '[data-studio-action="review-output"]';
    if(step.id==='results')return '[data-studio-action="handoff"]';
    return '#studioOutputBody';
  }
  function applyHighlight(step,ctx,w){
    clearHighlight();
    const target=document.querySelector?.(targetSelector(step,ctx,w));
    if(!target)return;
    target.classList?.add('research-tour-target');
    const coach=document.querySelector?.('.research-tour-coach');
    if(coach&&target.getBoundingClientRect&&coach.getBoundingClientRect){
      const a=target.getBoundingClientRect(),b=coach.getBoundingClientRect();
      const viewportHeight=window.innerHeight||document.documentElement?.clientHeight||b.bottom;
      const bottom=viewportHeight-((window.innerWidth||1000)<=760?12:22),top=bottom-b.height;
      coach.dataset.placement=a.bottom>top&&a.top<bottom&&a.right>b.left&&a.left<b.right?'top':'bottom';
    }
  }
  function currentDestination(step,ctx,w){
    if(step.id==='map')return {label:'Open Data processing',stage:'data'};
    if(step.id==='question')return {label:'Edit research question',view:'plan'};
    if(step.id==='manuscript'&&hasOutput(w,'abstract')&&String(ctx.draft?.text||'').includes(output(w,'abstract').body))return {label:'Open Manuscript',view:'manuscript'};
    if(step.id==='references'&&hasOutput(w,'references'))return {label:'Open Evidence review',view:'review'};
    if(step.id==='export')return {label:'Open export options',export:true};
    return {label:step.button,stage:step.stage,view:step.view};
  }
  function render(){
    if(!bridge)return;
    const ctx=context(),p=progress(),el=root();
    if(!p||!['active','paused','completed'].includes(p.status)||p.status==='completed'&&p.dismissed){el.innerHTML='';clearHighlight();lastSignature='';return;}
    const w=workspace(),step=steps[p.step]||steps[0],done=canAdvance(step,ctx,w,p);
    const signature=JSON.stringify([ctx.project.id,p.status,p.step,p.completed,p.skipped,p.minimized,p.showChecklist,done,currentDestination(step,ctx,w),ctx.view,w.activeStage]);
    if(signature===lastSignature){if(p.status==='active'&&!p.minimized)applyHighlight(step,ctx,w);return;}
    lastSignature=signature;
    if(p.status==='completed'){
      clearHighlight();el.innerHTML=`<aside class="research-tour-finish" aria-label="Practice tour summary"><span class="research-tour-eyebrow">PRACTICE TOUR FINISHED</span><strong>${p.completed.length} actions completed${p.skipped.length?' · '+p.skipped.length+' skipped':''}</strong><p>Your practice work is saved. This measures tutorial actions, not research quality or scientific validation.</p><div>${button('Review the route','checklist','quiet')}${button('Dismiss','dismiss','quiet')}</div>${p.showChecklist?checklist(p):''}</aside>`;return;
    }
    if(p.status==='paused'||p.minimized){clearHighlight();el.innerHTML=`<aside class="research-tour-mini" aria-label="Research workflow practice"><span><strong>${p.status==='paused'?'Practice paused':'Guided practice'}</strong><small>Step ${p.step+1} of ${steps.length} · ${esc(step.title)}</small></span>${button(p.status==='paused'?'Resume':'Expand',p.status==='paused'?'resume':'expand','primary')}</aside>`;return;}
    const destination=currentDestination(step,ctx,w),count=p.completed.length+p.skipped.length;
    el.innerHTML=`<aside class="research-tour-coach" aria-label="Research workflow practice" data-placement="bottom"><div class="research-tour-top"><span class="research-tour-eyebrow">GUIDED PRACTICE · ${p.step+1}/${steps.length}</span><div>${button('−','minimize','icon')}${button('Pause','pause','quiet')}</div></div><div class="research-tour-meter" aria-hidden="true"><span style="width:${Math.round(count/steps.length*100)}%"></span></div><h2>${esc(step.title)}</h2><p>${esc(step.text)}</p><div class="research-tour-task ${done?'done':''}" role="status"><span aria-hidden="true">${done?'✓':'○'}</span><span>${done?'Action completed. Ready to continue.':esc(step.task)}</span></div>${button(esc(destination.label),'goto','destination')}<div class="research-tour-controls">${button('Back','back','quiet',p.step===0)}${button('Skip this step','skip','quiet')}${button(p.step===steps.length-1?'Finish practice':'Continue','next','primary',!done)}</div><div class="research-tour-bottom"><span>${p.completed.length} completed${p.skipped.length?' · '+p.skipped.length+' skipped':''}</span>${button(p.showChecklist?'Hide route':'View route','checklist','quiet')}</div>${p.showChecklist?checklist(p):''}<small class="research-tour-disclosure">Prepared sample · No AI calls or token charges</small></aside>`;
    applyHighlight(step,ctx,w);
  }
  function checklist(p){return `<ol class="research-tour-checklist" aria-label="Practice route">${steps.map((step,i)=>`<li class="${p.completed.includes(step.id)?'complete':p.skipped.includes(step.id)?'skipped':i===p.step?'current':''}"><span aria-hidden="true">${p.completed.includes(step.id)?'✓':p.skipped.includes(step.id)?'–':i+1}</span><span>${esc(step.title)}</span><small>${p.completed.includes(step.id)?'Done':p.skipped.includes(step.id)?'Skipped':i===p.step?'Current':''}</small></li>`).join('')}</ol>`;}
  function onRender(){
    if(!bridge||refreshing)return;
    refreshing=true;
    try{
      const ctx=context(),p=progress(),w=workspace();
      if(p&&p.status==='active'&&ctx.view==='studio'&&typeof w.activeStage==='string'&&!p.visitedStages.includes(w.activeStage)){
        p.visitedStages.push(w.activeStage);save();
      }
      render();
    }finally{refreshing=false;}
  }
  function navigateStep(){
    const p=progress();if(!p||p.status!=='active')return;
    const step=steps[p.step];
    if(step.id==='map')bridge.navigate?.('map');
    else if(step.stage){const w=workspace();w.sideTab=step.id==='data'?'context':'output';bridge.openStage?.(step.stage);}
    else if(step.view)bridge.navigate?.(step.view);
    onRender();
  }
  function start(){
    if(!bridge)return;
    bridge.close?.();
    const html=`<div class="research-tour-start"><span class="research-tour-eyebrow">HANDS-ON PRODUCT TOUR</span><p class="research-tour-start-lead">Build a paper through its agent workspaces.</p><p>Work through a separate Cellular Blockchain practice project: scope the question, pass evidence between agents, review a section, approve a reference and export the manuscript.</p><ul><li>Your existing projects stay separate.</li><li>Every step uses the real interface and saves your actions.</li><li>Responses are prepared examples. No AI or experiment runs.</li></ul><p class="research-tour-start-note">About 8–12 minutes · Pause, resume or skip a step at any time.</p><div class="actions">${button('Start or resume practice','begin','primary')}${button('Create a fresh practice','restart','quiet')}${button('Keep working','dismiss-start','quiet')}</div></div>`;
    if(bridge.modal)bridge.modal('Explore the full research workflow',html);
    else{const el=root();el.innerHTML=`<dialog id="researchTourStartDialog" class="research-tour-start-dialog"><h2>Explore the full research workflow</h2>${html}</dialog>`;document.getElementById('researchTourStartDialog')?.showModal?.();}
  }
  async function begin(restart=false){
    if(!bridge||busy)return;
    busy=true;
    try{
      bridge.close?.();document.getElementById('researchTourStartDialog')?.close?.();
      await bridge.openPracticeProject?.({restart});
      const ctx=context();
      if(!inPractice(ctx)||!record(ctx.research)){bridge.toast?.('Open a separate practice project to start the tour.');return;}
      const existing=normalize(ctx.research.processTour);
      if(!restart&&['active','paused'].includes(existing.status)&&existing.projectId===ctx.project.id){existing.status='active';existing.minimized=false;ctx.research.processTour=existing;}
      else if(!restart&&existing.status==='completed'){ctx.research.processTour=existing;existing.minimized=false;existing.showChecklist=true;existing.dismissed=false;save();render();return;}
      else ctx.research.processTour={...defaults(),status:'active',projectId:ctx.project.id,baselineDraft:String(ctx.draft?.text||''),baselineQuestion:String(ctx.research.question||''),startedAt:new Date().toISOString()};
      save();navigateStep();
    }catch{bridge.toast?.('The practice project could not be opened. Your existing work was not changed.');}
    finally{busy=false;}
  }
  async function resume(){
    const p=progress();
    if(p&&['active','paused'].includes(p.status)){p.status='active';p.minimized=false;save();navigateStep();}
    else await begin(false);
  }
  function pause(){const p=progress();if(!p||p.status!=='active')return;p.status='paused';save();render();}
  function advance(skip=false){
    const ctx=context(),p=progress();if(!p||p.status!=='active')return;
    const step=steps[p.step],done=canAdvance(step,ctx,workspace(),p);
    if(!skip&&!done)return;
    if(skip){if(!p.completed.includes(step.id)&&!p.skipped.includes(step.id))p.skipped.push(step.id);}
    else{p.skipped=p.skipped.filter(id=>id!==step.id);if(!p.completed.includes(step.id))p.completed.push(step.id);}
    if(p.step===steps.length-1){p.status='completed';p.dismissed=false;p.finishedAt=new Date().toISOString();save();render();return;}
    p.step++;p.minimized=false;save();navigateStep();
  }
  function recordExport(filename){
    const p=progress();if(!p||!['active','paused'].includes(p.status)||typeof filename!=='string'||!filename.trim())return;
    const safeName=filename.slice(0,180);if(!p.exportedFiles.includes(safeName))p.exportedFiles.push(safeName);
    p.exportedFiles=p.exportedFiles.slice(-20);save();schedule();
  }
  function init(adapter){
    bridge=adapter;
    if(!listening){
      listening=true;
      document.addEventListener('click',event=>{
        const button=event.target.closest?.('[data-research-tour-action]');if(!button||button.disabled)return;
        const action=button.dataset.researchTourAction,p=progress();
        if(action==='start')start();
        else if(action==='begin')begin(false);
        else if(action==='restart')begin(true);
        else if(action==='resume')resume();
        else if(action==='dismiss-start'){bridge.close?.();document.getElementById('researchTourStartDialog')?.close?.();render();}
        else if(action==='pause')pause();
        else if(action==='next')advance(false);
        else if(action==='skip')advance(true);
        else if(action==='back'&&p&&p.step>0){p.step--;p.minimized=false;save();navigateStep();}
        else if(action==='minimize'&&p){p.minimized=true;save();render();}
        else if(action==='expand'&&p){p.minimized=false;save();render();}
        else if(action==='checklist'&&p){p.showChecklist=!p.showChecklist;save();render();}
        else if(action==='dismiss'&&p){p.dismissed=true;save();render();}
        else if(action==='goto'&&p){const destination=currentDestination(steps[p.step],context(),workspace());if(destination.export)bridge.openExportMenu?.();else if(destination.stage)bridge.openStage?.(destination.stage);else if(destination.view)bridge.navigate?.(destination.view);onRender();}
      });
      document.addEventListener('pherogent:workspace-change',schedule);
      document.addEventListener('input',schedule);
      document.addEventListener('change',schedule);
    }
    const ctx=context();if(inPractice(ctx)&&ctx.research?.processTour)ctx.research.processTour=normalize(ctx.research.processTour);
    onRender();
  }
  window.PherogentResearchTour={init,start,resume,pause,render,onRender,afterRender:onRender,recordExport,steps,canAdvance,normalize};
})();
