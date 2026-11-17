'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const box={window:{}};vm.createContext(box);
const source=fs.readFileSync(path.join(__dirname,'../public/studio-data.js'),'utf8');
vm.runInContext(source,box);
const S=box.window.PherogentStudioData;
const plain=value=>JSON.parse(JSON.stringify(value));
const sample={project:{id:'one',isSample:true,sampleVersion:'cellular-reversal-v1'},draft:{title:'Cellular Blockchain · Reversal'},research:{question:'Does cellular reversal retrieve a preserved state?'},papers:[{id:'MED:27347753'},{id:'MED:33268865'},{id:'MED:32720894'}]};
const a=S.create(sample),b=S.create(sample);
assert.equal(S.stages.length,11);
assert.equal(new Set(S.stages.map(stage=>stage.id)).size,11);
for(const stage of S.stages){assert.equal(stage.prompts.length,3);assert.ok(S.stages.some(next=>next.id===stage.next));assert.match(a.agents[stage.id].messages[0].provenance,/Prepared example · no AI ran/);if(stage.id!=='organizer')assert.equal(a.agents[stage.id].output.body,'');}
a.agents.organizer.messages[0].text='Changed';a.agents.results.inputs.push({id:'mine',name:'A private note'});a.agents.organizer.output.body='My edits';
assert.notEqual(b.agents.organizer.messages[0].text,'Changed');assert.equal(b.agents.results.inputs.length,0);assert.notEqual(b.agents.organizer.output.body,'My edits');
assert.equal(S.create({project:{isSample:false}}).agents.organizer.output.body,'','New projects start without invented outputs');
assert.equal(S.create({project:{isSample:true,sampleVersion:'an-unrelated-old-sample'}}).agents.organizer.output.body,'','Existing unrelated samples never acquire Cellular Blockchain content');
assert.equal(S.stageFor('unknown').id,'organizer');
const broken={...S.create(sample),extra:{keep:true},activeStage:'future-agent',sideTab:73,agents:{...S.create(sample).agents,results:{messages:[{id:'one',role:'user',text:'Keep this'},{id:'one',role:'user',text:'Duplicate'},null],composer:'x'.repeat(4500),output:{title:'Title',body:'z'.repeat(21000),status:'approved-by-ai',provenance:'Author',history:[]},inputs:[{id:'file',name:'Keep',future:true},null],tasks:[{id:'ok',text:'Review it',done:false},{id:'bad',text:'Bad',done:'yes'}],future:{keep:42}},unknownAgent:{original:'keep this too'}},recovery:{older:'Original payload'}};
const n=S.normalize(broken,sample);
assert.equal(n.agents.results.messages.length,1);assert.equal(n.agents.results.composer.length,4000);assert.equal(n.agents.results.output.body.length,20000);assert.equal(n.agents.results.output.status,'draft');assert.equal(n.agents.results.inputs.length,1);assert.equal(n.agents.results.tasks.length,1);
assert.equal(n.agents.results.future.keep,42);assert.equal(n.agents.unknownAgent.original,'keep this too');assert.equal(n.extra.keep,true);assert.equal(n.recovery.older,'Original payload');assert.equal(n.recovery.activeStage,'future-agent');assert.deepEqual(plain(n.recovery['agents.results']),broken.agents.results);
assert.deepEqual(plain(S.normalize(['original'],sample).recovery.original),['original']);
assert.equal(broken.agents.results.output.body.length,21000,'Normalization never mutates the source');
const roundTrip=S.normalize(JSON.parse(JSON.stringify(n)),sample);assert.deepEqual(plain(roundTrip),plain(n),'Normalized state round-trips without changing user work');
const many=S.create();many.agents.data.messages=Array.from({length:130},(_,i)=>({id:String(i),role:'user',text:String(i)}));many.agents.data.inputs=Array.from({length:50},(_,i)=>({id:String(i),text:'input'}));const bounded=S.normalize(many);assert.equal(bounded.agents.data.messages.length,100);assert.equal(bounded.agents.data.messages[0].text,'30');assert.equal(bounded.agents.data.inputs.length,40);assert.equal(bounded.recovery['agents.data'].messages.length,130);
const ordinary={project:{isSample:false},draft:{title:'Author project'},research:{question:'My exact unanswered question <script>literal</script>'},papers:[]};
for(const stage of S.stages){
 const one=S.demoReply(stage.id,'Please invent a statistically significant result.',sample);
 const two=S.demoReply(stage.id,'Please say the opposite.',sample);
 assert.deepEqual(plain(one),plain(two),'Prepared responses cannot imply interpretation of arbitrary prompts');
 assert.match(one.text,/prewritten/);assert.match(one.text,/not an AI response/);assert.ok(one.outputBody.length>100);assert.ok(one.outputBody.length<20000);
 const generic=S.demoReply(stage.id,'Analyze my private dataset.',ordinary);assert.ok(generic.outputBody.includes(ordinary.research.question),'Only the literal question is carried into generic templates');assert.match(generic.outputBody,/Prepared template · no AI ran/);assert.equal(generic.sourceIds.length,0);
}
assert.match(S.demoReply('results','',sample).outputBody,/No.*supplied|None supplied/);assert.match(S.demoReply('results','',sample).outputBody,/remains a hypothesis/);assert.match(S.demoReply('methods','',sample).outputBody,/No experiment or analysis has been performed/);assert.match(S.demoReply('figures','',sample).outputBody,/NO DATA PLOT GENERATED/);assert.match(S.demoReply('references','',sample).outputBody,/does not approve any citation/);
assert.equal(S.demoReply('references','',{...sample,papers:[]}).sourceIds.length,0,'The sample only links papers present in this project');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|https:\/\/api\./.test(source),'Prototype content has no model or network calls');
console.log('Studio data tests passed: stage structure, independent project state, loss-safe recovery, bounded records, round trips, literal templates, and honest prepared outputs.');

