'use strict';
// Local provenance and freshness checks. These functions never call an AI or approve a citation.
(() => {
  const list=v=>Array.isArray(v)?v:[];
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
  const labels={supports:'Supports',partial:'Partly supports',unsupported:'Not established',contradicts:'Contradicts'};
  const sourceSnapshot=p=>p?JSON.stringify([p.id,p.title,p.authors||[],p.year||null,p.journal||'',p.url||'',p.doi||'',p.pmid||'',p.pmcid||'',p.abstract||p.evidence_excerpt||'',p.agentSourceText||p.sourceText||'']):null;
  function findClaim(run,ctx){return list(ctx?.draft?.claims).find(c=>c.id===run?.claimContext?.claim?.id);}
  function freshness(run,ctx){
    const fail=reason=>({fresh:false,reason,claim:findClaim(run,ctx)});
    const binding=run?.claimContext?.claim;
    if(!binding||run?.result?.pipelineVersion!=='claim-check-v1'||run?.result?.claim?.id!==binding.id||run.result.claim.text!==binding.text)return fail('This result is not bound to an unchanged manuscript sentence.');
    const c=findClaim(run,ctx);if(!c)return fail('The sentence was removed or has not been prepared in this review.');
    if(ctx.draft.text!==ctx.draft.baseText)return fail('The manuscript changed. Prepare its updated sentences first.');
    if(ctx.draft.text.slice(c.start,c.end)!==c.text)return fail('The sentence no longer matches its manuscript position.');
    const approvedRevision=c.decision?.evidenceRunId===run.id&&c.decision.before===binding.text&&c.decision.after===c.text;
    if(c.text!==binding.text&&!approvedRevision)return fail('The sentence changed after this check.');
    const snapshots=run.claimContext.sourceSnapshots||{};
    for(const id of new Set([...Object.keys(snapshots),...list(run.result.evidence).map(e=>e.paperId)])){
      const local=ctx.papers?.[id],checked=list(run.result.papers).find(p=>p.id===id);
      if(!local){if(snapshots[id])return fail('A selected source was removed.');continue;}
      const current=sourceSnapshot(local);
      const opened=(c.manual?.evidenceRunId===run.id&&c.candidate===id)||(c.decision?.evidenceRunId===run.id&&c.decision.paperId===id);
      if(opened&&current!==sourceSnapshot(checked))return fail('The inspected source changed after this evidence was opened for review.');
      if(current!==snapshots[id]&&current!==sourceSnapshot(checked))return fail('A source record or its inspected text changed after this check.');
    }
    return {fresh:true,reason:approvedRevision&&c.decision.type==='apply'?(c.decision.before===c.decision.after?'Author approved the citation without changing the sentence.':'Author approved a revision. The AI verdict describes the original sentence.'):'Sentence and saved sources are unchanged since this check.',claim:c};
  }
  function records(ctx){
    return list(ctx?.research?.aiRuns).filter(r=>r?.kind==='claim_check'&&r.status==='completed'&&r.result?.claim).flatMap(run=>{
      const f=freshness(run,ctx),c=f.claim;
      return list(run.result.evidence).flatMap(e=>{
        const p=list(run.result.papers).find(p=>p.id===e.paperId);
        if(!p||e.claimId!==run.result.claim.id||e.claim!==run.result.claim.text||!norm(e.quote)||!norm(p.sourceText).includes(norm(e.quote))||!labels[e.label])return [];
        const key=run.id+':'+e.paperId,decision=c?.decision;
        const approved=f.fresh&&decision?.type==='apply'&&decision.evidenceKey===key&&decision.after===c.text&&(!decision.sourceSnapshot||decision.sourceSnapshot===sourceSnapshot(ctx.papers?.[e.paperId]));
        const resolved=f.fresh&&decision?.evidenceKey===key;
        return [{key,runId:run.id,claimId:e.claimId,claim:e.claim,currentText:c?.text||'',paperId:e.paperId,paper:p,evidence:e,
          status:!f.fresh?'needs_recheck':approved?'approved':resolved?'flagged':decision?'decision_recorded':'awaiting_author',fresh:f.fresh,reason:decision&&!resolved?'A decision is already recorded for this sentence. Undo it before reviewing a different card.':f.reason,
          checkedAt:run.at,fingerprint:JSON.stringify([key,e.claim,e.label,e.quote,e.suggestedWording||'',sourceSnapshot(p),approved?decision.after:null]),
          durationMs:run.durationMs,usage:run.usage}];
      });
    });
  }
  const reviewLabels={awaiting_author:'Waiting for you',needs_recheck:'Needs rechecking',approved:'Approved by author',flagged:'Concern recorded',decision_recorded:'Decision recorded'};
  const designVersion='same-cell-tracking-v1';
  function designInfo(e) {
    const d=e?.designCheck, headings={incompatible:'Design does not establish this claim',unknown:'Cannot assess tracking from these excerpts',compatible:'Same-cell tracking described'};
    if(!d || d.rule!==designVersion || !Object.hasOwn(headings,d.status))return null;
    return {heading:headings[d.status],reason:String(d.reason||''), changed:d.adjusted===true, modelLabel:labels[d.modelLabel]||'Unrecorded'};
  }
  function designText(e) {
    const d=designInfo(e);return d?'Study design (checked by code): '+d.heading+'. '+d.reason+(d.changed?' Original AI suggestion: '+d.modelLabel+'; final assessment: '+labels[e.label]+'.':''):'';
  }
  // A selected identifier may resolve to a different canonical record (e.g. PMCID → PMID).
  // Only use a mapping the reader actually recorded; do not guess from a title or another paper.
  function sourceOutcomes(run,ctx,cards){
    if(run?.kind!=='claim_check')return [];
    const result=run.result||{},scope=result.scope||{};
    const ids=[...new Set(list(scope.requestedPaperIds??run.claimContext?.citedPaperIds??result.claim?.citedPaperIds).filter(id=>typeof id==='string'&&id))];
    if(!ids.length)return [];
    const checked=cards||records({...ctx,research:{aiRuns:[run]}});
    return ids.map(id=>{
      const canonical=list(scope.sourceMatches).find(m=>m?.requestedId===id)?.paperId||id;
      const paper=list(result.papers).find(p=>p.id===canonical),card=checked.find(c=>c.runId===run.id&&c.paperId===canonical);
      const title=paper?.title||ctx?.papers?.[id]?.title||'';
      const row=(state,label,detail)=>({id,paperId:canonical,title,state,label,detail});
      if(run.status!=='completed')return row('unfinished','Check unfinished','No source outcome was confirmed before this check stopped.');
      if(card)return row('matched','Quote matched in source',(designInfo(card.evidence)?'Assessment after design check: ':'AI assessment: ')+labels[card.evidence.label]+'. Author review: '+reviewLabels[card.status]+'.');
      if(!paper&&list(scope.unavailablePaperIds).includes(id))return row('not_retrieved','Record not retrieved','No matching record was retrieved in this run. The sentence was not assessed against this source.');
      if(norm(paper?.sourceText))return row('read_no_card','Text read; no verified quote', (paper.access==='full_text'?'Full-text excerpts were checked':paper.access==='abstract_only'?'An abstract excerpt was checked':'Saved excerpts were checked')+', but no evidence card passed the checks for this sentence. No verdict was recorded.');
      if(list(scope.unreadablePaperIds).includes(id))return row('no_text','Record found; no readable text','No abstract or full-text passage was available to this run. The sentence was not assessed against this source.');
      return row('unknown','Coverage not recorded','The saved check does not show how far this source was checked.');
    });
  }
  function matchingRun(ctx,c,ids=[],studyDesign=false){
    const signature=JSON.stringify([...ids].sort());
    return list(ctx?.research?.aiRuns).slice().reverse().find(r=>r.kind==='claim_check'&&r.status==='completed'&&(r.result?.studyDesignVersion===designVersion)===studyDesign&&r.claimContext?.claim?.id===c?.id&&r.claimContext.claim.text===c.text&&JSON.stringify([...list(r.claimContext.citedPaperIds)].sort())===signature&&freshness(r,ctx).fresh);
  }
  function markdown(ctx){
    const runs=list(ctx?.research?.aiRuns).filter(r=>r.kind==='claim_check');
    return '# Evidence review trail\n\nAI assessments require author review. A text match is not scientific validation. Checks cover only the recorded sources and excerpts.\n\n'+(runs.length?runs.map(r=>{
      const f=freshness(r,ctx),cards=records({...ctx,research:{aiRuns:[r]}}),sources=sourceOutcomes(r,ctx,cards);
      const coverage=sources.length?'### Selected sources\n\n'+sources.map(s=>'- '+s.id+(s.paperId!==s.id?' → '+s.paperId:'')+(s.title?' · '+s.title:'')+' — '+s.label+'. '+s.detail).join('\n')+'\n\n':'';
      return '## '+(r.claimContext?.claim?.text||r.question)+'\n\nRun: '+r.id+' · '+r.at+' · '+r.status+'\n\n'+(r.status==='completed'?(f.fresh?'Current snapshot':'Needs rechecking')+': '+f.reason:'This run did not finish. No supporting conclusion can be drawn.')+'\n\n'+coverage+cards.map(x=>'### '+labels[x.evidence.label]+' · '+x.status.replace(/_/g,' ')+'\n\nOriginal sentence: '+x.claim+'\n\n> '+x.evidence.quote+'\n\n'+x.paper.title+' — '+x.paper.url+'\n\nLocation: '+x.evidence.location+'\n\n'+x.evidence.reason+(designInfo(x.evidence)?'\n\n'+designText(x.evidence):'')+'\n\nCoverage: '+x.evidence.coverage+(x.evidence.suggestedWording?'\n\nSuggested wording: '+x.evidence.suggestedWording:'')).join('\n\n')+'\n\nReported usage: '+(Number.isFinite(r.usage?.totalTokens)?r.usage.totalTokens+' tokens':'unavailable')+'; estimated cost: '+(Number.isFinite(r.usage?.estimatedCostUsd)?'$'+r.usage.estimatedCostUsd.toFixed(4):'unavailable')+'.';
    }).join('\n\n'):'No sentence-bound AI checks recorded.');
  }
  window.PherogentEvidence={sourceSnapshot,freshness,records,sourceOutcomes,matchingRun,markdown,labels,reviewLabels,designInfo,designText};
})();
