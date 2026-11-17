// Shared real UI missions. Runs with Playwright or the managed browser adapter.
// No direct localStorage/app-state writes and no automatic scientific approvals.
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const value=locator=>locator.evaluate(element=>element.value);

async function closeIntro(page){
  const dismiss=page.locator('#dialog [data-action="dismiss-intro"]');
  if(await dismiss.isVisible())await dismiss.click();
}
async function pauseIfActive(page){
  const pause=page.locator('#tutorialPause');
  if(await pause.isVisible())await pause.click();
}
async function freshTutorial(page){
  await closeIntro(page);
  await pauseIfActive(page);
  await page.locator('[data-action="help"]').first().click();
  const restart=page.locator('#dialog [data-action="restart-tutorial"]');
  if(await restart.isVisible())await restart.click();
  else await page.locator('#dialog [data-action="start-tutorial"]').click();
  await page.locator('#tutorialCoach').waitFor({state:'visible'});
  check(await page.locator('#tutorialProgress').getAttribute('aria-valuenow')==='0','A fresh tutorial starts at the research question');
}
async function next(page){
  await page.locator('#tutorialNext:not([disabled])').waitFor({state:'visible'});
  await page.locator('#tutorialNext').click();
}
async function reload(page,options){
  if(options?.reload)await options.reload();
  else await page.reload();
}

export async function preparedTutorialKeepsOwnProject(page){
  await closeIntro(page);await pauseIfActive(page);
  await page.locator('[data-action="new-project"]').first().click();
  await page.locator('#newProjectTitle').fill('My research stays separate');
  await page.locator('#newProjectQuestion').fill('How should I test an independent hypothesis?');
  await page.locator('#dialog').getByRole('button',{name:'Create project',exact:true}).click();
  await page.locator('#navigation [data-arg="manuscript"]').click();
  const ownWriting='My original research paragraph must remain untouched by the guided practice project.';
  await page.locator('#draftText').fill(ownWriting);

  await freshTutorial(page);
  check((await page.locator('#projectContext').textContent()).includes('Practice project'),'The walkthrough uses a visibly separate practice project');
  await next(page); // Search
  check(!(await page.locator('#tutorialNext').isEnabled()),'Search mission cannot advance before a result or explicit fallback');
  check((await value(page.locator('#searchQuery'))).includes('33268865'),'The search is prefilled without submitting');
  check((await page.locator('#searchResults').textContent()).trim()==='','Starting the tutorial does not send a live search');
  await page.locator('[data-tour-action="prepared-paper"]').click();
  check((await page.locator('#tutorialCoach').textContent()).includes('Prepared'),'The offline path is labelled prepared');
  await next(page); // Source already explicitly saved
  await next(page); // Reading note
  await page.locator('[data-tour-action="example-note"]').click();
  const note=await value(page.locator('[data-source-note="MED:33268865"]'));
  check(note.length>10,'The optional example populates a real editable source note');
  check(!(await page.locator('#tutorialNext').isEnabled()),'A source note still needs to be added to the notebook');
  await page.locator('[data-action="source-to-notebook"][data-arg="MED:33268865"]').click();
  check((await value(page.locator('#researchAnalysisNotes'))).includes(note),'The actual notebook receives the note');
  await next(page); // Draft
  await page.locator('[data-tour-action="example-draft"]').click();
  check((await value(page.locator('#draftText'))).includes('reading a preserved cellular archive'),'The teaching sentence explicitly overstates the archive mechanism');
  check(!(await page.locator('#tutorialNext').isEnabled()),'Typing alone does not falsely complete preparation');
  await page.getByRole('button',{name:'Prepare sentences for review',exact:true}).click();
  await next(page); // Passage
  check(await page.locator('.reference-list').count()===0,'The guide has not inserted a citation');
  await page.locator('[data-tour-action="example-evidence"]').click();
  check((await page.locator('#quoteMatch').textContent()).includes('Passage found'),'The prepared quotation passes the ordinary text checker');
  check(await page.locator('.reference-list').count()===0,'Loading a review suggestion is not author approval');
  await next(page); // Author decision
  check(!(await page.locator('#tutorialNext').isEnabled()),'Approval mission waits for the actual author decision');
  await page.getByRole('button',{name:'Apply wording + citation',exact:true}).click();
  if(await page.locator('#dialog [data-action="confirm-low-overlap"]').isVisible())await page.locator('#dialog [data-action="confirm-low-overlap"]').click();
  check(await page.locator('.reference-list').count()===1,'Author approval inserts the citation through the existing app');
  await next(page); // Finish
  check(await page.locator('#tutorialProgress').getAttribute('aria-valuenow')==='7','The completed research loop reaches the final milestone');
  await page.locator('[data-tour-action="return"]').click();
  check((await page.locator('#projectLabel').textContent()).includes('My research stays separate'),'The completion control returns to the original project');
  await page.locator('#navigation [data-arg="manuscript"]').click();
  check(await value(page.locator('#draftText'))===ownWriting,'The original manuscript is unchanged');
}

export async function tutorialPauseReloadAndLiveSearch(page,options={}){
  await freshTutorial(page);
  await next(page);
  const progress=await page.locator('#tutorialProgress').getAttribute('aria-valuenow');
  await page.locator('#tutorialPause').click();
  await page.locator('#tutorialResume').waitFor({state:'visible'});
  check(!(await page.locator('#tutorialCoach').isVisible()),'Pausing leaves the working product unobscured');
  await reload(page,options);
  await page.locator('#tutorialResume').waitFor({state:'visible'});
  await page.locator('#tutorialResume').click();
  check(await page.locator('#tutorialProgress').getAttribute('aria-valuenow')===progress,'Resume after reload restores the unfinished mission');
  check((await page.locator('#searchResults').textContent()).trim()==='','Resuming does not submit a search');
  await page.getByRole('button',{name:'Search papers',exact:true}).click();
  await page.getByRole('button',{name:'Inspect abstract',exact:true}).first().waitFor({state:'visible'});
  await next(page);
  check(!(await page.locator('#tutorialNext').isEnabled()),'A returned source still needs a deliberate save');
  await page.getByRole('button',{name:'Inspect abstract',exact:true}).first().click();
  check(await page.locator('#dialog').isVisible(),'The guide permits the real source-inspection dialog');
  await page.getByRole('button',{name:'Save to project sources',exact:true}).click();
  await page.locator('#tutorialNext:not([disabled])').waitFor({state:'visible'});
  await next(page);
  check(await page.locator('[data-source-note="MED:33268865"]').isVisible(),'A live result becomes an editable project source');
  await page.locator('#tutorialPause').click();
}

export const tutorialBrowserScenarios=[
  ['prepared tutorial completes through real actions and preserves personal research',preparedTutorialKeepsOwnProject],
  ['tutorial pauses, reloads, resumes and saves a live source',tutorialPauseReloadAndLiveSearch],
];
