// Shared UI scenarios: use a normal Playwright Page in CI, or the managed
// browser's Playwright-compatible adapter. No app-state or localStorage writes.
const check = (condition, message) => { if (!condition) throw new Error(message); };
const value = locator => locator.evaluate(element => element.value);

async function dismissIntro(page) {
  const dismiss = page.locator('#dialog [data-action="dismiss-intro"]');
  if (await dismiss.isVisible()) await dismiss.click();
}

async function openWriting(page) {
  await dismissIntro(page);
  // The manuscript and reference editor belong to the active project.
  await page.locator('#navigation [data-action="view"][data-arg="review"]').click();
  if (!await page.locator('#draftText').isVisible()) {
    await page.locator('.draft-editor summary').click();
  }
}

async function openProjectOverview(page) {
  const legacyNav = page.locator('#navigation [data-action="view"][data-arg="overview"]');
  if (await legacyNav.isVisible()) {
    await legacyNav.click();
    return;
  }
  // The new studio keeps the original task workspace behind its research brief.
  // Follow visible controls rather than changing application state in the test.
  await page.locator('#navigation [data-studio-action="open-stage"][data-studio-arg="organizer"]').click();
  await page.locator('.studio-side-tabs [data-studio-action="side-tab"][data-studio-arg="context"]').click();
  await page.locator('#studioPanelContent [data-action="view"][data-arg="plan"]').click();
  await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
}

async function prepareOnce(page, paragraph) {
  await openWriting(page);
  await page.locator('#draftText').fill(paragraph);
  // Deliberately one click, while the textarea still has focus. A blur handler
  // that replaces the button must fail this test, rather than get a retry.
  await page.getByRole('button', { name: 'Prepare sentences for review', exact: true }).click();
  await page.locator('.claim-row').first().waitFor({ state: 'visible' });
}

export async function singleClickPrepare(page) {
  const first = 'OSK expression restored vision in aged mice.';
  const second = 'Human benefit requires additional evidence.';
  await prepareOnce(page, `${first} ${second}`);
  check(await page.locator('.claim-row').count() === 2, 'One Prepare click must create two sentence rows.');
  const rows = await page.locator('.claim-text').allTextContents();
  check(rows[0].includes(first) && rows[1].includes(second), 'The rows must contain the newly pasted sentences, not an earlier review.');
}

export async function titleToParagraphFocus(page) {
  await openWriting(page);
  await page.locator('#draftText').fill('');
  await page.locator('#draftTitle').fill('Focus regression manuscript');
  await page.locator('#draftText').click();
  check(await page.evaluate(() => document.activeElement?.id) === 'draftText', 'Clicking the paragraph after typing a title must retain focus.');
  const paragraph = 'Typing after a title change must reach this paragraph.';
  await page.locator('#draftText').pressSequentially(paragraph);
  check(await value(page.locator('#draftText')) === paragraph, 'Typing must appear in the paragraph field.');
  check(await value(page.locator('#draftTitle')) === 'Focus regression manuscript', 'The entered title must be retained.');
}

export async function selectedSentencePrefill(page) {
  await prepareOnce(page, 'OSK expression restored vision in aged mice. Transient reprogramming increased collagen production in human fibroblasts.');
  const firstQuery = await value(page.locator('#searchQuery'));
  check(/osk|vision/i.test(firstQuery), 'The first selected sentence must supply relevant search keywords.');
  check((await page.locator('#searchResults').textContent()).trim() === '', 'Prefilling a query must not automatically perform a search.');
  await page.locator('.claim-text').nth(1).click();
  const secondQuery = await value(page.locator('#searchQuery'));
  check(/collagen|fibroblast/i.test(secondQuery) && secondQuery !== firstQuery, 'Selecting another sentence must update its suggested search keywords.');
  const customQuery = 'fibroblast collagen clinical study';
  await page.locator('#searchQuery').fill(customQuery);
  await page.locator('.draft-editor summary').click();
  await page.locator('#draftTitle').fill('A title does not replace a custom query');
  await page.locator('#searchQuery').click();
  check(await value(page.locator('#searchQuery')) === customQuery, 'A title edit must not replace the author’s customized search query.');
}

