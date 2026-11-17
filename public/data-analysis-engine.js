/* Local, deterministic assay-table adapter. No network or model calls. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PherogentDataEngine = api;
})(typeof window === 'object' ? window : null, function (root) {
  'use strict';
  const MAX_BYTES = 2 * 1024 * 1024, MAX_ROWS = 20000, MAX_UNITS = 128, MAX_TIMES = 48;
  const HEADERS = Object.freeze(['sample_id','unit_id','time','feature','value']);
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const clone = x => JSON.parse(JSON.stringify(x));
  function refuse(code,message) {const e = new Error(message);e.name = 'DataAnalysisError';e.code = code;throw e;}
  function skills() {if (!root?.PherogentResearchSkills) refuse('skills_unavailable','The descriptive calculation tools are not loaded. Reload the page.');return root.PherogentResearchSkills;}
  function identifier(value,label) {if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) refuse('invalid_identifier',label + ' must be 1–120 characters without control characters.');return value.trim();}
  function bytes(text) {let n=0;for(const c of text){const p=c.codePointAt(0);n+=p<=127?1:p<=2047?2:p<=65535?3:4;}return n;}
  function number(value,label) {if (!numeric.test(value) || !Number.isFinite(Number(value))) refuse('invalid_number',label+' must be a finite decimal number.');return Number(value);}

  function parse(text, options = {}) {
    if (typeof text !== 'string' || !text.trim()) refuse('empty_file','Choose a nonempty CSV or TSV measurement table.');
    if (text.length > MAX_BYTES || bytes(text) > MAX_BYTES) refuse('file_too_large','Measurement tables are limited to 2 MiB. No partial file is analyzed.');
    text=text.replace(/^\uFEFF/,'');
    const firstLine=text.split(/\r?\n/,1)[0], delimiter=/\.tsv$/i.test(options.fileName||'')||firstLine.includes('\t')?'\t':',';
    const records=[];let fields=[],field='',quoted=false,closed=false,line=1,start=1;
    function endField(){fields.push(field);field='';closed=false;}
    function endRow(){endField();if(!(fields.length===1&&fields[0].trim()===''))records.push({fields,row:start});fields=[];start=line+1;if(records.length>MAX_ROWS+1)refuse('too_many_rows','Measurement tables are limited to 20,000 data rows. No rows were sampled or dropped.');}
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted) {
        if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}
        else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;field+='\n';line++;}
        else field+=c;
      } else if(c===delimiter)endField();
      else if(c==='\r'||c==='\n'){endRow();if(c==='\r'&&text[i+1]==='\n')i++;line++;start=line;}
      else if(c==='"'){if(field||closed)refuse('malformed_csv','A quote occurs inside an unquoted field on line '+line+'.');quoted=true;}
      else {if(closed)refuse('malformed_csv','Unexpected text after a quoted field on line '+line+'.');field+=c;}
    }
    if(quoted)refuse('malformed_csv','The table ends inside a quoted field.');
    if(field||fields.length||closed)endRow();
    if(records.length<2)refuse('empty_file','Include the header and at least one measurement row.');
    const columns=records.shift().fields.map(x=>x.trim());
    if(columns.length!==HEADERS.length||new Set(columns).size!==HEADERS.length||HEADERS.some(x=>!columns.includes(x)))refuse('invalid_headers','Use exactly these columns: sample_id, unit_id, time, feature, value. Keep one assay and one route per file.');
    const rows=records.map(record=>{
      if(record.fields.length!==columns.length)refuse('row_width','Line '+record.row+' has '+record.fields.length+' fields; expected '+columns.length+'.');
      const row={row:record.row};columns.forEach((column,i)=>{row[column]=record.fields[i].trim();});return row;
    });
    return {columns,rows,delimiter};
  }
  function sourceRecord(source) {
    if(!object(source)||typeof source.fileName!=='string'||!source.fileName.trim()||source.fileName.length>240||/[\u0000-\u001f\u007f]/.test(source.fileName))refuse('invalid_source','The input file needs its actual filename.');
    if(typeof source.sha256!=='string'||! /^[a-f0-9]{64}$/i.test(source.sha256))refuse('missing_file_hash','Compute the SHA-256 fingerprint of the selected file before analysis.');
    if(source.origin!==undefined&&!['user_upload','synthetic'].includes(source.origin))refuse('invalid_source','Uploaded input must be labeled user_upload or synthetic.');
    return {fileName:source.fileName,sha256:source.sha256.toLowerCase(),origin:source.origin||'user_upload',provenanceStatus:'File fingerprint recorded; study and sample metadata are author-declared, not independently authenticated.'};
  }
  function summarize(tensor,extra={}) {
    const samples=new Set();for(const unit of tensor.sources)for(const visit of unit)for(const cell of visit)if(cell)samples.add(cell.sampleId);
    return {study:tensor.study,route:tensor.route,modality:tensor.modality,units:tensor.units.length,features:tensor.features.length,times:[...tensor.times],observedValues:tensor.observedValues,totalSlots:tensor.totalSlots,missingValues:tensor.totalSlots-tensor.observedValues,sampleCount:samples.size,...clone(tensor.metadata),...extra};
  }
  function prepare(text, metadata, source) {
    const S=skills(),file=sourceRecord(source),parsed=parse(text,{fileName:file.fileName});
    if(!object(metadata))refuse('invalid_metadata','Declare the study, assay, sampling route and biological-unit structure.');
    if(!['DNAm','RNA','ATAC'].includes(metadata.modality))refuse('invalid_modality','Choose DNAm, RNA or ATAC. They are different measurements.');
    const {modality,...design}=metadata;
    if(design.independentUnits===undefined)design.independentUnits=null;
    if(design.study==='lee2014')refuse('reserved_study','Use the bundled Lee example for its source-validated study identifier. Give uploaded data a separate study name.');
    const unitSet=new Set(),timeSet=new Set(),featureSet=new Set(),coordinates=new Set(),sampleSlots=new Map(),slotSamples=new Map(),observations=[];
    for(const row of parsed.rows) {
      const unit=identifier(row.unit_id,'Unit ID on line '+row.row),feature=identifier(row.feature,'Feature on line '+row.row),time=number(row.time,'Time on line '+row.row);
      if(time<0)refuse('invalid_time_order','Time must be nonnegative; line '+row.row+' has a negative value.');
      const missing=row.value===''||row.value.toUpperCase()==='NA';
      if(!missing&&!row.sample_id)refuse('missing_sample','Observed values require a sample_id on line '+row.row+'.');
      const sample=row.sample_id?identifier(row.sample_id,'Sample ID on line '+row.row):null;
      const coordinate=JSON.stringify([unit,time,feature]),slot=JSON.stringify([unit,time]);
      if(coordinates.has(coordinate))refuse('duplicate_observation','The same unit/time/feature occurs twice, including a missing value, on line '+row.row+'.');
      coordinates.add(coordinate);unitSet.add(unit);timeSet.add(time);featureSet.add(feature);
      if(sample){
        if(slotSamples.has(slot)&&slotSamples.get(slot)!==sample)refuse('mixed_sample_slot','One unit/time slot names different samples; line '+row.row+'.');
        if(sampleSlots.has(sample)&&sampleSlots.get(sample)!==slot)refuse('reused_sample','One sample_id is assigned to different units or times; line '+row.row+'.');
        slotSamples.set(slot,sample);sampleSlots.set(sample,slot);
      }
      if(!missing)observations.push({unit,time,feature,value:number(row.value,'Value on line '+row.row),source:{file:file.fileName,row:row.row,column:'value',sampleId:sample}});
    }
    if(unitSet.size>MAX_UNITS||timeSet.size>MAX_TIMES)refuse('axis_limit','This local workflow accepts at most 128 unit IDs and 48 time points. Split independent studies into separate runs.');
    if(design.observationUnit==='population_summary'&&unitSet.size!==1)refuse('ambiguous_population','Population-summary analysis requires one declared population ID. Do not silently pool different populations.');
    const tensor=S.epistateTensor({units:[...unitSet],times:[...timeSet].sort((a,b)=>a-b),features:[...featureSet],modality,metadata:design,observations});
    return {schemaVersion:1,tensor,summary:summarize(tensor,{rows:parsed.rows.length,missingRows:parsed.rows.length-observations.length}),source:file};
  }
  function prepareLee(data, options={}) {
    const tensor=skills().fromLeeData(data,options),rawHash=data?.metadata?.workbookSha256;
    const source={fileName:'sources/ncomms6619-s3.xlsx',sha256:typeof rawHash==='string'&&/^[a-f0-9]{64}$/i.test(rawHash)?rawHash:null,origin:'public_dataset',sourceUrl:data?.metadata?.workbookUrl||null,provenanceStatus:'Bundled Lee workbook reconstruction; validated against its fixed source layout. The original analysis archive is unavailable.'};
    return {schemaVersion:1,tensor,summary:summarize(tensor,{rows:tensor.observedValues}),source};
  }
  function preparedCheck(prepared) {
    if(!object(prepared)||prepared.schemaVersion!==1||!object(prepared.source))refuse('invalid_input','Connect and validate a measurement table before running an analysis.');
    skills().validateTensor(prepared.tensor);
    if(prepared.source.origin==='public_dataset') {
      if(prepared.tensor.study!=='lee2014'||prepared.source.fileName!=='sources/ncomms6619-s3.xlsx')refuse('invalid_source','Bundled source metadata does not match the Lee tensor.');
    } else sourceRecord(prepared.source);
    for(const unit of prepared.tensor.sources)for(const visit of unit)for(const cell of visit)if(cell&&cell.file!==prepared.source.fileName)refuse('source_mismatch','A measurement locator points to a different input file.');
  }
  function pairedIntervals(tensor) {
    const result=[];
    for(let t=1;t<tensor.times.length;t++){let n=0;for(let u=0;u<tensor.units.length;u++)for(let f=0;f<tensor.features.length;f++)if(tensor.mask[u][t-1][f]&&tensor.mask[u][t][f])n++;result.push({from:tensor.times[t-1],to:tensor.times[t],observedPairs:n});}
    return result;
  }
  function availability(prepared) {
    let ready=false,pairs=false,reason='Connect a valid measurement table first.';
    if(prepared){try{preparedCheck(prepared);ready=true;pairs=pairedIntervals(prepared.tensor).some(x=>x.observedPairs>0);reason=pairs?'Uses all eligible input rows.':'No matching unit/feature pairs occur at adjacent times; a transition cannot be computed.';}catch(e){reason=e.message;}}
    return [
      {id:'tensor',name:'EpiState-T state tensor',status:ready?'AVAILABLE':'BLOCKED',reason:ready?'Arrange measured values and preserve missing entries.':reason},
      {id:'rollup',name:'Interval Rollup',status:ready?'AVAILABLE':'BLOCKED',reason:ready?'Summarize every adjacent interval; unobserved intervals remain explicit.':reason},
      {id:'transition',name:'Observed transition',status:ready&&pairs?'AVAILABLE':'BLOCKED',reason},
      {id:'ablation',name:'Mechanism Ablation',status:'PROPOSED',reason:'Predictive model comparisons have not been implemented or validated.'},
      {id:'age',name:'Epigenetic Age',status:'PROPOSED',reason:'Requires an evaluated clock matched to the species, tissue and measurement assay.'},
      {id:'identity',name:'Identity Marker',status:'PROPOSED',reason:'Requires an evaluated marker panel matched to the assay and study.'}
    ];
  }
  function compactInterval(item,limit) {
    const out={...item},source=Array.isArray(item.source)?item.source:[];
    out.source=source.slice(0,limit);out.sourceGroupCount=source.length;out.omittedSourceGroups=Math.max(0,source.length-limit);
    for(const key of ['fromSampleIds','toSampleIds']){const ids=Array.isArray(item[key])?item[key]:[];out[key]=ids.slice(0,limit);out[key+'Count']=ids.length;out['omitted'+key[0].toUpperCase()+key.slice(1)]=Math.max(0,ids.length-limit);}
    return out;
  }
  function calculate(prepared, options={}) {
    preparedCheck(prepared);
    const S=skills(),tensor=prepared.tensor,rollup=S.intervalRollup(tensor),transition=S.epistateTransition(tensor,options),state=summarize(tensor,{rows:prepared.summary?.rows??tensor.observedValues});
    const synthetic=prepared.source.origin==='synthetic';
    const limitations=[
      'These are descriptive measurements, not a causal mechanism, a test of stored cellular memory, or proof of same-cell recovery.',
      'Features are not independent biological replicates. No significance test or predictive model was fitted.',
      'Within tolerance is not exact equality. Only the same declared unit and feature at adjacent times are paired; missing measurements are never imputed.',
      prepared.source.provenanceStatus,
      'Technical checks do not establish scientific validity. The researcher must assess the design and interpretation.'
    ];
    if(tensor.metadata.independentUnits===null)limitations.push('The number of independent biological units is unknown; no replicate-based inference is supported.');
    if(tensor.metadata.destructiveSampling||tensor.metadata.lineage!=='tracked')limitations.push('These data do not establish repeated measurements of the same tracked cells.');
    if(synthetic)limitations.unshift('Synthetic software-test inputs only. These numbers are not biological findings.');
    const verification={status:'CHECKED',scope:'Input structure and deterministic calculation only',checks:[
      {name:'Input structure',status:'CHECKED',detail:'All declared axes, values, masks, sample assignments and source locators passed the descriptive-tool input checks.'},
      {name:'Eligible observations',status:'CHECKED',detail:'Every eligible input row was used. No retrieved subset or imputed value entered a calculation.'},
      {name:'Adjacent comparison',status:'CHECKED',detail:`The selected transition uses ${transition.observedPairs} matched unit-feature pairs at times ${transition.from} and ${transition.to}.`},
      {name:'Independent units',status:state.independentUnits===null?'INDETERMINATE':'DECLARED',detail:state.independentUnits===null?'Independent biological replicate count is unknown.':`${state.independentUnits} independent units declared by the author; not independently authenticated.`},
      {name:'Scientific interpretation',status:'NOT_ASSESSED',detail:'No causal, same-cell, mechanistic or clinical conclusion has been verified.'}
    ],limitations};
    const base={schemaVersion:1,kind:'calculation',origin:synthetic?'synthetic':'computed',implementation:'pherogent-data-analysis-v1',study:tensor.study,route:tensor.route,epsilon:transition.epsilon,state,source:clone(prepared.source),verification,limitations,usage:{modelCalls:0,totalTokens:0},locatorNote:'Source-group row ranges may contain other or missing rows. Counts name eligible features only. Inspect exact unit/time/feature values while the input is connected. Compact traces explicitly count omitted source groups and sample IDs.'};
    let run;
    for(const limit of [8,4,2,1,0]){
      run={...base,rollup:{...rollup,intervals:rollup.intervals.map(x=>compactInterval(x,limit))},transition:compactInterval(transition,limit)};
      if(JSON.stringify(run).length<=56000)return run;
    }
    refuse('result_too_large','This calculation record exceeds the local save limit. No incomplete result was saved.');
  }
  function inspect(prepared,coordinate){preparedCheck(prepared);return skills().inspectValue(prepared.tensor,coordinate);}
  return Object.freeze({parse,prepare,prepareLee,calculate,availability,inspect,pairedIntervals,MAX_BYTES,MAX_ROWS,MAX_UNITS,MAX_TIMES,HEADERS});
});
