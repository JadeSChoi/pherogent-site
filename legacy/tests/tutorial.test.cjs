'use strict';
// Tutorial gates are tested against research state, not animation timing.
// The app adapter checks separately that guided examples cannot edit real projects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

const sandbox = { window: {}, console, URL, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(read('public/tutorial.js'), sandbox);
const T = sandbox.window.PherogentTutorial;
assert.ok(T, 'The optional tutorial has a public controller');
assert.equal(T.steps.length, 8, 'The tutorial includes a bounded set of useful missions');

// On small screens, the highlighted control must sit above the tutorial sheet.
// Positive offsets scroll down; negative offsets reveal controls above the band.
const visibleBand = {top:96,bottom:440};
assert.equal(T.getScrollOffset({top:120,bottom:300,height:180},visibleBand),0,'An unobscured target does not move');
assert.equal(T.getScrollOffset({top:96,bottom:440,height:344},visibleBand),0,'A target exactly fitting the available band does not move');
assert.equal(T.getScrollOffset({top:400,bottom:480,height:80},visibleBand),40,'A target behind the bottom sheet scrolls fully above it');
assert.equal(T.getScrollOffset({top:66,bottom:166,height:100},visibleBand),-30,'A target hidden above the band scrolls into view');
assert.equal(T.getScrollOffset({top:120,bottom:600,height:480},visibleBand),24,'An oversized target aligns its beginning with the visible band');
assert.equal(T.getScrollOffset({top:50,bottom:530,height:480},visibleBand),-46,'An oversized target above the band remains reachable from its beginning');
const coachEntry = read('public/tutorial.css').match(/@keyframes\s+tour-appear\s*\{([\s\S]*?)\}\s*\}/);
assert.ok(coachEntry,'The coach entry animation remains inspectable');
assert.doesNotMatch(coachEntry[1],/\btransform\s*:/,'Coach entry cannot change geometry after scroll positions are measured');

for (const value of [undefined, null, 'invalid', 7, [], {status:'unknown',step:999}]) {
  const normalized = T.normalize(value);
  assert.ok(['idle','active','paused','completed'].includes(normalized.status));
  assert.ok(Number.isInteger(normalized.step) && normalized.step >= 0 && normalized.step < T.steps.length);
}
const paused = T.normalize({version:1,status:'paused',step:4,projectId:'practice',returnProjectId:'my-research'});
assert.equal(paused.status, 'paused');
assert.equal(paused.step, 4, 'Reload preserves the real current mission');
assert.equal(paused.projectId, 'practice');
assert.equal(paused.returnProjectId, 'my-research', 'Returning to real work has a durable project identity');
const damaged=T.normalize({status:'active',step:100,projectId:7,returnProjectId:'author',customFutureField:'keep'});
assert.equal(damaged.status,'idle','A missing practice identity cannot create an active orphaned tour');
assert.equal(damaged.recovery.step,100,'Unreadable progress is retained for recovery');
assert.equal(damaged.recovery.projectId,7,'Invalid project identity is retained for recovery');
assert.equal(damaged.customFutureField,'keep','Unknown future tutorial fields remain intact');

