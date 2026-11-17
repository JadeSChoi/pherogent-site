'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const sandbox={module:{exports:{}},window:{},fetch(){throw Error('The data engine must not use a network or model.');}};
for(const file of ['lee-analysis.js','research-skills.js','data-analysis-engine.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'public',file),'utf8'),sandbox);
const E=sandbox.window.PherogentDataEngine;
const plain=x=>JSON.parse(JSON.stringify(x));
const source=(text,extra={})=>({fileName:'measurements.csv',sha256:crypto.createHash('sha256').update(text).digest('hex'),...extra});
const design=(extra={})=>({study:'Example study',route:'treated',population:'Declared donor cultures',modality:'DNAm',observationUnit:'biological_unit',independentUnits:null,destructiveSampling:true,lineage:'not_tracked',featuresAreReplicates:false,...extra});
const header='sample_id,unit_id,time,feature,value\n';
const data=header+'A0,A,0,cg1,0\nA0,A,0,cg2,0.5\nA2,A,2,cg1,0.05\nA2,A,2,cg2,NA\nA4,A,4,cg1,0.35\nA4,A,4,cg2,0.2\n';
const prepare=(text=data,meta=design(),src=source(text))=>E.prepare(text,meta,src);
const refusal=(fn,code)=>assert.throws(fn,e=>e.code===code,code);

test('browser and CommonJS exports expose the same deterministic engine',()=>{
  assert.equal(sandbox.module.exports,E);
  const p=prepare(),run=E.calculate(p,{from:0,to:2,epsilon:.05});
  assert.equal(run.usage.modelCalls,0);assert.equal(run.usage.totalTokens,0);
  assert.equal(run.transition.withinTolerance,1);assert.equal(run.transition.exactEqual,0);
  assert.equal(run.transition.meanDelta,.05);assert.equal(run.source.sha256,source(data).sha256);
  assert.equal(run.state.independentUnits,null);
  assert.equal(run.verification.checks.find(x=>x.name==='Independent units').status,'INDETERMINATE');
  assert.equal(run.verification.checks.find(x=>x.name==='Scientific interpretation').status,'NOT_ASSESSED');
  assert.deepEqual(plain(run),plain(E.calculate(p,{from:0,to:2,epsilon:.05})));
});
test('CSV quotes, escaped quotes, reordered columns, BOM and CRLF preserve physical source rows',()=>{
  const text='\uFEFFfeature,time,unit_id,value,sample_id\r\n"feature, with ""quote""",0,A,0.2,A0\r\n\r\n"feature, with ""quote""",2,A,0.4,A2\r\n';
  const p=prepare(text);assert.equal(p.tensor.features[0],'feature, with "quote"');
  const x=E.inspect(p,{unit:'A',time:2,feature:'feature, with "quote"'});
  assert.equal(x.source.row,4);assert.equal(x.source.column,'value');assert.equal(x.value,.4);
});
test('TSV supports zeros, missing rows and explicit absent visit slots without interpolation',()=>{
  const text='sample_id\tunit_id\ttime\tfeature\tvalue\nA0\tA\t0\tf\t0\n\tA\t2\tf\t\nA4\tA\t4\tf\t0.4\n';
  const p=prepare(text,design(),source(text,{fileName:'measurements.tsv'}));
  assert.equal(p.tensor.Z[0][0][0],0);assert.equal(p.tensor.mask[0][0][0],true);
  assert.equal(p.tensor.Z[0][1][0],null);assert.equal(p.summary.missingValues,1);
  assert.equal(E.inspect(p,{unit:'A',time:2,feature:'f'}).source,null);
  assert.equal(E.availability(p).find(x=>x.id==='transition').status,'BLOCKED');
  refusal(()=>E.calculate(p,{from:0,to:4}),'nonconsecutive_interval');
  refusal(()=>E.calculate(p,{from:0,to:2}),'no_paired_observations');
});
test('malformed quotes, missing or duplicated headers and ragged rows fail without guessing',()=>{
  refusal(()=>E.parse(header+'"unterminated'),'malformed_csv');
  refusal(()=>E.parse(header+'"A"oops,A,0,f,.1'),'malformed_csv');
  refusal(()=>E.parse('sample_id,unit_id,time,value,value\na,a,0,.1,.1'),'invalid_headers');
  refusal(()=>E.parse(header+'A,A,0,f,.1,extra'),'row_width');
  refusal(()=>E.parse('sample_id,unit_id,time,feature,value,route\na,a,0,f,.1,treatment'),'invalid_headers');
  refusal(()=>E.parse(header),'empty_file');
});
test('duplicate coordinates include missing rows and contradictory sample assignment is refused',()=>{
  refusal(()=>prepare(data+'A2,A,2,cg2,0.6\n'),'duplicate_observation');
  refusal(()=>prepare(data.replace('A2,A,2,cg2,NA','Other,A,2,cg2,NA')),'mixed_sample_slot');
  refusal(()=>prepare(data.replaceAll('A2,A,2','A0,A,2')),'reused_sample');
  refusal(()=>prepare(data.replace('A2,A,2,cg1,0.05',',A,2,cg1,0.05')),'missing_sample');
});
test('nonfinite, hexadecimal, empty time and wrong-assay values are not coerced',()=>{
  for(const token of ['Infinity','NaN','0x10','1_000','not measured'])refusal(()=>prepare(data.replace('A2,A,2,cg1,0.05','A2,A,2,cg1,'+token)),'invalid_number');
  refusal(()=>prepare(data.replace('A2,A,2,cg1,0.05','A2,A,,cg1,0.05')),'invalid_number');
  refusal(()=>prepare(data.replace('A2,A,2,cg1,0.05','A2,A,2,cg1,1.1')),'invalid_fraction');
  refusal(()=>prepare(data,design({modality:'methylation'})),'invalid_modality');
});
test('study design explicitly refuses false independence and destructive same-cell declarations',()=>{
  refusal(()=>prepare(data,design({featuresAreReplicates:true})),'features_are_not_replicates');
  refusal(()=>prepare(data,design({independentUnits:859151})),'invalid_replicate_count');
  refusal(()=>prepare(data,design({lineage:'tracked'})),'incompatible_lineage');
  refusal(()=>prepare(data,design({observationUnit:'population_summary',independentUnits:1})),'unknown_independence');
  const two=data+data.split('\n').slice(1).filter(Boolean).map(x=>x.replace(/^A/,'B').replace(',A,',',B,')).join('\n');
  refusal(()=>prepare(two,design({observationUnit:'population_summary'})),'ambiguous_population');
  const p=prepare(two,design({independentUnits:2}));assert.equal(p.summary.units,2);
  assert.equal(E.calculate(p).verification.checks.find(x=>x.name==='Independent units').status,'DECLARED');
});
test('independent groups at different times are never paired as the same unit',()=>{
  const text=header+'A0,A,0,f,.1\nB2,B,2,f,.5\n';
  const p=prepare(text);assert.equal(E.availability(p).find(x=>x.id==='transition').status,'BLOCKED');
  refusal(()=>E.calculate(p),'no_paired_observations');
});
test('all eligible rows are included, stale summary counts cannot change arithmetic',()=>{
  const p=prepare();p.summary.features=9999;p.summary.independentUnits=9999;
  const run=E.calculate(p,{epsilon:.1});assert.equal(run.state.features,2);assert.equal(run.state.independentUnits,null);
  assert.equal(run.rollup.intervals.length,2);assert.equal(run.transition.observedPairs,1);assert.equal(run.transition.missingPairs,1);
  assert.equal(run.transition.meanDelta,.3);assert.equal(run.transition.source[0].rowStart,4);
});
test('unknown provenance and untrusted study aliases cannot be labeled as the bundled source',()=>{
  refusal(()=>prepare(data,design(),{fileName:'x.csv'}),'missing_file_hash');
  refusal(()=>prepare(data,design(),source(data,{origin:'public_dataset'})),'invalid_source');
  refusal(()=>prepare(data,design({study:'lee2014'})),'reserved_study');
  const p=prepare();p.source.fileName='other.csv';refusal(()=>E.calculate(p),'source_mismatch');
});
test('synthetic inputs remain labeled and proposed skills cannot appear runnable',()=>{
  const p=prepare(data,design(),source(data,{origin:'synthetic'})),run=E.calculate(p);
  assert.equal(run.origin,'synthetic');assert.match(run.limitations[0],/not biological findings/);
  for(const capability of E.availability(p).filter(x=>['ablation','age','identity'].includes(x.id)))assert.equal(capability.status,'PROPOSED');
  assert.equal(E.availability(null).find(x=>x.id==='tensor').status,'BLOCKED');
});
test('file, row and tensor limits reject oversized input before it can be partly analyzed',()=>{
  refusal(()=>E.parse('x'.repeat(E.MAX_BYTES+1)),'file_too_large');
  refusal(()=>E.parse(header+'s,u,0,f,0\n'.repeat(E.MAX_ROWS+1)),'too_many_rows');
  const text=header+Array.from({length:49},(_,i)=>'s'+i+',A,'+i+',f,0').join('\n');
  refusal(()=>prepare(text),'axis_limit');
});
test('arithmetic overflow fails closed and corrupted tensor masks cannot bypass validation',()=>{
  const text=header+'a,A,0,f,-1e308\nb,A,2,f,1e308';
  const p=prepare(text,design({modality:'RNA'}));refusal(()=>E.calculate(p),'numeric_overflow');
  const altered=prepare();altered.tensor.mask[0][0][0]=false;refusal(()=>E.calculate(altered),'mask_value_mismatch');
});
test('large source lists are explicitly compacted while every numerical pair is retained',()=>{
  const text=header+Array.from({length:100},(_,i)=>`s${i}a,u${i},0,f,0.1\ns${i}b,u${i},2,f,0.3`).join('\n');
  const run=E.calculate(prepare(text));assert.equal(run.transition.observedPairs,100);
  assert.equal(run.transition.sourceGroupCount,200);assert.equal(run.transition.source.length,8);assert.equal(run.transition.omittedSourceGroups,192);
  assert.equal(run.transition.fromSampleIdsCount,100);assert.equal(run.transition.omittedFromSampleIds,92);assert.ok(JSON.stringify(run).length<56000);
});
test('bundled Lee analysis uses the existing complete source data and keeps source layout and limits',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(root,'public/data/lee2014/data.json'),'utf8'));
  const p=E.prepareLee(data,{route:'continued_low'}),run=E.calculate(p,{epsilon:.05});
  assert.equal(run.state.features,7890);assert.equal(run.state.independentUnits,null);assert.equal(run.transition.observedPairs,7890);
  assert.equal(run.source.sha256,data.metadata.workbookSha256);assert.equal(run.source.origin,'public_dataset');assert.equal(run.origin,'computed');
  assert.match(run.source.provenanceStatus,/original analysis archive is unavailable/);
  assert.equal(run.transition.source.find(x=>x.sampleId==='D16L').rowStart,4);
  assert.equal(run.transition.source.find(x=>x.sampleId==='D16L').rowEnd,7893);
  refusal(()=>E.calculate(p,{from:8,to:21}),'nonconsecutive_interval');
});