// The ordinary Playwright suite supplies a fixed Europe PMC response. Managed
// browser QA can run this same scenario with the real public record instead.
export async function lowOverlapApproval(page) {
  await prepareOnce(page, 'Photosynthesis uses chlorophyll to capture sunlight in plants.');
  await page.locator('#searchQuery').fill('EXT_ID:33268865 AND SRC:MED');
  await page.getByRole('button', { name: 'Search papers', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect abstract', exact: true }).first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Inspect abstract', exact: true }).first().click();
  await page.locator('#evidenceQuote').fill('Ageing is a degenerative process that leads to tissue dysfunction and death.');
  await page.locator('#manualVerdict').selectOption('supports');
  check((await page.locator('#quoteMatch').textContent()).includes('Passage found'), 'The warning scenario must first pass exact source-text matching.');
  check(await page.locator('#quoteRelevanceWarning').isVisible(), 'An exact but unrelated passage must show the low-overlap warning.');
  await page.getByRole('button', { name: 'Approve citation', exact: true }).click();
  check((await page.locator('#dialogTitle').textContent()).includes('Check this passage before approving'), 'Approval must pause for author confirmation.');
  check(await page.locator('.reference-list').count() === 0, 'The warning must not insert a citation before confirmation.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  check(await page.locator('.reference-list').count() === 0, 'Cancelling must leave the citation unapproved.');
  await page.getByRole('button', { name: 'Approve citation', exact: true }).click();
  await page.getByRole('button', { name: 'Approve despite warning', exact: true }).click();
  check(await page.locator('.reference-list').count() === 1, 'Explicit author confirmation may approve a low-overlap citation.');
  await page.getByRole('button', { name: 'Undo decision', exact: true }).click();
  check(await page.locator('.reference-list').count() === 0, 'Undo must still remove an approval made after the warning.');
}

export async function productResearchFlow(page) {
  await dismissIntro(page);
  await page.locator('[data-action="new-project"]').first().click();
  await page.locator('#newProjectTitle').fill('Independent research project');
  const question = 'Which outcomes would support visual recovery in aged mice?';
  const notes = 'The source population is mice; a clinical benefit in people remains untested.';
  const prose = 'My original introduction and its scientific uncertainty must be preserved.';
  await page.locator('#newProjectQuestion').fill(question);
  await page.locator('#dialog').getByRole('button', {name:'Create project', exact:true}).click();
  await openProjectOverview(page);
  check(await value(page.locator('[data-research-field="question"]')) === question, 'Creating a project must retain its research question.');
  await page.locator('#taskText').fill('Compare the study populations');
  await page.locator('#taskText').press('Enter');
  // The checkbox/button may render its label as a sibling; use the created row.
  const taskRow = page.locator('.task-row').filter({hasText:'Compare the study populations'});
  check(await taskRow.count() === 1, 'A submitted research task must appear once.');
  await taskRow.locator('[data-action="task-toggle"]').click();

  await page.locator('#navigation [data-action="view"][data-arg="analysis"]').click();
  await page.locator('[data-research-field="analysisNotes"]').fill(notes);
  await page.locator('#navigation [data-action="view"][data-arg="manuscript"]').click();
  if (!await page.locator('#draftText').isVisible()) await page.locator('.draft-editor summary').click();
  await page.locator('#draftText').fill(prose);
  await page.locator('[data-action="insert-outline"]').click();
  const outlined = await value(page.locator('#draftText'));
  check(outlined.startsWith(prose) && outlined.includes('## Methods'), 'The outline must append to existing writing.');
  await page.locator('#navigation [data-action="view"][data-arg="analysis"]').click();
  await page.locator('[data-action="append-analysis"]').click();
  const manuscript = await value(page.locator('#draftText'));
  check(manuscript.startsWith(outlined) && manuscript.includes(notes), 'Adding notebook notes must preserve the whole existing draft.');
  await page.getByRole('button', { name: 'Prepare sentences for review', exact: true }).click();
  await page.locator('.claim-row').first().waitFor({ state: 'visible' });
  check((await page.locator('.claim-text').first().textContent()).includes(prose), 'Reference review must use the active project’s manuscript.');

  await page.locator('#projectSwitcher').click();
  const ownProject = page.locator('#dialog [data-action="switch-project"].active').filter({hasText:'Independent research project'});
  const ownId = await ownProject.getAttribute('data-arg');
  check(!!ownId, 'The author’s project is available in the switcher.');
  await page.locator('#dialog [data-action="open-sample"]').click();
  await page.locator('#navigation [data-action="view"][data-arg="manuscript"]').click();
  if (!await page.locator('#draftText').isVisible()) await page.locator('.draft-editor summary').click();
  await page.locator('#draftText').fill('A tester can edit this sample manuscript like any other project.');
  await page.locator('#projectSwitcher').click();
  await page.locator(`#dialog [data-action="switch-project"][data-arg="${ownId}"]`).click();
  await openProjectOverview(page);
  check(await value(page.locator('[data-research-field="question"]')) === question, 'Editing the sample must not change the author’s question.');
  check(await page.locator('.task-row').filter({hasText:'Compare the study populations'}).count() === 1, 'Project tasks survive switching projects.');
  await page.locator('#navigation [data-action="view"][data-arg="manuscript"]').click();
  if (!await page.locator('#draftText').isVisible()) await page.locator('.draft-editor summary').click();
  check(await value(page.locator('#draftText')) === manuscript, 'Editing the sample must not replace the author’s manuscript.');
}

export async function discoveryDoesNotApprove(page) {
  await prepareOnce(page, 'Reprogramming may affect visual function in aged mice.');
  await page.locator('#navigation [data-action="view"][data-arg="literature"]').click();
  await page.locator('#searchQuery').fill('EXT_ID:33268865 AND SRC:MED');
  await page.getByRole('button', { name: 'Search papers', exact: true }).click();
  await page.locator('[data-action="inspect"]').first().waitFor({ state: 'visible' });
  await page.locator('[data-action="inspect"]').first().click();
  check(await page.locator('#dialog').isVisible(), 'Discovery must inspect the source without opening a sentence assessment.');
  await page.locator('#dialog [data-action="save-paper"]').click();
  if (await page.locator('#dialog').isVisible()) await page.locator('#dialog [data-action="close"]').click();
  const note = 'The abstract concerns mouse visual function; clinical generalization needs separate evidence.';
  await page.locator('[data-source-note="MED:33268865"]').fill(note);
  await page.locator('[data-source-tag="MED:33268865"]').selectOption('useful');
  await page.locator('[data-action="source-to-notebook"][data-arg="MED:33268865"]').click();
  await page.locator('#navigation [data-action="view"][data-arg="analysis"]').click();
  check((await value(page.locator('[data-research-field="analysisNotes"]'))).includes(note), 'A saved source note can be explicitly added to the notebook.');
  await page.locator('#navigation [data-action="view"][data-arg="review"]').click();
  check(await page.locator('.reference-list').count() === 0, 'Saving a source for research must not approve a manuscript citation.');
  check(await page.locator('#evidenceQuote').count() === 0, 'Research discovery must not silently assign the source to the selected sentence.');
}

export const browserScenarios = [
  ['pasted paragraph prepares with one click', singleClickPrepare],
  ['title-to-paragraph click preserves focus and typing', titleToParagraphFocus],
  ['selected sentence prefills search without sending it', selectedSentencePrefill],
  ['low keyword overlap requires author confirmation', lowOverlapApproval],
  ['projects, tasks and editable sample preserve independent work', productResearchFlow],
  ['source notes flow to notebook without approving a citation', discoveryDoesNotApprove],
];