// A saved tutorial from the old demo must not resume against new teaching material.
const versionedBox = {window:{PHEROGENT_CELL_DEMO:{version:'cellular-reversal-v1'}},console,URL,setTimeout:()=>1,clearTimeout(){}};
vm.createContext(versionedBox);
vm.runInContext(read('public/tutorial.js'),versionedBox);
const versionedTutorial = versionedBox.window.PherogentTutorial;
const versionedState = {tutorial:{version:1,status:'active',step:5,projectId:'old-practice',returnProjectId:'my-research'},activeProjectId:'old-practice',projectMeta:{isTutorial:true},view:'review'};
let practiceCreations=0, automaticSourceSelections=0;
versionedTutorial.init({
  snapshot:()=>versionedState,
  saveTutorial:next=>{versionedState.tutorial=next;},
  createTutorialProject:()=>{practiceCreations++;versionedState.activeProjectId='new-practice';versionedState.projectMeta={isTutorial:true};return 'new-practice';},
  navigate:view=>{versionedState.view=view;},
  openTutorialEvidence:()=>{automaticSourceSelections++;},
});
assert.equal(versionedState.tutorial.status,'paused','Loading an old active tutorial pauses before applying the new content');
assert.equal(versionedState.tutorial.projectId,'old-practice','The old practice identity survives initial migration');
assert.equal(practiceCreations,0,'Loading the page does not create a project without an author start/resume action');
versionedTutorial.resume();
assert.equal(practiceCreations,1,'Explicitly resuming an older version creates new practice');
assert.equal(versionedState.tutorial.contentVersion,'cellular-reversal-v1');
assert.equal(versionedState.tutorial.step,0,'A new teaching example restarts at the research question');
assert.equal(versionedState.tutorial.returnProjectId,'my-research','The author can still return to the original research project');
assert.equal(automaticSourceSelections,0,'Old passage-stage progress cannot select evidence in the new tutorial');
versionedTutorial.pause();versionedTutorial.resume();
assert.equal(practiceCreations,1,'A matching version resumes the existing new practice project');

const paperId = 'MED:33268865';
const quote = 'reverses vision loss in a mouse model of glaucoma and in aged mice.';
const paper = {id:paperId,title:'Vision study',authors:['Lu Y'],abstract:'The intervention '+quote};
const original = 'Partial reprogramming restores vision in mice by reading a preserved cellular archive.';
const revision = 'Partial reprogramming improved visual function in older mice and in a mouse glaucoma model.';
const initial = () => ({
  tutorial:{version:1,status:'active',step:0,projectId:'practice',returnProjectId:'my-research'},
  activeProjectId:'practice',projectMeta:{id:'practice',isTutorial:true},
  view:'overview',research:{question:'Does restored function show a preserved archive was read?',sourceNotes:{},savedSources:[],analysisNotes:''},
  draft:{text:'',baseText:'',claims:[]},papers:{},logs:[],
  search:{query:'',papers:[],total:null,loading:false,error:''},currentClaim:null,citationCount:0,
});
const ready = (state, index) => T.getStepStatus({...state,tutorial:{...state.tutorial,step:index}},index).ready;

const s = initial();
assert.equal(ready(s,0), true, 'The author can begin with a real practice project');
for (const index of [1,2,3,4,5,6]) assert.equal(ready(s,index),false,'Unperformed work cannot complete mission '+index);
s.search.query='EXT_ID:33268865 AND SRC:MED';
assert.equal(ready(s,1),false,'A suggested search query is not a completed search');
s.search.loading=true;
assert.equal(ready(s,1),false,'A pending API request is not a completed search');
s.search.loading=false;s.search.error='Connection failed';
assert.equal(ready(s,1),false,'A failed request cannot be narrated as a successful live search');
s.search.error='';
s.search.papers=[paper]; s.search.total=1;
assert.equal(ready(s,1),true,'A returned candidate completes the search mission');
assert.equal(ready(s,2),false,'A search result is not silently saved');
s.papers[paperId]=paper; s.research.savedSources=[paperId];
assert.equal(ready(s,2),true,'Saving the paper completes the collection mission');
assert.equal(ready(s,6),false,'Saving a paper never approves its evidence');
s.research.sourceNotes[paperId]={note:'Mouse visual recovery was reported; archive retrieval is not established by this passage.',tag:'useful'};
assert.equal(ready(s,3),false,'Typing a reading note is separate from carrying it into the notebook');
s.research.analysisNotes='### Vision study\n\nMouse visual recovery was reported; archive retrieval is not established by this passage.';
s.logs.push({type:'Source note added to notebook',paperId,actor:'Author'});
assert.equal(ready(s,3),true,'A note that reaches the notebook completes this mission');
s.draft.text=original;
assert.equal(ready(s,4),false,'Typing a draft alone does not prepare its claims');
const claim={id:'claim-one',original,text:original,start:0,end:original.length,candidate:paperId,decision:null,manual:null};
s.draft.baseText=original; s.draft.claims=[claim]; s.currentClaim=claim;
assert.equal(ready(s,4),true,'An actual prepared sentence completes the draft mission');
claim.manual={quote:'restores vision by reading a preserved cellular archive.',verdict:'partial',revision,note:'Mechanism mismatch: a recovered outcome does not establish an archive read.'};
assert.equal(ready(s,5),false,'The tutorial cannot bypass exact-quote checking');
claim.manual.quote=quote;
assert.equal(ready(s,5),true,'An exact passage and assessment can be submitted for approval');
assert.equal(ready(s,6),false,'Verified text is not author approval');
claim.decision={type:'apply',before:original,after:revision,paperId,assessment:'author'};
claim.text=revision; s.draft.text=revision; s.draft.baseText=revision; s.citationCount=1;
assert.equal(ready(s,6),true,'Only the recorded author approval completes the approval mission');

