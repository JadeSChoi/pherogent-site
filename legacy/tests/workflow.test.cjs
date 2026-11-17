'use strict';
// State-level regressions for citation provenance and preservation of scientific text.
// Browser rendering and real search are checked separately in UI QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const data = fs.readFileSync(path.join(__dirname, '../public/reference-data.js'), 'utf8');
const cellDemo = fs.readFileSync(path.join(__dirname, '../public/cell-demo.js'), 'utf8');
const research = fs.readFileSync(path.join(__dirname, '../public/research-workspace.js'), 'utf8');

function harness(stored = {}, searchImpl = async () => ({ total: 0, papers: [] }), options = {}) {
  const elements = new Map(), events = {}, values = new Map(Object.entries(stored));
  const downloads = [], blobs = new Map();
  class DownloadURL extends URL {
    static createObjectURL(blob) { const url = 'blob:test-' + blobs.size; blobs.set(url, blob); return url; }
    static revokeObjectURL() {}
  }
  const element = id => {
    if (!elements.has(id)) {
      const el = { id, textContent: '', value: '', hidden: false, open: false, writes: 0, dataset: {},
        addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; },
        setAttribute() {}, removeAttribute() {}, focus() {}, setSelectionRange() {}, classList: { toggle() {} } };
      let html = '';
      Object.defineProperty(el, 'innerHTML', { get: () => html, set: value => { html = value; el.writes++; } });
      elements.set(id, el);
    }
    return elements.get(id);
  };
  const sandbox = {
    window: { PherogentLiterature: { search: searchImpl } },
    document: { getElementById: element, querySelector: element, querySelectorAll: () => [],
      body: { appendChild() {} },
      createElement() { return { click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); }, remove() {} }; },
      addEventListener(type, fn) { (events[type] ||= []).push(fn); } },
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    URL: DownloadURL, URLSearchParams, AbortController, Blob, Intl, Date, Math, console,
    setTimeout: () => 1, clearTimeout() {}
  };
  vm.createContext(sandbox);
  vm.runInContext(data, sandbox);
  const legacyScenarios = JSON.stringify(sandbox.window.PHEROGENT_DATA.scenarios);
  vm.runInContext(cellDemo, sandbox);
  assert.equal(JSON.stringify(sandbox.window.PHEROGENT_DATA.scenarios.slice(0, 3)), legacyScenarios, 'New teaching material must not reinterpret saved scenario indices');
  vm.runInContext(research, sandbox);
  const testable = app.replace(/\nrender\(\);\n(?=if\(recoveryNotice\))/, '\nwindow.__test={state:()=>state,search:()=>search,prepare,setText,decide,assessment,cited,marker,manuscriptText,markdown,bibtex,paper,render,runSearch,keywordTerms,suggestedQuery,quoteOverlap,canApprove};\nrender();\n');
  assert.notEqual(testable, app, 'Test hook attaches without changing production source');
  vm.runInContext(testable, sandbox);
  const click = (action, arg = '') => events.click.forEach(fn => fn({ target: { closest: () => ({ dataset: { action, arg } }) } }));
  const dispatch = (type, id, value, dataset) => { const target = element(id); if (value !== undefined) target.value = value; if (dataset) target.dataset = dataset; return Promise.all((events[type] || []).map(fn => fn({ target, preventDefault() {} }))); };
  if (!options.keepIntro) click('dismiss-intro');
  return { t: sandbox.window.__test, element, click, dispatch, values, downloads, research: sandbox.window.PherogentResearch, data: sandbox.window.PHEROGENT_DATA, cellDemo: sandbox.window.PHEROGENT_CELL_DEMO };
}

function createProject(h, title, question = '') {
  h.click('new-project');
  h.element('newProjectTitle').value = title;
  h.element('newProjectQuestion').value = question;
  h.click('create-project');
  return h.t.state().activeProjectId;
}

function approveWithWarning(h) {
  h.click('approve-manual');
  if (h.element('dialog').open) h.click('confirm-low-overlap');
}

