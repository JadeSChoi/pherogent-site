'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/evidence-inbox.js','utf8'),sandbox);const E=sandbox.window.PherogentEvidence;
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const claim={id:'c1',text:'An intervention improves visual function in humans.',start:0};claim.end=claim.text.length;
 const before={id:'MED:123',title:'Study',authors:['Author A'],year:2020,journal:'Journal',url:'https://europepmc.org/article/MED/123',abstract:'An old abstract.'};
 const paper={...before,abstract:'Visual function improved in mice.',sourceText:'Visual function improved in mice.'};
 const result={pipelineVersion:'claim-check-v1',claim:{id:claim.id,text:claim.text,citedPaperIds:[paper.id]},papers:[paper],evidence:[{claimId:claim.id,claim:claim.text,paperId:paper.id,label:'partial',quote:'Visual function improved in mice.',suggestedWording:'An intervention improved visual function in mice.'}]};
 const run={id:'run1',kind:'claim_check',status:'completed',at:'2026-10-31',claimContext:{claim:{id:claim.id,text:claim.text},citedPaperIds:[paper.id],sourceSnapshots:{[paper.id]:E.sourceSnapshot(before)}},result};
 const ctx={draft:{text:claim.text,baseText:claim.text,claims:[claim]},papers:{[paper.id]:before},research:{aiRuns:[run]}};return{ctx,run,paper,before,claim};
}
test('an original sentence and its matching prefetch source can open a fetched result',()=>{const{ctx,run}=fixture();assert.equal(E.freshness(run,ctx).fresh,true);assert.equal(E.records(ctx)[0].status,'awaiting_author');assert.equal(E.matchingRun(ctx,ctx.draft.claims[0],['MED:123']).id,'run1');});
test('different text or removed identity cannot reuse a result',()=>{const{ctx,run,claim}=fixture();claim.text='A different scientific claim.';ctx.draft.text=ctx.draft.baseText=claim.text;claim.end=claim.text.length;assert.equal(E.freshness(run,ctx).fresh,false);assert.equal(E.records(ctx)[0].status,'needs_recheck');claim.id='another-id';assert.equal(E.freshness(run,ctx).fresh,false);});
test('checked source replacement and all bibliographic identity changes invalidate an opened record',()=>{const{ctx,run,paper,before,claim}=fixture();ctx.papers[paper.id]=copy(paper);claim.manual={evidenceRunId:run.id};claim.candidate=paper.id;assert.equal(E.freshness(run,ctx).fresh,true);for(const [field,value] of Object.entries({title:'Different',authors:['Another'],year:2025,journal:'Other',url:'https://europepmc.org/article/MED/999',sourceText:paper.sourceText+' Changed.'})){ctx.papers[paper.id]={...paper,[field]:value};assert.equal(E.freshness(run,ctx).fresh,false,field);}ctx.papers[paper.id]=before;assert.equal(E.freshness(run,ctx).fresh,false,'Returning to old prefetch text must not restore validity after inspecting fetched text.');});
test('author revision is separate from original AI verdict and other cards become view-only',()=>{const{ctx,run,paper,claim}=fixture();ctx.papers[paper.id]=copy(paper);const original=claim.text;claim.text='An intervention improved visual function in mice.';claim.end=claim.text.length;ctx.draft.text=ctx.draft.baseText=claim.text;claim.decision={type:'apply',before:original,after:claim.text,evidenceRunId:run.id,evidenceKey:run.id+':'+paper.id,paperId:paper.id,sourceSnapshot:E.sourceSnapshot(paper)};const second={...paper,id:'MED:456'};run.result.papers.push(second);run.result.evidence.push({...run.result.evidence[0],paperId:second.id});const records=E.records(ctx);assert.equal(records[0].status,'approved');assert.equal(records[0].claim,original);assert.equal(records[0].currentText,claim.text);assert.equal(records[1].status,'decision_recorded');ctx.papers[paper.id].year=2025;assert.equal(E.records(ctx)[0].status,'needs_recheck');});
test('cross-claim and fabricated quote cards never appear as verified evidence',()=>{const{ctx,run}=fixture();run.result.evidence[0].claimId='wrong';assert.equal(E.records(ctx).length,0);run.result.evidence[0].claimId='c1';run.result.evidence[0].quote='An invented passage.';assert.equal(E.records(ctx).length,0);});
test('no-evidence completions can be reused without turning absence into a supporting claim',()=>{const{ctx,run}=fixture();run.result.evidence=[];assert.equal(E.records(ctx).length,0);assert.equal(E.matchingRun(ctx,ctx.draft.claims[0],['MED:123']).id,run.id);assert.match(E.markdown(ctx),/Evidence review trail/);assert.doesNotMatch(E.markdown(ctx),/### Supports/);});

test('mixed selected sources retain their individual outcomes; alias matches use the actual checked paper',()=>{
 const {ctx,run,paper}=fixture(),alias='PMC:PMC123',missing='MED:404',unreadable='MED:456';
 run.result.scope={requestedPaperIds:[alias,missing,unreadable],sourceMatches:[{requestedId:alias,paperId:paper.id}],
   retrievedPaperIds:[paper.id,unreadable],unavailablePaperIds:[missing],unreadablePaperIds:[unreadable]};
 run.result.papers.push({id:unreadable,title:'An index record without available text',sourceText:''});
 run.result.evidence[0].label='unsupported';
 const rows=E.sourceOutcomes(run,ctx);
 assert.deepEqual(copy(rows.map(r=>r.state)),['matched','not_retrieved','no_text']);
 assert.equal(rows[0].id,alias);assert.equal(rows[0].paperId,paper.id);
 assert.match(rows[0].detail,/Not established.*Waiting for you/);
 for(const row of rows.slice(1)){assert.match(row.detail,/not assessed/);assert.doesNotMatch(row.detail,/AI assessment|contradicts/i);}
 const trail=E.markdown(ctx);assert.match(trail,/PMC:PMC123 → MED:123/);assert.match(trail,/MED:404 — Record not retrieved/);assert.match(trail,/Record found; no readable text/);assert.doesNotMatch(trail,/Contradicts/);
});

test('readable excerpts with no accepted card produce no scientific verdict, including a rejected quote',()=>{
 const {ctx,run,paper}=fixture();paper.access='abstract_only';
 run.result.evidence[0].label='contradicts';run.result.evidence[0].quote='This quote was not in the inspected paper.';
 const [row]=E.sourceOutcomes(run,ctx);
 assert.equal(row.state,'read_no_card');assert.match(row.detail,/abstract excerpt.*No verdict was recorded/);
 assert.equal(E.records(ctx).length,0);assert.doesNotMatch(E.markdown(ctx),/Contradicts|This quote was not/);
});

test('legacy or unfinished runs never infer failed access, and a wider search does not masquerade as a selected-source check',()=>{
 const {ctx,run}=fixture();run.result.papers=[];run.result.evidence=[];
 assert.equal(E.sourceOutcomes(run,ctx)[0].state,'unknown');
 assert.match(E.markdown(ctx),/Coverage not recorded/);
 run.status='failed';assert.equal(E.sourceOutcomes(run,ctx)[0].state,'unfinished');
 assert.doesNotMatch(E.markdown(ctx),/Record not retrieved|No readable text|AI assessment:/);
 run.result.scope={mode:'literature_search',requestedPaperIds:[]};assert.equal(E.sourceOutcomes(run,ctx).length,0);
});

test('author status and AI interpretation stay separate from the physical quote match',()=>{
 const {ctx,run,paper,claim}=fixture();run.result.evidence[0].label='contradicts';
 let row=E.sourceOutcomes(run,ctx)[0];assert.equal(row.state,'matched');assert.match(row.detail,/AI assessment: Contradicts\. Author review: Waiting for you/);
 claim.decision={type:'flag',evidenceKey:run.id+':'+paper.id};
 row=E.sourceOutcomes(run,ctx)[0];assert.match(row.detail,/AI assessment: Contradicts\. Author review: Concern recorded/);
});
