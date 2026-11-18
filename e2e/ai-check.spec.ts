import { expect, test } from "@playwright/test";
import { go } from "./helpers";

const paperTitle =
  "Reprogramming to recover youthful epigenetic information and restore vision.";
const SENTENCE = "Partial reprogramming restores vision in people with glaucoma.";

// The browser-side Library search fixture (the worker-side Europe PMC lookup
// is served by the e2e Worker entry's own fake, not by this route).
const searchFixture = JSON.stringify({
  hitCount: 1,
  resultList: {
    result: [
      {
        id: "33268865",
        source: "MED",
        pmid: "33268865",
        title: paperTitle,
        authorString: "Lu Y, Brommer B, Tian X",
        pubYear: "2020",
        journalInfo: { journal: { title: "Nature" } },
        doi: "10.1038/s41586-020-2975-4",
        isOpenAccess: "N",
        abstractText:
          "Ectopic expression of Oct4, Sox2 and Klf4 genes in mouse retinal ganglion cells " +
          "promotes axon regeneration after injury, and reverses vision loss in a mouse " +
          "model of glaucoma and in aged mice.",
      },
    ],
  },
});

test("the consented AI Evidence check runs end to end against the faked provider", async ({
  page,
}) => {
  await page.route(
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: searchFixture,
      }),
  );

  // Save the source the check will cite.
  await page.goto("/library");
  await page.getByLabel("Search Europe PMC").fill("OSK glaucoma mice");
  await page.getByRole("button", { name: "Search papers" }).click();
  await page.getByRole("button", { name: "Inspect" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save to project" }).click();
  await expect(
    page.getByRole("region", { name: "Saved sources" }).getByText(paperTitle),
  ).toBeVisible();

  // Write the sentence and prepare it for review.
  await go(page, /Manuscript/);
  await page.getByLabel("Section 1 text").fill(SENTENCE);
  await page.getByRole("button", { name: "Prepare sentences for review" }).click();

  // Select the source and preview: the exact outgoing content, not sent yet.
  await page.getByRole("checkbox", { name: paperTitle }).check();
  await page.getByRole("button", { name: "Preview AI check" }).click();
  const consentDialog = page.getByRole("dialog");
  const outgoing = consentDialog.locator(".evidence-check-outgoing");
  await expect(outgoing).toContainText('"consent": true');
  await expect(outgoing).toContainText(SENTENCE);
  await expect(outgoing).toContainText("MED:33268865");
  const consent = consentDialog.getByRole("button", { name: "Consent and send" });
  await expect(consent).toBeEnabled();

  // Consent runs the check through the real route, reservation ledger, and
  // verification pipeline, against the entry's fake provider.
  await consent.click();
  await expect(page.getByText("AI suggestion")).toBeVisible();

  // The three records are distinct: the AI suggestion, the code check, and
  // the (not yet recorded) author decision.
  await expect(page.getByText("Code check")).toBeVisible();
  await expect(page.getByText("Author decision")).toBeVisible();
  await expect(
    page.getByText("Suggests partial support — narrower wording proposed"),
  ).toBeVisible();
  await expect(
    page.getByText("reverses vision loss in a mouse model of glaucoma and in aged mice"),
  ).toBeVisible();
  await expect(page.getByText(/verified this quote appears verbatim/)).toBeVisible();
  await expect(page.getByText(/No decision has been recorded/)).toBeVisible();

  // The run reserved its allowance in the durable ledger and completed.
  // This browser context is a fresh visitor, so its ledger rows are exactly
  // this one run: the fake provider's 200 input + 100 output tokens.
  const status = await page.evaluate(
    () =>
      fetch("/api/agent/status").then((response) => response.json()) as Promise<{
        budget: { userRunsToday: number };
        usage: { modelCalls: number; totalTokens: number };
      }>,
  );
  expect(status.budget.userRunsToday).toBe(1);
  expect(status.usage.modelCalls).toBe(1);
  expect(status.usage.totalTokens).toBe(300);

  // The stored records survive a reload; the decision stays the author's.
  await page.reload();
  await expect(page.getByText("AI suggestion")).toBeVisible();
  await expect(page.getByText("Author decision")).toBeVisible();

  // The author decides — and all three records stay visible and distinct,
  // the decision now the author's own note rather than the placeholder.
  await page.getByRole("button", { name: "Keep original" }).click();
  await expect(page.getByText("Original wording kept")).toBeVisible();
  await expect(page.getByText("AI suggestion")).toBeVisible();
  await expect(page.getByText("Code check")).toBeVisible();
  await expect(page.getByText("Author decision")).toBeVisible();
  await expect(page.getByText(/No decision has been recorded/)).not.toBeVisible();

  // The usage meter renders this same run from the real status endpoint:
  // the fake provider's 300 reported tokens, this visitor's remaining runs
  // against the e2e config's 1,000, and the configured prices date.
  await go(page, /Usage/);
  const reported = page.getByRole("group", { name: "Reported usage" });
  await expect(reported.getByText("300", { exact: true })).toBeVisible();
  // 200 input tokens at the conservative reserved rate (2.5 micros) plus
  // 100 output tokens at 12 micros: 1,700 microdollars.
  await expect(reported.getByText("$0.0017")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Remaining allowance" }).getByText("999 of 1,000"),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Reservations held" }).getByText(/not charges/),
  ).toBeVisible();
  await expect(
    page.getByText(/Prices behind the estimates last verified 2026-11-17/),
  ).toBeVisible();
});
