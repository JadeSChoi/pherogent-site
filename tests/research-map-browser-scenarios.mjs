// Shared real-UI scenarios. No localStorage or application-state writes.
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const value=locator=>locator.evaluate(element=>element.value);
const mapAction=(page,action,arg)=>page.locator(`${action==='phase'?'.flow-phase':''}[data-map-action="${action}"]${arg===undefined?'':`[data-map-arg="${arg}"]`}`);
const mapNode=(page,id)=>page.locator(`.flow-item[data-map-arg="${id}"]`);
const studioAction=(page,action,arg)=>page.locator(`[data-studio-action="${action}"]${arg===undefined?'':`[data-studio-arg="${arg}"]`}`);

async function newProject(page,name){
  const dismiss=page.locator('#dialog [data-action="dismiss-intro"]');
  if(await dismiss.isVisible())await dismiss.click();
  await page.locator('[data-action="new-project"]').first().click();
  await page.locator('#newProjectTitle').fill(name);
  await page.locator('#newProjectQuestion').fill('What evidence distinguishes a measured outcome from a proposed mechanism?');
  await page.locator('#dialog').getByRole('button',{name:'Create project',exact:true}).click();
  await openMap(page);
}
async function openMap(page){
  await page.locator('#navigation [data-action="view"][data-arg="map"]').click();
  await page.locator('.research-map-page').waitFor({state:'visible'});
}

export async function mapReflectsReviewedWork(page){
  await newProject(page,'QA · Research workflow author progress');
  check(await page.locator('.flow-phase').count()===4,'Every research phase remains visible.');
  check(await page.locator('.flow-item').count()===2,'The new project focuses the two Plan workspaces.');
  check(await page.locator('[data-map-action="layout"], [data-graph-action], #mapGraph').count()===0,'The obsolete graph and layout controls are removed.');
  await mapAction(page,'phase','develop').click();
  await mapNode(page,'results').click();
  check((await page.locator('#mapInspector h2').textContent())==='Results','Selecting a workspace updates its inspector.');
  check(await page.locator('#studioComposer').count()===0,'Selecting a workspace does not start an agent or open chat.');
  await page.locator('#mapInspector [data-map-action="open"]').click();
  await page.locator('#studioComposer').waitFor({state:'visible'});
  await page.locator('.studio-examples > summary').click();
  await studioAction(page,'demo').first().click();
  check(/prepared|example/i.test(await page.locator('.studio-messages').textContent()),'The example is identified as prepared.');
  check((await value(page.locator('#studioOutputBody'))).trim().length>0,'The selected workspace has an editable output.');
  await openMap(page);
  check((await mapNode(page,'results').getAttribute('aria-label')).includes('Draft'),'A prepared example becomes a draft, never a reviewed result.');
  await page.locator('#mapInspector [data-map-action="review-draft"]').click();
  await studioAction(page,'review-output').click();
  await openMap(page);
  check((await mapNode(page,'results').getAttribute('aria-label')).includes('Reviewed'),'The author review action updates the workspace status.');
  await mapAction(page,'navigate','review').first().click();
  check(await page.locator('.reference-list').count()===0,'Reviewing a section draft never approves manuscript citations.');
}

export async function mapPhaseAndQuestionPersist(page,options={}){
  await newProject(page,'QA · Research phase and brief persistence');
  await mapAction(page,'phase','develop').click();await mapNode(page,'figures').click();
  await mapAction(page,'phase','write').click();
  check(await page.locator('.flow-item').count()===2,'Write shows only its two relevant workspaces.');
  await mapAction(page,'phase','develop').click();
  check((await page.locator('#mapInspector h2').textContent())==='Figures & tables','Returning to a phase restores its selected workspace.');
  await mapAction(page,'edit-question').click();
  const question='Which measurements would distinguish archive retrieval from a similar new state?';
  await page.locator('#mapQuestion').fill(question);
  await page.locator('#mapQuestionForm').getByRole('button',{name:'Save question',exact:true}).click();
  check((await page.locator('.flow-question h2').textContent())===question,'Saving updates the research question.');
  if(options.reload)await options.reload();else await page.reload();
  await page.locator('.research-map-page').waitFor({state:'visible'});
  check(await mapAction(page,'phase','develop').getAttribute('aria-pressed')==='true','Reload retains the active phase.');
  check((await page.locator('#mapInspector h2').textContent())==='Figures & tables','Reload retains the selected workspace.');
  check((await page.locator('.flow-question h2').textContent())===question,'Reload retains the edited question.');
  await mapAction(page,'navigate','manuscript').first().click();
  check(await value(page.locator('#draftText'))==='','Editing the research question never overwrites the manuscript.');
}

export async function mapFiltersAndCopies(page){
  await newProject(page,'QA · Research routes and reviewed copies');
  await mapAction(page,'filter','drafts').click();
  check(await page.locator('.flow-empty').isVisible(),'An empty phase draft filter explains what is missing.');
  await mapAction(page,'filter','all').first().click();
  await mapAction(page,'phase','develop').click();await mapNode(page,'results').click();
  await page.locator('#mapInspector [data-map-action="open"]').click();
  await page.locator('.studio-examples > summary').click();
  await studioAction(page,'demo').first().click();
  await openMap(page);await mapAction(page,'filter','drafts').click();
  check(await page.locator('.flow-item').count()===1,'The phase draft filter shows only its prepared Results draft.');
  check(await page.locator('.map-handoffs').count()===0,'Suggested routes do not manufacture actual handoffs.');
  await page.locator('#mapInspector [data-map-action="review-draft"]').click();
  await studioAction(page,'review-output').click();
  await studioAction(page,'handoff').click();
  await studioAction(page,'confirm-handoff','discussion').click();
  await openMap(page);
  check((await page.locator('.map-handoffs').textContent()).includes('1 passed by you'),'An explicit reviewed copy appears in the workflow.');
  check((await page.locator('.map-handoffs').textContent()).includes('Saved snapshots'),'A handoff is identified as a snapshot.');
  await page.locator('.map-handoffs [data-map-action="context"]').click();
  check((await page.locator('.studio-source-item').textContent()).includes('Reviewed copy from Results'),'The copy link opens the destination context.');
}

export async function mapCrossPhaseRoutesKeepFocus(page){
  await newProject(page,'QA · Research workflow keyboard focus');
  await mapAction(page,'phase','develop').press('Enter');await mapNode(page,'references').click();
  await page.locator('#mapInspector [data-map-action="select"][data-map-arg="introduction"]').click();
  check(await mapAction(page,'phase','write').getAttribute('aria-pressed')==='true','A suggested destination switches to its phase.');
  check((await page.locator('#mapInspector h2').textContent())==='Introduction','The inspector follows the cross-phase selection.');
  check(await mapNode(page,'introduction').isVisible(),'The destination workspace is visible.');
  check(await mapNode(page,'introduction').evaluate(element=>element===document.activeElement),'Keyboard focus follows the destination control.');
  check(await page.locator('#studioComposer').count()===0,'Following a route never starts a conversation.');
}

export const researchMapBrowserScenarios=[
  ['research workflow reflects author-reviewed work without citation approval',mapReflectsReviewedWork],
  ['phase selections and question editing persist on reload',mapPhaseAndQuestionPersist],
  ['phase draft filtering and reviewed copies stay distinct',mapFiltersAndCopies],
  ['cross-phase routes retain keyboard focus and reveal the destination',mapCrossPhaseRoutesKeepFocus],
];
