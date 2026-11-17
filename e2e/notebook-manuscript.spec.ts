import { expect, test } from "@playwright/test";

test("notebook and manuscript edit, append, and persist per project", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await page
    .getByLabel("Findings & interpretation")
    .fill("OSK restores vision in aged mice.");
  await page.getByLabel("Limitations & alternatives").fill("Mouse models only.");
  await page.getByLabel("Working hypothesis").fill("Reprogramming is reversible.");
  await page
    .getByLabel("Next experiment or question")
    .fill("Test visual recovery in aged primates.");

  await page.getByLabel("Document title").fill("Reprogramming draft");
  await page.getByLabel("Manuscript text").fill("Existing opening paragraph.");

  // Appending adds the notes after the existing text, never replacing it.
  await page.getByRole("button", { name: "Add notes to manuscript" }).click();
  await expect(page.getByLabel("Manuscript text")).toHaveValue(
    "Existing opening paragraph.\n\n## Findings notes\n\nOSK restores vision in aged mice.\n\n## Limitations\n\nMouse models only.",
  );
  await page.getByRole("button", { name: "Add notes to manuscript" }).click();
  await expect(page.getByText("These notes are already in the manuscript.")).toBeVisible();

  // Everything persists across a reload.
  await page.reload();
  await expect(page.getByLabel("Working hypothesis")).toHaveValue(
    "Reprogramming is reversible.",
  );
  await expect(page.getByLabel("Document title")).toHaveValue("Reprogramming draft");
  await expect(page.getByLabel("Manuscript text")).toHaveValue(
    /^Existing opening paragraph\./,
  );

  // The export downloads the manuscript as Markdown.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export manuscript (.md)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pherogent-manuscript.md");
  const exportPath = testInfo.outputPath("manuscript.md");
  await download.saveAs(exportPath);
  const { readFile } = await import("node:fs/promises");
  const markdown = await readFile(exportPath, "utf8");
  expect(markdown.startsWith("# Reprogramming draft\n\nExisting opening paragraph.")).toBe(
    true,
  );

  // A second project has its own empty notebook and manuscript…
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Axolotl limb regeneration");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByLabel("Findings & interpretation")).toHaveValue("");
  await expect(page.getByLabel("Manuscript text")).toHaveValue("");
  await page.getByLabel("Findings & interpretation").fill("Blastema cells dedifferentiate.");

  // …and switching back restores the first project's work after a reload.
  await page.reload();
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Untitled project" });
  await expect(page.getByLabel("Findings & interpretation")).toHaveValue(
    "OSK restores vision in aged mice.",
  );
  await expect(page.getByLabel("Manuscript text")).toHaveValue(
    /^Existing opening paragraph\./,
  );
});

test("importing a text file asks before replacing existing manuscript text", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Manuscript text").fill("Original writing.");
  await page.getByLabel("Import manuscript file").setInputFiles({
    name: "draft.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Imported replacement paragraph."),
  });

  await page.getByRole("button", { name: "Replace manuscript text" }).click();
  await expect(page.getByLabel("Manuscript text")).toHaveValue(
    "Imported replacement paragraph.",
  );

  await page.reload();
  await expect(page.getByLabel("Manuscript text")).toHaveValue(
    "Imported replacement paragraph.",
  );
});
