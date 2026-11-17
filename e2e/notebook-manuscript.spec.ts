import { expect, test } from "@playwright/test";

test("notebook and manuscript edit, append as sections, and persist per project", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await page
    .getByLabel("Findings & interpretation")
    .fill("OSK restores vision in aged mice.");
  await page.getByLabel("Limitations & alternatives").fill("Mouse models only.");
  await page.getByLabel("Working hypothesis").fill("Reprogramming is reversible.");

  await page.getByLabel("Document title").fill("Reprogramming draft");
  await page.getByLabel("Section 1 text").fill("Existing opening paragraph.");

  // Appending adds new sections after the existing one, never altering it.
  await page.getByRole("button", { name: "Add notes to manuscript" }).click();
  await expect(page.getByLabel("Section 1 text")).toHaveValue(
    "Existing opening paragraph.",
  );
  await expect(page.getByLabel("Section 2 heading")).toHaveValue("Findings notes");
  await expect(page.getByLabel("Section 2 text")).toHaveValue(
    "OSK restores vision in aged mice.",
  );
  await expect(page.getByLabel("Section 3 heading")).toHaveValue("Limitations");
  await page.getByRole("button", { name: "Add notes to manuscript" }).click();
  await expect(
    page.getByText("These notes are already in the manuscript."),
  ).toBeVisible();

  // Everything persists across a reload (saves are throttled, so the
  // trailing write must have flushed by navigation).
  await page.reload();
  await expect(page.getByLabel("Working hypothesis")).toHaveValue(
    "Reprogramming is reversible.",
  );
  await expect(page.getByLabel("Document title")).toHaveValue("Reprogramming draft");
  await expect(page.getByLabel("Section 1 text")).toHaveValue(
    "Existing opening paragraph.",
  );
  await expect(page.getByLabel("Section 2 heading")).toHaveValue("Findings notes");

  // The export is one Markdown document.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export manuscript (.md)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("pherogent-manuscript.md");
  const exportPath = testInfo.outputPath("manuscript.md");
  await download.saveAs(exportPath);
  const { readFile } = await import("node:fs/promises");
  const markdown = await readFile(exportPath, "utf8");
  expect(
    markdown.startsWith("# Reprogramming draft\n\nExisting opening paragraph."),
  ).toBe(true);
  expect(markdown).toContain("## Findings notes\n\nOSK restores vision in aged mice.");

  // A second project has its own empty notebook and manuscript…
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Axolotl limb regeneration");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByLabel("Findings & interpretation")).toHaveValue("");
  await expect(page.getByLabel("Section 1 text")).toHaveValue("");

  // …and switching back restores the first project's work after a reload.
  await page.reload();
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Untitled project" });
  await expect(page.getByLabel("Section 1 text")).toHaveValue(
    "Existing opening paragraph.",
  );
  await expect(page.getByLabel("Section 2 text")).toHaveValue(
    "OSK restores vision in aged mice.",
  );
});

test("a manuscript larger than the old 12,000-character cap writes, exports, and re-imports", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  // 15,000 characters in one section — impossible before ADR 0004.
  const longText = ("Fixture sentences about reef thresholds. ".repeat(400)).trim();
  expect(longText.length).toBeGreaterThan(12000);
  await page.getByLabel("Section 1 text").fill(longText);
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByLabel("Section 2 heading").fill("Methods");
  await page.getByLabel("Section 2 text").fill("We measured fixture things.");

  await page.reload();
  await expect(page.getByLabel("Section 1 text")).toHaveValue(longText);
  await expect(page.getByLabel("Section 2 heading")).toHaveValue("Methods");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export manuscript (.md)" }).click();
  const download = await downloadPromise;
  const exportPath = testInfo.outputPath("long-manuscript.md");
  await download.saveAs(exportPath);
  const { readFile } = await import("node:fs/promises");
  const markdown = await readFile(exportPath, "utf8");
  expect(markdown).toContain(longText);
  expect(markdown).toContain("## Methods");

  // Re-importing the export reproduces the sections (replacing the draft).
  await page.getByLabel("Import manuscript file").setInputFiles(exportPath);
  await page.getByRole("button", { name: "Replace manuscript text" }).click();
  await expect(page.getByLabel("Section 1 text")).toHaveValue(longText);
  await expect(page.getByLabel("Section 2 heading")).toHaveValue("Methods");
  await expect(page.getByLabel("Section 2 text")).toHaveValue(
    "We measured fixture things.",
  );
});

test("importing a Markdown file splits headings into sections after confirmation", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Section 1 text").fill("Original writing.");
  await page.getByLabel("Import manuscript file").setInputFiles({
    name: "draft.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# Imported draft\n\nImported opening.\n\n## Methods\n\nImported methods.",
    ),
  });

  await page.getByRole("button", { name: "Replace manuscript text" }).click();
  await expect(page.getByLabel("Document title")).toHaveValue("Imported draft");
  await expect(page.getByLabel("Section 1 text")).toHaveValue("Imported opening.");
  await expect(page.getByLabel("Section 2 heading")).toHaveValue("Methods");

  await page.reload();
  await expect(page.getByLabel("Section 2 text")).toHaveValue("Imported methods.");
});