const other={...s,activeProjectId:'my-research',projectMeta:{id:'my-research',isTutorial:false}};
for(const index of [1,2,3,4,5,6]) assert.equal(ready(other,index),false,'Real-project work cannot advance the practice tutorial');

function appHarness(stored = {}) {
  const elements=new Map(), events={}, values=new Map(Object.entries(stored));
  let api, searchCalls=0;
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',innerHTML:'',dataset:{},open:false,hidden:false,
      addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},focus(){},setSelectionRange(){},
      setAttribute(){},removeAttribute(){},classList:{toggle(){}}});
    return elements.get(id);
  };
  const box={window:{PherogentLiterature:{search:async()=>{searchCalls++;return {total:0,papers:[]};}},
    PherogentTutorial:{normalize:T.normalize,init(value){api=value;},refresh(){},start(){},pause(){}}},
    document:{getElementById:element,querySelector:element,querySelectorAll:()=>[],body:{appendChild(){}},
      createElement:()=>({click(){},remove(){}}),addEventListener(type,fn){(events[type]||=[]).push(fn);}},
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
    URL,URLSearchParams,AbortController,Blob,Intl,Date,Math,console,setTimeout:()=>1,clearTimeout(){}};
  vm.createContext(box);
  vm.runInContext(read('public/reference-data.js'),box);
  vm.runInContext(read('public/cell-demo.js'),box);
  vm.runInContext(read('public/research-workspace.js'),box);
  const source=read('public/app.js');
  const testable=source.replace(/\nrender\(\);\n(?=if\(recoveryNotice\))/, '\nwindow.__tutorialTest={state:()=>state,render,prepare};\nrender();\n');
  assert.notEqual(source,testable,'Adapter assertions attach at the existing startup boundary');
  vm.runInContext(testable,box);
  assert.ok(api,'App initializes the tutorial through its narrow adapter');
  return {api,element,values,state:box.window.__tutorialTest.state,prepare:box.window.__tutorialTest.prepare,searchCalls:()=>searchCalls};
}

