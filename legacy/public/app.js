'use strict';
(() => {
const D=window.PHEROGENT_DATA, C=window.PHEROGENT_CELL_DEMO, R=window.PherogentResearch, T=window.PherogentTutorial, A=window.PherogentAgent, S=window.PherogentStudio, M=window.PherogentMap, U=window.PherogentMeter, P=window.PherogentResearchTour, E=window.PherogentEvidence, L=window.PherogentLeeStudy, W=window.PherogentStudyWorkflows, O=window.PherogentOutputs, X=window.PherogentDataLab, KEY='pherogent-evidence-workspace-v2';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action,arg='',cls='btn')=>`<button type="button" class="${cls}" data-action="${action}" data-arg="${esc(arg)}">${label}</button>`;
const safeURL=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:'';}catch{return '';}};
const link=(label,url)=>safeURL(url)?`<a class="inline-link" href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
const uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const matchQuote=(q,t)=>!!q?.trim()&&String(t).replace(/\s+/g,' ').includes(q.trim().replace(/\s+/g,' '));
// A lexical convenience only: these terms neither assess support nor invoke AI.
const STOP_WORDS=new Set(('what which who whom whose where when why how whether far take us a an the and or but if then than so as at by for from in into of on onto to with without within through during before after over under between among about is are was were be been being can could may might must should would will do does did has have had it its this that these those they their we our you your i my not no also very more most less much many some such any all each both other show shows showed shown found find suggests suggest suggested suggestive demonstrate demonstrates demonstrated report reports reported study studies result results evidence significantly significant associated association').split(' '));
function keywordTerms(text){return [...new Set((String(text||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>1&&!STOP_WORDS.has(t)&&!/^[\p{N}]+$/u.test(t)))];}
function suggestedQuery(text){return keywordTerms(text).slice(0,8).join(' ').slice(0,300);}
function quoteOverlap(sentence,quote){
 const claimTerms=keywordTerms(sentence),quoteTerms=keywordTerms(quote);
 const singular=t=>t.length>4&&t.endsWith('s')&&!/(ss|us|is)$/.test(t)?t.slice(0,-1):t;
 const available=new Set(quoteTerms.map(singular));const shared=claimTerms.filter(t=>available.has(singular(t)));
 return {low:claimTerms.length>0&&(shared.length===0||claimTerms.length>=5&&shared.length/claimTerms.length<0.2),shared,claimTerms,quoteTerms};
}
const demos=()=>[1,0,2].map(i=>({id:'demo-'+i,scenario:i,original:D.scenarios[i].claim,text:D.scenarios[i].claim,candidate:D.scenarios[i].preferred_paper_id||'MED:27984723',decision:null,manual:null}));
const initial=()=>({version:2,layoutVersion:1,productVersion:1,onboardingSeen:false,activeProjectId:'project-main',projectMeta:{id:'project-main',isSample:false},projects:[],mode:'draft',view:'overview',research:R.defaults(),demo:demos(),draft:{title:'Untitled project',text:'',baseText:'',claims:[]},selected:{demo:'demo-1',draft:null},papers:{},logs:[],legacy:null});
let state=initial(),storageOK=true,search={query:'',loading:false,error:'',papers:[],total:null},controller=null,sequence=0,pendingImport=null,searchContext='',pendingApproval=null,introOpen=false;
function oldWriting(old){return ['Summary','Introduction','Results','Discussion','Methods','Extended data'].map(s=>{const entries=s==='Introduction'&&Array.isArray(old.entries)?old.entries.map(e=>String(e.text||'')).join('\n\n'):'';const notes=typeof old.notes?.[s]==='string'?old.notes[s]:'';return entries||notes?'## '+s+'\n\n'+[entries,notes].filter(Boolean).join('\n\n'):'';}).filter(Boolean).join('\n\n');}
const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const nullableString=x=>x==null||typeof x==='string';
function validClaim(c,draft){return record(c)&&['id','original','text'].every(k=>typeof c[k]==='string')&&nullableString(c.candidate)&&(c.scenario===undefined||Number.isInteger(c.scenario)&&c.scenario>=0&&c.scenario<D.scenarios.length)&&(!draft||Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.start>=0&&c.end>=c.start)&&(c.decision==null||record(c.decision)&&['apply','keep','flag'].includes(c.decision.type)&&typeof c.decision.before==='string'&&typeof c.decision.after==='string'&&nullableString(c.decision.paperId))&&(c.manual==null||record(c.manual)&&['quote','revision','note'].every(k=>typeof c.manual[k]==='string')&&['unreviewed','supports','partial','conflicting','unsupported'].includes(c.manual.verdict));}
function validSaved(s){return record(s)&&s.version===2&&Array.isArray(s.demo)&&s.demo.length===3&&s.demo.every(c=>validClaim(c,false)&&c.scenario!==undefined)&&record(s.draft)&&['title','text','baseText'].every(k=>typeof s.draft[k]==='string')&&Array.isArray(s.draft.claims)&&s.draft.claims.every(c=>validClaim(c,true))&&Array.isArray(s.logs)&&s.logs.every(l=>record(l)&&['type','detail','at'].every(k=>typeof l[k]==='string'))&&record(s.papers)&&Object.values(s.papers).every(p=>record(p)&&typeof p.id==='string'&&typeof p.title==='string'&&Array.isArray(p.authors)&&p.authors.every(a=>typeof a==='string'));}
let recoveryNotice=false;
try{
 const raw=localStorage.getItem(KEY);let saved=null;
 try{saved=JSON.parse(raw||'null');}catch{state.recovery=raw;recoveryNotice=true;}
 if(validSaved(saved)){state={...initial(),...saved};state.selected={...initial().selected,...(record(saved.selected)?saved.selected:{})};state.logs=saved.logs.slice(0,250);state.research=R.normalize(saved.research);if(saved.layoutVersion!==1||saved.productVersion!==1){state.view='overview';state.mode='draft';}state.layoutVersion=1;state.productVersion=1;}
 else{
  if(raw&&!state.recovery){state.recovery=raw;recoveryNotice=true;}
  const old=JSON.parse(localStorage.getItem('pherogent-workspace-reference-v1')||'null');
  if(old?.version===1){state.legacy=old;const text=oldWriting(old);if(text)state.draft={title:typeof old.title==='string'?old.title:'Recovered manuscript',text,baseText:'',claims:[]};}
 }
}catch{storageOK=false;}

const clone=x=>JSON.parse(JSON.stringify(x));
function validProject(p){return record(p)&&typeof p.id==='string'&&p.id.length>0&&record(p.meta)&&typeof p.meta.isSample==='boolean'&&validSaved({...initial(),...p});}
if(typeof state.activeProjectId!=='string'||!state.activeProjectId)state.activeProjectId='project-main';
state.projectMeta={...(record(state.projectMeta)?state.projectMeta:{}),id:state.activeProjectId,isSample:state.projectMeta?.isSample===true};
const seenProjects=new Set([state.activeProjectId]),badProjects=[];
if(!Array.isArray(state.projects)){if(state.projects!=null)badProjects.push(state.projects);state.projects=[];}
state.projects=state.projects.filter(p=>{if(!validProject(p)||seenProjects.has(p.id)){badProjects.push(p);return false;}seenProjects.add(p.id);p.research=R.normalize(p.research);return true;});
if(badProjects.length)state.projectRecovery=[...(Array.isArray(state.projectRecovery)?state.projectRecovery:[]),...badProjects];
state.onboardingSeen=state.onboardingSeen===true;
state.tutorial=T?.normalize?T.normalize(state.tutorial):{version:1,status:'idle',step:0,projectId:null,returnProjectId:null};
let tutorialRefreshPending=false,processTourRefreshPending=false;
function refreshTutorialSoon(){if(!T?.refresh||tutorialRefreshPending)return;tutorialRefreshPending=true;setTimeout(()=>{tutorialRefreshPending=false;T.refresh();},0);}
function projectSnapshot(){return {id:state.activeProjectId,meta:clone(state.projectMeta),draft:clone(state.draft),research:clone(state.research),papers:clone(state.papers),logs:clone(state.logs),selectedDraft:state.selected.draft};}
function projectList(){return [projectSnapshot(),...state.projects];}
function activateProject(next){
 const previous=projectSnapshot();
 state.projects=[...state.projects.filter(p=>p.id!==next.id&&p.id!==previous.id),previous];
 state.activeProjectId=next.id;state.projectMeta=clone(next.meta);state.draft=clone(next.draft);state.research=R.normalize(clone(next.research));state.papers=clone(next.papers);state.logs=clone(next.logs);state.selected.draft=next.selectedDraft||null;X?.onProjectChange?.(next.id);
 state.mode='draft';state.view=M?'map':S?'studio':'overview';state.onboardingSeen=true;pendingImport=null;clearSearch();close();render();
}
function switchProject(id){if(id===state.activeProjectId){close();return;}const next=state.projects.find(p=>p.id===id);if(next)activateProject(next);}
function blankProject(title,question=''){const id='project-'+uid();return {id,meta:{id,isSample:false,createdAt:new Date().toISOString()},draft:{title,text:'',baseText:'',claims:[]},research:{...R.defaults(),question},papers:{},logs:[],selectedDraft:null};}
function showNewProject(){close();modal('New research project',`<form id="newProjectForm"><label class="field">Project name<input id="newProjectTitle" required maxlength="180" placeholder="e.g. Reprogramming and visual recovery"></label><label class="field">Research question <span class="subtle">optional</span><textarea id="newProjectQuestion" rows="3" maxlength="2000" placeholder="What would you like to investigate?"></textarea></label><div class="actions"><button type="submit" class="btn primary">Create project</button>${btn('Cancel','close','','btn')}</div></form><p class="subtle">Stored in this browser. Your existing projects are kept separately.</p>`);}
function createProject(){const title=$('newProjectTitle').value.trim();if(!title){toast('Give your project a name.');$('newProjectTitle').focus?.();return;}activateProject(blankProject(title.slice(0,180),$('newProjectQuestion').value.trim()));log('Project created','Author created a new local research project.');save();}
function showProjects(){modal('Your projects',`<div class="project-picker">${projectList().map(p=>`<button type="button" class="project-choice${p.id===state.activeProjectId?' active':''}" data-action="switch-project" data-arg="${esc(p.id)}"><strong>${esc(p.draft.title||'Untitled project')}</strong><span>${p.meta.isTutorial?'Practice project':p.meta.isSample?'Editable sample':'Research project'} · ${Object.keys(p.papers).length} sources${p.id===state.activeProjectId?' · Current':''}</span></button>`).join('')}</div><div class="actions">${btn('+ New project','new-project','','btn primary')}${btn('Open sample project','open-sample','','btn')}${btn('Close','close','','btn')}</div><p class="subtle">Projects are saved on this browser, not shared between testers.</p>`);}
function openSample(){
 const existing=projectList().find(p=>p.meta.isSample&&p.meta.sampleVersion===C.version);if(existing){switchProject(existing.id);state.mode='draft';state.onboardingSeen=true;close();render();return;}
 const next=blankProject('Cellular Blockchain · Reversal',C.question);next.meta.isSample=true;next.meta.sampleVersion=C.version;next.research=R.sampleResearch();
 next.papers=Object.fromEntries(C.paperIds.map(id=>[id,{...clone(D.papers[id]),id,prepared:true}]));next.research.savedSources=C.paperIds.slice();
 let text=C.manuscriptIntro;const spans=[];
 for(const i of C.scenarioIndices){const scenario=D.scenarios[i],start=text.length;const c={id:'sample-'+uid(),scenario:i,original:scenario.claim,text:scenario.claim,candidate:scenario.preferred_paper_id||C.paperIds[0],decision:null,manual:null,start,end:start+scenario.claim.length};spans.push(c);text+=c.text+'\n\n';}
 text+=C.manuscriptDiscussion;
 next.draft={title:next.draft.title,text,baseText:text,claims:spans};next.selectedDraft=spans[0]?.id||null;
 activateProject(next);log('Sample project opened','Cellular Blockchain v1.1 teaching adaptation. Review sentences include deliberate overclaims; hypotheses and proposed tests are not findings. No AI or experiment ran.');save();
}
function showIntro(){const resume=['active','paused'].includes(state.tutorial.status);modal('Welcome to Pherogent',`<div class="welcome-art" aria-hidden="true"><span class="welcome-orbit"></span><span class="welcome-symbol">p</span><span class="welcome-chip">Question</span><span class="welcome-chip">Evidence</span><span class="welcome-chip">Discovery</span></div><span class="eyebrow">YOUR RESEARCH, CONNECTED</span><p class="intro-lead">Make your next idea a well-supported one.</p><p>Keep your question, papers, notes and manuscript together. Learn by doing a short practice project, then make the workspace your own.</p><div class="welcome-tour"><div><strong>${resume?'Pick up where you left off':'Explore cellular reversal'}</strong><span>Cellular Blockchain practice · about 3 minutes · your work stays separate</span></div>${btn(resume?'Continue tutorial':'Start interactive tour','start-tutorial','','btn primary')}</div><div class="intro-features"><p><strong>Collect</strong><span>Find and keep useful papers.</span></p><p><strong>Connect</strong><span>Turn reading into research notes.</span></p><p><strong>Write</strong><span>Check evidence before you cite.</span></p></div><div class="actions">${btn('Create a project','new-project','','btn')}${btn('Open sample project','open-sample','','btn')}${btn('Explore on my own','dismiss-intro','','btn ghost')}${state.tutorial.projectId?btn('Restart tutorial','restart-tutorial','','btn ghost'):''}</div><p class="welcome-footnote">Saved in this browser. The prepared tutorial uses no AI. Investigate sends selected text only after your consent.</p>`);introOpen=true;}
function addTask(){const input=$('taskText'),text=input.value.trim();if(!text)return;if(state.research.tasks.length>=100){toast('Keep up to 100 tasks in a project.');return;}state.research.tasks.push({id:uid(),text:text.slice(0,240),done:false});log('Task added',text);render();$('taskText')?.focus?.();}
function sourceToNotebook(id){const p=state.papers[id];if(!p)return;const note=state.research.sourceNotes[id]?.note||'';const addition='### '+p.title+'\n\n'+(note||'Source saved for review. Add your interpretation here.')+'\n\nSource: '+(safeURL(p.url)||safeURL('https://doi.org/'+p.doi));if(state.research.analysisNotes.includes(addition)){toast('This source note is already in your notebook.');return;}if(state.research.analysisNotes.length+addition.length>20000){toast('This would exceed the notebook size limit. Export or shorten your notes first.');return;}state.research.analysisNotes=[state.research.analysisNotes,addition].filter(Boolean).join('\n\n');state.view='analysis';if(state.projectMeta.isTutorial){const task=state.research.tasks.find(x=>x.id==='practice-paper');if(task)task.done=true;}log('Source note added to notebook','Author copied a source and note into the notebook; no scientific assessment was made.',{paperId:id});render();}

const VIEWS=['map','usage','studio','overview','plan','literature','analysis','manuscript','review','sources','activity','study-explorer','study-workflows','outputs','data-analysis'];
if(!['demo','draft'].includes(state.mode))state.mode='draft';if(!VIEWS.includes(state.view))state.view='overview';
// Add the new studio without changing saved project data or citation decisions.
if(S&&state.studioLayoutVersion!==1){state.studioLayoutVersion=1;state.view='studio';}
if(M&&state.researchMapLayoutVersion!==1){state.researchMapLayoutVersion=1;state.view='map';}
const studyDeepLink=(!!X&&window.location?.hash==='#data-analysis')||(!!L&&window.location?.hash==='#study-explorer')||(!!W&&window.location?.hash==='#study-workflows');
if(studyDeepLink)state.view=window.location.hash.slice(1);
const claims=()=>state.mode==='demo'?state.demo:state.draft.claims;
const current=()=>claims().find(c=>c.id===state.selected[state.mode])||claims()[0];
const paper=id=>D.papers[id]?{...D.papers[id],...state.papers[id]}:state.papers[id];
const author=p=>p?.authors?.[0]?p.authors[0].replace(/\s+[A-Z]+$/,'')+(p.authors.length>1?' et al.':''):'Authors not supplied';
const abstract=p=>p?.agentSourceText||p?.abstract||p?.evidence_excerpt||'';
const stale=()=>state.mode==='draft'&&state.draft.text!==state.draft.baseText;
const citationCurrent=c=>c.decision?.type==='apply'&&c.decision.after===c.text&&!stale()&&(!c.decision.sourceSnapshot||!E||c.decision.sourceSnapshot===E.sourceSnapshot(paper(c.decision.paperId)));
const cited=()=>[...new Set(claims().filter(citationCurrent).map(c=>c.decision.paperId).filter(id=>paper(id)))];
const marker=c=>{const n=cited().indexOf(c.decision?.paperId);return citationCurrent(c)&&n>=0?' ['+(n+1)+']':'';};
function log(type,detail,extra={}){state.logs.unshift({id:uid(),at:new Date().toISOString(),mode:state.mode,actor:'Author',type,detail,...extra});state.logs=state.logs.slice(0,250);}
function save(skipTutorial=false){try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;}catch{storageOK=false;}if($('saveStatus'))$('saveStatus').textContent=storageOK?'All changes saved in this browser':'Storage unavailable · export before closing';if(!skipTutorial)refreshTutorialSoon();if(P&&!processTourRefreshPending){processTourRefreshPending=true;setTimeout(()=>{processTourRefreshPending=false;P.onRender?.();},0);}}
function toast(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function modal(title,html){$('dialogTitle').textContent=title;$('dialogContent').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();refreshTutorialSoon();}
function close(){if(introOpen){introOpen=false;state.onboardingSeen=true;save();}pendingApproval=null;if($('dialog').open)$('dialog').close();refreshTutorialSoon();}
function clearSearch(){controller?.abort();sequence++;searchContext='';search={query:'',loading:false,error:'',papers:[],total:null};}
function ensureSearchQuery(){const c=current(),project=state.view==='literature',text=project?(state.mode==='demo'?R.demoQuestion:state.research.question):c?.text,context=JSON.stringify([state.mode,project?'project':'claim',project?'':c?.id,text]);if(context!==searchContext){clearSearch();searchContext=context;search.query=suggestedQuery(text);}}
// Preserve the actual inputs and buttons: replacing them during blur loses the click/focus.
function syncDraftUI(){
 if(state.mode!=='draft')return;
 const changed=stale()&&state.draft.claims.length>0;
 if($('documentTitle'))$('documentTitle').textContent=state.draft.title;
 if($('projectLabel'))$('projectLabel').textContent=state.draft.title||'Untitled research project';
 if($('draftInputSummary'))$('draftInputSummary').textContent='Manuscript input'+(changed?' · changed since last review':'');
 if($('draftReviewNotice'))$('draftReviewNotice').hidden=!changed;
 if($('reviewResults'))$('reviewResults').hidden=changed;
 if(E&&$('evidenceInbox'))$('evidenceInbox').innerHTML=inboxContentHTML();
 if(changed&&search.loading){
  controller?.abort();sequence++;search={...search,loading:false,error:'Search stopped because the paragraph changed.',papers:[],total:null};
  if($('searchSubmit')){$('searchSubmit').disabled=false;$('searchSubmit').textContent='Search papers';}
  if($('searchResults'))$('searchResults').innerHTML=resultsHTML();
 }
}

function assessment(c){
 if(stale())return {kind:'stale',label:'Draft changed',reason:'Prepare the updated sentences before reviewing this version.'};
 if(c.manual)return {kind:c.manual.verdict||'unreviewed',label:c.manual.verdict==='unreviewed'?'Not reviewed':c.manual.aiGenerated?'AI suggestion · review required':'Author assessment',reason:c.manual.aiGenerated?'AI supplied a suggested assessment. Inspect the retrieved passage before making your own decision.':'Your judgment, based on the source you inspect.'};
 if(c.scenario!==undefined){if(c.text!==c.original&&c.text!==c.decision?.after)return {kind:'stale',label:'Wording changed',reason:'The prepared assessment applies only to the original example sentence.'};const s=D.scenarios[c.scenario],e=s.evidence.find(x=>x.paper_id===c.candidate);return {kind:e?.fit==='supports'?'supports':e?.fit==='partial'?'partial':'unsupported',label:e?.fit==='supports'?'Matching evidence':e?.fit==='partial'?'Narrower wording needed':'Not supported by this source',reason:e?.explanation||s.short_reason,prepared:true,s};}
 return {kind:'unreviewed',label:'Not reviewed',reason:'Find a source and inspect its evidence. Scientific support is assessed by you in this version.'};
}
const status=c=>stale()?'Draft changed · recheck':c.decision?.sourceSnapshot&&E&&c.decision.sourceSnapshot!==E.sourceSnapshot(paper(c.decision.paperId))?'Source changed · recheck':c.decision?.type==='apply'?'Approved by author':c.decision?.type==='keep'?'Original kept · concern remains':c.decision?.type==='flag'?'Manual review needed':assessment(c).label;
function manualEvidenceCurrent(c){
 if(!c?.manual?.evidenceRunId||!E)return true;
 const run=(state.research.aiRuns||[]).find(r=>r.id===c.manual.evidenceRunId);
 return !!run&&E.freshness(run,state).fresh;
}
function claimControlsHTML(c){
 if(!c||state.mode!=='draft'||!A)return '';
 const completed=(state.research.aiRuns||[]).filter(r=>r.kind==='claim_check'&&r.claimContext?.claim?.id===c.id&&r.status==='completed').slice(-1)[0];
 return `<section class="evidence-check-controls"><div><span class="eyebrow">CHECK THIS EXACT SENTENCE</span><p>Inspect a selected source first, or find evidence in Europe PMC. Each new check requires your consent.</p></div><div class="actions">${!c.decision?btn('Check this sentence','check-sentence',c.id,'btn primary'):''}${completed?btn('Open saved check · no tokens','open-check',completed.id,'btn small'):''}</div>${c.decision?'<p class="subtle">Undo the decision before checking or changing this sentence again.</p>':''}</section>`;
}
function showClaimCheck(id){
 const c=state.draft.claims.find(c=>c.id===id);
 if(!c||stale()||c.decision){toast('Prepare the current sentences and undo any existing decision before starting a new check.');return;}
 if(c.text.length>2000){toast('Split this sentence into a claim of at most 2,000 characters.');return;}
 const choices=Object.values(state.papers).filter(p=>/^(MED:\d+|PMC:PMC\d+)$/.test(p.id)),selected=choices.some(p=>p.id===c.candidate)?c.candidate:'';
 modal('Check the original sentence',`<span class="eyebrow">ONE SENTENCE · AUTHOR CONTROLLED</span><blockquote class="source-passage">${esc(c.text)}</blockquote><label class="field">Evidence to check<select id="claimCheckSource"><option value="">Find evidence in Europe PMC</option>${choices.map(p=>`<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(p.title)}</option>`).join('')}</select></label><p class="subtle">Select the paper you cite or intend to cite. Its text is retrieved independently; selecting a saved paper does not establish support. Unrecognized references must be found and linked manually.</p><label class="agent-consent"><input type="checkbox" id="claimStudyDesign"><span><strong>Apply the study-design check (preview)</strong><br>Check whether a claim about the same cells over time fits the source methods. No additional AI calls.</span></label><p>Selected-source checks inspect that source only. A wider search is a separate, explicit choice.</p><div class="actions">${btn('Continue to consent','confirm-claim-check',c.id,'btn primary')}${btn('Cancel','close','','btn')}</div>`);
}
function startClaimCheck(id){
 const c=state.draft.claims.find(c=>c.id===id),sourceId=$('claimCheckSource')?.value||'';
 if(!c||stale()||c.decision||sourceId&&!state.papers[sourceId]){toast('The sentence or selected source changed. Open the check again.');return;}
 const ids=sourceId?[sourceId]:[],studyDesign=$('claimStudyDesign')?.checked===true,cached=E?.matchingRun(state,c,ids,studyDesign);
 const options={claim:{id:c.id,text:c.text},citedPaperIds:ids,...(studyDesign?{studyDesign:true}:{}),sourceSnapshots:Object.fromEntries(ids.map(id=>[id,E?.sourceSnapshot(state.papers[id])]))};
 close();
 if(cached){A?.showSaved(cached.id);toast('Opened the matching saved check. No new AI request was made.');return;}
 A?.show(options);
}
function designHTML(card){
 const d=E?.designInfo?.(card);if(!d)return '';
 return `<aside class="callout"><small>EXPERIMENTAL · STUDY DESIGN CHECKED BY CODE</small><p><strong>${esc(d.heading)}</strong></p>${card.reason===d.reason?'':'<p>'+esc(d.reason)+'</p>'}${d.changed?'<small>Initial AI suggestion: '+esc(d.modelLabel)+'. The design check limited the final assessment.</small>':''}</aside>`;
}
function inboxRunCoverageHTML(run,records){
 const cards=records.filter(c=>c.runId===run.id),sources=E.sourceOutcomes(run,state,cards),sentence=run.claimContext?.claim?.text||run.question||'Sentence check';
 if(!sources.length&&run.status==='completed'&&cards.length)return '';
 const c=state.draft?.claims.find(c=>c.id===run.claimContext?.claim?.id),current=state.mode==='draft'&&c&&!stale()&&c.text===run.claimContext.claim.text&&!c.decision;
 const gaps=sources.some(s=>s.state!=='matched'),next=current&&(gaps||!cards.length)?btn('Choose a source or search','check-sentence',c.id,'btn small'):'';
 if(!sources.length)return `<div class="evidence-record"><strong>${esc(sentence)}</strong><p>${run.status==='completed'?'No verified evidence card returned. Review the saved search and access limits.':'Check '+esc(run.status)+'. Your manuscript is unchanged; no automatic retry was made.'}</p><div class="actions">${btn('View run details','open-check',run.id,'btn small')}${next}</div></div>`;
 const matched=sources.filter(s=>s.state==='matched').length;
 return `<details class="source-coverage"${gaps?' open':''}><summary><span><small>Selected sources</small><strong>${esc(sentence)}</strong></span><span class="coverage-count">${matched} of ${sources.length} with a matched quote</span></summary><div class="coverage-body"><ul>${sources.map(s=>`<li><div><strong>${esc(s.title||s.id)}</strong>${s.title||s.paperId!==s.id?`<small>${esc(s.id)}${s.paperId!==s.id?' → '+esc(s.paperId):''}</small>`:''}</div><div><b>${esc(s.label)}</b><p>${esc(s.detail)}</p></div></li>`).join('')}</ul><p class="subtle">A quote match confirms the words appear in the source. You decide whether the passage supports your sentence.</p><div class="actions">${btn('View run details','open-check',run.id,'btn small')}${next}</div></div></details>`;
}
function inboxContentHTML(){
 if(!E)return '';
 const runs=(state.research.aiRuns||[]).filter(r=>r.kind==='claim_check'),records=E.records(state),filter=state.research.evidenceFilter||'all';
 const counts={awaiting_author:records.filter(r=>r.status==='awaiting_author').length,needs_recheck:records.filter(r=>r.status==='needs_recheck').length,approved:records.filter(r=>r.status==='approved').length};
 const labels=E.reviewLabels;
 const visible=records.filter(r=>filter==='all'||r.status===filter).slice().reverse();
 const coverage=filter==='all'?runs.slice().reverse().map(r=>inboxRunCoverageHTML(r,records)).join(''):'';
 return `<div class="evidence-inbox-bar"><div><span class="eyebrow">SENTENCE → SOURCE → DECISION</span><h2>Your evidence checks</h2><p class="subtle">Saved checks are free to reopen. Changes to the sentence or saved source require review again.</p></div>${runs.length?btn('Export evidence trail','export-evidence','','btn small'):''}</div><div class="evidence-inbox-stats"><span><strong>${counts.awaiting_author}</strong> waiting for you</span><span><strong>${counts.needs_recheck}</strong> need rechecking</span><span><strong>${counts.approved}</strong> approved</span></div>${runs.length?`<div class="evidence-filter" aria-label="Filter evidence checks">${[['all','All checks'],['awaiting_author','Waiting for you'],['needs_recheck','Needs rechecking'],['approved','Approved']].map(([value,label])=>`<button type="button" class="btn small ${filter===value?'primary':''}" data-action="inbox-filter" data-arg="${value}" aria-pressed="${filter===value}">${label}</button>`).join('')}</div>`:''}<div class="evidence-inbox-grid">${visible.map(r=>`<article class="evidence-record${r.fresh?'':' evidence-stale'}"><div class="evidence-record-head"><span class="status ${esc(r.evidence.label)}">${esc(E.labels[r.evidence.label])}</span><span class="evidence-provenance">${esc(labels[r.status])}</span></div><p><strong>${esc(r.claim)}</strong></p><blockquote class="source-passage">${esc(r.evidence.quote)}</blockquote><p class="subtle">${esc(r.paper.title)} · ${esc(r.evidence.location||'Inspected excerpt')}</p><p>${esc(r.evidence.reason)}</p>${designHTML(r.evidence)}${r.evidence.mismatchNotes?.length?`<p><strong>Mismatch:</strong> ${esc(r.evidence.mismatchNotes.join('; '))}</p>`:''}${r.evidence.suggestedWording?`<div class="callout"><strong>Suggested wording</strong><p>${esc(r.evidence.suggestedWording)}</p></div>`:''}<p class="subtle">${esc(r.reason)}</p><div class="actions">${r.fresh&&r.status==='awaiting_author'?btn('Review & decide','open-evidence',r.key,'btn primary'):''}${btn('View saved check','open-check',r.runId,'btn small')}${link('Open paper',r.paper.url)}</div>${r.status==='approved'?'<p class="subtle">Available under Context → Add input → Approved evidence in your writing workspaces.</p>':''}</article>`).join('')}</div>${!visible.length&&!coverage?`<div class="evidence-empty"><p>${!runs.length?'No AI sentence checks yet. Select a sentence below and choose “Check this sentence.” Prepared examples and manual review remain available.':'No evidence cards match this filter.'}</p></div>`:''}${coverage}`;
}
function inboxHTML(){return `<section id="evidenceInbox" aria-label="Evidence check inbox">${inboxContentHTML()}</section>`;}
function workspaceContext(){return {evidenceRecords:E?.records(state)||[],view:state.view,mode:state.mode,project:state.projectMeta,tutorial:state.tutorial,logs:state.logs,research:state.research,draft:state.draft,papers:state.mode==='demo'?Object.entries(D.papers).map(([id,p])=>({...p,id})):Object.values(state.papers),citationCount:cited().length,decisionsCount:claims().filter(c=>c.decision).length,claimCount:claims().length,searchHTML:state.view==='literature'?searchHTML():'',editorHTML:state.view==='manuscript'&&state.mode==='draft'?editorHTML(true):'',manuscriptText:manuscriptText()};}
let lastRenderedView='';
function render(){
 const viewChanged=lastRenderedView!==state.view;lastRenderedView=state.view;
 if(S)state.research.agentWorkspace=window.PherogentStudioData.normalize(state.research.agentWorkspace,workspaceContext());
 const items=[['overview','Workspace','◫'],['literature','Library','⌕'],['analysis','Notebook','▤'],['manuscript','Manuscript','▧'],['review','References','⌁']];
 $('navigation').innerHTML='<div class="nav-label">PROJECT</div>'+items.map(([v,label,icon])=>`<button type="button" class="nav-step${state.view===v?' active':''}" data-action="view" data-arg="${v}" ${state.view===v?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span><span class="navlabel">${label}</span>${v==='literature'?`<span class="nav-count">${Object.keys(state.papers).length}</span>`:''}</button>`).join('')+'<div class="nav-label nav-secondary">RECORD</div>'+btn('<span class="nav-icon" aria-hidden="true">◷</span><span class="navlabel">Activity</span>','view','activity','nav-step'+(state.view==='activity'?' active':''));
 if(S)$('navigation').innerHTML=S.nav(workspaceContext(),state.view);
 document.body?.classList?.toggle('studio-mode',state.view==='studio');
 document.body?.classList?.toggle('map-mode',state.view==='map');
 document.body?.classList?.toggle('usage-mode',state.view==='usage');
 if($('workspaceMode'))$('workspaceMode').innerHTML='';
 if($('projectLabel'))$('projectLabel').textContent=state.draft.title||'Untitled project';
 if($('projectContext'))$('projectContext').innerHTML=['study-explorer','study-workflows','data-analysis'].includes(state.view)?'':(state.projectMeta.sampleVersion===C.version||state.projectMeta.tutorialVersion===C.version)?'<span class="sample-badge">'+(state.projectMeta.isTutorial?'Practice project':'Editable sample')+'</span><span>Cellular Blockchain v1.1 · Hypotheses and proposed tests are not findings.</span>':state.projectMeta.isTutorial?'<span class="sample-badge">Practice project</span><span>Prepared teaching inputs. Your other projects stay separate.</span>':state.projectMeta.isSample?'<span class="sample-badge">Editable sample</span><span>Changes are saved to your copy. Review sentences include deliberate overclaims.</span>':'';
 M?.dispose?.();
 $('main').innerHTML=state.view==='data-analysis'&&X?X.render(workspaceContext()):state.view==='outputs'&&O?O.render(workspaceContext()):state.view==='study-workflows'&&W?W.render(workspaceContext()):state.view==='study-explorer'&&L?L.render():state.view==='map'&&M?M.render(workspaceContext()):state.view==='usage'&&U?U.render(workspaceContext()):state.view==='studio'&&S?S.render(workspaceContext()):state.view==='review'?reviewHTML():state.view==='sources'?sourcesHTML():state.view==='activity'?activityHTML():R.render(state.view,workspaceContext());save();S?.afterRender();if(state.view==='data-analysis')X?.afterRender?.();if(state.view==='outputs')O?.afterRender?.();if(state.view==='map')M?.afterRender?.();if(state.view==='usage')U?.afterRender?.();if(state.view==='study-explorer')L?.afterRender?.();if(state.view==='study-workflows')W?.afterRender?.();P?.onRender?.();if(viewChanged){window.scrollTo?.(0,0);$('main')?.scrollTo?.(0,0);}
}
function reviewHTML(){const rows=claims(),c=current();return `<div class="page"><div class="page-head"><div><span class="eyebrow">EVIDENCE REVIEW</span><h1>Evidence inbox</h1><p class="muted">Check your sentences. Resolve evidence gaps. Keep every decision connected.</p></div>${btn('Open manuscript','view','manuscript','btn')}</div>
 <div class="disclosure">${state.mode==='demo'?'<strong>Prepared example</strong><span>Three real papers. Assessments are prepared; no AI is running.</span>':'<strong>Author review</strong><span>Exact-quote matching is automatic. Scientific judgments and edits stay under your control.</span>'}</div>
 ${state.mode==='draft'?editorHTML()+inboxHTML():''}${state.legacy&&state.mode==='demo'?`<p class="subtle">Your earlier workspace is preserved. ${btn('Open earlier writing','legacy','','btn small ghost')}</p>`:''}
 ${rows.length?`<div id="reviewResults" ${stale()?'hidden':''}><div class="section-head"><span class="eyebrow">REVIEW QUEUE</span><span class="counts">${rows.filter(x=>x.decision).length} of ${rows.length} decisions recorded</span></div><div class="queue">${rows.map((x,i)=>`<button type="button" class="issue-chip${x.id===c?.id?' active':''}" data-action="select" data-arg="${esc(x.id)}" aria-pressed="${x.id===c?.id}"><span class="claim-number">${i+1}</span><span>${esc(state.mode==='demo'?['Narrow the wording','Add a reference','Evidence missing'][i]:x.text.slice(0,65)+(x.text.length>65?'…':''))}<small>${esc(status(x))}</small></span></button>`).join('')}</div><div class="workspace"><section class="manuscript-panel" aria-label="Manuscript">${manuscriptHTML()}</section><aside class="evidence-panel" aria-label="Selected claim evidence">${claimControlsHTML(c)}${evidenceHTML(c)}</aside></div></div>`:'<div class="empty-state"><h2>Start with one paragraph.</h2><p>Paste your writing above, then prepare up to five sentences for review.</p><p class="subtle">Preparing sentences organizes your text. It does not judge scientific accuracy.</p></div>'}
 <details class="activity"><summary>How the review works</summary><div class="info-grid"><div><strong>1. Choose a sentence</strong><p>Keep the population, intervention and outcome precise.</p></div><div><strong>2. Inspect the source</strong><p>A matching passage and a valid paper are separate from scientific support.</p></div><div><strong>3. Make a decision</strong><p>Add a citation, revise the wording, or leave the question open.</p></div></div><p class="subtle">Sample findings are prepared. Your source judgments are author-led. Use Investigate to request a bounded AI check; it never starts from this review screen automatically.</p></details></div>`;}
function editorHTML(forceOpen=false){return `<details class="draft-editor" ${forceOpen||!state.draft.claims.length||stale()?'open':''}><summary id="draftInputSummary">Manuscript input${stale()&&state.draft.claims.length?' · changed since last review':''}</summary><label class="field">Document title<input id="draftTitle" maxlength="180" value="${esc(state.draft.title)}"></label><label class="field">Manuscript text<textarea id="draftText" rows="12" maxlength="12000" placeholder="Start writing, paste a draft, or import a text file…">${esc(state.draft.text)}</textarea></label><p id="draftReviewNotice" class="subtle" role="status" ${stale()&&state.draft.claims.length?'':'hidden'}>Your paragraph changed. Prepare the sentences again before using earlier evidence decisions.</p><div class="actions">${btn('Prepare sentences for review','prepare','','btn primary')}${btn('Import .txt or .md','import-text','','btn')}<input id="textFile" type="file" accept=".txt,.md,text/plain,text/markdown" hidden></div><p class="subtle">Reviews up to five sentences per pass. Your draft is saved in this browser. Manual search queries go to Europe PMC; Investigate sends selected text to OpenAI only after your consent.</p></details>`;}
function manuscriptHTML(){const c=current();return `<div class="section-head"><span class="eyebrow">${state.mode==='demo'?'ILLUSTRATIVE MANUSCRIPT':'YOUR MANUSCRIPT'}</span><span class="scope-label">${state.mode==='demo'?'Example text':'Author controlled'}</span></div><h2 id="documentTitle" class="document-title">${esc(state.mode==='demo'?'Epigenetic reprogramming and tissue recovery':state.draft.title)}</h2><p class="subtle">${state.mode==='demo'?'Three example sentences · not findings from your manuscript':'Selected sentences · other text is preserved in your export'}</p>${claims().map((x,i)=>`<article class="claim-row${x.id===c?.id?' active':''}${x.decision?' reviewed':''}"><button type="button" class="claim-text" data-action="select" data-arg="${esc(x.id)}" aria-pressed="${x.id===c?.id}"><span class="claim-number">${i+1}</span><span>${esc(x.text)}${esc(marker(x))}</span></button><div class="claim-meta"><span class="status ${esc(assessment(x).kind)}">${esc(status(x))}</span>${btn('Edit sentence','edit',x.id,'btn small ghost')}</div></article>`).join('')}${cited().length?`<div class="reference-list"><span class="eyebrow">APPROVED REFERENCES</span>${cited().map((id,i)=>{const p=paper(id);return `<p>[${i+1}] ${esc(author(p))} (${esc(p.year)}). ${esc(p.title.replace(/\.+$/,''))}. ${link('Source',p.url||'https://doi.org/'+p.doi)}</p>`;}).join('')}</div>`:'<p class="subtle">A reference appears here only after you approve it.</p>'}`;}
function sourceCard(p,quote,prepared){if(!p)return '';return `<div class="source-card"><div class="section-head"><strong>${esc(author(p))} · ${esc(p.year)}</strong><span class="scope-label">${prepared?'Prepared abstract excerpt':p.agentSourceText?'Inspected '+(p.access==='full_text'?'full-text excerpts':'abstract'):p.abstract?'Abstract available':'Metadata only'}</span></div><h3 class="source-title">${esc(p.title)}</h3><p class="source-meta">${esc(p.journal)}${p.doi?' · DOI '+esc(p.doi):''}</p>${quote?`<blockquote class="source-passage">“${esc(quote)}”</blockquote>`:''}<p class="subtle">${prepared?'Passage location: Abstract. This is a prepared evidence record.':'Record retrieved from Europe PMC. Bibliographic identity does not establish support for your sentence.'}</p><div class="actions">${link('Open paper',p.url||'https://doi.org/'+p.doi)}${p.pmcid?link('Available full text','https://pmc.ncbi.nlm.nih.gov/articles/'+p.pmcid+'/'):''}</div></div>`;}
function decisionHTML(c,a){if(c.decision)return `<div class="callout"><strong>${esc(status(c))}</strong><p>${c.decision.type==='apply'?'Approved wording and citation are in your manuscript.':c.decision.type==='keep'?'Your wording remains. The evidence concern is unresolved.':'This sentence is unresolved. No supporting citation was inserted.'}</p>${btn('Undo decision','undo',c.id,'btn')}</div>`;return `<div class="actions">${['supports','partial'].includes(a.kind)?btn(a.kind==='partial'?'Accept revision + citation':'Add citation','approve-demo',c.id,'btn primary'):btn('Flag for manual review','flag',c.id,'btn primary')}${btn('Keep original','keep',c.id,'btn')}</div>`;}
function evidenceHTML(c){const a=assessment(c),p=paper(c.candidate);if(stale())return `<span class="eyebrow">REVIEW PAUSED</span><h2>Review the updated draft.</h2><p>Your manuscript changed. Previous evidence decisions do not apply automatically.</p>${btn('Prepare updated sentences','prepare','','btn primary')}`;if(a.kind==='stale')return `<span class="eyebrow">WORDING CHANGED</span><h2>A new review is needed.</h2><p>${esc(a.reason)}</p>${btn('Restore example wording','restore-demo',c.id,'btn')}${searchHTML()}`;if(!a.prepared)return manualHTML(c,p);
 return `<div class="section-head"><span class="eyebrow">PREPARED FINDING · ORIGINAL SENTENCE</span><span class="status ${a.kind}">${a.kind==='supports'?'Source fits':a.kind==='partial'?'Scope mismatch':'Not verified'}</span></div><h2>${esc(a.label)}</h2><p>${esc(a.reason)}</p>${sourceCard(p,p?.evidence_excerpt,true)}<div class="criteria-grid"><div class="criterion"><span>Study scope</span><p>${esc(p?.evidence_scope)}</p></div><div class="criterion"><span>Review coverage</span><p>Three prepared papers. This is not an exhaustive literature search.</p></div></div>${a.kind==='partial'?`<div class="revision"><span class="eyebrow">PROPOSED WORDING</span><p class="before">${esc(c.original)}</p><p class="after">${esc(a.s.revised_claim)}</p></div>`:a.kind==='supports'?'<div class="callout"><strong>A citation can support this wording.</strong><p>Inspect the population and measured outcomes before approving.</p></div>':'<div class="callout"><strong>Leave the question open.</strong><p>These sources do not establish this sentence. That does not mean no other evidence exists.</p></div>'}${decisionHTML(c,a)}
 <details class="activity"><summary>Compare the prepared sources</summary>${a.s.evidence.map(e=>{const q=D.papers[e.paper_id];return `<div class="paper-result"><strong>${esc(author(q))} (${q.year})</strong><p>${esc(e.explanation)}</p>${btn(e.paper_id===c.candidate?'Selected':'Inspect this paper','candidate',e.paper_id,'btn small')}</div>`;}).join('')}</details><details class="activity"><summary>Evidence trail and limits</summary><p>Original sentence → ${esc(author(p))} (${esc(p?.year)}) → Abstract passage.</p><p>This example uses a primary study. No recursive citation search, fresh retraction check, or counterevidence search has run.</p><p>Editing a sentence invalidates its prepared assessment. Author approval is not independent scientific validation.</p></details>${searchHTML()}`;}
function canApprove(c){const m=c.manual,p=paper(c.candidate);if(!m||!p||c.decision||stale()||m.verdict==='unreviewed'||!manualEvidenceCurrent(c))return false;return ['supports','partial'].includes(m.verdict)?matchQuote(m.quote,abstract(p))&&(m.verdict!=='partial'||!!m.revision.trim()):true;}
function approvalText(c){return c.manual?.verdict==='partial'&&c.manual.revision.trim()?c.manual.revision.trim():c.text;}
function quoteCaution(c){return !!c.manual?.quote.trim()&&!c.decision&&quoteOverlap(approvalText(c),c.manual.quote).low;}
function quoteWarningHTML(c){return `<div id="quoteRelevanceWarning" class="callout caution" role="status" ${quoteCaution(c)?'':'hidden'}><strong>Low keyword overlap</strong><p>The passage shares few or no key words with the sentence you would approve. Check that it is relevant. This is a simple word check, not an AI judgment; synonyms can trigger a warning and matching words do not prove support.</p></div>`;}
function approvalFingerprint(c){return JSON.stringify([state.activeProjectId,state.mode,c.id,c.text,c.candidate,c.manual,c.decision,E?.sourceSnapshot(paper(c.candidate)),state.mode==='draft'?state.draft.text:null]);}
function requestCitationApproval(c,after,paperId,extra){
 const overlap=quoteOverlap(after,extra.quote);
 if(overlap.low){
  pendingApproval={claimId:c.id,fingerprint:approvalFingerprint(c),after,paperId,extra,overlap};
  modal('Check this passage before approving',`<p><strong>Low keyword overlap:</strong> ${overlap.shared.length} of ${overlap.claimTerms.length} sentence keywords appear in the quote. This is a word check, not a scientific judgment.</p><p><strong>Sentence:</strong> ${esc(after)}</p><blockquote class="source-passage">${esc(extra.quote)}</blockquote><p>Synonyms can cause false warnings. Matching words also do not establish support. Inspect the context before deciding.</p><div class="actions">${btn('Cancel','close','','btn')}${btn('Approve despite warning','confirm-low-overlap','','btn primary')}</div>`);
  return;
 }
 decide(c,'apply',after,paperId,extra);
}
function approveManual(c){if(!c||!canApprove(c))return;const m=c.manual;if(['supports','partial'].includes(m.verdict))requestCitationApproval(c,approvalText(c),c.candidate,{assessment:m.aiGenerated?'AI suggestion reviewed by author':'author',verdict:m.verdict,quote:m.quote,note:m.note,evidenceRunId:m.evidenceRunId||null,evidenceKey:m.evidenceKey||null});else decide(c,'flag',c.text,null,{assessment:'author',verdict:m.verdict,evidencePaper:c.candidate,quote:m.quote,note:m.note,evidenceRunId:m.evidenceRunId||null,evidenceKey:m.evidenceKey||null});}
function manualHTML(c,p){const m=c.manual||{quote:'',verdict:'unreviewed',revision:'',note:''},outdated=m.aiGenerated&&!manualEvidenceCurrent(c),approved=c.decision?.type==='apply',revised=approved&&c.decision.before!==c.decision.after;const heading=outdated?'Review needs rechecking.':approved?(revised?'Revision and citation approved.':'Citation approved.'):c.decision?'Review decision recorded.':p?'Inspect the evidence.':'Find a reference.';const introduction=outdated?'The sentence or source changed after this check. Review the current version before reusing its assessment.':approved?(revised?'You approved revised wording and its citation.':'You approved this citation. The original wording is unchanged.'):c.decision?'Your decision is recorded. The evidence concern remains unresolved.':p?'Check whether the study matches your sentence, then record your decision.':'Search for a paper matching the population and outcome in this sentence.';return `<span class="eyebrow">${m.aiGenerated?(outdated?'AI ASSESSMENT · NEEDS RECHECKING':approved?'AI ASSESSMENT · APPROVED BY AUTHOR':c.decision?'AI ASSESSMENT · AUTHOR DECISION RECORDED':'AI SUGGESTION · AUTHOR APPROVAL REQUIRED'):'AUTHOR-LED EVIDENCE REVIEW'}</span><h2>${heading}</h2><p class="muted">${introduction}</p>${p?`${sourceCard(p,'',!!p.prepared)}<details class="activity" open><summary>${p.agentSourceText?'Retrieved source text · '+(p.access==='full_text'?'selected full-text passages':'abstract'):p.abstract?'Retrieved abstract':'Available prepared excerpt'}</summary><p id="abstractText" class="paragraph">${esc(abstract(p)||'No abstract was supplied. Open the paper to inspect its evidence; metadata alone cannot support a judgment.')}</p></details><label class="field">Evidence passage<textarea id="evidenceQuote" rows="3" maxlength="2000" placeholder="Copy a relevant passage from the text above" ${c.decision?'readonly':''}>${esc(m.quote)}</textarea></label><p id="quoteMatch" class="subtle">${matchQuote(m.quote,abstract(p))?'Passage found in the displayed source text. This checks the text, not scientific support.':'Paste an exact passage from the displayed text to enable citation approval.'}</p>${quoteWarningHTML(c)}${designHTML({designCheck:m.designCheck})}<label class="field">Your assessment<select id="manualVerdict" ${c.decision?'disabled':''}>${[['unreviewed','Not yet assessed'],['supports','Supports this wording'],['partial','Needs narrower wording'],['conflicting','Conflicts with this claim'],['unsupported','Cannot verify from this source']].map(([v,l])=>`<option value="${v}" ${m.verdict===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Proposed wording, if a revision is needed<textarea id="manualRevision" rows="3" maxlength="3000" ${c.decision?'readonly':''}>${esc(m.revision)}</textarea></label><label class="field">Reason or limitation<textarea id="manualNote" rows="2" maxlength="1500" placeholder="Population, study design, outcome or limitation" ${c.decision?'readonly':''}>${esc(m.note)}</textarea></label>${m.aiGenerated&&!manualEvidenceCurrent(c)?'<div class="callout evidence-stale"><strong>Needs rechecking</strong><p>The original sentence or source changed. Start a new check or select a source for a fresh manual review.</p></div>':''}${c.decision?decisionHTML(c,{kind:m.verdict}):`<div class="actions"><button type="button" id="manualApprove" data-action="approve-manual" class="btn primary" ${!canApprove(c)?'disabled':''}>${m.verdict==='partial'?'Apply wording + citation':m.verdict==='supports'?'Approve citation':'Save review finding'}</button>${btn('Keep original','keep',c.id,'btn')}</div>`}`:''}${searchHTML()}<p class="subtle">${m.aiGenerated?'This suggested assessment came from an AI run. Exact text matching does not prove scientific support; you make the final decision.':'You assess this source. Check this exact sentence with AI using the controls above, or continue manually.'}</p>`;}
function savedSourcesHTML(){const saved=Object.values(state.papers);return state.view==='review'&&saved.length?`<details class="activity"><summary>Use a source from your collection (${saved.length})</summary>${saved.map(p=>`<div class="paper-result"><strong>${esc(p.title)}</strong><p class="subtle">${esc(author(p))} · ${esc(p.year)} · Not an approved citation</p>${btn('Inspect for this sentence','use-saved-paper',p.id,'btn small')}</div>`).join('')}</details>`:'';}
function searchHTML(){ensureSearchQuery();return `${savedSourcesHTML()}<section class="literature-search"><div class="section-head"><h3>Find papers</h3><span class="scope-label">Live · Europe PMC</span></div><form id="paperSearch" class="search-form"><label class="field">Search keywords<input id="searchQuery" type="search" required maxlength="300" value="${esc(search.query)}" placeholder="e.g. OSK glaucoma mice"></label><button id="searchSubmit" type="submit" class="btn primary" ${search.loading?'disabled':''}>${search.loading?'Searching…':'Search papers'}</button></form><p class="subtle">Keywords are suggested from your ${state.view==='literature'?'research question':'selected sentence'}; edit them as needed. Only clicking Search papers sends this query to Europe PMC. Results are candidates, not AI-verified references.</p><div id="searchResults" class="search-results" aria-live="polite">${resultsHTML()}</div></section>`;}
function resultsHTML(){if(search.loading)return '<p class="subtle">Retrieving literature records…</p>';if(search.error)return `<div class="callout" role="alert"><strong>Search could not finish.</strong><p>${esc(search.error)}</p><p>Your writing is unchanged. Retry or open ${link('Europe PMC','https://europepmc.org/')}.</p></div>`;if(search.total===null)return '';return `<p class="subtle">${Number(search.total).toLocaleString()} matching records · showing ${search.papers.length}</p>${search.papers.length?search.papers.map((p,i)=>`<article class="paper-result"><strong>${esc(p.title)}</strong><p class="source-meta">${esc(author(p))} · ${esc(p.year)} · ${esc(p.journal)}</p><p>${esc((p.abstract||'No abstract supplied.').slice(0,210))}${p.abstract?.length>210?'…':''}</p><div class="actions">${btn('Inspect abstract','inspect',String(i),'btn small')}${link('Open paper',p.url)}</div></article>`).join(''):'<p>No records matched. Try fewer keywords or alternative scientific terms.</p>'}`;}
function sourcesHTML(){const ids=state.mode==='demo'?Object.keys(D.papers):Object.keys(state.papers);return `<div class="page"><div class="page-head"><div><span class="eyebrow">YOUR EVIDENCE COLLECTION</span><h1>Sources</h1><p class="muted">${state.mode==='demo'?'3 prepared example records':Object.keys(state.papers).length+' saved from live search'}</p></div>${btn('Export cited references','export-bib','','btn')}</div><div class="source-grid">${!ids.length?'<div class="empty-state"><h2>Build your source collection.</h2><p>Search in Explore literature and save a paper to begin.</p>'+btn('Explore literature','view','literature','btn primary')+'</div>':''}${ids.map(id=>{const p=paper(id);return `<article class="source-card"><span class="scope-label">${state.papers[id]?'Retrieved record':'Prepared example'}${cited().includes(id)?' · cited in this document':''}</span><h2 class="source-title">${esc(p.title)}</h2><p class="source-meta">${esc(author(p))} · ${esc(p.year)} · ${esc(p.journal)}</p><p class="subtle">${esc(p.evidence_scope||'Inspect the abstract or full paper to assess relevance.')}</p>${link('Open paper',p.url)}${p.doi?`<p class="subtle">DOI: ${esc(p.doi)}</p>`:''}</article>`;}).join('')}</div></div>`;}
function activityHTML(){return `<div class="page"><div class="page-head"><div><span class="eyebrow">DECISIONS YOU CAN TRACE</span><h1>Project activity</h1><p class="muted">Your searches, project actions and review decisions in one place. No hidden AI runs.</p></div>${btn('Export review log','export-log','','btn')}</div>${state.logs.length?`<ol class="log-list">${state.logs.map(l=>`<li class="log-item"><div class="section-head"><strong>${esc(l.type)}</strong><time class="subtle">${esc(new Date(l.at).toLocaleString())}</time></div><p>${esc(l.detail)}</p><span class="scope-label">${l.mode==='demo'?'Example':'My writing'}</span>${l.before?`<details><summary>View recorded change</summary><p><strong>Before:</strong> ${esc(l.before)}</p><p><strong>After:</strong> ${esc(l.after||l.before)}</p></details>`:''}</li>`).join('')}</ol>`:'<div class="empty-state"><h2>Your project trail starts here.</h2><p>Saved sources, project actions and manuscript decisions appear as you work.</p></div>'}<p class="subtle">The latest 250 actions are stored in this browser. Export for a durable record.</p></div>`;}
function setText(c,text){if(state.mode==='draft'){if(stale())throw new Error('Prepare the changed draft again first.');const oldEnd=c.end,delta=text.length-(c.end-c.start);state.draft.text=state.draft.text.slice(0,c.start)+text+state.draft.text.slice(c.end);state.draft.baseText=state.draft.text;claims().forEach(o=>{if(o.id!==c.id&&o.start>=oldEnd){o.start+=delta;o.end+=delta;}});c.end=c.start+text.length;}c.text=text;}
function decide(c,type,after,paperId=null,extra={}){if(!c||c.decision)return;const before=c.text;if(after!==before)setText(c,after);c.decision={type,before,after,paperId,at:new Date().toISOString(),sourceSnapshot:type==='apply'?E?.sourceSnapshot(paper(paperId)):null,evidenceRunId:c.manual?.evidenceRunId||null,evidenceKey:c.manual?.evidenceKey||null,...extra};if(state.projectMeta.isTutorial&&type==='apply'){const task=state.research.tasks.find(x=>x.id==='practice-citation');if(task)task.done=true;}log(type==='apply'?'Wording / citation approved':type==='keep'?'Original wording retained':'Manual review flagged',type==='apply'?(extra.warningAcknowledged?'Author approved after acknowledging low keyword overlap.':'Author approved this evidence and manuscript change.'):'The claim remains unresolved; no new supporting citation inserted.',{claimId:c.id,before,after,paperId,assessment:extra.assessment||'prepared example',...extra});render();toast(type==='apply'?'Approved change added to your manuscript.':'Review decision recorded.');}
function refreshManual(){const c=current(),m=c?.manual;if(!m)return;if($('quoteRelevanceWarning'))$('quoteRelevanceWarning').hidden=!quoteCaution(c);if($('quoteMatch'))$('quoteMatch').textContent=matchQuote(m.quote,abstract(paper(c.candidate)))?'Passage found in the displayed text. This checks text, not scientific support.':'Passage not matched yet. Paste an exact excerpt from the displayed text.';if($('manualApprove')){$('manualApprove').disabled=!canApprove(c);$('manualApprove').textContent=m.verdict==='partial'?'Apply wording + citation':m.verdict==='supports'?'Approve citation':'Save review finding';}}
function prepare(){
 const raw=state.draft.text;if(!raw.trim()){toast('Paste a paragraph first.');return;}
 const previous=state.draft.claims;const spans=[];const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('en',{granularity:'sentence'}):null;
 for(const line of raw.matchAll(/[^\n]+/g)){
  if(line[0].trim().startsWith('#'))continue;
  const parts=segmenter?[...segmenter.segment(line[0])]:[...line[0].matchAll(/[\s\S]+?(?:[.!?]+(?=\s|$)|$)/g)].map(m=>({segment:m[0],index:m.index}));
  for(const part of parts){const text=part.segment.trim();if(text.length<15)continue;const start=line.index+part.index+part.segment.indexOf(text);const same=previous.filter(c=>c.text===text),prior=same.length===1&&!spans.some(c=>c.id===same[0].id)?same[0]:null;spans.push({id:prior?.id||uid(),text,original:prior?.original||text,start,end:start+text.length,candidate:prior?.candidate||null,decision:null,manual:prior&&!prior.decision?prior.manual:null,...(prior?.scenario!==undefined&&prior.original===text?{scenario:prior.scenario}:{})});if(spans.length===5)break;}
  if(spans.length===5)break;
 }
 if(!spans.length){toast('Add a complete sentence of at least 15 characters.');return;}
 state.draft.claims=spans;state.draft.baseText=raw;state.selected.draft=spans[0].id;state.view='review';clearSearch();log('Sentences prepared',spans.length+' sentences selected by text splitting. No scientific assessment performed.');close();render();toast('Check sentence boundaries before reviewing.');
}
async function runSearch(query){controller?.abort();const seq=++sequence,request=new AbortController();controller=request;search={query,loading:true,error:'',papers:[],total:null};render();try{const result=await window.PherogentLiterature.search(query,{signal:request.signal});if(seq!==sequence)return;search={query,loading:false,error:'',papers:result.papers,total:result.total};log('Literature search','Europe PMC query: '+query,{query,resultCount:result.total,returnedIds:result.papers.map(p=>p.id)});render();}catch(error){if(seq!==sequence||request.signal.aborted)return;search={query,loading:false,error:error.message||'The service did not respond.',papers:[],total:null};render();}}
function manuscriptText(){if(state.mode==='demo')return state.demo.map(c=>c.text+marker(c)).join('\n\n');if(stale())return state.draft.text;let text=state.draft.text;[...state.draft.claims].sort((a,b)=>b.start-a.start).forEach(c=>{const m=marker(c);if(m)text=text.slice(0,c.end)+m+text.slice(c.end);});return text;}
function markdown(){const refs=cited().map((id,i)=>{const p=paper(id);return `[${i+1}] ${p.authors.join(', ')} (${p.year}). ${p.title.replace(/\.+$/,'')}. ${p.journal}. ${p.doi?'https://doi.org/'+p.doi:p.url}`;});return '# '+(state.mode==='demo'?'Illustrative reprogramming manuscript':state.draft.title)+'\n\n'+manuscriptText()+'\n\n## References\n\n'+(refs.join('\n\n')||'No citations approved.')+'\n\n---\nReview scope: '+(state.projectMeta.isTutorial?'Practice project with prepared teaching inputs; not original research.':state.mode==='demo'||state.projectMeta.isSample?'Editable prepared sample; not original research.':(Array.isArray(state.research.aiRuns)&&state.research.aiRuns.length?'Author-controlled review; AI research activity is recorded separately.':'Author-led review; no automated scientific assessment.'))+(state.projectMeta.sampleVersion===C.version||state.projectMeta.tutorialVersion===C.version?' '+C.attribution:'')+' Search coverage is limited to recorded queries and inspected sources.\n\n'+claims().map((c,i)=>'- Sentence '+(i+1)+': '+status(c)).join('\n')+'\n';}
function bibtex(){const clean=s=>String(s||'').replace(/[{}\\]/g,'');return cited().map(id=>{const p=paper(id);return '@article{'+id.replace(/[^a-zA-Z0-9]/g,'')+',\n  title = {'+clean(p.title)+'},\n  author = {'+p.authors.map(a=>{const m=String(a).match(/^(.+) ([A-Z][A-Z.-]*)$/);return m?clean(m[1])+', '+clean(m[2]):'{'+clean(a)+'}';}).join(' and ')+'},\n  year = {'+clean(p.year)+'},\n  journal = {'+clean(p.journal)+'},\n  doi = {'+clean(p.doi)+'},\n  url = {'+clean(p.url)+'}\n}\n';}).join('\n');}
function download(name,text,mime){const u=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();P?.recordExport?.(name);setTimeout(()=>URL.revokeObjectURL(u),1000);toast('Download prepared: '+name);}
function exportMenu(){const options=[...(S?[['Agent workspaces','Agent workspaces (.md)','export-studio','Section drafts, context and conversations','MD']]:[]),['Research notes','Research brief (.md)','export-research','Question, findings and tasks','MD'],['Manuscript','Manuscript (.md)','export-md','Your writing with approved citations','MD'],['Cited references','Cited references (.bib)','export-bib','Bibliography for your reference manager','BIB'],['Evidence trail','Evidence trail (.md)','export-evidence','Original sentences, source passages, decisions and freshness','MD'],['Activity record','Review log (.json)','export-log','Searches, decisions and changes','JSON'],['Workspace backup','Workspace backup (.json)','export-backup','All local projects and their saved work','JSON']];modal('Export your work',`<p>Take your research with you. Choose what you want to keep.</p><div class="export-options">${options.map(([name,label,action,description,type])=>`<button type="button" class="export-option" aria-label="${label}" data-action="${action}"><span class="export-format">${type}</span><span><strong>${name}</strong><small>${description}</small></span><span aria-hidden="true">↓</span></button>`).join('')}</div><div class="actions">${btn('Preview manuscript','preview-export','','btn')}${btn('Close','close','','btn ghost')}</div><p class="subtle">Saved on this device, in this browser. Keep a backup before clearing browser data.</p>`);}
function previewExport(){modal('Your manuscript export',`<p>This is the Markdown content used by the manuscript download. You can also select and copy it here.</p><label class="field"><span>Manuscript Markdown</span><textarea id="exportPreview" rows="12" readonly>${esc(markdown())}</textarea></label><div class="actions">${btn('Download manuscript (.md)','export-md','','btn primary')}${btn('Back to exports','export-menu','','btn')}</div>`);}

function showAIUsage(){if(U){close();state.view='usage';render();return;}if(A){A.showUsage();return;}modal('AI usage','<p>AI connection unavailable. No usage can be fetched.</p>');}
function about(){modal('What works in this version',`<div class="info-grid"><div><h3>Working now</h3><p>Separate projects, research tasks, source notes, a findings notebook, manuscript editing, live Europe PMC search, passage matching, author approvals, undo and exports.</p></div><div><h3>Prepared example</h3><p>The editable sample contains three published papers, notes and draft claims to test the product. It lives in its own project; opening it never replaces your writing.</p></div><div><h3>AI connection</h3><p>Investigate can plan a search, inspect a bounded set of sources and suggest findings when the owner has enabled the model connection. It requires your consent and has server-enforced budgets. Section chats can produce a role-specific AI reply after you review the exact message and context and consent. They do not search papers. All AI turns share the same server allowance. Prepared examples use no AI. No experiments or model training run here.</p></div></div><p>Your projects are saved in this browser. A manual search sends its query to Europe PMC. An AI investigation sends only the question or claim you approve to OpenAI and derived queries to Europe PMC. A section reply sends the exact message and bounded context shown in its consent preview to OpenAI. Server records contain usage and access identifiers, not your manuscript. External paper links open publishers or archives.</p><p>Browser storage is not account storage or a backup. Export to keep a copy.</p>${state.recovery?'<p>A saved workspace could not be loaded safely. Its original contents are preserved in the Workspace backup export under recovery.</p>':''}<div class="actions">${state.legacy?btn('Earlier workspace','legacy','','btn'):''}${btn('Open sample project','open-sample','','btn')}${btn('Interactive tutorial','start-tutorial','','btn primary')}${btn('Quick introduction','help','','btn')}${btn('Close','close','','btn')}</div>`);}
document.addEventListener('submit',e=>{if(e.target.id==='newProjectForm'){e.preventDefault();createProject();return;}if(e.target.id==='taskForm'){e.preventDefault();addTask();return;}if(e.target.id==='paperSearch'){e.preventDefault();const q=$('searchQuery').value.trim();if(q)runSearch(q);}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,arg=b.dataset.arg,c=current();try{
 switch(action){
 case 'view':if(VIEWS.includes(arg)){close();if((state.view==='literature')!==(arg==='literature'))clearSearch();state.view=arg;if(state.mode==='demo'&&state.research.tourStep!==null){const step=R.stages.findIndex(x=>x.view===arg);state.research.tourStep=step>=0?step:null;}render();}break;
 case 'mode':if(['demo','draft'].includes(arg)){state.mode=arg;state.research.tourStep=null;clearSearch();render();}break;
 case 'start-project':case 'new-project':showNewProject();break;
 case 'create-project':createProject();break;
 case 'projects':showProjects();break;
 case 'switch-project':switchProject(arg);break;
 case 'guided-demo':case 'open-sample':openSample();break;
 case 'help':if(S){S.welcome();introOpen=true;}else showIntro();break;
 case 'ai-usage':showAIUsage();break;
 case 'process-tour':close();P?.start();break;
 case 'investigate':A?.show();break;
 case 'check-sentence':showClaimCheck(arg);break;
 case 'confirm-claim-check':startClaimCheck(arg);break;
 case 'open-check':A?.showSaved(arg);break;
 case 'open-evidence':{const record=E?.records(state).find(r=>r.key===arg),run=state.research.aiRuns?.find(r=>r.id===record?.runId);if(record&&run)reviewAgentEvidence(state.activeProjectId,run.result,record.evidence);break;}
 case 'inbox-filter':state.research.evidenceFilter=['all','awaiting_author','needs_recheck','approved'].includes(arg)?arg:'all';render();break;
 case 'export-evidence':if(E)download('pherogent-evidence-trail.md',E.markdown(state),'text/markdown');break;
 case 'start-tutorial':close();T?.start();break;
 case 'resume-tutorial':close();T?.resume();break;
 case 'restart-tutorial':close();T?.restart();break;
 case 'pause-tutorial':T?.pause();break;
 case 'dismiss-intro':state.onboardingSeen=true;close();save();break;
 case 'task-add':addTask();break;
 case 'task-toggle':{const task=state.research.tasks.find(t=>t.id===arg);if(task){task.done=!task.done;log(task.done?'Task completed':'Task reopened',task.text);render();}break;}
 case 'source-to-notebook':sourceToNotebook(arg);break;
 case 'saved-paper-inspect':{const p=state.papers[arg];if(p)modal('Source details',sourceCard(p,abstract(p),!!p.prepared)+`<div class="actions">${btn('Close','close','','btn')}</div>`);break;}
 case 'focus-section':{const el=$('draftText');if(el){const start=state.draft.text.search(new RegExp('^## '+arg+'\\s*$','mi'));if(start>=0){el.focus();el.setSelectionRange(start,start+arg.length+3);}else toast('Add a section outline first.');}break;}
 case 'insert-outline':{if(state.mode!=='draft'){toast('Switch to My writing to add an outline to your own manuscript.');break;}const headings=['Summary','Introduction','Methods','Results','Discussion','Conclusion'].filter(h=>!new RegExp('^## '+h+'\\s*$','mi').test(state.draft.text));if(!headings.length){toast('These manuscript sections already exist.');break;}const addition=headings.map(h=>'## '+h+'\n\n').join('\n');if(state.draft.text.length+addition.length+2>12000){toast('The outline would exceed the 12,000 character workspace limit.');break;}state.draft.text=[state.draft.text,addition].filter(Boolean).join('\n\n');log('Manuscript outline added','Author added section headings. Existing writing was retained.');render();break;}
 case 'append-analysis':{if(state.mode!=='draft')break;const r=state.research,addition=[r.analysisNotes?'## Findings notes\n\n'+r.analysisNotes:'',r.limitations?'## Limitations\n\n'+r.limitations:''].filter(Boolean).join('\n\n');if(!addition){toast('Write findings notes first.');break;}if(state.draft.text.includes(addition)){toast('These notes are already in the manuscript.');break;}if(state.draft.text.length+addition.length+2>12000){toast('The notes would exceed the 12,000 character workspace limit.');break;}state.draft.text=[state.draft.text,addition].filter(Boolean).join('\n\n');state.view='manuscript';log('Findings added to manuscript','Author copied notebook notes into the manuscript. Their origin remains recorded in the notebook and Activity log.');render();break;}

 case 'select':if(c?.id!==arg)clearSearch();state.selected[state.mode]=arg;render();break;
 case 'candidate':if(!c||!D.papers[arg])break;if(c.decision){toast('Undo the decision before changing its source.');break;}c.candidate=arg;c.manual=null;log('Prepared source selected','Selected '+author(D.papers[arg])+'. No citation inserted.',{claimId:c.id,paperId:arg});render();break;
 case 'approve-demo':{if(!c)break;const a=assessment(c);if(a.prepared&&['supports','partial'].includes(a.kind))requestCitationApproval(c,a.kind==='partial'?a.s.revised_claim:c.text,c.candidate,{assessment:'prepared example',quote:D.papers[c.candidate].evidence_excerpt});break;}
 case 'keep':if(c)decide(c,'keep',c.text,null,{assessment:c.manual?'author':'prepared example'});break;
 case 'flag':if(c)decide(c,'flag',c.text);break;
 case 'undo':if(c?.decision){const d=c.decision;setText(c,d.before);c.decision=null;if(state.projectMeta.isTutorial){const task=state.research.tasks.find(x=>x.id==='practice-citation');if(task)task.done=false;}log('Decision undone','Author reverted a decision.',{claimId:c.id,before:d.after,after:d.before,paperId:d.paperId});render();}break;
 case 'edit':{const x=claims().find(x=>x.id===arg);if(!x)break;if(stale()){toast('Prepare the changed draft again before editing.');break;}modal('Edit this sentence',`<label class="field">Sentence<textarea id="editSentence" rows="5" maxlength="3000">${esc(x.text)}</textarea></label><p class="subtle">Changing the wording clears its approval and requires a new review.</p><div class="actions">${btn('Save changed sentence','save-edit',x.id,'btn primary')}${btn('Cancel','close','','btn')}</div>`);break;}
 case 'save-edit':{const x=claims().find(x=>x.id===arg),text=$('editSentence').value.trim();if(!text){toast('A sentence cannot be empty.');break;}if(text!==x.text){const before=x.text;setText(x,text);x.decision=null;if(x.manual)x.manual={...x.manual,verdict:'unreviewed',revision:'',note:''};log('Sentence changed','Previous approval invalidated.',{claimId:x.id,before,after:text});}close();render();break;}
 case 'restore-demo':if(c&&c.scenario!==undefined){setText(c,c.original);c.decision=null;c.manual=null;render();}break;
 case 'prepare':if(state.draft.claims.some(x=>x.decision))modal('Prepare a new review?',`<p>This prepares fresh sentence reviews for the current text. Earlier decisions remain in the activity log.</p><div class="actions">${btn('Prepare new review','prepare-confirm','','btn primary')}${btn('Cancel','close','','btn')}</div>`);else prepare();break;
 case 'prepare-confirm':prepare();break;
 case 'inspect':{const p=search.papers[Number(arg)];if(!p)break;if(state.view==='literature'){modal('Inspect a candidate source',sourceCard(p,p.abstract,false)+`<p class="subtle">Saving adds this paper to your own project collection. It does not approve evidence or insert a citation.${state.mode==='demo'?' This switches you to My writing, keeping the prepared example separate.':''}</p><div class="actions">${btn(state.mode==='demo'?'Save to my project':'Save to project sources','save-paper',arg,'btn primary')}${btn('Close','close','','btn')}</div>`);break;}if(!c)break;if(c.decision){toast('Undo the existing decision before choosing a source.');break;}state.papers[p.id]=p;c.candidate=p.id;c.manual={quote:'',verdict:'unreviewed',revision:'',note:''};log('Source opened','Retrieved metadata and available abstract; not a scientific approval.',{claimId:c.id,paperId:p.id});render();break;}
 case 'save-paper':{const p=search.papers[Number(arg)];if(!p)break;const fromExample=state.mode==='demo';if(fromExample){state.mode='draft';state.research.tourStep=null;state.view='literature';}state.papers[p.id]=p;if(!state.research.savedSources.some(x=>(typeof x==='string'?x:x.id)===p.id))state.research.savedSources.push(p.id);log('Source saved','Author saved a literature candidate. No citation or scientific approval was added.',{paperId:p.id});close();if(fromExample)clearSearch();render();toast('Paper saved to your project sources.');break;}
 case 'use-saved-paper':{const p=state.papers[arg];if(!c||!p)break;if(c.decision){toast('Undo the decision before choosing a source.');break;}c.candidate=p.id;c.manual={quote:'',verdict:'unreviewed',revision:'',note:''};log('Saved source opened','Author selected a source for this sentence; no citation inserted.',{claimId:c.id,paperId:p.id});render();break;}
 case 'approve-manual':approveManual(c);break;
 case 'confirm-low-overlap':{
  const pending=pendingApproval;
  if(!pending||!c||c.id!==pending.claimId||stale()||c.decision||approvalFingerprint(c)!==pending.fingerprint||c.manual&&!canApprove(c)||!matchQuote(pending.extra.quote,abstract(paper(pending.paperId)))){close();toast('The sentence or evidence changed. Review it again before approving.');break;}
  close();decide(c,'apply',pending.after,pending.paperId,{...pending.extra,keywordOverlap:pending.overlap,warningAcknowledged:true});break;
 }
 case 'import-text':$('textFile').click();break;
 case 'confirm-import':state.draft.text=pendingImport||'';pendingImport=null;close();log('Input replaced','Imported local text. Previous evidence requires rechecking.');render();break;
 case 'about':about();break;
 case 'export-menu':exportMenu();break;
 case 'preview-export':previewExport();break;
 case 'export-research':download('pherogent-research-brief.md',R.markdown(workspaceContext()),'text/markdown');break;
 case 'export-studio':if(S)download('pherogent-agent-workspaces.md',S.exportMarkdown(workspaceContext()),'text/markdown');break;
 case 'export-md':download('pherogent-manuscript.md',markdown(),'text/markdown');break;
 case 'export-bib':if(cited().length)download('pherogent-references.bib',bibtex(),'application/x-bibtex');else toast('Approve a citation before exporting references.');break;
 case 'export-log':download('pherogent-review-log.json',JSON.stringify({version:3,liveAI:(state.research.aiRuns||[]).some(r=>Number(r.usage?.modelCalls||r.usage?.calls)>0),scope:'Author decisions, prepared examples and AI activity are labeled individually. Token usage may be incomplete; see each run.',actions:state.logs,aiRuns:state.research.aiRuns||[],studyRuns:state.research.studyRuns||[],evidence:E?.records(state)||[]},null,2),'application/json');break;
 case 'export-backup':download('pherogent-workspace-backup.json',JSON.stringify(state,null,2),'application/json');break;
 case 'legacy':modal('Earlier workspace preserved',`<p>Earlier notes, additions, citations and history remain available in a separate export. Recovered writing is also in My writing and has not been reviewed by AI.</p><div class="actions">${btn('Open My writing','open-draft','','btn primary')}${btn('Export earlier workspace','export-legacy','','btn')}</div>`);break;
 case 'open-draft':close();state.mode='draft';state.view='manuscript';clearSearch();render();break;
 case 'export-legacy':if(state.legacy)download('pherogent-previous-workspace.json',JSON.stringify(state.legacy,null,2),'application/json');break;
 case 'reset-demo':modal('Reset the prepared example?',`<p>This resets the three example sentences and their decisions. Your writing, sources and earlier workspace are preserved.</p><div class="actions">${btn('Reset example','reset-demo-confirm','','btn primary')}${btn('Cancel','close','','btn')}</div>`);break;
 case 'reset-demo-confirm':state.demo=demos();state.selected.demo='demo-1';state.mode='demo';state.view='review';clearSearch();log('Example reset','Prepared sentences restored.');close();render();break;
 case 'close':close();break;
 }
}catch(error){toast(error.message||'The action could not finish.');}});
document.addEventListener('input',e=>{
 const noteId=e.target.dataset?.sourceNote;if(noteId&&state.papers[noteId]){state.research.sourceNotes[noteId]||={note:'',tag:'to-read'};state.research.sourceNotes[noteId].note=e.target.value;save();}

 const researchField=e.target.dataset?.researchField;if(state.mode==='draft'&&['question','aim','hypothesis','dataNotes','analysisNotes','limitations','nextExperiment'].includes(researchField)){state.research[researchField]=e.target.value;save();}
 if(e.target.id==='searchQuery')search.query=e.target.value;
 if(e.target.id==='draftTitle'){state.draft.title=e.target.value;save();syncDraftUI();}
 if(e.target.id==='draftText'){state.draft.text=e.target.value;save();syncDraftUI();}
 const field={evidenceQuote:'quote',manualRevision:'revision',manualNote:'note'}[e.target.id];if(field){const c=current();if(c&&!c.decision){c.manual||={quote:'',verdict:'unreviewed',revision:'',note:''};c.manual[field]=e.target.value;save();refreshManual();}}
});
document.addEventListener('change',async e=>{
 const tagId=e.target.dataset?.sourceTag;if(tagId&&state.papers[tagId]&&['to-read','useful','conflicting'].includes(e.target.value)){state.research.sourceNotes[tagId]||={note:'',tag:'to-read'};state.research.sourceNotes[tagId].tag=e.target.value;log('Source status updated',e.target.value,{paperId:tagId});save();}
 const noteId=e.target.dataset?.sourceNote;if(noteId&&state.papers[noteId]){log('Source note updated','Author edited a reading note.',{paperId:noteId});save();}

 const researchField=e.target.dataset?.researchField;if(state.mode==='draft'&&['question','aim','hypothesis','dataNotes','analysisNotes','limitations','nextExperiment'].includes(researchField)){log('Research note updated','Author updated '+researchField.replace(/([A-Z])/g,' $1').toLowerCase()+'.');save();}
 if(e.target.id==='manualVerdict'){const c=current();if(c&&!c.decision){c.manual||={quote:'',verdict:'unreviewed',revision:'',note:''};c.manual.verdict=e.target.value;save();refreshManual();}}
 if(e.target.id==='textFile'){const importProject=state.activeProjectId,f=e.target.files[0];if(!f)return;if(!/\.(md|txt)$/i.test(f.name)||f.size>100000){toast('Choose a .txt or .md file smaller than 100 KB.');return;}try{const text=await f.text();if(importProject!==state.activeProjectId){toast('Import cancelled because you switched projects.');return;}if(text.length>12000){toast('Import up to 12,000 characters at a time.');return;}if(state.draft.text.trim()){pendingImport=text;modal('Replace the input text?',`<p>Your current draft contains writing. Export it first if you want to keep a separate copy.</p><div class="actions">${btn('Export current draft','export-md','','btn')}${btn('Replace input','confirm-import','','btn primary')}${btn('Cancel','close','','btn')}</div>`);}else{state.draft.text=text;log('Text imported','Imported a local text file. No server upload.');render();}}catch{toast('The file could not be read.');}}
});
// The tutorial uses ordinary product actions in an isolated practice project.
// It never calls an AI model, searches without a click, or approves for the author.
const TUTORIAL_PAPER=C.tutorialPaper;
const TUTORIAL_CLAIM=D.scenarios[C.tutorialScenario].claim;
function inTutorialProject(){return state.projectMeta.isTutorial===true&&state.activeProjectId===state.tutorial.projectId;}
function createTutorialProject(){
 const next=blankProject('Cellular reversal · Practice',C.question);
 next.meta.isTutorial=true;next.meta.tutorialVersion=C.version;
 next.research.aim='Practice separating a measured recovery from a proposed mechanism. The teaching sentence deliberately adds archive retrieval to a mouse vision result; inspect the source and narrow the claim.';
 next.research.tasks=[{id:'practice-paper',text:'Find a paper and separate its outcome from the proposed mechanism',done:false},{id:'practice-citation',text:'Check the evidence and approve a precise citation',done:false}];
 activateProject(next);log('Practice project created','Separate tutorial project. Example inputs are prepared; no AI has run.');save();return next.id;
}
function usePreparedTutorialPaper(){
 if(!inTutorialProject())return false;
 if(!state.papers[TUTORIAL_PAPER])state.papers[TUTORIAL_PAPER]={...clone(D.papers[TUTORIAL_PAPER]),id:TUTORIAL_PAPER,prepared:true};
 if(!state.research.savedSources.includes(TUTORIAL_PAPER))state.research.savedSources.push(TUTORIAL_PAPER);
 log('Tutorial source loaded',state.papers[TUTORIAL_PAPER].prepared?'Prepared paper and abstract excerpt loaded from the bundled example. This was not a live search.':'Previously retrieved source reused for the tutorial.',{paperId:TUTORIAL_PAPER});
 close();render();return true;
}
function useTutorialNote(){
 if(!inTutorialProject()||!state.papers[TUTORIAL_PAPER])return false;
 const annotation=state.research.sourceNotes[TUTORIAL_PAPER]||{note:'',tag:'to-read'};
 if(!annotation.note.trim())annotation.note='The study reports visual recovery in mice. This outcome does not distinguish retrieval of a preserved record from formation of a similar new state.';
 state.research.sourceNotes[TUTORIAL_PAPER]=annotation;
 log('Tutorial note inserted','Prepared teaching note. Review and edit it before using it; no AI assessment.',{paperId:TUTORIAL_PAPER});
 const field=document.querySelector('[data-source-note="'+TUTORIAL_PAPER+'"]');if(field)field.value=annotation.note;
 save();return true;
}
function useTutorialDraft(){
 if(!inTutorialProject())return false;
 if(state.draft.claims.some(c=>c.decision)){toast('Undo the practice decision before replacing this draft.');return false;}
 const before=state.draft.text;state.draft.text=TUTORIAL_CLAIM;
 log('Tutorial sentence inserted','Prepared, deliberately overstated teaching sentence. No AI-generated finding.',{before,after:TUTORIAL_CLAIM});
 const field=$('draftText');if(field)field.value=TUTORIAL_CLAIM;syncDraftUI();save();return true;
}
function openTutorialEvidence(){
 if(!inTutorialProject()||!state.papers[TUTORIAL_PAPER])return false;
 const c=current();if(!c||c.decision||stale())return false;
 if(c.candidate&&c.candidate!==TUTORIAL_PAPER&&c.manual&&[c.manual.quote,c.manual.revision,c.manual.note].some(value=>String(value||'').trim())){toast('Your review of another source is preserved. Select the practice paper explicitly if you want to continue with its example.');return false;}
 if(c.candidate!==TUTORIAL_PAPER||!c.manual){c.candidate=TUTORIAL_PAPER;c.manual={quote:'',verdict:'unreviewed',revision:'',note:''};log('Tutorial source opened','Saved source attached to the practice sentence. No citation approved.',{claimId:c.id,paperId:TUTORIAL_PAPER});}
 state.view='review';render();return true;
}
function useTutorialEvidence(){
 if(!inTutorialProject())return false;
 const c=current();if(!c||c.decision||stale()||c.text!==TUTORIAL_CLAIM||c.candidate!==TUTORIAL_PAPER){toast('The prepared review fits only the original practice sentence. Review your changed wording yourself.');return false;}
 const quote=D.papers[TUTORIAL_PAPER].evidence_excerpt;
 if(!matchQuote(quote,abstract(paper(TUTORIAL_PAPER)))){toast('The practice passage does not match this source. Inspect the source text before proceeding.');return false;}
 c.manual={quote,verdict:'partial',revision:D.scenarios[C.tutorialScenario].revised_claim,note:'Mechanism not demonstrated: visual recovery in mice does not by itself establish retrieval of a preserved cellular archive. Prepared teaching suggestion; author approval required.'};
 log('Prepared review suggestion loaded','Example quotation, assessment and wording inserted for the author to inspect. No AI judgment and no approval.',{claimId:c.id,paperId:TUTORIAL_PAPER});
 render();return true;
}
// Agent results are bound to the project that initiated them, even if the author switches.
function agentProject(id){return id===state.activeProjectId?state:state.projects.find(p=>p.id===id);}
function agentLog(projectId,event){const project=agentProject(projectId);if(!project)return;project.logs.unshift({id:uid(),at:new Date().toISOString(),mode:'draft',actor:['AI','Author','System'].includes(event.actor)?event.actor:'System',type:String(event.type||'Agent activity').slice(0,100),detail:String(event.detail||'').slice(0,3000),runId:event.runId||null,stage:event.stage||null});project.logs=project.logs.slice(0,250);save();}
function agentSafePaper(p){return p&&/^(MED:\d+|PMC:PMC\d+)$/.test(p.id)&&typeof p.title==='string'&&Array.isArray(p.authors)&&p.authors.every(a=>typeof a==='string')&&A?.safeLink(p.url);}
function saveAgentSources(projectId,result){const project=agentProject(projectId);if(!project)return false;let count=0;for(const p of result.papers||[]){if(!agentSafePaper(p))continue;const existing=project.papers[p.id];if(!existing){project.papers[p.id]={...clone(p),prepared:false};count++;}if(!project.research.savedSources.includes(p.id)){project.research.savedSources.push(p.id);count++;}}if(count){agentLog(projectId,{type:'AI sources saved',detail:'Author added retrieved source records to the library. No citations approved.',actor:'Author'});if(projectId===state.activeProjectId)render();else save();}return count>0;}
function saveAgentFindings(projectId,result){const project=agentProject(projectId);if(!project)return false;const summary=result.summary||{},groups=[['Findings suggested by AI',summary.established],['Uncertainty & limitations',summary.uncertain],['Next questions',summary.nextQuestions]];const text='### AI research check: '+String(result.question||'')+'\n\n'+groups.map(([heading,items])=>heading+'\n'+(Array.isArray(items)?items.map(x=>'- '+String(x)).join('\n'):'Not recorded.')).join('\n\n')+'\n\nSources inspected:\n'+(result.papers||[]).filter(agentSafePaper).map(p=>'- '+p.title+' — '+p.url).join('\n')+'\n\nAI suggestions saved by the author. Not independently validated; no experiment ran.';if(project.research.analysisNotes.includes(text)){toast('These findings are already in the notebook.');return false;}if(project.research.analysisNotes.length+text.length+2>20000){toast('This would exceed the notebook limit. Export or shorten existing notes first.');return false;}project.research.analysisNotes=[project.research.analysisNotes,text].filter(Boolean).join('\n\n');agentLog(projectId,{type:'AI findings saved',detail:'Author saved AI suggestions and source links to the notebook. Manuscript untouched.',actor:'Author'});if(projectId===state.activeProjectId)render();else save();return true;}
function canReviewAgentEvidence(projectId,result,evidence){
 if(projectId!==state.activeProjectId||state.mode!=='draft'||stale())return false;
 const c=result.claim?state.draft.claims.find(c=>c.id===result.claim.id&&c.text===result.claim.text&&!c.decision):state.draft.claims.find(c=>c.text===evidence.claim&&!c.decision);
 const p=result.papers?.find(p=>p.id===evidence.paperId),run=(state.research.aiRuns||[]).find(r=>r.id===result.clientRunId);
 if(result.claim&&(evidence.claimId!==result.claim.id||evidence.claim!==result.claim.text||(!run||E&&!E.freshness(run,state).fresh)))return false;
 return !!c&&(!c.manual||c.manual.evidenceRunId===result.clientRunId&&c.manual.aiSnapshot===JSON.stringify([c.manual.quote,c.manual.verdict,c.manual.revision,c.manual.note])||![c.manual.quote,c.manual.revision,c.manual.note].some(x=>String(x||'').trim()))&&agentSafePaper(p)&&evidence.quoteVerified===true&&typeof p.sourceText==='string'&&matchQuote(evidence.quote,p.sourceText);
}
function reviewAgentEvidence(projectId,result,evidence){
 if(!canReviewAgentEvidence(projectId,result,evidence)){toast('This check is outdated or an existing review needs your attention. Recheck the sentence or finish the current review first.');return false;}
 const c=result.claim?state.draft.claims.find(c=>c.id===result.claim.id):state.draft.claims.find(c=>c.text===evidence.claim&&!c.decision),p=result.papers.find(p=>p.id===evidence.paperId);
 state.papers[p.id]={...clone(p),prepared:false,agentSourceText:p.sourceText};if(!state.research.savedSources.includes(p.id))state.research.savedSources.push(p.id);
 c.candidate=p.id;c.manual={quote:evidence.quote,verdict:({supports:'supports',partial:'partial',unsupported:'unsupported',contradicts:'conflicting'})[evidence.label]||'unreviewed',revision:String(evidence.suggestedWording||''),note:[evidence.reason,Array.isArray(evidence.mismatchNotes)?evidence.mismatchNotes.join('; '):evidence.mismatchNotes,evidence.coverage].filter(Boolean).join(' ').slice(0,1500),aiGenerated:true,...(evidence.designCheck?{designCheck:clone(evidence.designCheck)}:{}),evidenceRunId:result.claim?result.clientRunId:null,evidenceKey:result.claim?result.clientRunId+':'+p.id:null};
 c.manual.aiSnapshot=JSON.stringify([c.manual.quote,c.manual.verdict,c.manual.revision,c.manual.note]);state.selected.draft=c.id;state.view='review';agentLog(projectId,{type:'AI evidence opened for review',detail:'Author opened an AI suggestion against the original sentence and retrieved source text. No citation or wording approved.',actor:'Author',runId:result.clientRunId});render();return true;
}

// Study workflows never call the model. Only an explicit author handoff stages context.
document.addEventListener('pherogent:study-workflow',event=>{
 const d=event.detail,project=agentProject(d?.projectId);if(!project||!['retrieval','calculation'].includes(d?.kind)||!record(d.run))return;
 const serialized=JSON.stringify(d.run);if(serialized.length>60000){toast('Run is too large for browser history. Download its full record.');return;}
 const incomingId=d.kind==='calculation'&&d.run.workflow==='data-analysis'&&typeof d.run.id==='string'&&/^data-[a-z0-9-]{1,100}$/.test(d.run.id)?d.run.id:null;
 if(d.run.projectId&&d.run.projectId!==d.projectId)return;
 if(incomingId&&(project.research.studyRuns||[]).some(item=>item?.id===incomingId))return;
 const run={...clone(d.run),id:incomingId||uid(),recordedAt:new Date().toISOString(),kind:d.kind};
 project.research.studyRuns=[run,...(Array.isArray(project.research.studyRuns)?project.research.studyRuns:[])].slice(0,5);
 agentLog(d.projectId,{type:d.kind==='retrieval'?'Study summaries retrieved':'Study skills calculated',detail:String(d.summary||'Deterministic study workflow completed.').slice(0,2400)+' 0 model tokens. Manuscript unchanged.',actor:'System',runId:run.id});
});
// Explicit author handoff: use the persisted reviewed revision, not event-supplied text.
document.addEventListener('pherogent:link-output',event=>{
 const d=event.detail;
 if(!O||!S||d?.projectId!==state.activeProjectId||!O.sections.includes(d?.stageId))return;
 const output=O.records(workspaceContext()).find(item=>item.id===d.output?.id);
 if(!output||output.projectId!==state.activeProjectId||output.status!=='reviewed'||output.revision!==d.output?.revision)return;
 state.research.agentWorkspace=window.PherogentStudioData.normalize(state.research.agentWorkspace,workspaceContext());
 const a=state.research.agentWorkspace.agents[d.stageId];if(!a)return;
 if(a.inputs.some(input=>input.outputRef?.id===output.id&&input.outputRef?.revision===output.revision)){toast('This reviewed version is already linked to the section.');close();S.openStage(d.stageId,'context');return;}
 if(a.inputs.length>=40){toast('This section has 40 inputs. Detach an input before linking another.');return;}
 const text=['AUTHOR-REVIEWED OUTPUT SNAPSHOT','Title: '+output.title,'Revision: '+output.revision,'Origin: '+output.provenance,output.url?'Source link: '+output.url:'',output.body,output.sourceRunId?'Original study run: '+output.sourceRunId:'','This is a saved copy reviewed by the author, not independent scientific verification. Later edits to the output do not update this copy.'].filter(Boolean).join('\n\n');
 if(text.length>20000){toast('This report is too long for section context. Shorten it or export it instead.');return;}
 a.inputs.push({id:uid(),kind:'note',title:output.title,text,provenance:'Author-reviewed output snapshot',status:'reviewed',outputRef:{id:output.id,revision:output.revision,projectId:state.activeProjectId},sourceSnapshot:output.sourceSnapshot?clone(output.sourceSnapshot):null,at:new Date().toISOString()});
 log('Reviewed output linked','Author linked revision '+output.revision+' of '+output.title+' to '+d.stageId+'. Saved snapshot only; no AI ran and no manuscript text changed.',{actor:'Author',stage:d.stageId,outputId:output.id});
 save();close();S.openStage(d.stageId,'context');toast('Reviewed output linked. Review context before sending to AI.');
});
document.addEventListener('pherogent:study-chat',event=>{
 const d=event.detail,r=d?.run;if(d?.projectId!==state.activeProjectId||!S||!record(r)||r.status!=='retrieved'||!Array.isArray(r.evidence)||!r.evidence.length)return;
 state.research.agentWorkspace=window.PherogentStudioData.normalize(state.research.agentWorkspace,workspaceContext());
 const a=state.research.agentWorkspace.agents.references;
 if(a.inputs.length>=40){toast('References has 40 inputs. Remove an input before adding this run.');return;}
 const text=['SUPPLIED STUDY SUMMARIES — NOT VERIFIED QUOTATIONS',
  'Collection: '+r.study,'Question: '+r.question,
  'Numerical analysis: NOT_RUN. Claim support: NOT_ASSESSED. Similarity is not scientific support. These are source-package paraphrases, not paper passages.',
  ...r.evidence.slice(0,5).map(e=>'Record '+String(e.id)+' | '+String(e.sourceUrl)+'\n'+String(e.text)),
  'Do not combine these records into a cross-study trajectory or infer same-cell tracking. Review the original sources before citing.'
 ].join('\n\n').slice(0,5000);
 const duplicate=a.inputs.some(i=>i.studyWorkflow&&i.text===text);
 if(!duplicate)a.inputs.unshift({id:uid(),kind:'note',title:r.collection?.label||r.study,text,studyWorkflow:true,provenance:'Retrieved supplied summaries · no verified quotation'});
 if(!a.composer.trim())a.composer='Help me review these study summaries for this question: '+String(r.question).slice(0,2000)+'. Identify what needs checking in the original sources.';
 log('Study summaries staged for chat','Author staged retrieved summaries in References. No AI call was made; review the send preview and consent before using the existing metered chat.');
 save();S.openStage('references','context');toast('Sources added. Review your message and consent before sending to AI.');
});

S?.init({
 context:workspaceContext,
 updateAgent:(projectId,stageId,mutate)=>{const p=agentProject(projectId),a=p?.research?.agentWorkspace?.agents?.[stageId];if(!a)return false;mutate(a);save();return true;},
 logProject:agentLog,
 saveChatRun:(projectId,run)=>{const p=agentProject(projectId);if(!p)return;if(!Array.isArray(p.research.aiRuns))p.research.aiRuns=[];if(!p.research.aiRuns.some(r=>r.id===run.id))p.research.aiRuns.push(clone(run));agentLog(projectId,{type:'AI section run recorded',detail:'Section: '+run.stage+'. Status: '+run.status+'. Actual usage and reserved allowance are recorded separately; manuscript unchanged.',actor:'System',runId:run.id,stage:run.stage});save();},
 workspace:()=>state.research.agentWorkspace,
 setWorkspace:next=>{state.research.agentWorkspace=next;},
 save,render,modal,close,log,toast,download,startResearchTour:()=>P?.start(),
 navigateStudio:()=>{state.mode='draft';state.view='studio';state.onboardingSeen=true;clearSearch();render();},
 navigate:view=>{if(VIEWS.includes(view)){state.view=view;close();render();}},
 getDraft:()=>state.draft.text,
 appendOutput:output=>{
  if(output.projectId!==state.activeProjectId)return false;
  const addition='## '+output.title+'\n\n'+output.body;
  if(state.draft.text.includes(addition)){toast('This exact output is already in your manuscript.');return false;}
  const before=state.draft.text,after=[before,addition].filter(Boolean).join('\n\n');
  if(after.length>12000){toast('This would exceed the 12,000 character manuscript limit. Export the section draft instead.');return false;}
  const previousBaseText=state.draft.baseText;state.draft.text=after;if(before===previousBaseText)state.draft.baseText=after;state.research.agentWorkspace.lastInsertion={before,after,previousBaseText,stage:output.stage,at:new Date().toISOString()};
  log('Agent output added to manuscript','Author added a reviewed copy of '+output.title+'. Origin: '+output.provenance+'. No citations automatically approved.',{stage:output.stage,actor:'Author',before,after});save();return true;
 },
 undoInsertion:()=>{
  const last=state.research.agentWorkspace?.lastInsertion;if(!last)return false;
  if(state.draft.text!==last.after){toast('Your manuscript has changed since this addition. Undo is stopped to protect your newer edits.');return false;}
  state.draft.text=last.before;if(typeof last.previousBaseText==='string')state.draft.baseText=last.previousBaseText;delete state.research.agentWorkspace.lastInsertion;log('Manuscript addition undone','Author reverted the last section insertion. The section draft remains available.');save();return true;
 }
});
M?.init({context:workspaceContext,save,render,modal,close,log,toast,navigate:view=>{if(VIEWS.includes(view)){close();clearSearch();state.mode='draft';state.view=view;render();}}});
O?.init({context:workspaceContext,save,render,modal,close,log,toast,download,openStage:(id,panel)=>S?.openStage(id,panel),createProject:showNewProject,navigate:view=>{if(VIEWS.includes(view)){close();clearSearch();state.mode='draft';state.view=view;render();}}});
X?.init({context:workspaceContext,save,render,log,toast,download,navigate:view=>{if(VIEWS.includes(view)){close();clearSearch();state.mode='draft';state.view=view;render();}}});
U?.init({context:workspaceContext,usage:()=>A?.getUsageSnapshot?.(),navigate:view=>{if(VIEWS.includes(view)){close();state.view=view;render();}},download,save,log});
function openProcessPractice(options={}){
 if(state.tutorial.status==='active')T?.pause();
 const existing=projectList().find(p=>p.meta.isProcessTutorial);
 if(existing&&!options.restart){if(existing.id!==state.activeProjectId)activateProject(existing);return existing.id;}
 const next=blankProject('Cellular reversal · Full research walkthrough',C.question);
 next.meta.isTutorial=true;next.meta.isProcessTutorial=true;next.meta.tutorialVersion=C.version;next.meta.sampleVersion=C.version;
 next.research=R.sampleResearch();next.research.agentWorkspace=window.PherogentStudioData.create({project:next.meta,research:next.research,draft:next.draft,papers:[]});
 next.papers=Object.fromEntries(C.paperIds.map(id=>[id,{...clone(D.papers[id]),id,prepared:true}]));next.research.savedSources=C.paperIds.slice();
 let text=C.manuscriptIntro;const spans=[];
 for(const i of C.scenarioIndices){const scenario=D.scenarios[i],start=text.length;const c={id:'practice-'+uid(),scenario:i,original:scenario.claim,text:scenario.claim,candidate:scenario.preferred_paper_id||C.paperIds[0],decision:null,manual:null,start,end:start+scenario.claim.length};spans.push(c);text+=c.text+'\n\n';}
 text+=C.manuscriptDiscussion;next.draft={title:next.draft.title,text,baseText:text,claims:spans};next.selectedDraft=spans[0]?.id||null;
 activateProject(next);log('Full research practice created','Separate practice project with prepared papers and examples. No AI or data analysis ran.');save();return next.id;
}
P?.init({context:workspaceContext,workspace:()=>state.research.agentWorkspace,save,render,openStage:id=>S?.openStage(id),navigate:view=>{if(VIEWS.includes(view)){close();state.view=view;render();}},openPracticeProject:openProcessPractice,openExportMenu:exportMenu,modal,close,toast});
A?.init({
 beforeOpen:()=>{close();if(state.tutorial.status==='active')T?.pause();},
 context:()=>({projectId:state.activeProjectId,title:state.draft.title,question:state.view==='review'?(current()?.text||state.research.question):state.research.question||current()?.text||'',runs:Array.isArray(state.research.aiRuns)?state.research.aiRuns:[]}),
 modal,toast,log:agentLog,
 isClaimCurrent:(projectId,binding)=>{const p=agentProject(projectId),c=p?.draft.claims.find(c=>c.id===binding.claim?.id);return !!c&&p.draft.text===p.draft.baseText&&c.text===binding.claim.text&&p.draft.text.slice(c.start,c.end)===c.text&&Object.entries(binding.sourceSnapshots||{}).every(([id,snapshot])=>E?.sourceSnapshot(p.papers[id])===snapshot);},
 saveRun:(projectId,run)=>{const p=agentProject(projectId);if(!p)return;if(!Array.isArray(p.research.aiRuns))p.research.aiRuns=[];if(!p.research.aiRuns.some(r=>r.id===run.id))p.research.aiRuns.push(clone(run));agentLog(projectId,{type:'AI research '+run.status,detail:'Research record saved locally. '+Number(run.usage?.totalTokens||0)+' tokens reported; '+Number(run.usage?.calls||0)+' model calls reported.'+(run.usage?.usageUnknown||run.usage?.unknownCalls?' Usage is incomplete.':'')+' No manuscript edits were made.',actor:'System',runId:run.id});save();if(projectId===state.activeProjectId&&state.view==='review')render();},
 saveFindings:saveAgentFindings,saveSources:saveAgentSources,canReview:canReviewAgentEvidence,reviewEvidence:reviewAgentEvidence
});
T?.init({
 snapshot:()=>({tutorial:state.tutorial,activeProjectId:state.activeProjectId,projectMeta:state.projectMeta,view:state.view,research:state.research,draft:state.draft,papers:state.papers,logs:state.logs,search,currentClaim:current(),citationCount:cited().length}),
 saveTutorial:next=>{state.tutorial=T.normalize(next);save(true);},
 createTutorialProject,switchProject,
 navigate:view=>{if(!VIEWS.includes(view))return;if((state.view==='literature')!==(view==='literature'))clearSearch();state.view=view;close();render();},
 prefillQuery:query=>{ensureSearchQuery();search.query=String(query).slice(0,300);if($('searchQuery'))$('searchQuery').value=search.query;},
 usePreparedPaper:usePreparedTutorialPaper,useExampleNote:useTutorialNote,useExampleDraft:useTutorialDraft,
 openTutorialEvidence,useExampleEvidence:useTutorialEvidence,closeDialog:close,toast
});
$('closeDialog').addEventListener('click',close);
$('dialog').addEventListener('cancel',()=>{if(introOpen){introOpen=false;state.onboardingSeen=true;save();}});
render();
if(recoveryNotice)toast('Saved work needs recovery. Export a workspace backup to preserve its original contents.');
 if(!state.onboardingSeen&&!studyDeepLink){if(S){S.welcome();introOpen=true;}else showIntro();}
})();
