'use strict';
// The renderer handles user-authored research notes and bibliographic text.
// These checks exercise data recovery, safe output, and editable sample behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: {}, URL };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/reference-data.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/cell-demo.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/research-workspace.js'), 'utf8'), sandbox);
const R = sandbox.window.PherogentResearch;
const C = sandbox.window.PHEROGENT_CELL_DEMO;
const plain = value => JSON.parse(JSON.stringify(value));

const defaultsA = R.defaults(), defaultsB = R.defaults();
defaultsA.tasks.push({ id: 'local', text: 'Local task', done: false });
defaultsA.sourceNotes.paper = { note: 'Local note', tag: 'useful' };
assert.equal(defaultsB.tasks.length, 0, 'Each project gets an independent task list');
assert.equal(Object.keys(defaultsB.sourceNotes).length, 0, 'Each project gets independent source notes');

const malformed = {
  question: 42,
  customFutureField: { keep: 'future compatible data' },
  tasks: [
    { id: 'valid', text: 'Check population', done: false, futureField: 'preserve' },
    { id: 'valid', text: 'Duplicate identity', done: true },
    { id: 'bad', text: 'Invalid state', done: 'yes' },
    null,
  ],
  sourceNotes: {
    good: { note: 'A measured outcome', tag: 'useful', futureField: 123 },
    partial: { note: ['unreadable'], tag: 'unknown' },
    invalid: null,
  },
  recovery: { olderPayload: 'retain me' },
};
const normalized = R.normalize(malformed);
assert.equal(normalized.question, '');
assert.equal(normalized.recovery.question, 42, 'Malformed research text remains recoverable');
assert.deepEqual(plain(normalized.customFutureField), malformed.customFutureField, 'Unknown fields survive normalization');
assert.equal(normalized.recovery.olderPayload, 'retain me');
assert.equal(normalized.tasks.length, 1, 'Duplicate and malformed tasks cannot enter the interactive checklist');
assert.equal(normalized.tasks[0].futureField, 'preserve', 'Valid task extensions survive normalization');
assert.deepEqual(plain(normalized.recovery.tasks), malformed.tasks, 'Dropped task records remain in the recovery payload');
assert.equal(normalized.sourceNotes.good.note, malformed.sourceNotes.good.note);
assert.equal(normalized.sourceNotes.good.futureField, 123);
assert.equal(normalized.sourceNotes.partial.note, '');
assert.equal(normalized.sourceNotes.partial.tag, 'to-read', 'Unknown reading status uses a neutral default');
assert.deepEqual(plain(normalized.recovery.sourceNotes.partial), malformed.sourceNotes.partial);
assert.equal(normalized.recovery.sourceNotes.invalid, null, 'Unreadable source notes remain recoverable');
const arrayInput = [{ draft: 'keep this original' }];
assert.deepEqual(plain(R.normalize(arrayInput).recovery.original), arrayInput, 'A non-record research payload is preserved');

const attack = '</textarea><img src=x onerror="alert(1)">';
const research = { ...R.defaults(), question: attack, analysisNotes: attack,
  tasks: [{ id: 'task" onclick="alert(1)', text: attack, done: true }],
  sourceNotes: { paper: { note: attack, tag: 'conflicting' } },
};
const paper = { id: 'paper', title: attack, authors: [attack], year: 2020,
  journal: attack, url: 'javascript:alert(1)', abstract: 'Available abstract.' };