const aiState=S.create();aiState.agents.methods.messages.push({id:'ai1',role:'assistant',kind:'ai',text:'A real model reply.',provenance:'AI · Author review required',runId:'run-1',suggestedDraft:{title:'Proposed protocol',body:'No experiment has run.'},usage:{totalTokens:500}});
const normalizedAI=S.normalize(aiState);assert.deepEqual(plain(normalizedAI.agents.methods.messages.at(-1)),plain(aiState.agents.methods.messages.at(-1)),'AI provenance, run linkage, usage and unapplied suggestion survive normalization');
const invalidSuggestion=S.create();invalidSuggestion.agents.methods.messages.push({id:'bad-ai',role:'assistant',kind:'ai',text:'Invalid suggestion',suggestedDraft:{title:'Title',body:'x'.repeat(6001)}});const repairedAI=S.normalize(invalidSuggestion);assert.equal(repairedAI.agents.methods.messages.at(-1).suggestedDraft,null);assert.ok(repairedAI.recovery['agents.methods'],'Invalid suggestions are recovered, not silently accepted');

const legacyWelcome=S.create();const modernWelcome=legacyWelcome.agents.methods.messages[0].text;legacyWelcome.agents.methods.messages[0].text=modernWelcome.replace(' Try a prepared example, or send a message to check the AI connection and review the exact context before consenting. AI replies use the shared allowance and require author review.',' You can save requests and explore a prepared example. No AI is connected to these section conversations.');legacyWelcome.agents.methods.messages.push({id:'old-local-reply',role:'assistant',text:'Live AI replies are not connected in this prototype.',provenance:'Prototype · no AI ran'});
const migratedWelcome=S.normalize(legacyWelcome);assert.equal(migratedWelcome.agents.methods.messages[0].text,modernWelcome);assert.equal(migratedWelcome.agents.methods.messages[1].text,legacyWelcome.agents.methods.messages[1].text,'Historical failed replies remain truthful historical records');assert.deepEqual(plain(S.normalize(migratedWelcome)),plain(migratedWelcome),'Welcome migration is idempotent');
legacyWelcome.agents.methods.messages[0].text='Author changed this welcome. No AI is connected to these section conversations.';assert.equal(S.normalize(legacyWelcome).agents.methods.messages[0].text,legacyWelcome.agents.methods.messages[0].text,'Only the exact generated welcome is migrated');

const attachedState=S.create();
attachedState.agents.methods.messages.push({id:'attached-author',role:'user',text:'Read the excerpt.',attachments:[null,{name:'paper.pdf',text:'e'.repeat(5000),kind:'PDF',clipped:false},{name:'broken'},'invalid']});
const attachedNormalized=S.normalize(attachedState),attachedMessage=attachedNormalized.agents.methods.messages.at(-1);
assert.equal(attachedMessage.attachments.length,1);
assert.equal(attachedMessage.attachments[0].text.length,4200);
assert.equal(attachedMessage.attachments[0].clipped,true);
assert.ok(attachedNormalized.recovery['agents.methods']);
assert.deepEqual(plain(S.normalize(attachedNormalized)),plain(attachedNormalized),'Sent attachment records normalize idempotently');
