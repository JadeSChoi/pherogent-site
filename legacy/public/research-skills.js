/* Pherogent descriptive research skills, browser/Node adapter.
 * No network, model execution, learned predictor, or causal inference.
 * This is a small JavaScript implementation of the supplied tensor/interval
 * contracts, not the Python EpiState-T package running in the browser.
 */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PherogentResearchSkills = api;
})(typeof window === 'object' ? window : null, function (root) {
  'use strict';
  const MAX_SLOTS = 200000;
  const EPSILONS = Object.freeze([0.02, 0.05, 0.1]);
  const MODALITIES = Object.freeze(['DNAm', 'RNA', 'ATAC']);
  const LEE_ROUTES = Object.freeze({
    continued_high:[[0,'2°MEF'],[2,'D2H'],[5,'D5H'],[8,'D8H'],[11,'D11H'],[16,'D16H'],[18,'D18H']],
    continued_low:[[0,'2°MEF'],[2,'D2H'],[5,'D5H'],[8,'D8H'],[16,'D16L'],[21,'D21L']],
    low_withdrawal:[[0,'2°MEF'],[2,'D2H'],[5,'D5H'],[8,'D8H'],[21,'D21Ø']],
    high_withdrawal:[[0,'2°MEF'],[2,'D2H'],[5,'D5H'],[8,'D8H'],[11,'D11H'],[16,'D16H'],[18,'D18H'],[30,'2°iPSC']]
  });
  const LEE_COLUMNS = Object.freeze({'2°MEF':'H',D2H:'I',D5H:'J',D8H:'K',D11H:'L',D16H:'M',D18H:'N',D16L:'O',D21L:'P','D21Ø':'Q','2°iPSC':'S'});
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const word = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const warning = 'Descriptive differences between source profiles only. Features are not independent replicates. Within tolerance is not exact equality, a same-cell trajectory, or a demonstrated mechanism.';

  function refuse(code, message) {
    const error = new Error(message);
    error.name = 'ResearchSkillError'; error.code = code; throw error;
  }
  function keys(value, allowed, code = 'invalid_arguments') {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) refuse(code, 'Unsupported or malformed arguments.');
  }
  function axis(values, name) {
    if (!Array.isArray(values) || !values.length || values.some(value => !word(value))) refuse('invalid_axis', name + ' must contain nonempty identifiers.');
    if (new Set(values).size !== values.length) refuse('duplicate_axis', name + ' identifiers must be unique.');
  }
  function timesCheck(times) {
    if (!Array.isArray(times) || times.length < 2 || times.some((time, i) => typeof time !== 'number' || !Number.isFinite(time) || time < 0 || (i > 0 && time <= times[i - 1]))) {
      refuse('invalid_time_order', 'At least two finite, strictly increasing, nonnegative time points are required.');
    }
  }
  function metadataCheck(metadata, units, features, times) {
    keys(metadata, ['study', 'route', 'population', 'observationUnit', 'independentUnits', 'destructiveSampling', 'lineage', 'featuresAreReplicates', 'approximateTimes', 'sourceStatus'], 'invalid_metadata');
    if (![metadata.study, metadata.route, metadata.population].every(word)) refuse('invalid_metadata', 'Study, route and population must be explicitly identified.');
    if (metadata.featuresAreReplicates !== false) refuse('features_are_not_replicates', 'The feature axis cannot be counted as independent biological replicates.');
    if (!['population_summary', 'biological_unit'].includes(metadata.observationUnit)) refuse('invalid_observation_unit', 'Declare population_summary or biological_unit; features are not a valid observation unit.');
    if (typeof metadata.destructiveSampling !== 'boolean' || !['not_tracked', 'tracked', 'unknown'].includes(metadata.lineage)) refuse('invalid_metadata', 'Declare destructive sampling and whether units were tracked.');
    if (metadata.destructiveSampling && metadata.lineage === 'tracked') refuse('incompatible_lineage', 'Destructive samples cannot be declared repeated measurements of the same tracked cells.');
    if (metadata.observationUnit === 'population_summary' && metadata.independentUnits !== null) refuse('unknown_independence', 'This population-summary tensor does not identify independent biological units; keep their count unknown.');
    if (metadata.observationUnit === 'biological_unit' && metadata.independentUnits !== null && (!Number.isInteger(metadata.independentUnits) || metadata.independentUnits < 1 || metadata.independentUnits > units.length)) refuse('invalid_replicate_count', 'Independent units must be a declared count within the biological-unit axis, never the feature count.');
    if (metadata.approximateTimes !== undefined && (!Array.isArray(metadata.approximateTimes) || new Set(metadata.approximateTimes).size !== metadata.approximateTimes.length || metadata.approximateTimes.some(time => !times.includes(time)))) refuse('invalid_metadata', 'Approximate time points must refer to declared times.');
    if (features.length * times.length * units.length > MAX_SLOTS) refuse('size_limit', 'This local skill is limited to 200,000 tensor slots.');
  }
  function locator(source) {
    keys(source, ['file', 'sheet', 'row', 'column', 'sampleId'], 'invalid_source');
    if (!word(source.file) || !word(source.sampleId)) refuse('invalid_source', 'Each observed value needs a source file and sample ID.');
    if (source.sheet !== undefined && !word(source.sheet)) refuse('invalid_source', 'The source sheet must be a nonempty name.');
    if (source.row !== undefined && (!Number.isInteger(source.row) || source.row < 1)) refuse('invalid_source', 'A source row must be a positive integer.');
    if (source.column !== undefined && !word(source.column)) refuse('invalid_source', 'A source column must be a nonempty identifier.');
    if (source.row === undefined && source.sheet !== undefined) refuse('invalid_source', 'A spreadsheet locator requires its source row.');
    return {...source};
  }
  function valueCheck(value, modality) {
    if (typeof value !== 'number' || !Number.isFinite(value)) refuse('non_finite_value', 'Observed measurements must be finite numbers. Leave unobserved entries absent; do not insert NaN or zero.');
    if (modality === 'DNAm' && (value < 0 || value > 1)) refuse('invalid_fraction', 'DNAm fractions must lie between 0 and 1.');
  }
  function cells(units, times, features, initial) {
    return units.map(() => times.map(() => features.map(() => initial)));
  }
  function epistateTensor(input) {
    keys(input, ['units', 'times', 'features', 'modality', 'metadata', 'observations']);
    const {units, times, features, modality, metadata, observations} = input;
    axis(units, 'Units'); axis(features, 'Features'); timesCheck(times);
    if (!MODALITIES.includes(modality)) refuse('invalid_modality', 'Use DNAm, RNA or ATAC. ATAC is not a methylation measurement.');
    metadataCheck(metadata, units, features, times);
    if (!Array.isArray(observations) || observations.length > MAX_SLOTS) refuse('invalid_observations', 'Provide at most 200,000 observed values.');
    const ui = new Map(units.map((value, i) => [value, i])), ti = new Map(times.map((value, i) => [value, i])), fi = new Map(features.map((value, i) => [value, i]));
    const Z = cells(units, times, features, null), mask = cells(units, times, features, false), sources = cells(units, times, features, null);
    for (const row of observations) {
      keys(row, ['unit', 'time', 'feature', 'value', 'source']);
      if (!ui.has(row.unit) || !ti.has(row.time) || !fi.has(row.feature)) refuse('unknown_coordinate', 'An observation refers to a unit, time or feature outside the declared axes.');
      const u = ui.get(row.unit), t = ti.get(row.time), f = fi.get(row.feature);
      if (mask[u][t][f]) refuse('duplicate_observation', 'A unit/time/feature coordinate has more than one observation.');
      valueCheck(row.value, modality);
      sources[u][t][f] = locator(row.source); Z[u][t][f] = row.value; mask[u][t][f] = true;
    }
    const tensor = {schemaVersion:1, implementation:'pherogent-js-descriptive-v1', study:metadata.study, route:metadata.route, modality,
      units:[...units], times:[...times], features:[...features], metadata:{...metadata, approximateTimes:[...(metadata.approximateTimes || [])]},
      Z, mask, sources, observedValues:observations.length, totalSlots:units.length * times.length * features.length};
    validateTensor(tensor);
    return tensor;
  }
  function validateTensor(tensor) {
    if (!object(tensor) || tensor.schemaVersion !== 1) refuse('invalid_tensor', 'A version-1 validated state tensor is required.');
    const {units, times, features, modality, metadata} = tensor;
    axis(units, 'Units'); axis(features, 'Features'); timesCheck(times);
    if (!MODALITIES.includes(modality)) refuse('invalid_modality', 'Unknown assay; methylation and accessibility cannot be substituted.');
    metadataCheck(metadata, units, features, times);
    if (tensor.study !== metadata.study || tensor.route !== metadata.route) refuse('route_mismatch', 'The tensor study and route must match its declared metadata.');
    const leeVisits=tensor.study==='lee2014' ? LEE_ROUTES[tensor.route] : null;
    if(tensor.study==='lee2014') {
      if(!leeVisits || units.length!==1 || units[0]!=='population-profile' || modality!=='DNAm' || metadata.observationUnit!=='population_summary' || metadata.independentUnits!==null || metadata.lineage!=='not_tracked' || !metadata.destructiveSampling)refuse('invalid_lee_design','Lee tensors must retain the source-supported population profile and route.');
      if(times.length!==leeVisits.length || times.some((time,i)=>time!==leeVisits[i][0]) || features.length!==7890 || features.some((feature,i)=>feature!=='DMR_'+(i+1)))refuse('invalid_lee_schedule','Use the full Lee route and every one of its 7,890 measured regions. D16L is not a withdrawal observation.');
      const approx=metadata.approximateTimes || [];
      if(tensor.route==='high_withdrawal' ? approx.length!==1 || approx[0]!==30 : approx.length!==0)refuse('invalid_lee_schedule','The Lee endpoint near day30 must remain explicitly approximate.');
    }
    for (const matrix of [tensor.Z, tensor.mask, tensor.sources]) {
      if (!Array.isArray(matrix) || matrix.length !== units.length || matrix.some(rows => !Array.isArray(rows) || rows.length !== times.length || rows.some(row => !Array.isArray(row) || row.length !== features.length))) refuse('shape_mismatch', 'Values, observation mask and source locators must have exactly the declared unit × time × feature shape.');
    }
    let observed = 0;
    const sampleBySlot = new Map(), slotBySample = new Map();
    for (let u = 0; u < units.length; u++) for (let t = 0; t < times.length; t++) for (let f = 0; f < features.length; f++) {
      const masked = tensor.mask[u][t][f], value = tensor.Z[u][t][f], source = tensor.sources[u][t][f];
      if (typeof masked !== 'boolean') refuse('invalid_mask', 'Observation mask entries must be booleans.');
      if (!masked) {
        if(leeVisits)refuse('invalid_lee_mask','Every value on an included Lee source profile is observed; a filtered subset cannot enter this full-table calculation.');
        if (value !== null || source !== null) refuse('mask_value_mismatch', 'Unobserved entries must have null values and locators; masked values cannot enter a calculation.');
        continue;
      }
      valueCheck(value, modality); locator(source); observed++;
      if(leeVisits && (source.sampleId!==leeVisits[t][1] || source.file!=='sources/ncomms6619-s3.xlsx' || source.sheet!=='Suppl_Data2' || source.row!==f+4 || source.column!==LEE_COLUMNS[source.sampleId]))refuse('invalid_lee_locator','A Lee profile, workbook cell or route assignment differs from the source layout.');
      const slot = u + '/' + t;
      if (sampleBySlot.has(slot) && sampleBySlot.get(slot) !== source.sampleId) refuse('mixed_sample_slot', 'One unit/time slot cannot silently mix multiple sample IDs.');
      sampleBySlot.set(slot, source.sampleId);
      if (slotBySample.has(source.sampleId) && slotBySample.get(source.sampleId) !== slot) refuse('reused_sample', 'A source sample cannot stand for two different unit/time slots in one route.');
      slotBySample.set(source.sampleId, slot);
    }
    if (tensor.observedValues !== observed || tensor.totalSlots !== units.length * times.length * features.length) refuse('count_mismatch', 'Tensor counts must agree with the observation mask, not a feature-derived replicate count.');
    return true;
  }
  function sourceSummary(tensor, indices, pairedFeatures) {
    const groups = new Map();
    for (let u = 0; u < tensor.units.length; u++) for (const t of indices) for (let f = 0; f < tensor.features.length; f++) {
      if (!pairedFeatures[u][f]) continue;
      const s = tensor.sources[u][t][f];
      const key = JSON.stringify([s.file, s.sheet || null, s.column || null, s.sampleId]);
      let g = groups.get(key);
      if (!g) {g = {file:s.file, sampleId:s.sampleId, featureCount:0}; if(s.sheet)g.sheet=s.sheet;if(s.column)g.column=s.column;groups.set(key,g);}
      g.featureCount++;
      if (s.row !== undefined) {g.rowStart = Math.min(g.rowStart ?? s.row, s.row);g.rowEnd = Math.max(g.rowEnd ?? s.row, s.row);}
    }
    return [...groups.values()];
  }
  function interval(tensor, a, b, epsilon) {
    let observedPairs = 0, signed = 0, absolute = 0, withinTolerance = 0, increased = 0, decreased = 0, exactEqual = 0;
    const pairs = tensor.units.map(() => tensor.features.map(() => false));
    const fromIds = new Set(), toIds = new Set();
    for (let u = 0; u < tensor.units.length; u++) for (let f = 0; f < tensor.features.length; f++) {
      if (!tensor.mask[u][a][f] || !tensor.mask[u][b][f]) continue;
      pairs[u][f] = true; observedPairs++;
      fromIds.add(tensor.sources[u][a][f].sampleId); toIds.add(tensor.sources[u][b][f].sampleId);
      const delta = tensor.Z[u][b][f] - tensor.Z[u][a][f];
      if(!Number.isFinite(delta))refuse('numeric_overflow','The observed difference exceeded finite numeric precision; no numerical result was returned.');
      signed += delta; absolute += Math.abs(delta);
      if(!Number.isFinite(signed) || !Number.isFinite(absolute))refuse('numeric_overflow','The aggregate exceeded finite numeric precision; no numerical result was returned.');
      if (delta === 0) exactEqual++;
      if (epsilon !== undefined) {if (Math.abs(delta) <= epsilon) withinTolerance++;else if (delta > epsilon) increased++;else decreased++;}
    }
    const totalPairs = tensor.units.length * tensor.features.length;
    return {from:tensor.times[a], to:tensor.times[b], fromSampleIds:[...fromIds], toSampleIds:[...toIds],
      approximateFrom:(tensor.metadata.approximateTimes || []).includes(tensor.times[a]), approximateTo:(tensor.metadata.approximateTimes || []).includes(tensor.times[b]),
      observedPairs, missingPairs:totalPairs-observedPairs, missingFraction:1-observedPairs/totalPairs,
      meanDelta:observedPairs ? signed/observedPairs : null, meanAbsoluteDelta:observedPairs ? absolute/observedPairs : null,
      source:sourceSummary(tensor,[a,b],pairs), status:observedPairs ? 'COMPUTED' : 'NO_PAIRED_OBSERVATIONS',
      ...(epsilon !== undefined ? {withinTolerance,increased,decreased,exactEqual} : {})};
  }
  function intervalRollup(tensor) {
    validateTensor(tensor);
    const intervals = [];
    for (let t = 1; t < tensor.times.length; t++) intervals.push({...interval(tensor,t-1,t),sequence:t,previousSequence:t > 1 ? t-1 : null,recordIsComputational:true});
    return {schemaVersion:1,study:tensor.study,route:tensor.route,modality:tensor.modality,intervals,
      observationUnit:tensor.metadata.observationUnit,independentUnits:tensor.metadata.independentUnits,
      aiCalls:0,tokens:0,warning,integrity:'Ordered in-memory records with source locators; no cryptographic or biological ledger is claimed.'};
  }
  function epistateTransition(tensor, options = {}) {
    validateTensor(tensor); keys(options,['from','to','epsilon']);
    if (own(options,'from') !== own(options,'to')) refuse('incomplete_interval','Supply both interval endpoints, or omit both to use the final interval.');
    const {from = tensor.times[tensor.times.length-2],to = tensor.times[tensor.times.length-1],epsilon = 0.05} = options;
    if (!EPSILONS.includes(epsilon)) refuse('invalid_tolerance', 'Use a declared tolerance: 0.02, 0.05 or 0.10.');
    const a=tensor.times.indexOf(from),b=tensor.times.indexOf(to);
    if(a<0||b<0)refuse('missing_route_slot','The requested time does not exist on this route. Missing visits are not interpolated or borrowed from another route.');
    if(b!==a+1)refuse('nonconsecutive_interval','Choose consecutive observed time slots in the same route, in increasing order.');
    const summary=interval(tensor,a,b,epsilon);
    if(!summary.observedPairs)refuse('no_paired_observations','No features were observed at both requested endpoints. No difference can be computed.');
    return {schemaVersion:1,study:tensor.study,route:tensor.route,modality:tensor.modality,epsilon,...summary,
      observationUnit:tensor.metadata.observationUnit,independentUnits:tensor.metadata.independentUnits,
      definition:'For every feature observed at both endpoints, delta = later value − earlier value. Within tolerance means |delta| ≤ epsilon; increased/decreased count only changes beyond epsilon.',
      aiCalls:0,tokens:0,warning};
  }
  function fromLeeData(data, options = {}) {
    keys(options,['route']);
    const {route='continued_low'}=options;
    if (!root?.PherogentLeeAnalysis?.validateData) refuse('lee_validator_unavailable','Load the existing Lee source validator before converting its dataset.');
    root.PherogentLeeAnalysis.validateData(data);
    if (typeof route !== 'string' || !own(data.routeConfig.routes,route)) refuse('unknown_route','Choose a source-supported Lee route.');
    const visits=data.routeConfig.routes[route], units=['population-profile'],times=visits.map(v=>v.day==='~30'?30:Number(v.day)), observations=[];
    for(const visit of visits) {
      const sample=data.samples.indexOf(visit.sample_id),time=visit.day==='~30'?30:Number(visit.day);
      for(let f=0;f<data.features.length;f++)observations.push({unit:units[0],time,feature:data.features[f],value:data.values[sample][f],source:{file:'sources/ncomms6619-s3.xlsx',sheet:'Suppl_Data2',row:data.rows[f],column:data.columns[sample],sampleId:visit.sample_id}});
    }
    return epistateTensor({units,times,features:data.features,modality:'DNAm',observations,
      metadata:{study:'lee2014',route,population:'Source methylation profiles from Lee et al. 2014',observationUnit:'population_summary',independentUnits:null,destructiveSampling:true,lineage:'not_tracked',featuresAreReplicates:false,approximateTimes:visits.some(v=>v.day==='~30')?[30]:[],sourceStatus:'Public workbook numerical reconstruction; original analysis archive unavailable.'}});
  }
  function inspectValue(tensor,{unit,time,feature}={}) {
    validateTensor(tensor);
    const u=tensor.units.indexOf(unit),t=tensor.times.indexOf(time),f=tensor.features.indexOf(feature);
    if(u<0||t<0||f<0)refuse('unknown_coordinate','The requested coordinate is outside this state tensor.');
    return {unit,time,feature,observed:tensor.mask[u][t][f],value:tensor.Z[u][t][f],source:tensor.sources[u][t][f] ? {...tensor.sources[u][t][f]} : null};
  }
  return Object.freeze({epistateTensor,intervalRollup,epistateTransition,validateTensor,fromLeeData,inspectValue,MAX_SLOTS,EPSILONS,MODALITIES});
});