const editor = '<textarea id="canonical-manuscript-editor">Author draft</textarea>';
const ctx = { mode: 'draft', project: { id: 'project-one', isSample: true },
  research, draft: { title: attack, text: '## Methods\n\nThe author’s manuscript.' },
  papers: [paper], citationCount: 0, decisionsCount: 0, claimCount: 0,
  searchHTML: '<form id="trusted-search-form"></form>', editorHTML: editor,
  manuscriptText: 'The author’s manuscript.',
};
for (const view of ['overview', 'plan', 'literature', 'analysis', 'manuscript']) {
  const html = R.render(view, ctx);
  assert.ok(html.length > 100, view + ' renders a usable surface');
  assert.ok(!html.includes('<img src=x'), view + ' escapes user-authored markup');
  assert.ok(!html.includes('javascript:alert'), view + ' rejects unsafe source links');
  assert.ok(!html.includes('data-action="tour-next"'), view + ' is not a sequential walkthrough');
}
const overview = R.render('overview', ctx);
assert.match(overview, /data-research-field="question"/, 'The sample research question is editable');
assert.match(overview, /role="checkbox" aria-checked="true"/, 'Task completion is exposed accessibly');
assert.match(overview, /data-arg="task&quot; onclick=&quot;alert\(1\)"/, 'Task identifiers cannot break out of attributes');
assert.match(R.render('analysis', ctx), /data-research-field="analysisNotes"/, 'The sample notebook remains editable');
assert.match(R.render('literature', ctx), /data-source-note="paper"/, 'Source annotations are editable');
assert.ok(R.render('literature', ctx).includes('id="trusted-search-form"'), 'The live search control remains in the collection view');
assert.ok(R.render('manuscript', ctx).includes(editor), 'The manuscript view uses the canonical editor provided by the app');
assert.equal(R.tourHTML(ctx), '', 'No tutorial banner is inserted into working views');

const sampleA = R.sampleResearch(), sampleB = R.sampleResearch();
sampleA.tasks[0].done = true;
sampleA.sourceNotes['MED:33268865'].note = 'Tester changed this sample';
assert.equal(sampleB.tasks[0].done, false, 'Loading another sample does not share mutable task state');
assert.notEqual(sampleB.sourceNotes['MED:33268865'].note, sampleA.sourceNotes['MED:33268865'].note, 'Sample notes are independent copies');
assert.notEqual(C.sampleResearch.sourceNotes['MED:33268865'].note, sampleA.sourceNotes['MED:33268865'].note, 'Editing a sample cannot mutate the bundled source notes');
assert.equal(C.sampleResearch.tasks[0].done, false, 'Editing a sample cannot mutate the bundled research task');
const cellContext = {...ctx,project:{...ctx.project,sampleVersion:C.version},research:sampleB};
const cellExport = R.markdown(cellContext);
assert.match(cellExport, /archive mechanism remains a hypothesis/, 'The export distinguishes the hypothesis from observed recovery');
assert.ok(cellExport.includes(C.attribution), 'The export retains the sample adaptation attribution');
const practiceExport = R.markdown({...cellContext,project:{id:'practice',isTutorial:true,tutorialVersion:C.version}});
assert.match(practiceExport, /archive mechanism remains a hypothesis/, 'Practice exports retain the same evidence boundary');
const legacyExport = R.markdown({...ctx,research:R.defaults()});
assert.doesNotMatch(legacyExport,/Cellular Blockchain example|archive mechanism remains a hypothesis/, 'Existing sample exports are not relabeled as the new cellular project');

const exported = R.markdown({ ...ctx, research: { ...R.defaults(), tasks: [{ id: 't', text: 'Compare outcomes', done: true }], sourceNotes: { paper: { note: 'Measured in mice', tag: 'useful' } } } });
assert.match(exported, /\[x\] Compare outcomes/, 'Exports include checklist completion');
assert.match(exported, /Author note: Measured in mice/, 'Exports retain source annotations');
assert.match(exported, /not citation approval/, 'Reading status is not misrepresented as evidence approval');
assert.match(exported, /Editable sample project/, 'Sample exports retain their provenance');
assert.match(exported, /No AI, experiment or new data analysis ran/, 'Sample exports do not invent agent execution');
console.log('Product view checks passed: independent defaults, loss-safe recovery, safe rendering, editable sample, canonical editor, annotated exports.');

// AI activity must be exported as activity, not relabeled as an untouched demo.
const aiResearch=R.defaults();
aiResearch.aiRuns=[{id:'run-test',at:'2026-10-24T00:00:00Z',question:'A focused question',status:'failed',reserved:true,usage:{totalTokens:40,estimatedCostUsd:0.0002,unknownCalls:1},steps:[{actor:'AI',stage:'plan',detail:'Planned two searches.'}],result:null}];
const aiExport=R.markdown({research:aiResearch,draft:{title:'AI export',text:''},project:{isSample:false},papers:[]});
assert.match(aiExport,/AI research checks/);
assert.match(aiExport,/incomplete usage/);
assert.match(aiExport,/Reserved allowance: \$0\.10/);
assert.match(aiExport,/\[AI\] plan: Planned two searches/);
assert.ok(!aiExport.includes('No AI assessment or experiment has run in this prototype.'));