const h=appHarness(), before=h.state();
before.draft.title='My independent research';
before.draft.text='The author’s unpublished draft must survive every tutorial action.';
before.research.question='My research question';
before.research.analysisNotes='Private working notes';
const ownId=before.activeProjectId, ownDraft=plain(before.draft), ownResearch=plain(before.research);
const practiceId=h.api.createTutorialProject();
assert.notEqual(practiceId,ownId,'Practice work has a different project identity');
assert.equal(h.state().activeProjectId,practiceId);
assert.equal(h.state().projectMeta.isTutorial,true);
assert.deepEqual(plain(h.state().projects.find(p=>p.id===ownId).draft),ownDraft,'Creating practice preserves the complete original draft');
h.api.saveTutorial({version:1,status:'active',step:1,projectId:practiceId,returnProjectId:ownId});
h.api.navigate('literature');
h.api.prefillQuery('EXT_ID:33268865 AND SRC:MED');
assert.equal(h.searchCalls(),0,'Entering the guide and suggesting keywords never submits a network search');
h.api.usePreparedPaper();
assert.equal(h.searchCalls(),0,'The explicit prepared fallback makes no fake live search');
assert.equal(h.state().papers[paperId].prepared,true,'Fallback source retains prepared provenance');
assert.equal(h.state().draft.claims.filter(c=>c.decision).length,0,'Loading an example does not approve a citation');
assert.ok(h.state().logs.some(log=>/prepared/i.test(log.detail)),'Activity honestly records the prepared path');
h.api.useExampleNote(); h.api.useExampleDraft();
assert.equal(h.state().draft.text,original,'Practice helpers insert the cellular archive overclaim into only the practice draft');
h.state().research.sourceNotes[paperId].note='My own reading note is more specific than the prepared suggestion.';
h.api.useExampleNote();
assert.equal(h.state().research.sourceNotes[paperId].note,'My own reading note is more specific than the prepared suggestion.','The note shortcut preserves authored practice notes');
h.prepare();
const practiceClaim=h.state().draft.claims[0];
const alternateId='MED:99912345';
h.state().papers[alternateId]={id:alternateId,title:'An author-selected alternative study',authors:['A Researcher'],abstract:'An independently chosen source passage.'};
for(const field of ['quote','revision','note']){
  practiceClaim.candidate=alternateId;
  practiceClaim.manual={quote:'',verdict:'partial',revision:'',note:'',[field]:'Author review content must survive.'};
  const authoredReview=plain(practiceClaim),logCount=h.state().logs.length;
  assert.equal(h.api.openTutorialEvidence(),false,'The tutorial must not replace an alternate source with authored '+field);
  assert.deepEqual(plain(practiceClaim),authoredReview,'The alternate source and its '+field+' remain intact');
  assert.equal(h.state().logs.length,logCount,'A protected review does not log a source replacement');
}
practiceClaim.candidate=null;practiceClaim.manual=null;
h.api.openTutorialEvidence(); h.api.useExampleEvidence();
assert.equal(h.state().draft.claims[0].manual.verdict,'partial','A real outcome does not validate the proposed archive mechanism');
assert.match(h.state().draft.claims[0].manual.note,/archive|mechanism/i,'The review explains the unsupported mechanism');
assert.equal(h.state().draft.claims[0].manual.quote,quote,'The new example still uses the checked Lu source passage');
assert.equal(h.state().draft.claims[0].manual.revision,revision,'The suggestion removes the archive mechanism and preserves the measured mouse outcome');
assert.equal(h.state().draft.claims[0].decision,null,'A suggested review never approves itself');
assert.ok(h.state().logs.some(log=>/No AI judgment and no approval/.test(log.detail)),'Example assistance remains explicitly distinguishable from an AI run');
const changed=h.state().draft.claims[0];
changed.text='The author changed the practice sentence to a different research claim.';
h.state().draft.text=changed.text;h.state().draft.baseText=changed.text;changed.end=changed.text.length;
changed.manual={quote:'',verdict:'unreviewed',revision:'',note:'Author note must survive.'};
assert.equal(h.api.useExampleEvidence(),false,'The prepared review cannot be applied to arbitrary changed wording');
assert.equal(changed.manual.note,'Author note must survive.');
h.api.switchProject(ownId);
const protectedState=plain({draft:h.state().draft,research:h.state().research,papers:h.state().papers});
for(const helper of ['usePreparedPaper','useExampleNote','useExampleDraft','openTutorialEvidence','useExampleEvidence'])h.api[helper]();
assert.deepEqual(plain({draft:h.state().draft,research:h.state().research,papers:h.state().papers}),protectedState,'Every guided example helper refuses to edit a real project');
assert.deepEqual(plain(h.state().draft),ownDraft);
assert.deepEqual(plain(h.state().research),ownResearch);
const reloaded=appHarness(Object.fromEntries(h.values));
assert.equal(reloaded.state().activeProjectId,ownId);
assert.deepEqual(plain(reloaded.state().draft),ownDraft,'The protected manuscript survives reload');
assert.ok(reloaded.state().projects.some(p=>p.id===practiceId&&p.meta.isTutorial),'Practice work remains independently available after reload');

console.log('Tutorial checks passed: mission gates, quote verification, approval, pause state, honest fallback and real-project protection.');
