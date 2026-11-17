'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const context = {module:{exports:{}},window:{}};
for(const file of ['lee-analysis.js','research-skills.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'public',file),'utf8'),context);
const S=context.module.exports;
const clone = value => JSON.parse(JSON.stringify(value));
const throws = (fn,code) => assert.throws(fn,error=>error.name==='ResearchSkillError'&&error.code===code,code);
const fixture = () => ({
  units:['summary'],times:[0,2,4],features:['a','b'],modality:'DNAm',
  metadata:{study:'test-fixture',route:'treated',population:'Synthetic software-test inputs, not biological data',observationUnit:'population_summary',independentUnits:null,destructiveSampling:true,lineage:'not_tracked',featuresAreReplicates:false},
  observations:[
    {unit:'summary',time:0,feature:'a',value:0,source:{file:'fixture.csv',row:2,sampleId:'s0'}},
    {unit:'summary',time:0,feature:'b',value:0.5,source:{file:'fixture.csv',row:3,sampleId:'s0'}},
    {unit:'summary',time:2,feature:'a',value:0.05,source:{file:'fixture.csv',row:4,sampleId:'s2'}},
    {unit:'summary',time:4,feature:'a',value:0.35,source:{file:'fixture.csv',row:5,sampleId:'s4'}},
    {unit:'summary',time:4,feature:'b',value:0.2,source:{file:'fixture.csv',row:6,sampleId:'s4'}},
  ]
});

test('browser and CommonJS interfaces agree and function without network or model capabilities',()=>{
  assert.equal(S,context.window.PherogentResearchSkills);
  assert.equal(S.MAX_SLOTS,200000);
  const tensor=S.epistateTensor(fixture());
  assert.equal(tensor.totalSlots,6);assert.equal(tensor.observedValues,5);
  assert.equal(tensor.Z[0][0][0],0);assert.equal(tensor.mask[0][0][0],true);
  assert.equal(tensor.Z[0][1][1],null);assert.equal(tensor.mask[0][1][1],false);
  assert.equal(tensor.metadata.independentUnits,null);
  assert.equal(S.intervalRollup(tensor).aiCalls,0);
  assert.equal(S.epistateTransition(tensor).tokens,0);
});
test('rollup honors both endpoint masks and never bridges missing features',()=>{
  const result=S.intervalRollup(S.epistateTensor(fixture()));
  assert.equal(result.intervals.length,2);
  assert.equal(result.intervals[0].observedPairs,1);
  assert.equal(result.intervals[0].missingPairs,1);
  assert.equal(result.intervals[0].missingFraction,0.5);
  assert.equal(result.intervals[0].meanAbsoluteDelta,0.05);
  assert.equal(result.intervals[1].observedPairs,1);
  assert.equal(result.intervals[1].meanDelta,0.3);
  assert.equal(result.intervals[0].source[0].rowStart,2);
  assert.equal(result.intervals[0].source[0].rowEnd,2);
  assert.equal(result.intervals[0].source[1].sampleId,'s2');
  assert.equal(result.intervals[0].sequence,1);
  assert.equal(result.intervals[1].previousSequence,1);
  assert.equal(result.intervals[0].recordIsComputational,true);
});
test('a threshold match is within tolerance but never called exact equality',()=>{
  const tensor=S.epistateTensor(fixture());
  const near=S.epistateTransition(tensor,{from:0,to:2,epsilon:.05});
  assert.equal(near.withinTolerance,1);assert.equal(near.exactEqual,0);assert.equal(near.increased,0);
  const strict=S.epistateTransition(tensor,{from:0,to:2,epsilon:.02});
  assert.equal(strict.withinTolerance,0);assert.equal(strict.increased,1);
  assert.match(near.warning,/not exact equality/);
  assert.equal(near.withinTolerance+near.increased+near.decreased,near.observedPairs);
});
test('nonconsecutive, reverse, missing and half-specified interval endpoints are refused',()=>{
  const tensor=S.epistateTensor(fixture());
  throws(()=>S.epistateTransition(tensor,{from:0,to:4}),'nonconsecutive_interval');
  throws(()=>S.epistateTransition(tensor,{from:2,to:0}),'nonconsecutive_interval');
  throws(()=>S.epistateTransition(tensor,{from:0,to:3}),'missing_route_slot');
  throws(()=>S.epistateTransition(tensor,{from:0}),'incomplete_interval');
  throws(()=>S.epistateTransition(tensor,{epsilon:0.03}),'invalid_tolerance');
  throws(()=>S.epistateTransition(tensor,{replicates:2}),'invalid_arguments');
});
test('missing paired measurements have explicit non-results, never a mean of zero',()=>{
  const data=fixture();data.observations=data.observations.filter(row=>row.time!==2);
  const tensor=S.epistateTensor(data),result=S.intervalRollup(tensor);
  for(const row of result.intervals){assert.equal(row.status,'NO_PAIRED_OBSERVATIONS');assert.equal(row.meanDelta,null);assert.equal(row.meanAbsoluteDelta,null);assert.equal(row.source.length,0);}
  throws(()=>S.epistateTransition(tensor),'no_paired_observations');
});
test('reverse, duplicated, NaN and string time axes fail before calculations',()=>{
  for(const times of [[4,2,0],[0,0,4],[0,NaN,4],['0',2,4]]){const data=fixture();data.times=times;throws(()=>S.epistateTensor(data),'invalid_time_order');}
});
test('duplicated axes and observations, unsupported coordinates and modalities are refused',()=>{
  const duplicateFeature=fixture();duplicateFeature.features=['a','a'];throws(()=>S.epistateTensor(duplicateFeature),'duplicate_axis');
  const duplicateUnit=fixture();duplicateUnit.units=['summary','summary'];throws(()=>S.epistateTensor(duplicateUnit),'duplicate_axis');
  const duplicateObservation=fixture();duplicateObservation.observations.push(duplicateObservation.observations[0]);throws(()=>S.epistateTensor(duplicateObservation),'duplicate_observation');
  const wrongCoordinate=fixture();wrongCoordinate.observations[0].unit='other';throws(()=>S.epistateTensor(wrongCoordinate),'unknown_coordinate');
  const wrongModality=fixture();wrongModality.modality='DNAm_typo';throws(()=>S.epistateTensor(wrongModality),'invalid_modality');
});
test('nonfinite values cannot be marked observed for any modality; methylation fractions remain bounded',()=>{
  for(const modality of ['DNAm','RNA','ATAC'])for(const value of [NaN,Infinity,null,'0.5']){const data=fixture();data.modality=modality;data.observations[0].value=value;throws(()=>S.epistateTensor(data),'non_finite_value');}
  for(const value of [-0.1,1.01]){const data=fixture();data.observations[0].value=value;throws(()=>S.epistateTensor(data),'invalid_fraction');}
});
test('finite but overflowing RNA differences and sums are refused rather than exported as null',()=>{
  const data=fixture();data.modality='RNA';data.observations[0].value=-1e308;data.observations[2].value=1e308;
  const tensor=S.epistateTensor(data);
  throws(()=>S.intervalRollup(tensor),'numeric_overflow');
  throws(()=>S.epistateTransition(tensor,{from:0,to:2}),'numeric_overflow');
  const sum=fixture();sum.modality='RNA';sum.observations[0].value=-9e307;sum.observations[1].value=-9e307;sum.observations[2].value=0;sum.observations.push({unit:'summary',time:2,feature:'b',value:0,source:{file:'fixture.csv',row:7,sampleId:'s2'}});
  throws(()=>S.intervalRollup(S.epistateTensor(sum)),'numeric_overflow');
});
test('masked finite numbers, source-less observations, invalid mask types and changed dimensions fail closed',()=>{
  const finiteMasked=S.epistateTensor(fixture());finiteMasked.mask[0][0][0]=false;throws(()=>S.intervalRollup(finiteMasked),'mask_value_mismatch');
  const missingSource=S.epistateTensor(fixture());missingSource.sources[0][0][0]=null;throws(()=>S.intervalRollup(missingSource),'invalid_source');
  const badMask=S.epistateTensor(fixture());badMask.mask[0][0][0]=1;throws(()=>S.intervalRollup(badMask),'invalid_mask');
  const shape=S.epistateTensor(fixture());shape.mask[0][0].pop();throws(()=>S.intervalRollup(shape),'shape_mismatch');
  const count=S.epistateTensor(fixture());count.observedValues=6;throws(()=>S.intervalRollup(count),'count_mismatch');
});
test('samples cannot be reused as extra time points or mixed within one slot',()=>{
  const reused=fixture();reused.observations.find(row=>row.time===2).source.sampleId='s0';throws(()=>S.epistateTensor(reused),'reused_sample');
  const mixed=fixture();mixed.observations[1].source.sampleId='other';throws(()=>S.epistateTensor(mixed),'mixed_sample_slot');
});
test('feature counts, fabricated independence and destructive same-cell trajectories are refused',()=>{
  const replicate=fixture();replicate.metadata.featuresAreReplicates=true;throws(()=>S.epistateTensor(replicate),'features_are_not_replicates');
  const unknown=fixture();unknown.metadata.independentUnits=859151;throws(()=>S.epistateTensor(unknown),'unknown_independence');
  const tracked=fixture();tracked.metadata.lineage='tracked';throws(()=>S.epistateTensor(tracked),'incompatible_lineage');
  const units=fixture();units.metadata.observationUnit='biological_unit';units.metadata.independentUnits=2;throws(()=>S.epistateTensor(units),'invalid_replicate_count');
});
test('source cells preserve original numeric precision and missing entries stay missing',()=>{
  const tensor=S.epistateTensor(fixture());
  const cell=S.inspectValue(tensor,{unit:'summary',time:0,feature:'a'});
  assert.equal(cell.value,0);assert.equal(cell.source.row,2);assert.equal(cell.observed,true);
  const absent=S.inspectValue(tensor,{unit:'summary',time:2,feature:'b'});assert.equal(absent.value,null);assert.equal(absent.source,null);assert.equal(absent.observed,false);
  throws(()=>S.inspectValue(tensor,{unit:'summary',time:1,feature:'a'}),'unknown_coordinate');
});
test('omitting optional approximate-time metadata on an external tensor remains valid',()=>{
  const tensor=S.epistateTensor(fixture());delete tensor.metadata.approximateTimes;
  assert.equal(S.validateTensor(tensor),true);
  assert.equal(S.epistateTransition(tensor).approximateTo,false);
  assert.equal(S.intervalRollup(tensor).intervals[0].approximateFrom,false);
});

const lee=JSON.parse(fs.readFileSync(path.join(root,'public/data/lee2014/data.json'),'utf8'));
const csv=fs.readFileSync(path.join(root,'public/data/lee2014/increments.csv'),'utf8').trim().split('\n').map(row=>row.split(','));
const columns=csv.shift(),archive=csv.map(row=>Object.fromEntries(columns.map((name,i)=>[name,row[i]])));
test('all four real Lee routes use all7890rows and reproduce every archived interval',()=>{
  for(const route of Object.keys(lee.routeConfig.routes)){
    const tensor=S.fromLeeData(lee,{route}),rollup=S.intervalRollup(tensor);
    assert.equal(tensor.features.length,7890);assert.equal(tensor.totalSlots,tensor.times.length*7890);assert.equal(tensor.observedValues,tensor.totalSlots);
    assert.equal(tensor.metadata.independentUnits,null);assert.equal(tensor.metadata.observationUnit,'population_summary');
    const expected=archive.filter(row=>row.route===route);assert.equal(rollup.intervals.length,expected.length);
    for(let i=0;i<expected.length;i++){
      const original=expected[i],actual=rollup.intervals[i],transition=S.epistateTransition(tensor,{from:actual.from,to:actual.to,epsilon:.05});
      assert.equal(actual.observedPairs,Number(original.eligible_regions));
      assert.equal(actual.fromSampleIds[0],original.from_sample);assert.equal(actual.toSampleIds[0],original.to_sample);
      assert.ok(Math.abs(actual.meanDelta-Number(original.mean_difference))<1e-14,route+' mean delta');
      assert.ok(Math.abs(actual.meanAbsoluteDelta-Number(original.mean_absolute_difference))<1e-14,route+' mean absolute delta');
      assert.equal(transition.increased,Number(original.above_0_05));assert.equal(transition.decreased,Number(original.below_minus_0_05));
      assert.equal(transition.withinTolerance,7890-Number(original.absolute_above_0_05));
      assert.equal(actual.source[0].file,original.source_file);assert.equal(actual.source[0].sheet,original.source_sheet);assert.equal(actual.source[0].rowStart,4);assert.equal(actual.source[0].rowEnd,7893);
    }
  }
});
test('Lee D16L stays on continued low; day16 cannot be requested on withdrawal',()=>{
  const tensor=S.fromLeeData(lee,{route:'low_withdrawal'});
  assert.equal(tensor.times.includes(16),false);
  throws(()=>S.epistateTransition(tensor,{from:8,to:16}),'missing_route_slot');
  const changed=clone(lee);changed.routeConfig.routes.low_withdrawal.splice(4,0,{day:'16',sample_id:'D16L'});
  assert.throws(()=>S.fromLeeData(changed,{route:'low_withdrawal'}),error=>error.code==='invalid_route_assignment');
  const mislabeled=S.fromLeeData(lee,{route:'continued_low'});mislabeled.route='low_withdrawal';mislabeled.metadata.route='low_withdrawal';
  throws(()=>S.epistateTransition(mislabeled),'invalid_lee_schedule');
  const wrongSample=S.fromLeeData(lee,{route:'low_withdrawal'});wrongSample.sources[0][4][0].sampleId='D21L';
  throws(()=>S.intervalRollup(wrongSample),'invalid_lee_locator');
});
test('Lee exact values, source locators and approximate final time remain explicit',()=>{
  const tensor=S.fromLeeData(lee,{route:'high_withdrawal'}),result=S.epistateTransition(tensor);
  assert.equal(result.to,30);assert.equal(result.approximateTo,true);
  const cell=S.inspectValue(tensor,{unit:'population-profile',time:8,feature:'DMR_6652'});
  assert.equal(cell.value,lee.values[3][6651]);assert.equal(cell.source.row,6655);assert.equal(cell.source.column,'K');assert.equal(cell.source.sampleId,'D8H');
  delete tensor.metadata.approximateTimes;throws(()=>S.intervalRollup(tensor),'invalid_lee_schedule');
});
test('Lee retrieved subsets and invalid routes cannot enter the skills',()=>{
  const partial=clone(lee);partial.features.pop();assert.throws(()=>S.fromLeeData(partial),error=>error.code==='incomplete_features');
  throws(()=>S.fromLeeData(lee,{route:'invented'}),'unknown_route');
  throws(()=>S.fromLeeData(lee,{route:'continued_low',feature:'DMR_1'}),'invalid_arguments');
  const filtered=S.fromLeeData(lee);filtered.mask[0][0][0]=false;filtered.Z[0][0][0]=null;filtered.sources[0][0][0]=null;filtered.observedValues--;
  throws(()=>S.intervalRollup(filtered),'invalid_lee_mask');
});
test('local size budget is enforced before allocating large tensors',()=>{
  const data=fixture();data.features=Array.from({length:100001},(_,i)=>'f'+i);throws(()=>S.epistateTensor(data),'size_limit');
});
