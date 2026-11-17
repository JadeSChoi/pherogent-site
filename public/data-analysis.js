'use strict';
(() => {
  // Local measurement workspace. No model requests and no uploaded file leaves this browser.
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value!==0&&Math.abs(value)<1e-6 ? value.toExponential(3) : value.toLocaleString('en-US',{maximumFractionDigits:6}) : 'Not estimable';
  const routes = {continued_high:'Continued high',continued_low:'Continued low',low_withdrawal:'Low withdrawal',high_withdrawal:'High withdrawal'};
  const template = 'sample_id,unit_id,time,feature,value\nSYNTHETIC_T0,population,0,feature_A,0.20\nSYNTHETIC_T0,population,0,feature_B,0.50\nSYNTHETIC_T2,population,2,feature_A,0.40\nSYNTHETIC_T2,population,2,feature_B,0.50\nSYNTHETIC_T4,population,4,feature_A,\nSYNTHETIC_T4,population,4,feature_B,0.53\n';
  const fresh = () => ({study:'',route:'',population:'',modality:'DNAm',observationUnit:'population_summary',independentUnits:'',destructiveSampling:'true',lineage:'not_tracked'});
  const knownSynthetic = value => String(value).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim()===template.trim();
  const studyLabel = value => value==='lee2014'?'Lee 2014':value;
  const routeLabel = value => routes[value] || value;
  let lastPaintedPhase = null;
  let bridge, projectId = null, phase = 'connect', form = fresh(), text = '', fileName = '', bytes = null, origin = 'user_upload', confirmed = false, prepared = null, result = null, error = '', busy = false, generation = 0, tolerance = .05, selectedInterval = '', leeRoute = 'continued_low';
  const button = (label,action,extra='',kind='secondary') => `<button type="button" class="dl-button ${kind}" data-dl-action="${action}" ${extra}>${label}</button>`;
  function sync(ctx) {
    const id = ctx?.project?.id || '';
    if(id !== projectId) {
      projectId = id;generation++;phase='connect';form=fresh();text='';fileName='';bytes=null;origin='user_upload';confirmed=false;prepared=null;error='';busy=false;selectedInterval='';
      result = (ctx?.research?.studyRuns || []).find(run=>object(run)&&run.workflow==='data-analysis'&&run.kind==='calculation'&&run.projectId===id) || null;
      if(result)phase='results';
    }
  }
  function current() {return bridge?.context?.();}
  function currentProject() {return current()?.project?.id || projectId;}
  function validAsync(id,version) {return generation===version && projectId===id && currentProject()===id;}
  function resetDerived(message='Inputs changed. Check them again before running an analysis.') {
    generation++;prepared=null;result=null;error='';busy=false;selectedInterval='';
    if(phase!=='connect')phase='connect';
    const status=$('dlInputStatus');if(status)status.textContent=message;
    updateTabs();
  }
  function labelOrigin(run) {return run?.origin==='synthetic'||run?.source?.origin==='synthetic'?'Synthetic software test':'Calculated by Pherogent';}
  function tabs() {return [['connect','Connect data'],['analyses','Available analyses'],['results','Results & checks']].map(([key,label],i)=>`<button type="button" role="tab" id="dlTab-${key}" aria-selected="${phase===key}" aria-controls="dlPanel" data-dl-phase="${key}"${key==='analyses'&&!prepared||key==='results'&&!result?' disabled':''}><span>${String(i+1).padStart(2,'0')}</span>${label}${key==='analyses'&&prepared||key==='results'&&result?'<i aria-hidden="true">✓</i>':''}</button>`).join('');}
  function updateTabs() {const el=$('dlTabs');if(el)el.innerHTML=tabs();}
  function update() {
    if(!$('dataAnalysis'))return;
    const changed=lastPaintedPhase!==phase;lastPaintedPhase=phase;
    updateTabs();
    const panel=$('dlPanel');if(panel){panel.setAttribute?.('aria-labelledby','dlTab-'+phase);panel.innerHTML=phase==='connect'?connectHTML():phase==='analyses'?analysesHTML():resultsHTML();}
    if(changed)$('dataAnalysis')?.scrollIntoView?.({block:'start',behavior:'auto'});
  }
  function render(ctx) {
    sync(ctx);lastPaintedPhase=phase;
    return `<div class="data-lab" id="dataAnalysis"><header class="dl-heading"><div><span class="dl-eyebrow">${esc(ctx?.draft?.title || 'YOUR PROJECT')} / DATA & RESULTS</span><h1>Make the result traceable.</h1><p>Connect measurements, run eligible tools, and keep every result with its sources.</p></div><div class="dl-local"><span aria-hidden="true">●</span><div><strong>Runs on your device</strong><small>0 AI calls · 0 tokens</small></div></div></header><div id="dlTabs" class="dl-tabs" role="tablist" aria-label="Data analysis workspace">${tabs()}</div><section id="dlPanel" class="dl-panel" role="tabpanel" aria-labelledby="dlTab-${phase}">${phase==='connect'?connectHTML():phase==='analyses'?analysesHTML():resultsHTML()}</section><footer class="dl-footer"><span>Measurements stay in memory. Saved result summaries stay in this browser.</span><span>Source → calculation → your review</span></footer></div>`;
  }
  function select(id,label,values,value,help='') {return `<label class="dl-field" for="${id}"><span>${label}</span><select id="${id}">${values.map(([v,t])=>`<option value="${v}"${String(value)===v?' selected':''}>${t}</option>`).join('')}</select>${help?`<small>${help}</small>`:''}</label>`;}
  function input(id,label,value,placeholder,extra='') {return `<label class="dl-field" for="${id}"><span>${label}</span><input id="${id}" value="${esc(value)}" placeholder="${placeholder}" ${extra}></label>`;}
  function errorHTML() {return error?`<div class="dl-error" role="alert"><strong>Check the input</strong><p>${esc(error)}</p></div>`:'';}
  function connectHTML() {
    return `<div class="dl-connect-grid"><form id="dlConnectForm" class="dl-card"><div class="dl-card-heading"><div><span class="dl-eyebrow">MEASUREMENTS</span><h2>Connect your data</h2></div><span class="dl-badge">CSV / TSV</span></div><div id="dlDropzone" class="dl-dropzone${fileName?' has-file':''}"><span class="dl-file-icon" aria-hidden="true">${fileName?'▤':'↑'}</span><strong id="dlFileLabel">${esc(fileName || 'Drop a measurement file here')}</strong><p id="dlFileDetail">${fileName?`${number(bytes?.byteLength || new TextEncoder().encode(text).length)} bytes · held locally`:'One study and route per file · up to 2 MB'}</p><button type="button" class="dl-file-button" data-dl-action="file">${fileName?'Choose another file':'Choose file'}</button><input type="file" id="dlFile" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden></div><div class="dl-format-line"><span>Required: <code>sample_id, unit_id, time, feature, value</code></span>${button('Download template ↓','template','','text')}</div><details class="dl-paste"${text&&!bytes?' open':''}><summary>Paste a table instead</summary><label for="dlPaste">CSV or tab-separated measurements</label><textarea id="dlPaste" rows="6" maxlength="2097152" spellcheck="false" placeholder="sample_id,unit_id,time,feature,value">${esc(bytes?'':text)}</textarea><p>Blank or NA values are missing. Include missing visits as rows with blank values.</p></details><div class="dl-divider"></div><div class="dl-card-heading"><div><span class="dl-eyebrow">STUDY DESIGN</span><h2>Describe what was measured</h2></div></div><div class="dl-form-grid">${input('dlStudy','Study name',form.study,'e.g. My methylation study','required maxlength="120"')}${input('dlRoute','Route or arm',form.route,'e.g. Treated','required maxlength="120"')}${input('dlPopulation','Population or tissue',form.population,'e.g. Fibroblast cultures','required maxlength="120"')}${select('dlModality','Assay',[['DNAm','DNA methylation (0–1)'],['RNA','RNA expression'],['ATAC','Chromatin accessibility']],form.modality)}${select('dlObservationUnit','Unit represented by unit_id',[['population_summary','Population summary'],['biological_unit','Biological unit (e.g. donor)']],form.observationUnit,'Use the same ID only for a genuinely matched unit or population across time.')}${input('dlIndependentUnits','Independent biological units',form.independentUnits,'Unknown','type="number" min="1" step="1"'+(form.observationUnit==='population_summary'?' disabled':''))}${select('dlDestructive','Destructive sampling',[['true','Yes — different sampled cells'],['false','No']],form.destructiveSampling)}${select('dlLineage','Same cells tracked',[['not_tracked','No'],['unknown','Unknown'],['tracked','Yes — documented cell tracking']],form.lineage)}</div><label class="dl-confirm"><input type="checkbox" id="dlConfirm"${confirmed?' checked':''}><span>I checked the sample and unit IDs and these design declarations. Features are not biological replicates.</span></label><p class="dl-note">Design declarations are supplied by you; the software checks consistency, not their authenticity. Independent groups cannot be silently paired across time.</p><div id="dlError">${errorHTML()}</div><div class="dl-submit"><span id="dlInputStatus" role="status">${busy?'Checking file and sample structure…':origin==='synthetic'?'Synthetic example — no biological finding.':'The original measurements are not saved after a page reload.'}</span><button type="submit" class="dl-button primary" id="dlValidate"${busy?' disabled':''}>${busy?'Checking inputs…':'Check inputs & continue'} <span aria-hidden="true">→</span></button></div></form><aside class="dl-example"><span class="dl-eyebrow">START WITH REAL MEASUREMENTS</span><h2>Lee 2014</h2><p>A public methylation dataset with 7,890 regions. Inspect the data and run the same descriptive tools.</p><dl><div><dt>Input</dt><dd>Workbook reconstruction</dd></div><div><dt>Observations</dt><dd>Population profiles over time</dd></div><div><dt>Scope</dt><dd>Observed differences only</dd></div></dl>${select('dlLeeRoute','Sampling route',Object.entries(routes),leeRoute)}${button(busy?'Loading…':'Use Lee example →','lee',busy?'disabled':'','primary')}<p class="dl-note">The example uses the full source table. It does not use the Lu or WIF1 source-note collections.</p><div class="dl-example-bottom"><strong>Just checking the format?</strong><p>Try a tiny synthetic table with one missing endpoint.</p>${button('Load synthetic example','synthetic','','text')}</div></aside></div>`;
  }
  function analysesHTML() {
    if(!prepared)return '<div class="dl-empty">Connect data to see which analyses can run.</div>';
    const s=prepared.summary,t=prepared.tensor,available=window.PherogentDataEngine.availability(prepared);
    const ready=available.filter(x=>x.status==='AVAILABLE'),blocked=available.filter(x=>x.status==='BLOCKED'),proposed=available.filter(x=>x.status==='PROPOSED');
    return `<div class="dl-analysis-grid"><div><div class="dl-card dl-dataset"><div><span class="dl-eyebrow">${origin==='synthetic'?'SYNTHETIC INPUT':'INPUT STRUCTURE CHECKED'}</span><h2>${esc(studyLabel(s.study))} <span>/ ${esc(routeLabel(s.route))}</span></h2><p>${esc(s.modality)} · ${esc(form.population || t.metadata?.population || 'Declared population')}</p></div>${button('Edit inputs','edit','','text')}<div class="dl-stat-row"><div><strong>${number(s.features)}</strong><span>features</span></div><div><strong>${number(s.units)}</strong><span>unit profiles</span></div><div><strong>${number(s.times?.length)}</strong><span>declared visits</span></div><div><strong>${number(s.missingValues ?? s.totalSlots-s.observedValues)}</strong><span>missing values</span></div></div></div><section class="dl-card"><div class="dl-card-heading"><div><span class="dl-eyebrow">AVAILABLE ANALYSES</span><h2>Choose a measured interval</h2></div><span class="dl-badge">${ready.length} tools ready</span></div><div class="dl-skill-list">${available.filter(x=>x.status!=='PROPOSED').map(skill=>`<article><span class="dl-skill-mark ${skill.status==='AVAILABLE'?'ready':'blocked'}" aria-hidden="true">${skill.status==='AVAILABLE'?'✓':'—'}</span><div><strong>${esc(skill.name)}</strong><p>${esc(skill.reason)}</p></div><span class="dl-badge">${skill.status==='AVAILABLE'?'Ready':'Needs input'}</span></article>`).join('')}</div><form id="dlRunForm" class="dl-run-form">${select('dlInterval','Interval to inspect',t.times.slice(1).map((time,i)=>[String(i),`${t.times[i]} → ${time}${t.metadata?.approximateTimes?.includes(time)?' (approximate)':''}`]),selectedInterval)}${select('dlTolerance','Difference tolerance',[['0.02','0.02'],['0.05','0.05'],['0.1','0.10']],tolerance,'In the measurement’s units. Tolerance is not a significance threshold.')}<button class="dl-button primary" type="submit" id="dlRun"${busy||blocked.length?' disabled':''}>${busy?'Calculating…':'Run descriptive analysis'} <span aria-hidden="true">→</span></button></form><div id="dlError">${errorHTML()}</div><p class="dl-note">All eligible input rows enter the calculation. No interpolation, model training or AI calls. Every consecutive interval is summarized; the selected interval gets a detailed tolerance check.</p></section></div><aside class="dl-analysis-aside"><div class="dl-card"><span class="dl-eyebrow">BEFORE YOU RUN</span><h3>What this design can support</h3><p>Descriptive changes between the matched observations you supplied.</p><dl class="dl-design-facts"><div><dt>Independent biological units</dt><dd>${s.independentUnits===null?'Unknown':number(s.independentUnits)}</dd></div><div><dt>Cell tracking</dt><dd>${t.metadata?.lineage==='tracked'?'Declared by author':'Not established'}</dd></div><div><dt>Missingness</dt><dd>Kept explicit</dd></div></dl><p class="dl-note">These tools do not establish a mechanism, causation or cellular rejuvenation.</p></div><section class="dl-proposed"><span class="dl-eyebrow">PROPOSED · NOT AVAILABLE</span>${proposed.map(skill=>`<div><strong>${esc(skill.name)}</strong><p>${esc(skill.reason)}</p></div>`).join('')}</section></aside></div>`;
  }
  function verificationHTML(run) {
    const checks=Array.isArray(run.verification?.checks)?run.verification.checks:[];
    return `<section class="dl-card"><div class="dl-card-heading"><div><span class="dl-eyebrow">VERIFICATION</span><h2>What was checked</h2></div><span class="dl-badge">Code checks</span></div><p class="dl-note">${esc(run.verification?.scope || 'Input structure and deterministic calculation only.')} This does not verify the biological interpretation.</p><ul class="dl-checks">${checks.map(check=>`<li><span class="${check.status!=='CHECKED'?'uncertain':''}" aria-hidden="true">${check.status==='CHECKED'?'✓':check.status==='INDETERMINATE'?'?':'—'}</span><div><strong>${esc(check.name)}</strong><p>${esc(check.detail)}</p></div><small>${esc(check.status)}</small></li>`).join('')}</ul>${!checks.length?'<p class="dl-note">This saved run predates the structured check record. Inspect its source and limits.</p>':''}</section>`;
  }
  function resultsHTML() {
    if(!result)return '<div class="dl-empty">Run an analysis to see its measured results and checks.</div>';
    const r=result,s=r.state||{},t=r.transition||{},intervals=r.rollup?.intervals||[],source=r.source||{},locations=Array.isArray(t.source)?t.source:[],limits=Array.isArray(r.limitations)?r.limitations:[];
    return `<div class="dl-result-head"><div><span class="dl-eyebrow">${esc(labelOrigin(r).toUpperCase())}</span><h2>${esc(studyLabel(r.study))} <span>/ ${esc(routeLabel(r.route))}</span></h2><p>${prepared?'Inputs remain available for another run.':'Saved result restored. Reconnect the original input to run again.'}</p></div><div class="dl-result-actions">${button('Export run ↓','export')}${button('Review in Outputs →','outputs','','primary')}</div></div><div class="dl-result-stats"><article><span>OBSERVED PAIRS</span><strong>${number(t.observedPairs)}</strong><small>Features × matched unit profiles</small></article><article><span>MEAN CHANGE</span><strong>${number(t.meanDelta)}</strong><small>Interval ${esc(t.from)} → ${esc(t.to)}</small></article><article><span>WITHIN TOLERANCE</span><strong>${number(t.withinTolerance)}</strong><small>Absolute change ≤ ${esc(r.epsilon)}</small></article><article><span>EXACTLY EQUAL</span><strong>${number(t.exactEqual)}</strong><small>Exact equality is counted separately</small></article></div><div class="dl-result-grid"><div><section class="dl-card"><div class="dl-card-heading"><div><span class="dl-eyebrow">INTERVAL ROLLUP</span><h2>The measured path</h2></div>${prepared?button('Adjust analysis','analyses','','text'):button('Connect another input','edit','','text')}</div><div class="dl-table-wrap" tabindex="0" role="region" aria-label="Interval calculation results"><table><thead><tr><th scope="col">Interval</th><th scope="col">Observed pairs</th><th scope="col">Missing pairs</th><th scope="col">Mean change</th></tr></thead><tbody>${intervals.map(v=>`<tr${v.from===t.from&&v.to===t.to?' class="selected"':''}><th scope="row">${esc(v.from)} → ${esc(v.to)}${v.approximateTo?' ≈':''}</th><td>${number(v.observedPairs)}</td><td>${number(v.missingPairs)}</td><td>${number(v.meanDelta)}</td></tr>`).join('')}</tbody></table></div><p class="dl-note">No paired measurements means “Not estimable,” not zero. Within tolerance is not an exact return. Feature counts are not biological replicate counts.</p></section>${verificationHTML(r)}</div><aside><section class="dl-card"><span class="dl-eyebrow">YOUR REVIEW</span><h3>Keep the result with its limits</h3><p>Open Outputs to save this run as a report. Review it, then link a saved copy to Methods or Results.</p><span class="dl-badge warm">Author review in Outputs</span><p class="dl-note">No manuscript text has changed. No message has been sent to an AI.</p></section><section class="dl-card"><span class="dl-eyebrow">DESIGN LIMITS</span><dl class="dl-design-facts"><div><dt>Assay</dt><dd>${esc(s.modality || r.modality || 'Declared in source')}</dd></div><div><dt>Independent biological units</dt><dd>${s.independentUnits==null?'Unknown':number(s.independentUnits)}</dd></div><div><dt>Missing pairs in selected interval</dt><dd>${number(t.missingPairs)}</dd></div></dl><ul class="dl-limits">${limits.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section></aside></div><details class="dl-source-record"><summary><span>Inspect the source and execution record</span><small>${esc(source.fileName || 'Source locators retained')}</small></summary><dl class="dl-design-facts"><div><dt>Source file</dt><dd>${esc(source.fileName || 'See source locators below')}</dd></div><div><dt>SHA-256</dt><dd class="dl-hash">${esc(source.sha256 || 'Not recorded for this built-in dataset')}</dd></div><div><dt>Origin</dt><dd>${esc(source.origin || r.origin || 'Declared source')}</dd></div><div><dt>Recorded</dt><dd>${esc(r.createdAt || r.recordedAt || 'Not recorded')}</dd></div></dl><p class="dl-note">A file hash identifies the input bytes; it does not authenticate the study. Row bounds may span missing values. Only observed endpoint pairs entered the calculation.</p>${t.omittedSourceGroups?`<p class="dl-note">Showing ${locations.length} of ${number(t.sourceGroupCount)} source groups. ${number(t.omittedSourceGroups)} additional groups were omitted from this compact record; all eligible values were used.</p>`:''}<div class="dl-table-wrap"><table><thead><tr><th scope="col">File / sheet</th><th scope="col">Sample</th><th scope="col">Rows</th><th scope="col">Column</th><th scope="col">Eligible values</th></tr></thead><tbody>${locations.map(loc=>`<tr><td>${esc(loc.file)}${loc.sheet?' / '+esc(loc.sheet):''}</td><td>${esc(loc.sampleId)}</td><td>${esc(loc.rowStart ?? '')}${loc.rowEnd&&loc.rowEnd!==loc.rowStart?'–'+esc(loc.rowEnd):''}</td><td>${esc(loc.column || '')}</td><td>${number(loc.featureCount)}</td></tr>`).join('')}</tbody></table></div><pre>${esc(JSON.stringify({verification:r.verification,source:r.source,trace:r.trace,usage:r.usage},null,2))}</pre></details>`;
  }
  function metadata() {return {...form,independentUnits:form.independentUnits===''?null:Number(form.independentUnits),destructiveSampling:form.destructiveSampling==='true',featuresAreReplicates:false};}
  async function digest(value) {
    if(!window.crypto?.subtle)throw Error('This browser cannot create a source hash. Use a current browser over HTTPS.');
    const hash=await window.crypto.subtle.digest('SHA-256',value);return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  }
  function setError(value) {error=String(value?.message || value || 'The operation could not complete.');const el=$('dlError');if(el)el.innerHTML=errorHTML();bridge?.toast?.(error);}
  async function validate() {
    if(busy)return;
    if(!confirmed){setError('Confirm the sample and unit mapping before continuing.');return;}
    if(!text.trim()){setError('Choose a CSV/TSV file or paste a measurement table.');return;}
    const inputBytes=bytes || new TextEncoder().encode(text),name=fileName || 'pasted-measurements.csv',id=projectId,version=++generation;
    if(inputBytes.byteLength>2097152){setError('This local workspace accepts files up to 2 MB.');return;}
    busy=true;error='';const submit=$('dlValidate');if(submit){submit.disabled=true;submit.textContent='Checking inputs…';}
    try {const sha256=await digest(inputBytes);if(!validAsync(id,version))return;prepared=window.PherogentDataEngine.prepare(text,metadata(),{fileName:name,sha256,origin});selectedInterval=String(Math.max(0,prepared.tensor.times.length-2));result=null;phase='analyses';}
    catch(e){if(validAsync(id,version))setError(e);}
    finally{if(validAsync(id,version)){busy=false;update();}}
  }
  async function acceptFile(file) {
    if(!file)return;
    resetDerived('Reading the selected file…');confirmed=false;text='';bytes=null;fileName='';origin='user_upload';
    if(file.size>2097152){setError('This local workspace accepts files up to 2 MB.');update();return;}
    if(!/\.(csv|tsv)$/i.test(file.name)){setError('Choose a .csv or .tsv measurement table. PDF and Excel files need conversion first.');update();return;}
    const id=projectId,version=generation;busy=true;
    try {const buffer=await file.arrayBuffer();if(!validAsync(id,version))return;const decoded=new TextDecoder('utf-8',{fatal:true}).decode(buffer);if(buffer.byteLength>2097152)throw Error('This local workspace accepts files up to 2 MB.');bytes=new Uint8Array(buffer);text=decoded;fileName=file.name;origin=knownSynthetic(decoded)?'synthetic':'user_upload';error='';}
    catch(e){if(validAsync(id,version)){bytes=null;text='';fileName='';setError(e);}}
    finally{if(validAsync(id,version)){busy=false;update();}}
  }
  async function useLee() {
    if(busy)return;
    resetDerived();const id=projectId,version=generation;busy=true;error='';update();
    try {const response=await fetch('/data/lee2014/data.json',{credentials:'same-origin'});if(!response.ok)throw Error('The public Lee example could not be loaded.');const data=await response.json();if(!validAsync(id,version))return;prepared=window.PherogentDataEngine.prepareLee(data,{route:leeRoute});origin='public_dataset';result=null;form={...fresh(),study:'Lee 2014',route:leeRoute,population:'Population profiles'};text='';bytes=null;fileName='';confirmed=false;selectedInterval=String(Math.max(0,prepared.tensor.times.length-2));phase='analyses';}
    catch(e){if(validAsync(id,version))setError(e);}
    finally{if(validAsync(id,version)){busy=false;update();}}
  }
  function calculate() {
    if(busy||!prepared)return;
    const id=projectId,version=generation,index=Number(selectedInterval),times=prepared.tensor.times;
    if(!Number.isInteger(index)||index<0||index>=times.length-1){setError('Select a valid consecutive interval.');return;}
    busy=true;error='';
    try {const run=window.PherogentDataEngine.calculate(prepared,{epsilon:tolerance,from:times[index],to:times[index+1]});if(!validAsync(id,version))return;result={...run,id:'data-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),workflow:'data-analysis',projectId:id,createdAt:new Date().toISOString()};
      if(JSON.stringify(result).length>60000)throw Error('The source record is too large to save safely. Use fewer units or visits. No result was saved.');
      document.dispatchEvent(new CustomEvent('pherogent:study-workflow',{detail:{kind:'calculation',summary:`${labelOrigin(result)}: ${result.study}, ${result.route}. Descriptive calculation and input checks; 0 AI calls.`,run:result,projectId:id}}));phase='results';
    }catch(e){result=null;setError(e);}finally{busy=false;update();}
  }
  function loadSynthetic() {resetDerived();text=template;bytes=null;fileName='synthetic-format-example.csv';origin='synthetic';form={...fresh(),study:'Synthetic format example',route:'Example route',population:'Synthetic population'};confirmed=false;phase='connect';update();}
  const fields={dlStudy:'study',dlRoute:'route',dlPopulation:'population',dlModality:'modality',dlObservationUnit:'observationUnit',dlIndependentUnits:'independentUnits',dlDestructive:'destructiveSampling',dlLineage:'lineage'};
  document.addEventListener('input',event=>{
    if(!$('dataAnalysis'))return;const target=event.target;
    if(fields[target.id]){form[fields[target.id]]=target.value;resetDerived();confirmed=false;const confirm=$('dlConfirm');if(confirm)confirm.checked=false;if(target.id==='dlObservationUnit'){form.independentUnits='';const count=$('dlIndependentUnits');if(count){count.value='';count.disabled=target.value==='population_summary';}}}
    if(target.id==='dlPaste'){text=target.value;bytes=null;fileName='pasted-measurements.csv';origin=origin==='synthetic'||knownSynthetic(text)?'synthetic':'user_upload';confirmed=false;resetDerived();const confirm=$('dlConfirm');if(confirm)confirm.checked=false;const name=$('dlFileLabel');if(name)name.textContent='Pasted measurement table';const info=$('dlFileDetail');if(info)info.textContent='Held locally · no file uploaded';}
  });
  document.addEventListener('change',event=>{
    if(!$('dataAnalysis'))return;const t=event.target;
    if(t.id==='dlFile')return acceptFile(t.files?.[0]);
    if(t.id==='dlConfirm')confirmed=!!t.checked;
    if(t.id==='dlLeeRoute')leeRoute=t.value;
    if(t.id==='dlInterval'){selectedInterval=t.value;result=null;error='';updateTabs();}
    if(t.id==='dlTolerance'){tolerance=Number(t.value);result=null;error='';updateTabs();}
  });
  document.addEventListener('submit',event=>{if(event.target.id==='dlConnectForm'){event.preventDefault();return validate();}if(event.target.id==='dlRunForm'){event.preventDefault();return calculate();}});
  document.addEventListener('click',event=>{
    const tab=event.target.closest?.('[data-dl-phase]');if(tab&&$('dataAnalysis')){const value=tab.dataset.dlPhase;if(['connect','analyses','results'].includes(value)&&!(value==='analyses'&&!prepared||value==='results'&&!result)){phase=value;update();$('dlTab-'+phase)?.focus?.();}return;}
    const target=event.target.closest?.('[data-dl-action]');if(!target||!$('dataAnalysis'))return;const action=target.dataset.dlAction;
    if(action==='file')return $('dlFile')?.click?.();
    if(action==='lee')return useLee();
    if(action==='synthetic')return loadSynthetic();
    if(action==='template')return bridge?.download?.('pherogent-synthetic-format-template.csv',template,'text/csv');
    if(action==='edit'){phase='connect';error='';update();}
    if(action==='analyses'&&prepared){phase='analyses';update();}
    if(action==='outputs'&&result)bridge?.navigate?.('outputs');
    if(action==='export'&&result)bridge?.download?.('pherogent-data-analysis-'+result.id+'.json',JSON.stringify(result,null,2)+'\n','application/json');
  });
  document.addEventListener('keydown',event=>{const tab=event.target.closest?.('[data-dl-phase]');if(!tab||!$('dataAnalysis')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const phases=['connect',...(prepared?['analyses']:[]),...(result?['results']:[])],at=phases.indexOf(phase);event.preventDefault();phase=event.key==='Home'?phases[0]:event.key==='End'?phases.at(-1):phases[(at+(event.key==='ArrowRight'?1:-1)+phases.length)%phases.length];update();$('dlTab-'+phase)?.focus?.();});
  for(const type of ['dragover','dragleave','drop'])document.addEventListener(type,event=>{const zone=event.target.closest?.('#dlDropzone');if(!zone||!$('dataAnalysis'))return;event.preventDefault();zone.classList?.toggle('dragging',type==='dragover');if(type==='drop')return acceptFile(event.dataTransfer?.files?.[0]);});
  window.PherogentDataLab={init:adapter=>{bridge=adapter;},render,afterRender:()=>{},onProjectChange:id=>{if(id!==projectId){generation++;projectId=null;phase='connect';lastPaintedPhase=null;form=fresh();text='';fileName='';bytes=null;origin='user_upload';confirmed=false;prepared=null;result=null;error='';busy=false;selectedInterval='';}},template};
})();
