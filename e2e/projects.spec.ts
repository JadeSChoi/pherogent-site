import { expect, test } from "@playwright/test";

test("create, switch, and persistence across reload", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New project" }).click();
  await page
    .getByLabel("Project name")
    .fill("Coral bleaching thresholds");
  await page
    .getByLabel("Research question")
    .fill("At what temperature does fixture coral bleach?");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(
    page.getByRole("heading", { name: "Coral bleaching thresholds" }),
  ).toBeVisible();
  await expect(
    page.getByText("At what temperature does fixture coral bleach?"),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Coral bleaching thresholds" }),
  ).toBeVisible();

  await page.getByLabel("Project", { exact: true }).selectOption({ label: "Untitled project" });
  await expect(
    page.getByRole("heading", { name: "Untitled project" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Untitled project" }),
  ).toBeVisible();
});

test("export downloads a full backup and importing it restores the workspace", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Imaginary enzyme kinetics");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(
    page.getByRole("heading", { name: "Imaginary enzyme kinetics" }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pherogent-workspace-backup.json");
  const backupPath = testInfo.outputPath("backup.json");
  await download.saveAs(backupPath);

  // A fresh browser profile: nothing stored.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Untitled project" }),
  ).toBeVisible();

  await page.getByLabel("Import backup file").setInputFiles(backupPath);
  await page.getByRole("button", { name: "Replace workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Imaginary enzyme kinetics" }),
  ).toBeVisible();
});

test("a v2-format backup imports with its Projects intact", async ({ page }) => {
  await page.goto("/");

  await page
    .getByLabel("Import backup file")
    .setInputFiles("src/storage/fixtures/v2-multi-project.json");
  await page.getByRole("button", { name: "Replace workspace" }).click();

  await expect(
    page.getByRole("heading", { name: "Coral bleaching thresholds" }),
  ).toBeVisible();
  await expect(page.getByLabel("Project", { exact: true }).locator("option")).toHaveText([
    "Coral bleaching thresholds",
    "Axolotl limb regeneration",
    "Cellular Blockchain · Reversal",
  ]);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Coral bleaching thresholds" }),
  ).toBeVisible();
});

test("a malformed import is rejected without touching existing data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Keep me safe");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Keep me safe" })).toBeVisible();

  await page.getByLabel("Import backup file").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{not json"),
  });

  await expect(
    page.getByRole("alert").filter({ hasText: "not valid JSON" }),
  ).toContainText("Nothing was changed");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Keep me safe" })).toBeVisible();
});
