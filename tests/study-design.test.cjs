'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../public/study-design.js');
const claim='The same individual fibroblasts recovered after factor withdrawal.';
const donor='Bulk assays measured samples from the same three donors at each time point. The cells were destroyed during measurement. The same individual cells were not tracked.';
const tracking='We tracked the same individual fibroblasts across time points by live imaging.';
const run=(passage,other={})=>evaluate({claim, passage, ...other});

test('donor-linked destructive bulk observations cannot answer a same-cell conclusion, even when the claim matches a quote',()=>{
 const guard=run(donor+' '+claim);
 assert.equal(guard.status,'incompatible');assert.equal(guard.applies,true);assert.match(guard.reason,/across time/);assert.equal(guard.basis,'passage');
 assert.equal(run('Bulk methylation was measured in separate samples from the same donors at each time point.').status,'incompatible');
});

test('an observed group or locus result remains answerable; the rule does not certify its correctness',()=>{
 for(const c of [
  'For donor O2, methylation at cg06036945 moved closer to its starting value after withdrawal.',
  'The same cell type showed a lower mean signal after treatment.',
  'The same fibroblast populations showed greater uptake.',
  'RNA moved closer to baseline on average in three donor samples.',
  'Individual fibroblasts stained positive for the marker at baseline.'
 ])assert.equal(run(donor,{claim:c}).status,'not_applicable',c);
});

test('direct time-resolved tracking meets the prerequisite, not the claim itself',()=>{
 for(const p of [tracking,'We used time-lapse microscopy to track the same individual cells across all time points.','The same fibroblasts were individually followed over time.']){
  const x=run(p);assert.equal(x.status,'compatible',p);assert.match(x.reason,/verify the outcome separately/i);
 }
});

test('unknown design, indirect naming, a tracking plan, and a one-time measurement cannot establish direct follow-up',()=>{
 for(const p of ['','Samples from three donors were processed.', 'An endpoint single-cell RNA-seq map was obtained.',
 'We used barcodes to trace descendant clones across time points.',
 'We tracked the same individual cells across time using lineage inference.',
 'Future studies should track the same cells over time.',
 'The same individual fibroblasts were tracked in the microscope.',
 'We evaluated whether the same individual fibroblasts were tracked over time.',
 'We predicted that the same individual cells were followed over time.',
 'Bulk methylation profiling was not performed.',
 'We did not use bulk assays.',
 'The same individual cells recovered after factor withdrawal.']){
   const r=run(p);assert.equal(r.status,'unknown',p);assert.match(r.reason,/not enough information/i);
 }
});

test('negations, limitations, and questions about uncertainty are not treated as affirmative claims',()=>{
 for(const c of ['We cannot tell whether the same cells recovered.',
 'These data did not establish that the same individual cells recovered.',
 'The same individual cells were not tracked.',
 'If the same fibroblasts recovered, the signal might decline.',
 'We propose tracking the same cells over time.'])
 assert.equal(run(donor,{claim:c}).status,'not_applicable',c);
});

test('a negated tracking statement does not authorize the affirmative claim',()=>{
 for(const p of ['Individual cells were not tracked over time.','We did not track the same individual cells over time.','We could not follow the same cells across phases.']){
  const x=run(p);assert.equal(x.status,'incompatible',p);
 }
});

test('mixed assays or conflicting author annotations do not auto-clear a claim',()=>{
 assert.equal(run(tracking+' '+donor).status,'unknown');
 assert.equal(run(tracking,{tracking:'bulk'}).status,'unknown');
 assert.equal(run(donor,{tracking:'same_cells'}).status,'unknown');
 assert.equal(run('',{tracking:'same_cells'}).basis,'author');
 assert.equal(run(tracking,{tracking:'unknown'}).status,'unknown');
 assert.equal(run(undefined,{requirement:'same_cells',claim:'A manual claim.',tracking:'bulk'}).status,'incompatible');
 // A UI label alone must not bypass an explicit same-cell statement.
 assert.equal(run(donor,{requirement:'group'}).status,'incompatible');
});

test('bounded inputs do not turn missing or oversized evidence into a pass',()=>{
 assert.equal(run(tracking+' '.repeat(33000)).status,'unknown');
 assert.equal(evaluate({claim:'',passage:tracking}).status,'not_applicable');
 assert.equal(evaluate({claim:'x'.repeat(8001),passage:tracking}).status,'unknown');
});
