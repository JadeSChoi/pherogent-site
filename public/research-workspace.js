'use strict';
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const textFields = ['question', 'aim', 'hypothesis', 'dataNotes', 'analysisNotes', 'limitations', 'nextExperiment'];
  const sourceTags = [['to-read', 'To read'], ['useful', 'Useful'], ['conflicting', 'Conflicting']];
  // Retained as navigation metadata; the optional interactive tutorial is separate.
  const stages = [
    {view:'plan', title:'Research brief', short:'Brief'},
    {view:'literature', title:'Library', short:'Library'},
    {view:'analysis', title:'Notebook', short:'Notebook'},
    {view:'manuscript', title:'Manuscript', short:'Manuscript'},
    {view:'review', title:'References', short:'References'}
  ];
  const C = window.PHEROGENT_CELL_DEMO || null;
  const clone = value => JSON.parse(JSON.stringify(value));
  const demoQuestion = C?.question || 'What does partial reprogramming restore—and how far can the evidence take us?';
  const defaults = () => ({question:'', aim:'', hypothesis:'', dataNotes:'', analysisNotes:'', limitations:'', nextExperiment:'', savedSources:[], tasks:[], sourceNotes:{}, tourStep:null});
  function sampleResearch() {
    if (record(C?.sampleResearch)) return {...defaults(), ...clone(C.sampleResearch)};
    return {...defaults(), question:demoQuestion,
      aim:'Compare functional outcomes in selected mouse and cultured human-cell studies. Keep evidence about cells, animals and living people separate.',
      hypothesis:'Functional effects may depend on the tissue, model and intervention. Changes in molecular aging markers alone do not establish recovery across an organism.',
      dataNotes:'Prepared comparison of Ocampo (2016), Lu (2020) and Gill (2022). Record the population, intervention, measured outcome and study limitations. No new dataset or experiment is included.',
      analysisNotes:'The selected studies examine distinct systems: mouse aging, visual function in mice, and cultured human fibroblasts. These findings should remain separate when making claims. Together they motivate a more focused question; they do not establish human lifespan extension.',
      limitations:'Three selected papers are not a systematic review. Populations, tissues and outcomes differ. These materials do not establish clinical effectiveness or safety in living humans.',
      nextExperiment:'Does a functional improvement persist after transient reprogramming stops, compared with matched untreated controls? Define a cell model, a prespecified functional endpoint, biological replicates and safety measurements.',
      tasks:sampleTasks(),
      savedSources:['MED:27984723','MED:33268865','MED:35390271'],
      sourceNotes:{
        'MED:27984723':{tag:'useful',note:'Mouse experiments, including lifespan in a premature-aging model. Do not turn this into a human lifespan claim.'},
        'MED:33268865':{tag:'useful',note:'Mouse retinal ganglion cells and visual function. Inspect the exact passage before citing a functional benefit.'},
        'MED:35390271':{tag:'to-read',note:'Cultured human fibroblasts. Compare molecular measures with the functional assays reported.'}
      }
    };
  }
  function sampleTasks() {
    if (Array.isArray(C?.sampleResearch?.tasks)) return clone(C.sampleResearch.tasks);
    return [
    {id:'sample-task-scope',text:'Compare the populations and outcomes in the three papers',done:false},
    {id:'sample-task-wording',text:'Narrow the human-benefit sentence in the manuscript',done:false},
    {id:'sample-task-durability',text:'Find a study that measures durability after treatment stops',done:false}
  ];}
  function normalize(value) {
    if (!record(value)) return value == null ? defaults() : {...defaults(), recovery:{original:value}};
    const result = {...value, ...defaults()}, recovery = record(value.recovery) ? {...value.recovery} : {};
    if ('recovery' in value && !record(value.recovery)) recovery.previousRecovery = value.recovery;
    for (const key of textFields) {
      if (typeof value[key] === 'string') result[key] = value[key];
      else if (key in value) recovery[key] = value[key];
    }
    if (Array.isArray(value.savedSources)) {
      const seen = new Set();
      result.savedSources = value.savedSources.filter(item => {
        const id = typeof item === 'string' ? item : record(item) && typeof item.id === 'string' ? item.id : '';
        if (!id || seen.has(id)) return false;
        seen.add(id); return true;
      });
      if (result.savedSources.length !== value.savedSources.length) recovery.savedSources = value.savedSources;
    } else if ('savedSources' in value) recovery.savedSources = value.savedSources;
    if (Array.isArray(value.tasks)) {
      const seen = new Set();
      result.tasks = value.tasks.filter(task => {
        if (!record(task) || typeof task.id !== 'string' || !task.id || typeof task.text !== 'string' || typeof task.done !== 'boolean' || seen.has(task.id)) return false;
        seen.add(task.id); return true;
      }).map(task => ({...task}));
      if (result.tasks.length !== value.tasks.length) recovery.tasks = value.tasks;
    } else if ('tasks' in value) recovery.tasks = value.tasks;
    if (record(value.sourceNotes)) {
      const rows = [], invalid = [];
      for (const [id, annotation] of Object.entries(value.sourceNotes)) {
        if (!record(annotation)) {invalid.push([id, annotation]); continue;}
        const validNote = typeof annotation.note === 'string', validTag = sourceTags.some(([tag]) => tag === annotation.tag);
        rows.push([id, {...annotation, note:validNote ? annotation.note : '', tag:validTag ? annotation.tag : 'to-read'}]);
        if (!validNote || !validTag) invalid.push([id, annotation]);
      }
      result.sourceNotes = Object.fromEntries(rows);
      if (invalid.length) recovery.sourceNotes = Object.fromEntries(invalid);
    } else if ('sourceNotes' in value) recovery.sourceNotes = value.sourceNotes;
    if (value.tourStep === null || Number.isInteger(value.tourStep) && value.tourStep >= 0 && value.tourStep < stages.length) result.tourStep = value.tourStep;
    else if ('tourStep' in value) recovery.tourStep = value.tourStep;
    if (Object.keys(recovery).length) result.recovery = recovery;
    return result;
  }
  const button = (label, action, arg = '', cls = 'btn') => `<button type="button" class="${cls}" data-action="${action}" data-arg="${esc(arg)}">${esc(label)}</button>`;
  const go = (label, view, cls = 'btn') => button(label, 'view', view, cls);
  const notes = ctx => normalize(ctx.research);
  const sourceList = ctx => Array.isArray(ctx.papers) ? ctx.papers : [];
  const count = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  const words = value => String(value || '').trim().split(/\s+/).filter(Boolean).length;
  const title = ctx => ctx.draft?.title || 'Untitled project';
  const sample = ctx => ctx.project?.isSample === true || ctx.mode === 'demo';
  const tourHTML = () => '';
  const practice = ctx => ctx.project?.isTutorial === true;
  const sampleBadge = ctx => practice(ctx) ? '<span class="scope-pill">Practice project</span>' : sample(ctx) ? '<span class="scope-pill">Editable sample</span>' : '';
  const icon = name => {
    const paths = {search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',notes:'<path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6M9 16h3M3 7h4M3 12h4M3 17h4"/>',write:'<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5ZM14 20h6"/>',source:'<path d="M6 3h8l4 4v14H6V3ZM14 3v5h4M9 12h6M9 16h6"/>',check:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m7 12 3 3 7-7"/>',tour:'<path d="M9 4 4 9l5 5M15 10l5 5-5 5M4 9h10a4 4 0 0 1 0 8h-2"/>'};
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.source)+'</svg>';
  };
  function heading(name, subtitle, actions = '') {
    return `<div class="page-head product-head"><div><h1>${esc(name)}</h1>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
  }
  function field(key, label, value, rows = 4, placeholder = '', hint = '') {
    const id = 'research' + key[0].toUpperCase() + key.slice(1);
    return `<label class="field" for="${id}"><span>${esc(label)}</span><textarea id="${id}" data-research-field="${key}" aria-label="${esc(label)}" rows="${rows}" maxlength="20000" placeholder="${esc(placeholder)}"${hint ? ` aria-describedby="${id}Hint"` : ''}>${esc(value)}</textarea>${hint ? `<small id="${id}Hint" class="subtle">${esc(hint)}</small>` : ''}</label>`;
  }
  function author(p) {
    return Array.isArray(p.authors) && p.authors.length ? p.authors[0].replace(/\s+[A-Z]+$/, '') + (p.authors.length > 1 ? ' et al.' : '') : 'Authors not supplied';
  }
  function paperLink(p) {
    let href = '';
    try {const u = new URL(p.url || (p.doi ? 'https://doi.org/' + p.doi : '')); if (u.protocol === 'https:') href = u.href;} catch (_) {}
    return href ? `<a class="inline-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open paper ↗</a>` : '';
  }
  function metrics(ctx) {
    const r = notes(ctx), done = r.tasks.filter(task => task.done).length;
    return `<div class="product-metrics" aria-label="Project summary">${[
      [sourceList(ctx).length, 'Saved papers', 'literature', 'source'],
      [words(ctx.draft?.text), 'Manuscript words', 'manuscript', 'write'],
      [count(ctx.citationCount), 'Approved references', 'review', 'check'],
      [`${done}/${r.tasks.length}`, 'Tasks completed', 'overview', 'notes']
    ].map(([n, label, view, glyph]) => `<button class="metric-tile" type="button" data-action="view" data-arg="${view}"><span class="metric-icon">${icon(glyph)}</span><div class="metric-body"><strong>${esc(n)}</strong><span>${label}</span></div><span class="metric-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`;
  }
  function shortcuts(ctx) {
    const draftText = String(ctx.draft?.text || '').trim();
    const items = [
      ['search', 'Find a paper', 'Search live literature and build your collection.', 'literature'],
      ['notes', 'Connect your findings', 'Keep interpretations and open questions together.', 'analysis'],
      ['write', draftText ? 'Continue your manuscript' : 'Start your manuscript', draftText ? 'Pick up your draft and check its references.' : 'Turn your research into a draft you can review.', 'manuscript']
    ];
    return `<div class="workspace-shortcuts" aria-label="Quick actions">${items.map(([glyph,label,detail,view])=>`<button type="button" class="shortcut-card" data-action="view" data-arg="${view}"><span class="shortcut-icon">${icon(glyph)}</span><span class="shortcut-copy"><strong>${esc(label)}</strong><p>${esc(detail)}</p></span><span class="shortcut-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`;
  }
  function recentActivity(ctx) {
    const entries = Array.isArray(ctx.logs) ? ctx.logs.filter(record).slice(0,3) : [];
    return `<section class="product-panel compact-record"><div class="section-head"><h2>Recent activity</h2>${go('View all','activity','btn small ghost')}</div>${entries.length ? `<ol class="recent-activity">${entries.map(entry=>`<li><span class="activity-dot" aria-hidden="true"></span><div class="activity-copy"><strong>${esc(entry.type || 'Project action')}</strong><p>${esc(String(entry.detail || '').slice(0,150))}</p><span>${esc(entry.actor || 'Author')}</span></div></li>`).join('')}</ol>` : `<div class="artifact-empty"><p>Every source and decision has a trail.</p><span>Your project actions will appear here as you work.</span></div>`}</section>`;
  }
  function tasksHTML(r) {
    return `<section class="product-panel"><div class="section-head"><h2>Research tasks</h2><span class="subtle">${r.tasks.filter(task => !task.done).length} open</span></div><form id="taskForm" class="task-form"><label class="sr-only" for="taskText">New research task</label><input id="taskText" name="taskText" maxlength="300" required placeholder="Add a task…" autocomplete="off"><button type="submit" class="btn small primary">Add task</button></form><div class="task-list">${r.tasks.length ? r.tasks.map(task => `<div class="task-row${task.done ? ' done' : ''}"><button type="button" class="task-check" data-action="task-toggle" data-arg="${esc(task.id)}" role="checkbox" aria-checked="${task.done}" aria-label="${esc(task.text)}"><span aria-hidden="true">${task.done ? '✓' : ''}</span></button><span class="task-text">${esc(task.text)}</span><span class="task-state">${task.done ? 'Done' : 'Open'}</span></div>`).join('') : '<p class="empty-inline">No tasks yet. Add a question to investigate or something to finish.</p>'}</div></section>`;
  }
  function overview(ctx) {
    const r = notes(ctx), papers = sourceList(ctx), draftText = String(ctx.draft?.text || '').trim();
    const projectTitle = title(ctx), isEmpty = !r.question && !draftText && !papers.length;
    const tutorialStatus = ctx.tutorial?.status;
    const tutorialLabel = tutorialStatus === 'active' || tutorialStatus === 'paused' ? 'Continue the tutorial' : tutorialStatus === 'completed' ? 'Replay the tutorial' : 'Learn by doing';
    return `<section class="workspace-hero"><div class="workspace-welcome"><div class="hero-kicker">YOUR RESEARCH WORKSPACE ${sampleBadge(ctx)}</div><h1>${esc(isEmpty && projectTitle==='Untitled project' ? 'Your research, in focus.' : projectTitle)}</h1><p>${practice(ctx) ? 'A safe place to practice. Your other projects stay separate.' : isEmpty ? 'Make room for your next question. Start anywhere, and keep your work together.' : 'Your sources, ideas and writing. One place to keep moving.'}</p></div><button type="button" class="tutorial-launch-card" data-action="start-tutorial"><span class="shortcut-icon">${icon('tour')}</span><span><strong>${tutorialLabel}</strong><small>Interactive walkthrough · about 3 min</small></span><span aria-hidden="true">↗</span></button></section>
      ${metrics(ctx)}${shortcuts(ctx)}
      <div class="product-grid"><div class="product-main"><section class="product-panel product-brief"><div class="section-head"><div><span class="eyebrow">THE QUESTION AT THE CENTER</span><h2>Research question</h2></div>${go('Edit brief', 'plan', 'btn small ghost')}</div>${field('question', 'Question', r.question, 3, 'What are you investigating?')}<div class="brief-bottom"><p class="subtle">${esc(r.aim || 'Define the population, outcome and scope in your research brief.')}</p><span class="save-inline">Saved as you type</span></div></section>${tasksHTML(r)}
      <section class="product-panel workspace-notes"><div class="section-head"><h2>Working notes</h2>${go('Open notebook', 'analysis', 'btn small ghost')}</div>${field('analysisNotes', 'Findings & interpretation', r.analysisNotes, 4, 'Capture a finding, compare results, or record an open question…')}<div class="actions">${button('Add notes to manuscript', 'append-analysis', '', 'btn small')}${button('Export project notes', 'export-research', '', 'btn small ghost')}</div></section></div>
      <aside class="product-side"><section class="product-panel artifact-card manuscript-preview-card"><div class="section-head"><div><span class="eyebrow">YOUR WRITING</span><h2>Manuscript</h2></div><span class="subtle">${words(draftText)} words</span></div>${draftText ? `<div class="manuscript-preview-page"><h3>${esc(projectTitle)}</h3><p class="artifact-excerpt">${esc(draftText.replace(/^#{1,6}\s+/gm, '').slice(0,260) + (draftText.length > 260 ? '…' : ''))}</p></div>` : `<div class="artifact-empty"><span class="artifact-empty-icon">${icon('write')}</span><h3>Your ideas start here.</h3><p>Write freely, import a draft, or bring in notes from your notebook.</p></div>`}<div class="actions">${go(draftText ? 'Continue writing' : 'Start writing', 'manuscript', 'btn small primary')}${go('Review references', 'review', 'btn small ghost')}</div></section>
      <section class="product-panel"><div class="section-head"><h2>Project library</h2><span class="subtle">${papers.length} saved</span></div><div class="compact-source-list">${papers.slice(-3).reverse().map(p => `<button type="button" class="compact-source" data-action="saved-paper-inspect" data-arg="${esc(p.id)}"><span class="source-file-icon" aria-hidden="true">${icon('source')}</span><span><strong>${esc(p.title)}</strong><small>${esc(author(p))} · ${esc(p.year || 'Year not supplied')}</small></span><span aria-hidden="true">↗</span></button>`).join('') || '<div class="artifact-empty"><p>Build a collection you can return to.</p><span>Save papers, record what matters, and keep each source close to your writing.</span></div>'}</div><div class="actions">${go('Find papers', 'literature', 'btn small')}${papers.length?go('View collection','literature','btn small ghost'):''}</div></section>
      ${recentActivity(ctx)}</aside></div>`;
  }
  function plan(ctx) {
    const r = notes(ctx);
    return `${heading('Research brief', 'Saved as you type.', go('Back to workspace', 'overview', 'btn'))}<div class="brief-editor"><section class="product-panel">${field('question','Research question',r.question,3,'What are you investigating?')}${field('aim','Aim & scope',r.aim,4,'Population, context, outcomes and boundaries…')}${field('hypothesis','Working hypothesis',r.hypothesis,4,'Your testable expectation…')}${field('dataNotes','Evidence & data plan',r.dataNotes,6,'Data sources, methods, comparisons and controls…','Planning notes only; this prototype does not execute experiments or analyze datasets.')}</section></div>`;
  }
  function collectionPaper(p, r, index) {
    const annotation = r.sourceNotes[p.id] || {note:'',tag:'to-read'};
    return `<article class="collection-paper"><div class="section-head"><span class="source-meta">${esc(author(p))} · ${esc(p.year || 'No year')} · ${esc(p.journal || '')}</span><span class="scope-pill">${p.abstract ? 'Abstract available' : p.evidence_excerpt ? 'Prepared excerpt' : 'Metadata only'}</span></div><h3>${esc(p.title || 'Untitled source')}</h3><div class="paper-actions"><div class="actions">${button('Inspect source','saved-paper-inspect',p.id,'btn small')}${paperLink(p)}</div><label class="source-status" for="sourceTag${index}"><span class="sr-only">Reading status for ${esc(p.title)}</span><select id="sourceTag${index}" data-source-tag="${esc(p.id)}">${sourceTags.map(([tag,label])=>`<option value="${tag}"${annotation.tag===tag?' selected':''}>${label}</option>`).join('')}</select></label></div>${p.evidence_scope ? `<details class="source-scope"><summary>Prepared study scope</summary><p>${esc(p.evidence_scope)}</p></details>` : ''}<label class="field source-note" for="sourceNote${index}"><span>Your notes</span><textarea id="sourceNote${index}" data-source-note="${esc(p.id)}" rows="2" maxlength="4000" placeholder="Key result, limitation or why this paper matters…">${esc(annotation.note)}</textarea></label><div class="source-note-footer"><span class="subtle">Reading notes are separate from citation approval</span>${button('Add note to notebook','source-to-notebook',p.id,'btn small ghost')}</div></article>`;
  }
  function literature(ctx) {
    const r = notes(ctx), papers = sourceList(ctx);
    return `${heading('Library', `${papers.length} saved ${papers.length===1?'paper':'papers'} · Keep the evidence behind your ideas.`, go('Review references','review','btn'))}<div class="collection-layout"><section class="product-panel collection-main"><div class="section-head"><h2>Saved papers</h2><span class="subtle">Your reading collection</span></div><div class="collection-list">${papers.length ? papers.map((p,i)=>collectionPaper(p,r,i)).join('') : `<div class="empty-state collection-empty"><span class="empty-symbol" aria-hidden="true">${icon('source')}</span><h2>Your collection starts with a question.</h2><p>Search for a topic, author or paper. Inspect the abstract, then save useful sources here.</p><div class="empty-feature-list"><span>Keep reading notes</span><span>Track useful and conflicting evidence</span><span>Reuse sources in your manuscript</span></div></div>`}</div></section><aside class="product-panel collection-search">${ctx.searchHTML || '<p class="subtle">Open References to search for papers.</p>'}${r.question ? `<details class="search-question"><summary>Research question</summary><p>${esc(r.question)}</p></details>` : ''}</aside></div>`;
  }
  function analysis(ctx) {
    const r = notes(ctx), annotated = sourceList(ctx).filter(p=>r.sourceNotes[p.id]?.note.trim());
    return `${heading('Notebook','Your findings, working hypotheses and open questions.',button('Add notes to manuscript','append-analysis','','btn primary')+button('Export notes','export-research','','btn'))}<div class="notebook-grid"><section class="product-panel notebook-main">${field('analysisNotes','Findings & interpretation',r.analysisNotes,14,'Write your research notes here…')}${field('limitations','Limitations & alternatives',r.limitations,6,'What remains uncertain? What other explanation fits?')}</section><aside class="notebook-side"><section class="product-panel">${field('hypothesis','Working hypothesis',r.hypothesis,5,'A testable expectation…')}${field('nextExperiment','Next experiment or question',r.nextExperiment,5,'The comparison or evidence you need next…')}</section><section class="product-panel"><div class="section-head"><h2>Source notes</h2>${go('Library','literature','btn small ghost')}</div>${annotated.length ? annotated.slice(0,5).map(p=>`<div class="notebook-source"><strong>${esc(author(p))} · ${esc(p.year)}</strong><p>${esc(r.sourceNotes[p.id].note)}</p>${button('Add to findings','source-to-notebook',p.id,'btn small ghost')}</div>`).join('') : '<p class="empty-inline">Notes you add to saved papers appear here.</p>'}</section></aside></div>`;
  }
  const outlineSections = ['Summary','Introduction','Methods','Results','Discussion','Conclusion'];
  function manuscript(ctx) {
    const raw = String(ctx.draft?.text || ''), found = outlineSections.filter(name=>new RegExp('^## '+name+'\\s*$','mi').test(raw));
    return `${heading('Manuscript',`${words(raw)} words · ${count(ctx.citationCount)} approved references`,go('Check references','review','btn primary'))}<div class="product-manuscript"><aside class="product-panel document-outline"><div class="section-head"><h2>Outline</h2></div><nav aria-label="Manuscript outline">${outlineSections.map(name=>`<button type="button" class="outline-item${found.includes(name)?' present':''}" data-action="focus-section" data-arg="${name}"><span class="outline-dot" aria-hidden="true"></span>${name}<span class="subtle">${found.includes(name)?'↗':'—'}</span></button>`).join('')}</nav>${button('Insert section outline','insert-outline','','btn small')}<div class="outline-divider"></div><span class="eyebrow">REFERENCE REVIEW</span><p class="subtle">${count(ctx.claimCount)} sentences prepared<br>${count(ctx.decisionsCount)} author decisions</p>${go('Open references','review','btn small ghost')}</aside><section class="product-panel manuscript-editor"><div class="editor-toolbar"><span class="editor-file">▤ &nbsp; Draft</span><div class="actions">${button('Export manuscript','export-md','','btn small ghost')}${go('Notebook','analysis','btn small ghost')}</div></div>${ctx.editorHTML || '<p class="subtle">Open References to edit this manuscript.</p>'}</section></div>`;
  }
  function render(view, ctx = {}) {
    const views = {overview,plan,literature,analysis,manuscript};
    return `<div class="page product-page">${(views[view]||overview)(ctx)}</div>`;
  }
  function markdown(ctx = {}) {
    const r=notes(ctx), isSample=sample(ctx), isPractice=practice(ctx), aiRuns=Array.isArray(r.aiRuns)?r.aiRuns:[], isCellular=!!C?.version && (ctx.project?.sampleVersion===C.version || ctx.project?.tutorialVersion===C.version), blocks=[
      '# '+title(ctx),
      Array.isArray(r.studyRuns)&&r.studyRuns.length ? 'This project contains recorded deterministic study workflows. Inspect each run to distinguish retrieved summaries, skipped analyses, and completed calculations. No experiment was conducted by this website. AI requests, if any, are listed separately; all scientific interpretations require author review.' : aiRuns.length ? 'Research workspace with recorded AI requests; inspect each status and usage record to see what completed. AI interpretations require author review; no experiment or new data analysis was executed. Prepared teaching material retains its original provenance.' : isPractice ? 'Practice project from the interactive tutorial. Example inputs are learning material, not original research. No AI, experiment or new data analysis ran.' : isSample ? 'Editable sample project. Initial content is prepared material, not original research. No AI, experiment or new data analysis ran.' : 'Author-led research project. No AI assessment or experiment has run in this prototype.',
      ...[['Research question',r.question],['Aim & scope',r.aim],['Working hypothesis',r.hypothesis],['Evidence & data plan',r.dataNotes],['Findings & interpretation',r.analysisNotes],['Limitations',r.limitations],['Next experiment or research question',r.nextExperiment]].map(([name,value])=>'## '+name+'\n\n'+(value||'Not recorded.')),
      '## Research tasks\n\n'+(r.tasks.map(task=>'- ['+(task.done?'x':' ')+'] '+task.text).join('\n')||'No tasks recorded.'),
      '## Source collection\n\n'+(sourceList(ctx).map(p=>{const annotation=r.sourceNotes[p.id];return '- '+[Array.isArray(p.authors)?p.authors.join(', '):'',p.year,p.title,p.doi?'https://doi.org/'+p.doi:p.url].filter(Boolean).join(' · ')+(annotation?'\n  Reading status: '+annotation.tag+'\n  Author note: '+(annotation.note||'Not recorded.'):'')+(p.evidence_scope?'\n  Prepared study scope: '+p.evidence_scope:'');}).join('\n\n')||'No sources saved.')+'\n\nCollection membership and reading status are not citation approval.',
      '## Manuscript\n\n'+(ctx.manuscriptText||ctx.draft?.text||'No manuscript text recorded.'),
      '## Review state\n\n'+count(ctx.claimCount)+' prepared sentences; '+count(ctx.decisionsCount)+' author decisions; '+count(ctx.citationCount)+' approved references.\n\nExport the manuscript and activity log separately for the numbered bibliography and detailed decision trail.'
    ];
    if(isCellular) {
      blocks.push('Sample scope: this Cellular Blockchain example distinguishes recovery of a preserved earlier state from creation of a similar new state. The selected studies inform that question but do not establish archive retrieval. Functional recovery is an observation; the archive mechanism remains a hypothesis. No new experiment ran.'+(aiRuns.length?' AI checks are listed separately below.':' No AI analysis ran.'));
      if (typeof C.attribution === 'string' && C.attribution) blocks.push(C.attribution);
    } else if(isSample)blocks.push('Sample scope: selected mouse and cultured human-cell studies do not establish safety, clinical benefit or lifespan extension in living humans.');
    if(aiRuns.length)blocks.push('## AI research checks and section conversations\n\n'+aiRuns.map(run=>{
        const u=run.usage||{}, result=run.result||{}, summary=result.summary||{};
        const content=run.kind==='section_chat' ? 'Section: '+(run.stage||'Not recorded')+'\n\nAI reply (author review required):\n'+(result.reply||'No completed reply recorded.')+'\n\nSuggested section draft (not automatically applied):\n'+(result.suggestedDraft?result.suggestedDraft.title+'\n'+result.suggestedDraft.body:'None.') : [['AI findings',summary.established],['Uncertainty',summary.uncertain],['Next questions',summary.nextQuestions]].map(([title,items])=>title+':\n'+(Array.isArray(items)?items.map(x=>'- '+x).join('\n'):'Not recorded.')).join('\n\n');
        return '### '+(run.question||run.message||'Research request')+'\n\nStatus: '+run.status+' · '+(run.at||'')+'\n\nReported tokens: '+(Number.isSafeInteger(u.totalTokens)?u.totalTokens:'Not reported')+(u.unknownCalls||u.usageUnknown?' (incomplete usage; submitted calls may still be billed)':'')+' · Estimated model cost: '+(Number.isFinite(u.estimatedCostUsd)?'$'+u.estimatedCostUsd.toFixed(4):'Not reported')+' · Reserved allowance: '+(run.reservationUnknown?'Unknown':run.reserved?'$0.10':'$0.00')+' · Tokens reserved: '+(Number.isSafeInteger(run.reservedTokens)?run.reservedTokens:'Not reported')+'\n\n'+content+'\n\nActivity:\n'+(Array.isArray(run.steps)?run.steps.map(step=>'- ['+(step.actor||'System')+'] '+step.stage+': '+step.detail).join('\n'):'Not recorded.');
      }).join('\n\n')+'\n\nAI findings and saved source collections do not constitute author-approved manuscript citations.');
    if(Array.isArray(r.studyRuns)&&r.studyRuns.length)blocks.push('## Study workflow records\n\n'+r.studyRuns.map(run=>'### '+(run.question||run.study||'Study run')+'\n\nType: '+run.kind+' · Recorded: '+(run.recordedAt||run.createdAt||'Not recorded')+'\n\n```json\n'+JSON.stringify(run,null,2)+'\n```').join('\n\n'));
    const savedOutputs=window.PherogentOutputs?.projectMarkdown?.(ctx);if(savedOutputs)blocks.push(savedOutputs);
    return blocks.join('\n\n')+'\n';
  }
  window.PherogentResearch={defaults,normalize,render,markdown,demoQuestion,stages,tourHTML,sampleResearch,sampleTasks};
})();
