import { expect, test } from "@playwright/test";
import { go } from "./helpers";

const paperTitle =
  "Reprogramming to recover youthful epigenetic information and restore vision.";

test.beforeEach(async ({ page }) => {
  // The deterministic bibliographic fixture: this test covers the Overview,
  // not Europe PMC itself.
  await page.route(
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search*",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
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
                isOpenAccess: "Y",
                abstractText:
                  "Ectopic expression of Oct4, Sox2 and Klf4 genes in mouse retinal ganglion cells promotes axon regeneration after injury.",
              },
            ],
          },
        }),
      }),
  );
});

test("the summary leads the Overview and its one next action follows the project's state", async ({
  page,
}) => {
  await page.goto("/");

  const summary = page.getByRole("region", { name: "Project summary" });
  const row = (label: string) =>
    summary.locator(".overview-row", {
      has: page.getByText(label, { exact: true }),
    });

  // A fresh project: the head leads, every figure is real, no API status.
  await expect(
    summary.getByRole("heading", { name: "Untitled project" }),
  ).toBeVisible();
  await expect(row("Saved sources")).toContainText("0");
  await expect(row("Words")).toContainText("0");
  await expect(row("Sentences decided")).toContainText("None to review yet");
  await expect(page.getByText("API status")).toHaveCount(0);

  // The backup controls are still on the page, after the summary.
  await expect(
    page.getByRole("region", { name: "Projects and backups" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export backup" })).toBeVisible();

  // Exactly one primary action; for an empty project it leads to the Library.
  await expect(page.locator(".shell-page .ui-button-primary:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Save your first source" }).click();
  await expect(page.getByLabel("Search Europe PMC")).toBeVisible();

  await page.getByLabel("Search Europe PMC").fill("OSK glaucoma mice");
  await page.getByRole("button", { name: "Search papers" }).click();
  await page.getByRole("button", { name: "Inspect" }).click();
  await page.getByRole("button", { name: "Save to project" }).click();

  // The summary updates with the project's data and the action advances.
  await go(page, /Overview/);
  await expect(row("Saved sources")).toContainText("1");
  await expect(page.locator(".shell-page .ui-button-primary:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Start the manuscript" }).click();
  await expect(page.getByLabel("Document title")).toBeVisible();

  await page
    .getByLabel("Section 1 text")
    .fill("Reprogramming restored visual function in aged mice.");

  await go(page, /Overview/);
  await expect(row("Words")).toContainText("7");
  await expect(row("Sentences decided")).toContainText("0 of 1");
  await expect(page.locator(".shell-page .ui-button-primary:visible")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Prepare sentences for review" }),
  ).toBeVisible();
});
