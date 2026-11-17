'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const count = value => Number(value || 0).toLocaleString('en-US');
  const number = value => Number.isFinite(value) ? value.toFixed(6) : 'Not available';
  const safeUrl = value => {try {const url = new URL(value);return url.protocol === 'https:' ? url.href : '';} catch {return '';}};
  const studies = {
    rag1_lu2020:{name:'Lu 2020',tag:'RAG 1',detail:'OSK · retinal ganglion cells',note:'6 supplied source summaries · mouse and human records distinguished',question:'What does the Lu study measure, and does it track the same cells over time?',presets:['What does the Lu study measure, and does it track the same cells over time?','Where are the mouse methylation and RNA sequencing data deposited?','Does TET involvement establish a stored-state retrieval mechanism?']},
    rag2_gse293381:{name:'GSE293381',tag:'RAG 2',detail:'WIF1 · retinal multiome',note:'7 supplied source summaries · RNA and ATAC distinguished',question:'Are the control, 2-week and 4-week groups the same cells followed over time?',presets:['Are the control, 2-week and 4-week groups the same cells followed over time?','Does the ATAC assay measure DNA methylation?','Are spatial coordinates available for a neighbor analysis?']}
  };
  const routes = {continued_low:'Continued low',low_withdrawal:'Low withdrawal',continued_high:'Continued high',high_withdrawal:'High withdrawal'};
  let projectId = '', restoredProject = null;
  let study = 'rag1_lu2020', question = studies[study].question, retrieval = null, retrievalError = '', active = null;
  let calculationGeneration = 0;
  let leeData = null, calculation = null, calculationError = '', calculationBusy = false, selectedRoute = 'continued_low', epsilon = .05;

  function sourceCards() {
    return Object.entries(studies).map(([id,info]) => `<button type="button" class="sw-collection${study === id ? ' selected' : ''}" data-sw-study="${id}" aria-pressed="${study === id}"><span class="sw-collection-top"><span class="sw-tag">${info.tag}</span><span class="sw-selected-mark" aria-hidden="true">${study === id ? '✓' : '+'}</span></span><strong>${info.name}</strong><span>${info.detail}</span><small>${info.note}</small></button>`).join('');
  }
  function presets() {
    return studies[study].presets.map((text,i) => `<button type="button" data-sw-preset="${i}">${esc(i === 0 ? 'Study design' : i === 1 ? (study === 'rag1_lu2020' ? 'Find the data' : 'Assay limits') : (study === 'rag1_lu2020' ? 'Mechanism limits' : 'Spatial evidence'))}</button>`).join('');
  }
  function render(context = {}) {
    const nextProjectId = typeof context.project?.id === 'string' ? context.project.id : projectId;
    if(projectId && nextProjectId !== projectId){
      active?.abort();active = null;retrieval = null;retrievalError = '';question = studies[study].question;
      calculationGeneration++;calculationBusy = false;calculation = null;calculationError = '';
    }
    projectId = nextProjectId;
    if (restoredProject !== projectId) {
      const saved = Array.isArray(context.research?.studyRuns) ? context.research.studyRuns : [];
      retrieval = saved.find(run => run.kind === 'retrieval' && studies[run.study] && Array.isArray(run.evidence) && (!run.projectId || run.projectId === projectId)) || null;
      calculation = saved.find(run => run.kind === 'calculation' && run.study === 'lee2014' && run.state && run.rollup && run.transition && (!run.projectId || run.projectId === projectId)) || null;
      if (retrieval) {study = retrieval.study;question = retrieval.question;}
      if (calculation) {selectedRoute = calculation.route;epsilon = calculation.epsilon;}
      restoredProject = projectId;
    }
    return `<div class="sw-page" id="studyWorkflows"><header class="sw-heading"><div><span class="sw-eyebrow">STUDY WORKFLOWS</span><h1>Evidence in. Traceable work out.</h1><p>Choose a study to inspect source notes, calculation inputs, and their limits.</p></div><span class="sw-mode"><i aria-hidden="true"></i><span><strong>Tools are connected</strong><small>Deterministic workflow · no model calls</small></span></span></header>
      <div class="sw-layout"><section class="sw-panel sw-source-panel" aria-labelledby="swSourceHeading"><div class="sw-section-heading"><span class="sw-step-number">01</span><div><span class="sw-eyebrow">SOURCE COLLECTIONS</span><h2 id="swSourceHeading">Start with one study.</h2></div></div><div class="sw-collections" id="swCollections">${sourceCards()}</div><p class="sw-source-note">These are separate vector indexes of the supplied summaries. They are not full papers or raw datasets. A search match is not a verified quotation.</p>
      <form id="swQuestionForm"><label for="swQuestion">Ask about this study</label><textarea id="swQuestion" name="question" rows="3" maxlength="2000" required placeholder="Ask about the design, measurements, or available data…">${esc(question)}</textarea><div class="sw-presets" id="swPresets">${presets()}</div><div class="sw-form-bottom"><span>Your question goes to this site’s server.<br>No AI provider receives it.</span><button class="sw-primary" type="submit" id="swRun"${active ? ' disabled' : ''}>${active ? 'Running workflow…' : 'Run study workflow'}<span aria-hidden="true">↗</span></button></div></form></section>
      <aside class="sw-panel sw-flow-panel" aria-labelledby="swFlowHeading"><span class="sw-eyebrow">CONNECTED WORKFLOW</span><h2 id="swFlowHeading">A visible chain of work.</h2><ol class="sw-pipeline"><li><span>1</span><div><strong>Select</strong><small>Lock the study collection</small></div></li><li><span>2</span><div><strong>Retrieve</strong><small>Rank relevant source notes</small></div></li><li><span>3</span><div><strong>Check inputs</strong><small>Are numerical data available?</small></div></li><li><span>4</span><div><strong>Report</strong><small>Return sources and limitations</small></div></li></ol><p>The workflow stops short of numerical analysis when the required source matrix is missing.</p><div class="sw-legend"><span><i></i>Code runs the workflow</span><span><i></i>You review the result</span></div></aside></div>
      <div id="swRetrievalResult" aria-live="polite">${retrievalHTML()}</div>
      <section class="sw-panel sw-calculation-panel" aria-labelledby="swCalculationHeading"><div class="sw-calculation-heading"><div class="sw-section-heading"><span class="sw-step-number">02</span><div><span class="sw-eyebrow">THREE CALCULATION SKILLS</span><h2 id="swCalculationHeading">Try a real dataset.</h2><p>Lee 2014 is already loaded into the platform. Run all three skills on its public methylation measurements.</p></div></div><span class="sw-chip">Separate Lee dataset</span></div><div class="sw-skill-line"><div><span>01</span><strong>EpiState-T</strong><small>Arrange states + observation mask</small></div><div><span>02</span><strong>Rollup Sequencer</strong><small>Summarize adjacent observed visits</small></div><div><span>03</span><strong>EpiState transition</strong><small>Describe the final observed change</small></div></div>
      <form id="swCalculationForm" class="sw-calculation-controls"><label for="swRoute">Sampling route<select id="swRoute">${Object.entries(routes).map(([value,label]) => `<option value="${value}"${selectedRoute === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label for="swEpsilon">Tolerance<select id="swEpsilon">${[.02,.05,.1].map(value => `<option value="${value}"${epsilon === value ? ' selected' : ''}>ε = ${value} · ${value * 100} percentage points</option>`).join('')}</select></label><button type="submit" class="sw-primary" id="swCalculate"${calculationBusy ? ' disabled' : ''}>${calculationBusy ? 'Calculating…' : 'Run three skills'}<span aria-hidden="true">↗</span></button></form>
      <div id="swCalculationResult" aria-live="polite">${calculationHTML()}</div><p class="sw-source-note sw-calculation-note">These are descriptive JavaScript implementations of the three skills. All 7,890 regions are used, never just retrieved rows. These are population measurements, not the same cells followed over time. The transition skill describes observed differences; it does not predict a mechanism. Lu and WIF1 matrices are not included in these calculations.</p></section>
      <footer class="sw-footer"><span>Source notes → validated tools → inspectable results</span><span>Manuscript edits always remain yours.</span></footer></div>`;
  }
  function retrievalHTML() {
    if (active) return '<section class="sw-panel sw-running" role="status"><span class="sw-running-dot" aria-hidden="true"></span><div><strong>Running the selected study workflow…</strong><p>Retrieving source notes and checking available inputs. No AI call is being made.</p></div><button type="button" class="sw-secondary" data-sw-action="cancel">Stop</button></section>';
    if (retrievalError) return `<div class="sw-error" role="alert"><strong>The workflow did not complete.</strong><p>${esc(retrievalError)}</p></div>`;
    if (!retrieval) return '<div class="sw-ready"><span aria-hidden="true">↗</span><p>Your source notes and workflow record will appear here.</p></div>';
    const evidence = Array.isArray(retrieval.evidence) ? retrieval.evidence : [], trace = Array.isArray(retrieval.trace) ? retrieval.trace : [];
    return `<section class="sw-panel sw-output" aria-labelledby="swResultHeading"><div class="sw-output-heading"><div><span class="sw-eyebrow">WORKFLOW RECORD · ${esc(studies[retrieval.study]?.name || retrieval.study)}</span><h2 id="swResultHeading">${evidence.length ? 'Sources found. Limits kept visible.' : 'No matching source notes found.'}</h2><p>${esc(retrieval.question)}</p></div><button type="button" class="sw-secondary" data-sw-action="export-retrieval">Export run ↓</button></div><div class="sw-output-summary"><span class="sw-chip">${count(evidence.length)} source notes</span><span class="sw-chip">0 AI calls · 0 tokens</span><span class="sw-chip sw-chip-warm">Numerical analysis not run</span></div>${skippedSkillsHTML(retrieval)}<div class="sw-output-actions"><button type="button" class="sw-secondary" data-action="view" data-arg="outputs">Save a report in Outputs ↗</button><span>This run is saved in this project. Review it before linking to your paper.</span></div>${retrieval.summary ? `<p class="sw-summary">${esc(retrieval.summary)}</p>` : ''}${evidence.length ? '<div class="sw-chat-handoff"><button type="button" class="sw-secondary" data-sw-action="chat">Use sources in References chat ↗</button><span>Review context and consent before sending. Existing shared spending limits apply.</span></div>' : ''}<div class="sw-evidence-grid">${evidence.map((item,i) => evidenceCard(item,i)).join('')}</div>${!evidence.length ? '<p class="sw-source-note">Try more specific terms from the selected study. An empty search does not prove that evidence does not exist elsewhere.</p>' : ''}<details class="sw-trace" open><summary>What actually ran <span>${count(trace.length)} recorded steps</span></summary><ol>${trace.map(item => `<li><span class="sw-trace-marker" aria-hidden="true"></span><div><strong>${esc(item.step || item.stage || 'Workflow step')}</strong><p>${esc(item.detail)}</p></div><small>${esc(({completed:'Completed',blocked:'Skipped — missing input',no_matches:'No matches',not_applicable:'Not applicable'})[item.status] || item.status || 'Recorded')}</small></li>`).join('')}</ol></details>${Array.isArray(retrieval.limitations) && retrieval.limitations.length ? `<div class="sw-limits"><strong>What this result cannot establish</strong><ul>${retrieval.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}</section>`;
  }
  function evidenceCard(item,index) {
    const url = safeUrl(item.sourceUrl), locator = typeof item.locator === 'string' ? item.locator : JSON.stringify(item.locator || {});
    return `<article class="sw-evidence"><div class="sw-evidence-top"><span class="sw-evidence-index">${String(index + 1).padStart(2,'0')}</span><span>Supplied summary · not an exact quote</span></div><p>${esc(item.text)}</p><div class="sw-evidence-bottom"><span>${esc(String(item.recordKind || 'Source note').replaceAll('_',' '))}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : '<span>Source link unavailable</span>'}</div><details class="sw-locator"><summary>Source locator</summary><code>${esc(locator)}</code><small>Lexical similarity: ${Number.isFinite(item.score) ? item.score.toFixed(3) : 'not reported'}. This is a search score, not confidence in scientific support.</small></details></article>`;
  }
  function skippedSkillsHTML(run) {
    const rows = Array.isArray(run.skills) ? run.skills.filter(skill => skill.status === 'NOT_RUN') : [];
    return `<section class="sw-skipped-skills" aria-label="Numerical steps not run"><strong>Skipped — no numerical input</strong><p>Source retrieval completed; a validated study matrix is required for calculation.</p>${rows.length ? `<ul>${rows.map(skill => `<li><strong>${esc(skill.name)}</strong><span>${esc(skill.reason || 'Required numerical input is missing.')}</span></li>`).join('')}</ul>` : ''}</section>`;
  }
  function calculationHTML() {
    if (calculationBusy) return '<div class="sw-calculation-empty" role="status">Loading the public workbook reconstruction and calculating all eligible rows…</div>';
    if (calculationError) return `<div class="sw-error" role="alert"><strong>Calculation stopped.</strong><p>${esc(calculationError)}</p></div>`;
    if (!calculation) return '<div class="sw-calculation-empty">Choose a route to inspect the state, interval summaries, and final transition. Computation runs in your browser.</div>';
    const {state,rollup,transition} = calculation, intervals = rollup.intervals || [];
    return `<div class="sw-calculation-output"><div class="sw-calc-result-heading"><div><strong>${esc(routes[calculation.route] || calculation.route)}</strong><span>Lee 2014 · ε = ${esc(calculation.epsilon)} · 0 AI calls</span></div><button type="button" class="sw-secondary" data-sw-action="export-calculation">Export calculation ↓</button></div><div class="sw-output-actions"><button type="button" class="sw-secondary" data-action="view" data-arg="outputs">Save a report in Outputs ↗</button><span>Keep the calculation and its source record together.</span></div><div class="sw-skill-results"><article><span class="sw-tag">EPISTATE-T · RAN</span><strong>${count(state.features)}</strong><p>regions across ${count(state.times.length)} observed visits</p><small>${count(state.observedValues)} observed values / ${count(state.totalSlots)} slots</small></article><article><span class="sw-tag">ROLLUP SEQUENCER · RAN</span><strong>${count(intervals.length)}</strong><p>adjacent observed intervals</p><small>Every summary retains its source profiles.</small></article><article><span class="sw-tag">TRANSITION · RAN</span><strong>${count(transition.withinTolerance)}</strong><p>of ${count(transition.observedPairs)} regions changed by at most ε</p><small>Final interval: day ${esc(transition.from)} → ${esc(transition.to)}${state.approximateTimes?.includes(transition.to) ? ' (approximate)' : ''}</small></article></div><div class="sw-interval-scroll" tabindex="0" role="region" aria-label="Computed interval summaries"><table class="sw-intervals"><caption>Mean changes across all eligible regions. These are descriptive summaries, not replicate-based tests.</caption><thead><tr><th scope="col">Interval (day)</th><th scope="col">Observed pairs</th><th scope="col">Mean change</th><th scope="col">Mean absolute change</th><th scope="col">Missing pairs</th></tr></thead><tbody>${intervals.map(item => `<tr><th scope="row">${esc(item.from)} → ${esc(item.to)}${state.approximateTimes?.includes(item.to) ? ' ≈' : ''}</th><td>${count(item.observedPairs)}</td><td>${number(item.meanDelta)}</td><td>${number(item.meanAbsoluteDelta)}</td><td>${count(item.missingPairs)}</td></tr>`).join('')}</tbody></table></div><div class="sw-transition-note"><strong>Within tolerance does not mean exact equality.</strong><span>In the final interval, ${count(transition.exactEqual)} regions are exactly equal, ${count(transition.increased)} increased beyond tolerance, and ${count(transition.decreased)} decreased beyond tolerance. Independent biological replicate count: unknown.</span></div><details class="sw-calculation-sources"><summary>Inspect source and calculation record</summary><pre>${esc(JSON.stringify({state,transition},null,2))}</pre></details></div>`;
  }
  function updateRetrieval() {const target = $('swRetrievalResult');if (target) target.innerHTML = retrievalHTML();const button = $('swRun');if(button){button.disabled = !!active;button.innerHTML = active ? 'Running workflow…' : 'Run study workflow <span aria-hidden="true">↗</span>';}}
  function updateCalculation() {const target = $('swCalculationResult');if (target) target.innerHTML = calculationHTML();const button = $('swCalculate');if(button){button.disabled = calculationBusy;button.innerHTML = calculationBusy ? 'Calculating…' : 'Run three skills <span aria-hidden="true">↗</span>';}}
  function record(kind,summary,run,runProjectId) {document.dispatchEvent(new CustomEvent('pherogent:study-workflow',{detail:{kind,summary,run,projectId:runProjectId}}));}
  async function runRetrieval() {
    if(active)return;
    question = ($('swQuestion')?.value || question).trim();
    if(!question || question.length > 2000){retrievalError = 'Enter a question of 1–2,000 characters.';updateRetrieval();return;}
    const requestedStudy = study, requestedQuestion = question, runProjectId = projectId, controller = new AbortController();
    active = controller;retrieval = null;retrievalError = '';updateRetrieval();const target = $('swRetrievalResult');
    try {
      const response = await fetch('/api/studies/run',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({study:requestedStudy,question:requestedQuestion}),signal:controller.signal});
      const value = await response.json();
      if(!response.ok)throw Error(value?.error?.message || 'The source workflow could not run. Please try again.');
      if(!value || value.study !== requestedStudy || !Array.isArray(value.evidence) || !Array.isArray(value.trace))throw Error('The workflow returned an incomplete record. No result was saved.');
      if(controller.signal.aborted || active !== controller || projectId !== runProjectId)return;
      retrieval = {...value,question:requestedQuestion,projectId:runProjectId};
      record('retrieval',`Retrieved ${value.evidence.length} supplied source notes from ${studies[requestedStudy].name}. No AI or numerical analysis ran.`,retrieval,runProjectId);
    } catch(error) {if(active === controller && projectId === runProjectId)retrievalError = controller.signal.aborted ? 'Stopped by you. No AI call was made.' : error?.message || 'The study workflow could not be reached.';}
    finally {if(active === controller)active = null;if($('swRetrievalResult') === target)updateRetrieval();}
  }
  async function runCalculation() {
    if(calculationBusy)return;
    selectedRoute = $('swRoute')?.value || selectedRoute;epsilon = Number($('swEpsilon')?.value || epsilon);
    const route = selectedRoute, tolerance = epsilon, runProjectId = projectId, generation = ++calculationGeneration, target = $('swCalculationResult');
    calculationBusy = true;calculation = null;calculationError = '';updateCalculation();
    try {
      if(!leeData){const response = await fetch('/data/lee2014/data.json',{credentials:'same-origin'});if(!response.ok)throw Error('The Lee public dataset could not be downloaded.');const data = await response.json();window.PherogentLeeAnalysis.validateData(data);leeData = data;}
      if(generation !== calculationGeneration || projectId !== runProjectId)return;
      const skills = window.PherogentResearchSkills;
      if(!skills)throw Error('The calculation tools are unavailable. Reload the page.');
      const tensor = skills.fromLeeData(leeData,{route}), rollup = skills.intervalRollup(tensor), transition = skills.epistateTransition(tensor,{epsilon:tolerance});
      const state = {study:tensor.study,route:tensor.route,modality:tensor.modality,features:tensor.features.length,times:tensor.times,observedValues:tensor.observedValues,totalSlots:tensor.totalSlots,observationUnit:tensor.metadata?.observationUnit,independentUnits:tensor.metadata?.independentUnits ?? null,approximateTimes:tensor.metadata?.approximateTimes || [],source:transition.source};
      calculation = {schemaVersion:1,kind:'descriptive_calculation',projectId:runProjectId,study:'lee2014',route,epsilon:tolerance,createdAt:new Date().toISOString(),state,rollup,transition,usage:{modelCalls:0,totalTokens:0},limitations:['Population-level measurements; not a same-cell trajectory.','Region counts are not independent biological replicate counts.','Within tolerance is not an exact return.','The source is the public Lee workbook reconstruction, not the unavailable original analysis archive.']};
      record('calculation',`Ran three descriptive skills on all ${count(tensor.features.length)} Lee regions (${routes[route]}). No AI ran.`,calculation,runProjectId);
    } catch(error){if(generation === calculationGeneration && projectId === runProjectId)calculationError = error?.message || 'The source data did not pass validation.';}
    finally {if(generation === calculationGeneration){calculationBusy = false;if($('swCalculationResult') === target)updateCalculation();}}
  }
  function exportRun(value,name) {
    if(!value)return;
    const blob = new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}), href = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = href;anchor.download = name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(() => URL.revokeObjectURL(href),1000);
  }
  function afterRender() {if($('studyWorkflows')){updateRetrieval();updateCalculation();}}
  document.addEventListener('input',event => {if(event.target.id === 'swQuestion')question = event.target.value;});
  document.addEventListener('change',event => {if(event.target.id === 'swRoute')selectedRoute = event.target.value;if(event.target.id === 'swEpsilon')epsilon = Number(event.target.value);});
  document.addEventListener('submit',event => {if(event.target.id === 'swQuestionForm'){event.preventDefault();return runRetrieval();}if(event.target.id === 'swCalculationForm'){event.preventDefault();return runCalculation();}});
  document.addEventListener('click',event => {
    const collection = event.target.closest?.('[data-sw-study]');
    if(collection && $('studyWorkflows') && studies[collection.dataset.swStudy]){
      if(active)return;
      study = collection.dataset.swStudy;question = studies[study].question;retrieval = null;retrievalError = '';
      $('swCollections').innerHTML = sourceCards();$('swPresets').innerHTML = presets();$('swQuestion').value = question;updateRetrieval();
      document.querySelector?.(`[data-sw-study="${study}"]`)?.focus();return;
    }
    const preset = event.target.closest?.('[data-sw-preset]');
    if(preset && $('studyWorkflows')){const text = studies[study].presets[Number(preset.dataset.swPreset)];if(text){question = text;$('swQuestion').value = text;$('swQuestion').focus();}return;}
    const action = event.target.closest?.('[data-sw-action]')?.dataset.swAction;
    if(action === 'cancel')active?.abort();
    if(action === 'chat' && retrieval?.evidence?.length)document.dispatchEvent(new CustomEvent('pherogent:study-chat',{detail:{run:retrieval,projectId:retrieval.projectId}}));
    if(action === 'export-retrieval')exportRun(retrieval,'pherogent-study-workflow.json');
    if(action === 'export-calculation')exportRun(calculation,'pherogent-lee-skills.json');
  });
  window.PherogentStudyWorkflows = {render,afterRender};
})();