(async () => {
  const h = harness(), t = h.t, s = t.state();
  s.mode = 'draft';
  s.draft.text = 'Treatment increased survival by 1.5 months in mice. The second outcome was uncertain.\n\nAdditional notes stay here.';
  t.prepare();
  assert.equal(s.draft.claims[0].text, 'Treatment increased survival by 1.5 months in mice.', 'Decimal values retain their full claim');
  for (const claim of s.draft.claims) assert.equal(s.draft.text.slice(claim.start, claim.end), claim.text, 'Offsets identify the complete original span');
  const first = s.draft.claims[0], second = s.draft.claims[1], third = s.draft.claims[2];
  first.candidate = 'MED:33268865';
  first.manual = { quote: h.data.papers[first.candidate].evidence_excerpt, verdict: 'partial', revision: 'The animal experiment reported a visual benefit in mice.', note: 'Illustrative test input' };
  approveWithWarning(h);
  assert.equal(first.text, first.manual.revision);
  assert.equal(s.draft.text.slice(second.start, second.end), second.text, 'Revision updates later offsets');
  assert.equal(s.draft.text.slice(third.start, third.end), third.text, 'Trailing text remains intact');
  assert.match(t.manuscriptText(), /mice\. \[1\]/);
  assert.match(t.bibtex(), /author = \{Lu, Y and Brommer, B/);

  s.selected.draft = second.id;
  second.candidate = 'MED:35390271';
  second.manual = { quote: h.data.papers[second.candidate].evidence_excerpt, verdict: 'supports', revision: '', note: '' };
  approveWithWarning(h);
  assert.equal(t.cited().length, 2);
  assert.equal(t.marker(second), ' [2]');
  s.selected.draft = first.id;
  h.click('undo');
  assert.equal(first.text, first.original);
  assert.equal(t.marker(second), ' [1]', 'Reference numbering recomputes after undo');
  assert.equal(s.draft.text.slice(second.start, second.end), second.text, 'Undo preserves later offsets');

  s.selected.draft = second.id;
  h.click('edit', second.id);
  h.element('editSentence').value = 'Changed wording requires another source review.';
  h.click('save-edit', second.id);
  assert.equal(second.decision, null);
  assert.equal(second.manual.verdict, 'unreviewed');
  assert.equal(t.cited().length, 0);
  assert.ok(t.manuscriptText().includes('Additional notes stay here.'));

  s.mode = 'demo';
  s.selected.demo = 'demo-1';
  h.click('approve-demo');
  assert.equal(t.cited().length, 1);
  h.click('edit', 'demo-1');
  h.element('editSentence').value = 'A changed example involving humans needs independent review.';
  h.click('save-edit', 'demo-1');
  assert.equal(t.assessment(s.demo[0]).kind, 'stale');
  assert.equal(t.cited().length, 0);
  const liveLu = { id: 'MED:33268865', title: h.data.papers['MED:33268865'].title, abstract: 'A retrieved abstract.', authors: ['Lu Y'], year: 2020, journal: 'Nature', url: 'https://europepmc.org/article/MED/33268865' };
  s.papers[liveLu.id] = liveLu;
  assert.equal(t.paper(liveLu.id).evidence_excerpt, h.data.papers[liveLu.id].evidence_excerpt, 'Live metadata preserves prepared evidence');

  const old = { version: 1, title: 'Earlier paper', notes: { Introduction: 'Earlier manual writing.', Discussion: 'Earlier interpretation.' }, entries: [{ text: 'Earlier approved sentence.', paper: 'MED:33268865' }], logs: [{ type: 'old review' }] };
  const legacy = harness({ 'pherogent-workspace-reference-v1': JSON.stringify(old) });
  assert.equal(JSON.stringify(legacy.t.state().legacy), JSON.stringify(old));
  assert.match(legacy.t.state().draft.text, /Earlier manual writing/);
  assert.match(legacy.t.state().draft.text, /Earlier approved sentence/);
  assert.equal(legacy.values.get('pherogent-workspace-reference-v1'), JSON.stringify(old), 'Old store is not overwritten');

  const key = 'pherogent-evidence-workspace-v2';
  const malformed = JSON.parse(harness().values.get(key));
  malformed.demo = [null, null, null];
  const malformedRaw = JSON.stringify(malformed);
  const recovered = harness({ [key]: malformedRaw });
  assert.equal(recovered.t.state().recovery, malformedRaw, 'Malformed saved work is preserved verbatim for backup');
  assert.equal(recovered.t.state().demo.length, 3);
  assert.ok(recovered.t.state().demo.every(claim => typeof claim.text === 'string'));
  assert.equal(recovered.t.state().view, 'overview', 'Malformed data recovers to the research overview');
  assert.ok(recovered.element('main').innerHTML.length > 100, 'Malformed data does not prevent initial rendering');
  assert.match(recovered.element('toast').textContent, /Saved work needs recovery/);
  assert.equal(JSON.parse(recovered.values.get(key)).recovery, malformedRaw, 'Recovery payload survives the next local save');

  const original = harness(), originalState = original.t.state();
  originalState.mode = 'draft';
  originalState.draft.title = 'Recorded unresolved findings';
  originalState.draft.text = 'This first scientific claim needs further evidence. The second scientific claim conflicts with this study.';
  original.t.prepare();
  for (const [index, verdict] of ['unsupported', 'conflicting'].entries()) {
    const claim = originalState.draft.claims[index];
    originalState.selected.draft = claim.id;
    claim.candidate = index === 0 ? 'MED:33268865' : 'MED:35390271';
    claim.manual = { quote: '', verdict, revision: '', note: 'Author recorded an unresolved finding.' };
    original.click('approve-manual');
    assert.equal(claim.decision.type, 'flag', 'Unresolved findings are saved without approving a citation');
  }
  const savedRaw = original.values.get(key);
  const roundTrip = harness({ [key]: savedRaw });
  assert.equal(roundTrip.t.state().recovery, undefined, 'Valid author verdicts are accepted on reload');
  assert.equal(JSON.stringify(roundTrip.t.state()), savedRaw, 'All saved writing, verdicts, decisions and logs round-trip');
  assert.equal(roundTrip.t.state().draft.claims[0].manual.verdict, 'unsupported');
  assert.equal(roundTrip.t.state().draft.claims[1].manual.verdict, 'conflicting');
  assert.equal(roundTrip.t.cited().length, 0, 'Unresolved findings never acquire supporting citations after reload');

  // Step 1: suggestions are local keyword helpers, not scientific judgments.
  const keywords = harness(), kt = keywords.t;
  const terms = Array.from(kt.keywordTerms('The mice develop glaucoma and glaucoma impairs vision.'));
  assert.ok(terms.includes('glaucoma') && terms.includes('vision'), 'Key subject and outcome words are retained');
  assert.ok(!terms.includes('the') && !terms.includes('and'), 'Function words are excluded');
  assert.equal(terms.filter(word => word === 'glaucoma').length, 1, 'Repeated terms do not inflate overlap');
  assert.match(kt.suggestedQuery('OSK improves vision in mice with glaucoma.'), /osk/i);
  assert.match(kt.suggestedQuery('OSK improves vision in mice with glaucoma.'), /glaucoma/i);
  assert.ok(kt.suggestedQuery('glaucoma '.repeat(500)).length <= 300, 'Generated query respects the search input budget');
  assert.equal(kt.quoteOverlap('Vision improves in glaucoma.', 'Telomere attrition shortens chromosomes.').low, true, 'Unrelated vocabulary triggers a caution');
  assert.equal(kt.quoteOverlap('OSK improves vision in mice with glaucoma.', 'OSK improved vision in mice with glaucoma.').low, false, 'Several shared substantive words avoid a low-overlap warning');
  assert.equal(kt.quoteOverlap('Retinal neurons regenerate axons after glaucoma injury.', 'Retinal').low, true, 'One shared term in a long scientific sentence still merits caution');

  const suggestions = harness(), ss = suggestions.t.state();
  suggestions.click('mode', 'draft');
  await suggestions.dispatch('input', 'draftText', 'Glaucoma damages retinal neurons in mice. Cholesterol predicts cardiovascular disease in adults.');
  suggestions.t.prepare();
  assert.match(suggestions.t.search().query, /glaucoma/i, 'Preparing sentences prefills keywords from the selected sentence');
  await suggestions.dispatch('input', 'searchQuery', 'a hand edited search');
  suggestions.t.render();
  assert.equal(suggestions.t.search().query, 'a hand edited search', 'Unrelated renders preserve an author-edited query');
  await suggestions.dispatch('input', 'searchQuery', '');
  suggestions.t.render();
  assert.equal(suggestions.t.search().query, '', 'Clearing a query is an intentional edit, not a request to refill it');
  suggestions.click('select', ss.draft.claims[1].id);
  assert.match(suggestions.t.search().query, /cholesterol/i, 'Changing sentence generates a fresh relevant suggestion');
  assert.doesNotMatch(suggestions.t.search().query, /glaucoma/i);

  const warning = harness(), ws = warning.t.state();
  ws.mode = 'draft';
  ws.draft.text = 'Cholesterol predicts cardiovascular disease risk in adults.';
  warning.t.prepare();
  const unrelated = { id: 'MED:test-unrelated', title: 'A telomere study', authors: ['Example A'], year: 2020, journal: 'Test fixture', url: 'https://example.invalid/paper', abstract: 'Telomere attrition affects replicative senescence in fibroblasts.' };
  ws.papers[unrelated.id] = unrelated;
  const wc = ws.draft.claims[0];
  wc.candidate = unrelated.id;
  wc.manual = { quote: unrelated.abstract, verdict: 'supports', revision: '', note: 'Author explanation.' };
  assert.equal(warning.t.canApprove(wc), true, 'Exact quote is eligible for author review even when keywords differ');
  const beforeWarning = { text: wc.text, logs: ws.logs.length };
  warning.click('approve-manual');
  assert.equal(wc.decision, null, 'Low overlap cannot immediately approve a citation');
  assert.equal(warning.element('dialog').open, true);
  assert.match(warning.element('dialogContent').innerHTML, /keyword|overlap/i);
  warning.click('close');
  assert.equal(wc.decision, null, 'Cancelling the warning makes no decision');
  assert.equal(wc.text, beforeWarning.text);
  assert.equal(ws.logs.length, beforeWarning.logs);
  warning.click('approve-manual');
  warning.click('confirm-low-overlap');
  assert.equal(wc.decision.type, 'apply');
  assert.equal(wc.decision.warningAcknowledged, true, 'Author acknowledgement is retained with the decision');
  assert.equal(ws.logs[0].warningAcknowledged, true, 'Activity export retains the acknowledged caution');
  assert.equal(wc.decision.keywordOverlap.shared.length, 0);
  warning.click('undo');
  assert.equal(warning.t.cited().length, 0);

  wc.manual.quote = 'This invented passage is not in the paper.';
  assert.equal(warning.t.canApprove(wc), false, 'The keyword caution never replaces the exact-text gate');
  warning.click('approve-manual');
  assert.equal(wc.decision, null);
  wc.manual.quote = unrelated.abstract;
  warning.click('approve-manual');
  wc.manual.note = 'Changed after the warning opened.';
  warning.click('confirm-low-overlap');
  assert.equal(wc.decision, null, 'A confirmation for stale review contents cannot approve changed evidence');

  // Full-page writes on blur caused the first click and cursor regressions.
  // The actual click/focus behavior is also covered by the browser scenarios.
  const typing = harness();
  typing.click('mode', 'draft');
  const mainWrites = typing.element('main').writes;
  await typing.dispatch('input', 'draftTitle', 'My updated manuscript title');
  await typing.dispatch('change', 'draftTitle');
  await typing.dispatch('input', 'draftText', 'Glaucoma damages retinal neurons in mice.');
  await typing.dispatch('change', 'draftText');
  assert.equal(typing.element('main').writes, mainWrites, 'Editing and blurring inputs do not replace the page');
  assert.equal(typing.t.state().draft.title, 'My updated manuscript title');
  assert.equal(typing.t.state().draft.text, 'Glaucoma damages retinal neurons in mice.');
  assert.equal(JSON.parse(typing.values.get(key)).draft.title, 'My updated manuscript title', 'Input changes remain saved without blur rendering');

  let resolveEditedSearch, editedSignal;
  const editedSearch = harness({}, (_query, options) => {
    editedSignal = options.signal;
    return new Promise(resolve => { resolveEditedSearch = resolve; });
  });
  const editedState = editedSearch.t.state();
  editedState.mode = 'draft';
  editedState.draft.text = 'Glaucoma damages retinal neurons in mice.';
  editedSearch.t.prepare();
  const reviewedText = editedState.draft.text;
  const pendingEditedSearch = editedSearch.t.runSearch('author chosen glaucoma query');
  const editMainWrites = editedSearch.element('main').writes;
  const editLogs = editedState.logs.length;
  const draftInputNode = editedSearch.element('draftText');
  editedSearch.element('searchSubmit').disabled = true; // The test DOM does not parse rendered button attributes.
  await editedSearch.dispatch('input', 'draftText', reviewedText + ' A new outcome needs review.');
  assert.equal(editedSignal.aborted, true, 'Editing the paragraph aborts its in-flight search');
  assert.equal(editedSearch.t.search().loading, false);
  assert.equal(editedSearch.t.search().query, 'author chosen glaucoma query', 'Cancellation preserves the authored query');
  assert.equal(editedSearch.element('searchSubmit').disabled, false, 'Cancelled search re-enables the existing submit control');
  assert.equal(editedSearch.element('searchSubmit').textContent, 'Search papers');
  assert.equal(editedSearch.element('main').writes, editMainWrites, 'Editing during search does not replace the page');
  assert.equal(editedSearch.element('draftText'), draftInputNode, 'The existing text input remains in place');
  assert.equal(editedSearch.element('reviewResults').hidden, true);
  resolveEditedSearch({ total: 1, papers: [liveLu] });
  await pendingEditedSearch;
  assert.equal(editedSearch.t.search().total, null, 'A late search response cannot populate the changed draft');
  assert.equal(editedState.logs.length, editLogs, 'The obsolete response is not logged as a completed search');
  assert.equal(editedSearch.element('main').writes, editMainWrites, 'A late response cannot replace the page under the cursor');
  await editedSearch.dispatch('input', 'draftText', reviewedText);
  assert.equal(editedSearch.element('reviewResults').hidden, false, 'Reverting text restores the current review without a full render');
  assert.equal(editedSearch.element('searchSubmit').disabled, false, 'Reverting text does not leave Search stuck in its loading state');
  editedSearch.t.render();
  assert.equal(editedSearch.t.search().query, 'author chosen glaucoma query', 'Search context is preserved through the next render');

  let resolve;
  const race = harness({}, () => new Promise(r => { resolve = r; }));
  const pending = race.t.runSearch('OSK glaucoma');
  race.click('mode', 'draft');
  resolve({ total: 1, papers: [liveLu] });
  await pending;
  assert.equal(race.t.search().total, null, 'An old response cannot populate another workspace');
  assert.equal(race.t.state().logs.length, 0, 'Cancelled response does not become a new workspace search log');

  // The product is a migration of the same workspace, not a destructive reset.
  const beforeLayout = JSON.parse(savedRaw);
  delete beforeLayout.layoutVersion;
  delete beforeLayout.research;
  delete beforeLayout.productVersion;
  delete beforeLayout.projects;
  delete beforeLayout.activeProjectId;
  delete beforeLayout.projectMeta;
  beforeLayout.view = 'review';
  const migrated = harness({ [key]: JSON.stringify(beforeLayout) });
  assert.equal(migrated.t.state().view, 'overview', 'Existing v2 users first land in the new research overview');
  assert.equal(migrated.t.state().layoutVersion, 1);
  assert.equal(migrated.t.state().productVersion, 1);
  assert.ok(migrated.t.state().activeProjectId, 'A legacy workspace receives an active project identity');
  for (const field of ['version', 'mode', 'demo', 'draft', 'selected', 'papers', 'logs', 'legacy']) {
    assert.equal(JSON.stringify(migrated.t.state()[field]), JSON.stringify(beforeLayout[field]), 'Layout migration preserves ' + field);
  }
  migrated.click('view', 'analysis');
  const migratedReload = harness({ [key]: migrated.values.get(key) });
  assert.equal(migratedReload.t.state().view, 'analysis', 'The overview migration runs once, then preserves the chosen stage');
  assert.equal(migratedReload.t.state().draft.claims[0].manual.verdict, 'unsupported', 'Research navigation retains unresolved reference reviews');
  assert.equal(migratedReload.t.cited().length, 0);

  const project = harness(), ps = project.t.state();
  const ownId = createProject(project, 'My independent research');
  assert.equal(ps.mode, 'draft');
  assert.equal(ps.view, 'overview');
  assert.ok(ownId, 'New projects receive a stable identity');
  const projectWrites = project.element('main').writes;
  const authored = {
    question: 'Does transient reprogramming improve vision in aged mice?',
    aim: 'Compare visual outcomes while keeping mouse and human evidence separate.',
    hypothesis: 'Any benefit depends on the tissue and intervention.',
    dataNotes: 'Use the original outcome definitions and independent biological replicates.',
    analysisNotes: 'The prepared sources do not establish a clinical benefit in people.',
    limitations: 'No new data analysis has run in this prototype.',
    nextExperiment: 'Specify the outcome and comparator before testing a new intervention.',
  };
  for (const [field, text] of Object.entries(authored)) {
    await project.dispatch('input', 'test-' + field, text, { researchField: field });
  }
  assert.equal(project.element('main').writes, projectWrites, 'Writing research notes never replaces the page under the cursor');
  for (const [field, text] of Object.entries(authored)) assert.equal(ps.research[field], text);
  const researchReload = harness({ [key]: project.values.get(key) });
  for (const [field, text] of Object.entries(authored)) assert.equal(researchReload.t.state().research[field], text, 'Research ' + field + ' survives reload');

  await project.dispatch('input', 'draftTitle', 'An author-controlled research draft');
  await project.dispatch('input', 'draftText', 'My original prose must remain intact.\n\nAn important limitation belongs here.');
  const originalProse = ps.draft.text;
  project.click('insert-outline');
  assert.ok(ps.draft.text.startsWith(originalProse), 'Adding an outline appends to existing prose');
  assert.match(ps.draft.text.slice(originalProse.length), /## Introduction/);
  assert.match(ps.draft.text.slice(originalProse.length), /## Methods/);
  assert.match(ps.draft.text.slice(originalProse.length), /## Results/);
  assert.match(ps.draft.text.slice(originalProse.length), /## Discussion/);
  const outlined = ps.draft.text;
  project.click('append-analysis');
  assert.ok(ps.draft.text.startsWith(outlined), 'Adding analysis notes appends without replacing the outline or prose');
  assert.ok(ps.draft.text.includes(authored.analysisNotes), 'The author’s analysis notes reach the canonical manuscript');
  assert.equal(ps.research.analysisNotes, authored.analysisNotes, 'Moving notes into the manuscript retains the original notes');

  project.click('export-research');
  const researchDownload = project.downloads.at(-1);
  assert.ok(researchDownload && researchDownload.name.endsWith('.md'), 'Research export produces a Markdown download');
  const researchText = await researchDownload.blob.text();
  assert.ok(researchText.includes(authored.question));
  assert.ok(researchText.includes(authored.analysisNotes));
  assert.ok(researchText.includes(authored.limitations));
  assert.match(researchText, /prototype|no (?:live )?AI|no model|author-led|author notes/i, 'Research export retains the limits of the prototype');

  // Project switching is independent of a guided-tour mode. Every project is editable.
  const ownDraftBefore = JSON.stringify(ps.draft), ownNotesBefore = JSON.stringify(ps.research);
  const secondId = createProject(project, 'A second question', 'What comparison would test an alternative explanation?');
  assert.notEqual(secondId, ownId, 'Each created project gets a different identity');
  assert.equal(ps.draft.text, '', 'A new project starts with its own blank manuscript');
  assert.equal(ps.research.question, 'What comparison would test an alternative explanation?');
  await project.dispatch('input', 'draftText', 'The second project contains independent scientific writing.');
  const secondDraft = ps.draft.text;
  project.click('switch-project', ownId);
  assert.equal(JSON.stringify(ps.draft), ownDraftBefore, 'Switching back restores the complete manuscript and reference state');
  assert.equal(JSON.stringify(ps.research), ownNotesBefore, 'Switching back restores the original research notes');
  project.click('open-sample');
  const sampleId = ps.activeProjectId;
  assert.notEqual(sampleId, ownId, 'The editable sample is a separate project');
  assert.equal(ps.mode, 'draft', 'The sample uses normal author editing rather than a read-only demo mode');
  assert.equal(ps.projectMeta.isSample, true);
  assert.equal(ps.projectMeta.sampleVersion, 'cellular-reversal-v1', 'The new example has its own durable content version');
  assert.deepEqual(Array.from(project.cellDemo.scenarioIndices), [3, 4, 5], 'The cellular example uses appended scenario indices');
  assert.ok(ps.draft.text.length > 0, 'The sample opens with working manuscript material');
  await project.dispatch('input', 'draftText', 'A tester has edited the sample manuscript.');
  const sampleDraft = ps.draft.text;
  const expectedSampleIds = ['MED:27347753', 'MED:33268865', 'MED:32720894'].sort();
  assert.deepEqual(Object.keys(ps.papers).sort(), expectedSampleIds, 'The editable sample contains all three prepared paper records');
  for (const id of expectedSampleIds) assert.equal(ps.papers[id].id, id, 'Every sample paper has the identity required for safe persistence and note controls');
  const activeSampleReload = harness({ [key]: project.values.get(key) });
  assert.equal(activeSampleReload.t.state().recovery, undefined, 'A valid active sample must not be sent to workspace recovery on reload');
  assert.equal(activeSampleReload.t.state().activeProjectId, sampleId);
  assert.equal(activeSampleReload.t.state().projectMeta.isSample, true);
  assert.equal(activeSampleReload.t.state().draft.title, ps.draft.title);
  assert.equal(activeSampleReload.t.state().draft.text, sampleDraft, 'The edited sample manuscript survives an active-project reload');
  assert.deepEqual(Object.keys(activeSampleReload.t.state().papers).sort(), expectedSampleIds);
  for (const id of expectedSampleIds) assert.equal(activeSampleReload.t.state().papers[id].id, id);
  activeSampleReload.click('view', 'literature');
  for (const id of expectedSampleIds) {
    assert.ok(activeSampleReload.element('main').innerHTML.includes('data-source-note="' + id + '"'), 'Each sample source note is bound to the saved paper ID');
    assert.ok(activeSampleReload.element('main').innerHTML.includes('data-source-tag="' + id + '"'), 'Each sample reading-status control is bound to the saved paper ID');
  }
  await activeSampleReload.dispatch('input', 'sample-source-note', 'A tester annotation on the sample paper.', { sourceNote: expectedSampleIds[0] });
  activeSampleReload.click('switch-project', ownId);
  const inactiveSampleReload = harness({ [key]: activeSampleReload.values.get(key) });
  assert.ok(inactiveSampleReload.t.state().projects.some(item => item.id === sampleId), 'An inactive editable sample remains a valid saved project after reload');
  assert.equal((inactiveSampleReload.t.state().projectRecovery || []).some(item => item.id === sampleId), false, 'The inactive sample is not silently moved to recovery');
  inactiveSampleReload.click('projects');
  assert.ok(inactiveSampleReload.element('dialogContent').innerHTML.includes('data-arg="' + sampleId + '"'), 'The inactive sample remains selectable in the project switcher');
  inactiveSampleReload.click('switch-project', sampleId);
  assert.equal(inactiveSampleReload.t.state().draft.text, sampleDraft);
  assert.equal(inactiveSampleReload.t.state().research.sourceNotes[expectedSampleIds[0]].note, 'A tester annotation on the sample paper.', 'Sample source annotations survive switching and reload');
  project.click('switch-project', ownId);
  assert.equal(JSON.stringify(ps.draft), ownDraftBefore, 'Editing the sample never replaces an authored project');
  assert.equal(JSON.stringify(ps.research), ownNotesBefore);
  project.click('open-sample');
  assert.equal(ps.activeProjectId, sampleId, 'Opening the sample again reuses the existing editable project');
  assert.equal(ps.draft.text, sampleDraft, 'Reopening the sample preserves tester changes');
  // An older editable sample is author work, not a migration template to overwrite.
  const previousSample = JSON.parse(project.values.get(key));
  delete previousSample.projectMeta.sampleVersion;
  previousSample.draft.title = 'My edited earlier reprogramming sample';
  previousSample.draft.text = 'These older sample edits belong to the author.';
  previousSample.draft.baseText = '';
  previousSample.draft.claims = [];
  previousSample.research.analysisNotes = 'An independent interpretation saved before the new demo.';
  const oldSampleDraft = JSON.stringify(previousSample.draft), oldSampleResearch = JSON.stringify(previousSample.research);
  const migration = harness({ [key]: JSON.stringify(previousSample) });
  migration.click('open-sample');
  const freshSampleId = migration.t.state().activeProjectId;
  assert.notEqual(freshSampleId, sampleId, 'Opening a new demo version creates a separate sample project');
  assert.equal(migration.t.state().projectMeta.sampleVersion, 'cellular-reversal-v1');
  const retainedSample = migration.t.state().projects.find(item => item.id === sampleId);
  assert.equal(JSON.stringify(retainedSample.draft), oldSampleDraft, 'Old sample writing survives version migration exactly');
  assert.equal(JSON.stringify(retainedSample.research), oldSampleResearch, 'Old sample research notes survive version migration exactly');
  await migration.dispatch('input', 'draftText', 'The author edited the cellular sample too.');
  migration.click('switch-project', sampleId);
  assert.equal(JSON.stringify(migration.t.state().draft), oldSampleDraft, 'The previous sample remains usable in the project switcher');
  migration.click('open-sample');
  assert.equal(migration.t.state().activeProjectId, freshSampleId, 'Reopening chooses the matching content version');
  assert.equal(migration.t.state().draft.text, 'The author edited the cellular sample too.', 'Reopening the new demo preserves its edits');

  project.click('switch-project', secondId);
  assert.equal(ps.draft.text, secondDraft);
  const projectsReload = harness({ [key]: project.values.get(key) });
  assert.equal(projectsReload.t.state().activeProjectId, secondId, 'The chosen project survives reload');
  assert.equal(projectsReload.t.state().draft.text, secondDraft);
  projectsReload.click('switch-project', ownId);
  assert.equal(JSON.stringify(projectsReload.t.state().draft), ownDraftBefore, 'Inactive project snapshots survive reload');

  project.click('switch-project', ownId);
  project.element('taskText').value = 'Compare the populations in the selected studies';
  await project.dispatch('submit', 'taskForm');
  const task = ps.research.tasks.find(item => item.text === 'Compare the populations in the selected studies');
  assert.ok(task, 'Submitting a task adds it to the active project');
  assert.equal(task.done, false);
  project.click('task-toggle', task.id);
  assert.equal(task.done, true, 'A task can be completed');
  project.click('task-toggle', task.id);
  assert.equal(task.done, false, 'A task can be reopened');
  project.click('switch-project', secondId);
  assert.equal(ps.research.tasks.some(item => item.id === task.id), false, 'Tasks do not leak into another project');
  project.click('switch-project', ownId);
  assert.equal(ps.research.tasks.find(item => item.id === task.id).done, false, 'Task state survives project switching');

  const isolated = harness(), isolatedState = isolated.t.state();
  const approvedProjectId = createProject(isolated, 'Project with approved evidence');
  isolatedState.draft.text = 'Visual function improved in aged mice. The remaining scientific outcome is uncertain.';
  isolated.t.prepare();
  const isolatedClaim = isolatedState.draft.claims[0];
  const isolatedSource = {id:'MED:project-source',title:'Project-specific visual study',authors:['Example A'],year:2020,journal:'Test fixture',url:'https://example.invalid/visual-study',abstract:'Visual function improved in aged mice.'};
  isolatedState.papers[isolatedSource.id] = isolatedSource;
  isolatedClaim.candidate = isolatedSource.id;
  isolatedClaim.manual = {quote:isolatedSource.abstract,verdict:'partial',revision:'Visual function improved in treated aged mice.',note:'Author narrowed the population.'};
  approveWithWarning(isolated);
  assert.equal(isolatedClaim.decision.type, 'apply');
  const approvedDraft = JSON.stringify(isolatedState.draft), approvedLogs = JSON.stringify(isolatedState.logs);
  const otherProjectId = createProject(isolated, 'Unrelated project');
  assert.equal(isolated.t.cited().length, 0, 'New projects never inherit another project’s approved citations');
  assert.equal(isolatedState.papers[isolatedSource.id], undefined, 'Project-specific sources stay in their own collection');
  isolatedState.draft.text = 'An unrelated project has its own original scientific text.';
  isolated.t.prepare();
  const unrelatedDraft = JSON.stringify(isolatedState.draft);
  isolated.click('switch-project', approvedProjectId);
  assert.equal(JSON.stringify(isolatedState.draft), approvedDraft, 'Switching restores exact reviewed text, sentence offsets and approval provenance');
  assert.equal(JSON.stringify(isolatedState.logs), approvedLogs, 'Project activity is restored with its project');
  assert.equal(isolated.t.cited().length, 1);
  for (const claim of isolatedState.draft.claims) assert.equal(isolatedState.draft.text.slice(claim.start, claim.end), claim.text, 'Restored offsets match the canonical manuscript');
  isolated.click('undo');
  assert.equal(isolatedState.draft.claims[0].text, 'Visual function improved in aged mice.');
  isolated.click('switch-project', otherProjectId);
  assert.equal(JSON.stringify(isolatedState.draft), unrelatedDraft, 'Undo in one project never changes another project');

  isolated.click('open-sample');
  const sampleOriginal = isolatedState.draft.text;
  const sampleClaim = isolatedState.draft.claims.find(claim => isolated.t.assessment(claim).kind === 'partial');
  assert.ok(sampleClaim, 'The editable sample includes an overclaim to revise');
  isolatedState.selected.draft = sampleClaim.id;
  isolated.click('approve-demo');
  if (isolated.element('dialog').open) isolated.click('confirm-low-overlap');
  assert.equal(sampleClaim.decision.type, 'apply');
  assert.notEqual(isolatedState.draft.text, sampleOriginal, 'Approving a prepared revision edits the editable sample’s canonical manuscript');
  assert.equal(isolatedState.draft.text.slice(sampleClaim.start, sampleClaim.end), sampleClaim.text);
  assert.match(isolated.t.manuscriptText(), /\[1\]/);
  isolated.click('undo');
  assert.equal(isolatedState.draft.text, sampleOriginal, 'Undo restores the entire sample manuscript exactly');
  assert.equal(isolated.t.cited().length, 0);

  let resolveProjectSearch, projectSignal;
  const searchAcrossProjects = harness({}, (_query, options) => {projectSignal = options.signal; return new Promise(resolve => {resolveProjectSearch = resolve;});});
  const searchProjectId = createProject(searchAcrossProjects, 'Search project');
  searchAcrossProjects.click('view', 'literature');
  const projectSearch = searchAcrossProjects.t.runSearch('visual function mice');
  const destinationId = createProject(searchAcrossProjects, 'Different project');
  const destinationLogs = JSON.stringify(searchAcrossProjects.t.state().logs);
  assert.equal(projectSignal.aborted, true, 'Switching projects cancels in-flight literature requests');
  resolveProjectSearch({total:1,papers:[liveLu]});
  await projectSearch;
  assert.equal(searchAcrossProjects.t.state().activeProjectId, destinationId);
  assert.equal(searchAcrossProjects.t.search().total, null, 'A late result cannot populate a different project');
  assert.equal(JSON.stringify(searchAcrossProjects.t.state().logs), destinationLogs, 'An obsolete response does not become another project’s completed search');
  searchAcrossProjects.click('switch-project', searchProjectId);
  assert.equal(searchAcrossProjects.t.state().papers[liveLu.id], undefined, 'An obsolete response does not silently save its paper to the original project either');

  const snapshotRaw = JSON.parse(project.values.get(key));
  const goodSnapshot = snapshotRaw.projects[0];
  const invalidSnapshot = {...goodSnapshot,id:'invalid-project',draft:{title:'Recover my writing',text:'Retain this damaged snapshot for recovery.'}};
  const emptyIdSnapshot = {...goodSnapshot,id:''};
  snapshotRaw.projects.push(invalidSnapshot, emptyIdSnapshot, {...goodSnapshot});
  const repairedProjects = harness({[key]:JSON.stringify(snapshotRaw)});
  assert.ok(repairedProjects.t.state().projects.some(item=>item.id === goodSnapshot.id), 'Valid inactive projects remain available');
  assert.equal(repairedProjects.t.state().projects.filter(item=>item.id === goodSnapshot.id).length, 1, 'Duplicate project identities cannot shadow the real project');
  assert.equal(repairedProjects.t.state().projects.some(item=>item.id === 'invalid-project'||item.id === ''), false, 'Malformed or empty-ID projects are not activated');
  const recoveryProjects = repairedProjects.t.state().projectRecovery;
  assert.ok(recoveryProjects.some(item=>item.id === 'invalid-project'&&item.draft.text === invalidSnapshot.draft.text), 'Malformed snapshots preserve their original text for recovery');
  assert.ok(recoveryProjects.some(item=>item.id === ''), 'An unusable project identity is preserved for recovery');
  const repairedReload = harness({[key]:repairedProjects.values.get(key)});
  assert.equal(JSON.stringify(repairedReload.t.state().projectRecovery), JSON.stringify(recoveryProjects), 'Project recovery data survives reload');

  const onboarding = harness({}, undefined, { keepIntro: true });
  assert.equal(onboarding.element('dialog').open, true, 'First use presents a short introduction');
  onboarding.click('dismiss-intro');
  assert.equal(onboarding.element('dialog').open, false);
  assert.equal(onboarding.t.state().onboardingSeen, true, 'Dismissing the introduction is remembered');
  const returning = harness({ [key]: onboarding.values.get(key) }, undefined, { keepIntro: true });
  assert.equal(returning.element('dialog').open, false, 'The introduction does not interrupt returning visitors');
  returning.click('help');
  assert.equal(returning.element('dialog').open, true, 'Help can reopen the short introduction');
  returning.click('close');
  assert.equal(returning.t.state().onboardingSeen, true);

  const discovery = harness({}, async () => ({ total: 1, papers: [liveLu] }));
  discovery.click('mode', 'draft');
  await discovery.dispatch('input', 'draftText', 'Reprogramming may affect visual function in aged mice.');
  discovery.t.prepare();
  const discoveryState = discovery.t.state(), unreviewedClaim = discoveryState.draft.claims[0];
  const claimBeforeDiscovery = JSON.stringify(unreviewedClaim);
  discovery.click('view', 'literature');
  await discovery.t.runSearch('OSK vision aged mice');
  discovery.click('inspect', '0');
  assert.equal(discovery.element('dialog').open, true, 'Literature discovery inspects the paper in a dialog');
  assert.equal(JSON.stringify(unreviewedClaim), claimBeforeDiscovery, 'Opening a paper for discovery does not assign it to a manuscript sentence');
  discovery.click('save-paper', '0');
  assert.ok(discoveryState.research.savedSources.includes(liveLu.id), 'The chosen search record is saved to the research library');
  assert.equal(discoveryState.papers[liveLu.id].title, liveLu.title);
  assert.equal(discovery.t.cited().length, 0, 'Saving a paper never silently inserts an approved citation');
  assert.equal(JSON.stringify(unreviewedClaim), claimBeforeDiscovery, 'Saving a discovery paper preserves the sentence review and decision');
  discovery.click('save-paper', '0');
  assert.equal(discoveryState.research.savedSources.filter(id => id === liveLu.id).length, 1, 'Saving a paper again does not duplicate the library record');
  const discoveryReload = harness({ [key]: discovery.values.get(key) });
  assert.ok(discoveryReload.t.state().research.savedSources.includes(liveLu.id));
  assert.equal(discoveryReload.t.cited().length, 0, 'A saved discovery source stays uncited after reload');
  discovery.click('export-research');
  assert.ok((await discovery.downloads.at(-1).blob.text()).includes(liveLu.title), 'Research export includes the saved source without requiring citation approval');
  discovery.click('view', 'review');
  discovery.click('use-saved-paper', liveLu.id);
  assert.equal(unreviewedClaim.candidate, liveLu.id, 'The author can explicitly choose a saved source for a sentence');
  assert.equal(unreviewedClaim.manual.verdict, 'unreviewed');
  assert.equal(unreviewedClaim.manual.quote, '');
  assert.equal(discovery.t.cited().length, 0);
  assert.equal(discovery.t.canApprove(unreviewedClaim), false, 'Reusing a source still requires a new evidence review');
  unreviewedClaim.manual.verdict = 'supports';
  unreviewedClaim.manual.quote = 'An invented sentence that does not appear in the abstract.';
  discovery.click('approve-manual');
  assert.equal(unreviewedClaim.decision, null, 'A reused source cannot bypass the exact-quote gate');
  unreviewedClaim.manual.quote = liveLu.abstract;
  approveWithWarning(discovery);
  assert.equal(unreviewedClaim.decision.type, 'apply', 'An exact passage and explicit author approval may cite a saved source');
  discoveryState.papers[unrelated.id] = unrelated;
  discovery.click('use-saved-paper', unrelated.id);
  assert.equal(unreviewedClaim.candidate, liveLu.id, 'Choosing a new source cannot silently replace an approved citation');
  discovery.click('undo');
  discovery.click('use-saved-paper', unrelated.id);
  assert.equal(unreviewedClaim.candidate, unrelated.id, 'Undo permits a new source review');
  assert.equal(discovery.t.cited().length, 0);

  discovery.click('view', 'literature');
  const sourceMainWrites = discovery.element('main').writes;
  await discovery.dispatch('input', 'test-source-note', 'Population: mice. Human benefit requires independent evidence.', { sourceNote: liveLu.id });
  await discovery.dispatch('change', 'test-source-tag', 'useful', { sourceTag: liveLu.id });
  assert.equal(discoveryState.research.sourceNotes[liveLu.id].note, 'Population: mice. Human benefit requires independent evidence.');
  assert.equal(discoveryState.research.sourceNotes[liveLu.id].tag, 'useful');
  assert.equal(discovery.element('main').writes, sourceMainWrites, 'Editing source notes does not replace the input under the cursor');
  discovery.click('source-to-notebook', liveLu.id);
  assert.ok(discoveryState.research.analysisNotes.includes('Population: mice.'), 'The author can explicitly add a source note to the notebook');
  assert.ok(discoveryState.research.analysisNotes.includes(liveLu.title), 'Copied notes retain their source title');
  assert.equal(discovery.t.cited().length, 0, 'Source-to-notebook copying does not approve a manuscript citation');
  const withNotesReload = harness({ [key]: discovery.values.get(key) });
  assert.equal(withNotesReload.t.state().research.sourceNotes[liveLu.id].tag, 'useful');
  assert.ok(withNotesReload.t.state().research.analysisNotes.includes('Population: mice.'));

  console.log('Workflow regressions passed: decimals, spans, approvals, edits, citation numbering, BibTeX names, evidence preservation, legacy recovery, malformed-save recovery, valid verdict round-trip, search suggestions, overlap cautions, exact-quote gating, stale confirmations, input rendering, edit-during-search cancellation, search cancellation.');
  console.log('Product workspace regressions passed: migration without data loss, project creation and switching, independent editable sample, note persistence/export, append-only manuscript actions, tasks, dismissible onboarding, and source notes without citation approval.');
})().catch(error => { console.error(error); process.exitCode = 1; });
