'use strict';
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = id => document.getElementById(id);
  const labels = {continued_high:'Continued high',continued_low:'Continued low',low_withdrawal:'Low withdrawal',high_withdrawal:'High withdrawal'};
  const schedules = [['common','Matched visits · days 2, 5, 8'],['day8','One visit · day 8'],['all_available','All available visits']];
  const count = n => Number(n).toLocaleString('en-US');
  const url = value => {try {const u = new URL(value); return u.protocol === 'https:' ? esc(u.href) : '';} catch {return '';}};
  let data = null, pending = null, error = '', epsilon = .05, schedule = 'common', selectedRegion = 'DMR_81';
  const engine = () => window.PherogentLeeAnalysis;

  function header() {
    return `<header class="lee-heading"><div><span class="lee-kicker">STUDY EXPLORER <span>PUBLIC DATA / 01</span></span><h1>Lee 2014.<br>Follow the data.</h1><p>Explore the methylation time course, from sampling routes to the original workbook cells.</p></div><div class="lee-mode"><span class="lee-mode-dot" aria-hidden="true"></span><div><strong>Local calculations</strong><small>0 AI calls · 0 tokens</small></div></div></header>`;
  }
  function loading() {
    return `<div class="lee-loading" role="status">${error ? `<strong>Study data could not be opened.</strong><p>${esc(error)}</p><button type="button" class="btn small" data-lee-action="retry">Try again</button>` : '<span class="lee-loading-dot" aria-hidden="true"></span><strong>Opening the public study data…</strong><p>Loading all 7,890 regions. Nothing is sent to an AI model.</p>'}</div>`;
  }
  function render() {
    return `<div class="lee-page" id="leeStudy">${header()}<div id="leeStudyBody">${data ? body() : loading()}</div></div>`;
  }
  async function load() {
    if (data) return data;
    if (!pending) pending = (async () => {
      const response = await fetch('/data/lee2014/data.json', {credentials:'same-origin'});
      if (!response.ok) throw Error('The public dataset download failed. Your project is unchanged.');
      const next = await response.json();
      if (!engine()) throw Error('The local calculation module is unavailable. Reload this page.');
      engine().validateData(next);
      if (!next.metadata || !url(next.metadata.paperUrl) || !url(next.metadata.workbookUrl)) throw Error('The dataset source links are incomplete. No study result has been opened.');
      data = next; error = ''; return data;
    })().finally(() => {pending = null;});
    return pending;
  }
  async function afterRender() {
    const target = $('leeStudyBody');
    if (!target || data) return;
    try {await load();} catch (e) {error = e?.message || 'The dataset could not be read.';}
    // A completed download must never replace a view the author has moved to.
    if ($('leeStudyBody') === target) target.innerHTML = data ? body() : loading();
  }
  function body() {
    return `<div class="lee-source-strip"><div><strong>Lee et al. · Nature Communications · 2014</strong><span>Public source data · Numerical reconstruction</span></div><a href="${url(data.metadata.paperUrl)}" target="_blank" rel="noopener noreferrer">Read the paper ↗</a></div>
      <div class="lee-metrics"><div><strong>7,890</strong><span>Measured regions</span></div><div><strong>4</strong><span>Sampling routes</span></div><div><strong>26 <small>/ 36</small></strong><span>Observed route-day slots</span></div><div><strong>Unknown</strong><span>Independent replicate count</span></div></div>
      <section class="lee-panel" aria-labelledby="leeCompareTitle"><div class="lee-section-head"><div><span class="lee-kicker">EXPLORE THE RESULT</span><h2 id="leeCompareTitle">How does the sampling schedule change the count?</h2><p>A region counts when it leaves the baseline tolerance at a selected visit and ends within that tolerance at day 21.</p></div><span class="lee-chip">All 7,890 rows</span></div>
      <div class="lee-controls"><label for="leeSchedule">Intermediate visits<select id="leeSchedule">${schedules.map(([value,label]) => `<option value="${value}"${schedule === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label for="leeEpsilon">Tolerance around baseline<select id="leeEpsilon">${[.02,.05,.1].map(value => `<option value="${value}"${epsilon === value ? ' selected' : ''}>${value * 100} percentage points (ε = ${value})</option>`).join('')}</select></label></div>
      <div id="leeResults" aria-live="polite" aria-atomic="true">${results()}</div>
      <p class="lee-footnote">These are descriptive bulk measurements. “Within tolerance” does not mean an exact return, recovery in the same cells, or a demonstrated mechanism.</p></section>
      <section class="lee-panel" aria-labelledby="leeRoutesTitle"><div class="lee-section-head"><div><span class="lee-kicker">UNDERSTAND THE DESIGN</span><h2 id="leeRoutesTitle">Four routes. Shared starting measurements.</h2><p>Repeated sample IDs are the same source profile, not extra independent replicates.</p></div><span class="lee-chip">10 missing slots</span></div>${routes()}<div class="lee-route-note"><strong>Why the gap matters</strong><span>D16L belongs only to continued low. There is no day-16 measurement on the low-withdrawal route. The ~30 endpoint is approximate; days 14 and 19 are interventions, not sampled visits.</span></div></section>
      <section class="lee-panel" aria-labelledby="leeTraceTitle"><div class="lee-section-head"><div><span class="lee-kicker">TRACE A NUMBER</span><h2 id="leeTraceTitle">From a result to its source cell.</h2><p>Inspect any region in the workbook. Values below retain the source precision.</p></div><a class="lee-text-link" href="${url(data.metadata.workbookUrl)}" target="_blank" rel="noopener noreferrer">Original workbook ↗</a></div><div class="lee-trace-controls"><form id="leeRegionForm"><label for="leeRegion">Region ID</label><div><input id="leeRegion" name="region" value="${esc(selectedRegion)}" maxlength="24" pattern="DMR_[0-9]+" placeholder="DMR_81" required autocomplete="off"><button type="submit" class="btn small">Inspect region</button></div></form><div class="lee-examples"><span>Examples</span>${['DMR_81','DMR_6651','DMR_6652'].map(id => `<button type="button" class="lee-example" data-lee-region="${id}">${id}</button>`).join('')}</div></div><p id="leeRegionError" class="lee-error" role="alert" hidden></p><div id="leeRegionResult">${region()}</div></section>
      <aside class="lee-notice" aria-labelledby="leeNoticeTitle"><span class="lee-notice-icon" aria-hidden="true">!</span><div><h2 id="leeNoticeTitle">One rounding discrepancy remains visible</h2><p>For DMR_6652, subtracting the original values gives <strong>0.056277369723… → 0.0563</strong>. The supplied report states <strong>0.0562</strong>, from subtracting the rounded endpoints. The sign and the 0.05 threshold result are unchanged.</p><p>This is a new reconstruction from public data. The missing original analysis ZIP was unavailable, so byte-for-byte identity with that original archive cannot be established.</p></div></aside>
      <section class="lee-panel lee-download-panel" aria-labelledby="leeDownloadTitle"><div class="lee-section-head"><div><span class="lee-kicker">REPRODUCIBILITY RECORD</span><h2 id="leeDownloadTitle">Inspect the outputs.</h2><p>Six CSVs and the verification record from the reconstruction. Downloads are fixed outputs; changing the controls above does not rewrite them.</p></div></div><div class="lee-downloads">${downloads()}</div><div class="lee-provenance"><strong>What was checked</strong><p>All seven files regenerated byte for byte against the new reconstruction’s frozen copies. Calculation checks passed; 58 of 59 report values matched, with the rounding difference above retained. <a href="/data/lee2014/reproduction.json" download="lee2014-reproduction.json">Download the regeneration check ↗</a></p><p>Source: Lee et al., DOI 10.1038/ncomms6619. ${esc(data.metadata.attribution || '')} <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.</p><p>Read-only study exploration. No AI ran, no biological interpretation was added, and your manuscript is not edited.</p></div></section>`;
  }
  function results() {
    const result = engine().analyze(data,{epsilon,schedule});
    return `<div class="lee-comparison-note${result.matchedSchedule ? '' : ' lee-unmatched'}"><strong>${result.matchedSchedule ? 'Same intermediate visits on both routes' : 'Unequal sampling opportunity'}</strong><span>${result.matchedSchedule ? 'Both counts use the same selected intermediate days, with their own day-21 endpoint.' : 'Continued low adds D16L. Low withdrawal has no day-16 measurement, so these counts use different schedules.'}</span></div><div class="lee-counts">${result.routes.map(row => `<article class="lee-count-row"><div class="lee-count-meta"><strong>${esc(labels[row.route] || row.label)}</strong><span>${esc(row.intermediates.join(' · '))} → ${esc(row.endpoint)}</span></div><div class="lee-count-number"><strong>${count(row.returnCount)}</strong><span>of ${count(row.eligibleRegions)} regions · ${(row.returnFraction * 100).toFixed(2)}%</span></div><div class="lee-bar" aria-hidden="true"><span style="width:${Math.max(0,Math.min(100,row.returnFraction * 100))}%"></span></div><p>${count(row.endpointNearCount)} regions end within tolerance; ${count(row.returnCount)} also departed at a selected intermediate visit.</p></article>`).join('')}</div><p class="lee-computation">Recomputed in this browser · ε = ${epsilon} · Source: Suppl_Data2, rows 4–7893</p>`;
  }
  function routes() {
    const config = data.routeConfig, uses = {};
    for (const route of Object.values(config.routes)) for (const slot of route) uses[slot.sample_id] = (uses[slot.sample_id] || 0) + 1;
    return `<div class="lee-table-scroll" tabindex="0" role="region" aria-label="Sampling routes table; scroll horizontally for all days"><table class="lee-routes"><caption>Observed source profiles by route and day. A dash means no measurement.</caption><thead><tr><th scope="col">Route / day</th>${config.days.map(day => `<th scope="col">${esc(day)}</th>`).join('')}</tr></thead><tbody>${Object.entries(config.routes).map(([id,slots]) => `<tr><th scope="row">${esc(labels[id] || id)}</th>${config.days.map(day => {const slot = slots.find(s => s.day === day); return slot ? `<td><span class="lee-sample${uses[slot.sample_id] > 1 ? ' shared' : ''}" title="${esc(slot.sample_id)}${uses[slot.sample_id] > 1 ? ' · shared source profile' : ''}">${esc(slot.sample_id)}</span></td>` : '<td class="lee-missing"><span aria-label="No measurement">—</span></td>';}).join('')}</tr>`).join('')}</tbody></table></div><div class="lee-legend"><span><i class="shared"></i>Shared source profile</span><span><i></i>Route-specific profile</span><span>— No measurement</span></div>`;
  }
  function region() {
    const record = engine().inspectRegion(data,selectedRegion);
    const main = new Set(['2°MEF','D8H','D21L','D21Ø']), primary = record.values.filter(v => main.has(v.sampleId)), other = record.values.filter(v => !main.has(v.sampleId));
    const table = values => `<div class="lee-table-scroll"><table class="lee-values"><thead><tr><th scope="col">Source profile</th><th scope="col">Workbook cell</th><th scope="col">Methylation fraction</th></tr></thead><tbody>${values.map(value => `<tr><th scope="row">${esc(value.sampleId)}</th><td><code>${esc(value.cell)}</code></td><td class="lee-number">${esc(value.value)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="lee-region-head"><strong>${esc(record.featureId)}</strong><span>${esc(record.group)} · ${esc(record.source.sheet)} · row ${esc(record.source.row)}</span></div>${table(primary)}<details class="lee-more-values"><summary>View the other ${other.length} source profiles</summary>${table(other)}</details><div class="lee-delta"><span>Day 21 withdrawal − continued low</span><strong>${esc(record.deltas.withdrawalMinusLow)}</strong><small>Fraction difference · ${(record.deltas.withdrawalMinusLow * 100).toFixed(4)} percentage points (rounded)</small></div><p class="lee-footnote">Source locator: <code>${esc(record.source.file)}</code> / ${esc(record.source.sheet)} / row ${esc(record.source.row)}. Profiles measure bulk samples; they do not track the same cells.</p>`;
  }
  function downloads() {
    const names = [['return_schedules.csv','Sampling schedules'],['path_classes.csv','Path classes'],['increments.csv','Route increments'],['same_day_comparisons.csv','Same-day comparisons'],['group_differences.csv','Group differences'],['examples.csv','Source examples'],['verification.json','Verification record']];
    return names.map(([file,label]) => `<a href="/data/lee2014/${file}" download="lee2014-${file}"><span>${label}</span><small>${file.endsWith('.json') ? 'JSON' : 'CSV'} ↓</small></a>`).join('');
  }
  function showRegion(id) {
    try {
      engine().inspectRegion(data,id);
      selectedRegion = id;
      $('leeRegion').value = id;
      $('leeRegionResult').innerHTML = region();
      $('leeRegionError').hidden = true;
    } catch (e) {
      $('leeRegionError').textContent = e?.message || 'That region is not in this dataset.';
      $('leeRegionError').hidden = false;
    }
  }
  document.addEventListener('change',event => {
    if (!data || !$('leeStudy')) return;
    if (event.target.id === 'leeEpsilon' || event.target.id === 'leeSchedule') {
      const nextEpsilon = Number($('leeEpsilon').value), nextSchedule = $('leeSchedule').value;
      try {engine().analyze(data,{epsilon:nextEpsilon,schedule:nextSchedule}); epsilon = nextEpsilon; schedule = nextSchedule; $('leeResults').innerHTML = results();}
      catch (e) {$('leeResults').innerHTML = `<p class="lee-error" role="alert">${esc(e?.message || 'These options are not supported.')}</p>`;}
    }
  });
  document.addEventListener('submit',event => {
    if (event.target.id !== 'leeRegionForm' || !data) return;
    event.preventDefault(); showRegion($('leeRegion').value.trim());
  });
  document.addEventListener('click',event => {
    const regionButton = event.target.closest?.('[data-lee-region]');
    if (regionButton && data && $('leeStudy')) {showRegion(regionButton.dataset.leeRegion); return;}
    const retry = event.target.closest?.('[data-lee-action="retry"]');
    if (retry && $('leeStudyBody')) {error = ''; $('leeStudyBody').innerHTML = loading(); void afterRender();}
  });
  window.PherogentLeeStudy = {render,afterRender};
})();
