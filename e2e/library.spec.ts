import { expect, test } from "@playwright/test";
import { go } from "./helpers";

const paperTitle =
  "Reprogramming to recover youthful epigenetic information and restore vision.";

test.beforeEach(async ({ page }) => {
  // The deterministic bibliographic fixture carried over from the legacy
  // browser suite: these tests cover the Library UI, not Europe PMC itself.
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
                pmcid: "PMC7752134",
                title: paperTitle,
                authorString: "Lu Y, Brommer B, Tian X",
                pubYear: "2020",
                journalInfo: { journal: { title: "Nature" } },
                doi: "10.1038/s41586-020-2975-4",
                isOpenAccess: "Y",
                abstractText:
                  "Ageing is a degenerative process that leads to tissue dysfunction and death. Ectopic expression of Oct4, Sox2 and Klf4 genes in mouse retinal ganglion cells promotes axon regeneration after injury, and reverses vision loss in a mouse model of glaucoma and in aged mice.",
              },
            ],
          },
        }),
      }),
  );
  // A deep link straight to the Library route (SPA fallback serves it).
  await page.goto("/library");
});

test("search, inspect, and save a paper with a reading note, persisted across reload", async ({
  page,
}) => {
  await page.getByLabel("Search Europe PMC").fill("OSK glaucoma mice");
  await page.getByRole("button", { name: "Search papers" }).click();
  await expect(page.getByText(paperTitle)).toBeVisible();

  // Inspect before saving: abstract and metadata are readable in the dialog.
  await page.getByRole("button", { name: "Inspect" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/retinal ganglion cells/)).toBeVisible();
  await expect(dialog.getByText(/Nature, 2020/)).toBeVisible();
  await expect(dialog.getByText("DOI: 10.1038/s41586-020-2975-4")).toBeVisible();
  await expect(dialog.getByText(/does not approve evidence/)).toBeVisible();

  await dialog.getByRole("button", { name: "Save to project" }).click();
  const savedRegion = page.getByRole("region", { name: "Saved sources" });
  await expect(savedRegion.getByText(paperTitle)).toBeVisible();
  // A saved paper is visibly not a citation approval.
  await expect(
    savedRegion.getByText("Saved for reading — not an approved citation"),
  ).toBeVisible();

  const note =
    "The abstract concerns mouse visual function; clinical generalization needs separate evidence.";
  await page.getByLabel("Reading note").fill(note);
  await page.getByLabel("Reading status").selectOption("useful");

  await page.reload();
  await expect(savedRegion.getByText(paperTitle)).toBeVisible();
  await expect(page.getByLabel("Reading note")).toHaveValue(note);
  await expect(page.getByLabel("Reading status")).toHaveValue("useful");

  // The ledger's chips filter by reading status.
  await savedRegion.getByRole("button", { name: "Useful 1" }).click();
  await expect(savedRegion.getByText(paperTitle)).toBeVisible();
  await savedRegion.getByRole("button", { name: "To read 0" }).click();
  await expect(savedRegion.getByText(paperTitle)).toHaveCount(0);
  await expect(
    savedRegion.getByText("No saved source has this reading status yet."),
  ).toBeVisible();
  await savedRegion.getByRole("button", { name: "All 1" }).click();
  await expect(savedRegion.getByText(paperTitle)).toBeVisible();

  // The saved source's abstract and metadata stay inspectable after saving
  // and reloading, still presented as reading material rather than a citation.
  await savedRegion.getByRole("button", { name: "Inspect" }).click();
  const reopened = page.getByRole("dialog");
  await expect(reopened.getByText(/retinal ganglion cells/)).toBeVisible();
  await expect(reopened.getByText("DOI: 10.1038/s41586-020-2975-4")).toBeVisible();
  await expect(reopened.getByText(/not an approved citation/)).toBeVisible();
});

test("saved sources stay isolated per project across switches and reloads", async ({
  page,
}) => {
  await page.getByLabel("Search Europe PMC").fill("OSK glaucoma mice");
  await page.getByRole("button", { name: "Search papers" }).click();
  await page.getByRole("button", { name: "Inspect" }).click();
  await page.getByRole("button", { name: "Save to project" }).click();
  const savedRegion = page.getByRole("region", { name: "Saved sources" });
  await expect(savedRegion.getByText(paperTitle)).toBeVisible();

  // A second project (created on the Overview) starts with no saved sources.
  await go(page, /^Overview/);
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Axolotl limb regeneration");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(
    page.getByRole("heading", { name: "Axolotl limb regeneration" }),
  ).toBeVisible();
  await go(page, /^Library/);
  await expect(savedRegion).toHaveCount(0);

  // Switching back restores the first project's collection, and the
  // separation survives a reload.
  await go(page, /^Overview/);
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Untitled project" });
  await go(page, /^Library/);
  await expect(savedRegion.getByText(paperTitle)).toBeVisible();

  await page.reload();
  await expect(savedRegion.getByText(paperTitle)).toBeVisible();
  await go(page, /^Overview/);
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Axolotl limb regeneration" });
  await go(page, /^Library/);
  await expect(savedRegion).toHaveCount(0);
});
