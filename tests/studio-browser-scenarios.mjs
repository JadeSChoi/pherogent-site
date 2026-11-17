// Public-UI-only scenarios, shared by Playwright and managed-browser QA.
// These never write app state, localStorage or call an AI endpoint directly.
const check = (condition, message) => { if (!condition) throw new Error(message); };
const value = locator => locator.evaluate(element => element.value);
const action = (page, name, arg) => page.locator(`[data-studio-action="${name}"]${arg === undefined ? '' : `[data-studio-arg="${arg}"]`}`);

async function dismissIntro(page) {
  const dismiss = page.locator('#dialog [data-action="dismiss-intro"]');
  if (await dismiss.isVisible()) await dismiss.click();
}

async function createProject(page, name) {
  await dismissIntro(page);
  await page.locator('[data-action="new-project"]').first().click();
  await page.locator('#newProjectTitle').fill(name);
  await page.locator('#newProjectQuestion').fill('How can observed recovery be distinguished from a proposed mechanism?');
  await page.locator('#dialog').getByRole('button', {name:'Create project', exact:true}).click();
}

async function openStage(page, id) {
  await page.locator(`#navigation [data-studio-action="open-stage"][data-studio-arg="${id}"]`).click();
  await page.locator('#studioComposer').waitFor({state:'visible'});
}

export async function stageConversationsStaySeparate(page) {
  await createProject(page, 'QA · Scoped agent conversations');
  await openStage(page, 'results');
  const request = 'Keep this Results request in this project only.';
  const pending = 'An unsent Results thought should survive switching stages.';
  await page.locator('#studioComposer').fill(request);
  await page.locator('#studioChatForm').getByRole('button', {name:'Send message',exact:true}).click();
  check((await page.locator('.studio-messages').textContent()).includes(request), 'The author’s request is visible in the Results conversation.');
  check(/not connected|saved locally|no AI/i.test(await page.locator('.studio-messages').textContent()), 'Custom messages do not masquerade as a live model answer.');
  await page.locator('#studioComposer').fill(pending);
  await openStage(page, 'methods');
  check(!(await page.locator('.studio-messages').textContent()).includes(request), 'A sibling stage must not inherit Results messages.');
  check(await value(page.locator('#studioComposer')) === '', 'A sibling stage has an independent composer.');
  await openStage(page, 'results');
  check((await page.locator('.studio-messages').textContent()).includes(request), 'Results messages survive navigating away and back.');
  check(await value(page.locator('#studioComposer')) === pending, 'The unsent composer survives navigating away and back.');

  await page.locator('#projectSwitcher').click();
  const origin = await page.locator('#dialog [data-action="switch-project"].active').getAttribute('data-arg');
  await page.locator('#dialog [data-action="close"]').click();
  await createProject(page, 'QA · Independent second project');
  await openStage(page, 'results');
  check(!(await page.locator('.studio-messages').textContent()).includes(request), 'Another project must not inherit the original project’s conversation.');
  await page.locator('#projectSwitcher').click();
  await page.locator(`#dialog [data-action="switch-project"][data-arg="${origin}"]`).click();
  await openStage(page, 'results');
  check((await page.locator('.studio-messages').textContent()).includes(request), 'Returning to the original project restores its conversation.');
  check(await value(page.locator('#studioComposer')) === pending, 'Returning to a project restores its unsent composer.');
}

export async function preparedOutputsNeedAuthorReview(page) {
  await createProject(page, 'QA · Author-controlled stage output');
  await openStage(page, 'methods');
  await action(page,'demo').first().click();
  check(/prepared|example/i.test(await page.locator('.studio-messages').textContent()), 'An example response identifies its prepared origin.');
  const output = page.locator('#studioOutputBody');
  check((await value(output)).trim().length > 0, 'Trying a prepared example creates an editable stage output.');
  const edited = 'Author-reviewed methods draft. This is a proposal, not an experiment that was run.';
  await output.fill(edited);
  await action(page,'review-output').click();
  check(/reviewed|approved by you/i.test(await page.locator('.studio-output-meta').textContent()), 'Only an author action marks an output reviewed.');
  await output.fill(edited+' Changed after review.');
  check(/draft|needs review/i.test(await page.locator('.studio-output-meta').textContent()), 'Changing the output invalidates its previous review.');
  await action(page,'review-output').click();
  await action(page,'insert-output').click();
  check(await page.locator('#dialog').isVisible(), 'Adding a stage output to the manuscript must show the author a confirmation.');
  await action(page,'confirm-insert').click();
  await page.locator('#navigation [data-action="view"][data-arg="manuscript"]').click();
  check((await value(page.locator('#draftText'))).includes(edited), 'The explicitly accepted output reaches the manuscript.');
  check(!/\[\d+\]/.test(await value(page.locator('#draftText'))), 'Stage review must not silently approve citations.');
}

export async function reviewedHandoffStaysACopy(page) {
  await createProject(page, 'QA · Reviewed handoff snapshot');
  await openStage(page, 'results');
  const snapshot='A mouse visual outcome was observed; the cellular archive explanation remains a hypothesis.';
  await page.locator('#studioOutputTitle').fill('Reviewed result summary');
  await page.locator('#studioOutputBody').click();
  check(await page.evaluate(()=>document.activeElement?.id)==='studioOutputBody', 'Clicking the output body after editing its title must preserve focus.');
  await page.locator('#studioOutputBody').pressSequentially('A mouse');
  check(await value(page.locator('#studioOutputBody'))==='A mouse', 'Typing reaches the focused output after editing its title.');
  await page.locator('#studioOutputBody').fill(snapshot);
  await action(page,'review-output').click();
  await action(page,'handoff').click();
  await action(page,'confirm-handoff','discussion').click();
  check((await page.locator('#studioPanelContent').textContent()).includes('Reviewed result summary'), 'The chosen recipient sees the passed output in its context.');
  await action(page,'inspect-input').first().click();
  check(await value(page.locator('#dialog textarea'))===snapshot, 'The handoff contains the reviewed text.');
  await action(page,'close-dialog').click();
  await openStage(page,'results');
  await action(page,'side-tab','output').click();
  await page.locator('#studioOutputBody').fill('Later Results edits should not replace the previous reviewed snapshot.');
  await openStage(page,'discussion');
  await action(page,'side-tab','context').click();
  await action(page,'inspect-input').first().click();
  check(await value(page.locator('#dialog textarea'))===snapshot, 'Later source edits must not silently rewrite another agent’s input.');
  await action(page,'close-dialog').click();
}

export const studioBrowserScenarios = [
  ['agent conversations and composer drafts stay scoped to stage and project', stageConversationsStaySeparate],
  ['prepared stage outputs require author review before manuscript insertion', preparedOutputsNeedAuthorReview],
  ['reviewed handoffs are scoped snapshots and editor focus is preserved', reviewedHandoffStaysACopy],
];
