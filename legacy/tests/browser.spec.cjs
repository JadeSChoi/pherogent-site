'use strict';
const { test } = require('playwright/test');

test.beforeEach(async ({ page }) => {
  // Deterministic bibliographic fixture; these browser regressions test the UI,
  // not availability or coverage of Europe PMC. The live API is checked separately.
  await page.route('https://www.ebi.ac.uk/europepmc/webservices/rest/search*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      hitCount: 1,
      resultList: { result: [{
        id: '33268865', source: 'MED', pmid: '33268865', pmcid: 'PMC7752134',
        title: 'Reprogramming to recover youthful epigenetic information and restore vision.',
        authorString: 'Lu Y, Brommer B, Tian X', pubYear: '2020',
        journalInfo: { journal: { title: 'Nature' } },
        doi: '10.1038/s41586-020-2975-4', isOpenAccess: 'Y',
        abstractText: 'Ageing is a degenerative process that leads to tissue dysfunction and death. Ectopic expression of Oct4, Sox2 and Klf4 genes in mouse retinal ganglion cells promotes axon regeneration after injury, and reverses vision loss in a mouse model of glaucoma and in aged mice.',
      }] },
    }),
  }));
  await page.goto('/');
});

for (const [name, scenario] of [
  ['pasted paragraph prepares with one click', 'singleClickPrepare'],
  ['title-to-paragraph click preserves focus and typing', 'titleToParagraphFocus'],
  ['selected sentence prefills search without sending it', 'selectedSentencePrefill'],
  ['low keyword overlap requires author confirmation', 'lowOverlapApproval'],
  ['projects, tasks and editable sample preserve independent work', 'productResearchFlow'],
  ['source notes flow to notebook without approving a citation', 'discoveryDoesNotApprove'],
]) {
  test(name, async ({ page }) => {
    const scenarios = await import('./browser-scenarios.mjs');
    await scenarios[scenario](page);
  });
}

for (const [name,scenario] of [
  ['prepared tutorial completes through real actions and preserves personal research','preparedTutorialKeepsOwnProject'],
  ['tutorial pauses, reloads, resumes and saves a live source','tutorialPauseReloadAndLiveSearch'],
]) {
  test(name, async ({page})=>{
    const scenarios=await import('./tutorial-browser-scenarios.mjs');
    await scenarios[scenario](page);
  });
}

test.describe('Research agent studio', () => {
  for (const index of [0, 1, 2]) {
    test(`studio interaction ${index + 1}`, async ({page}) => {
      const {studioBrowserScenarios} = await import('./studio-browser-scenarios.mjs');
      await studioBrowserScenarios[index][1](page);
    });
  }
});

test.describe('Research map', () => {
  for (const [name,scenario] of [
    ['author-reviewed map status','mapReflectsReviewedWork'],
    ['phase and question persistence','mapPhaseAndQuestionPersist'],
    ['draft filters and reviewed copies','mapFiltersAndCopies'],
    ['cross-phase keyboard navigation','mapCrossPhaseRoutesKeepFocus'],
  ]) {
    test(name, async ({page}) => {
      const scenarios = await import('./research-map-browser-scenarios.mjs');
      await scenarios[scenario](page);
    });
  }
});
