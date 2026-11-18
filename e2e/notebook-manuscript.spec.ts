import { expect, test } from "@playwright/test";
import { go } from "./helpers";

test("notebook and manuscript edit, append as sections, and persist per project", async ({
  page,
}, testInfo) => {
  // A deep link straight to the Manuscript route (SPA fallback serves it).
  await page.goto("/manuscript");

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

  // A second project (created on the Overview) has its own empty notebook
  // and manuscript…
  await go(page, /^Overview/);
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Axolotl limb regeneration");
  await page.getByRole("button", { name: "Create project" }).click();
  await go(page, /^Manuscript/);
  await expect(page.getByLabel("Findings & interpretation")).toHaveValue("");
  await expect(page.getByLabel("Section 1 text")).toHaveValue("");

  // …and switching back restores the first project's work after a reload.
  await page.reload();
  await go(page, /^Overview/);
  await page
    .getByLabel("Project", { exact: true })
    .selectOption({ label: "Untitled project" });
  await go(page, /^Manuscript/);
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
  await page.goto("/manuscript");

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

test("the review flow runs from the proof-sheet margin and survives reload", async ({
  page,
}) => {
  // A saved source to review against, seeded the way the app stores it.
  // Init scripts rerun on reload, so seed only an empty store — the test
  // relies on the author's decisions surviving the reload.
  await page.addInitScript(() => {
    if (localStorage.getItem("pherogent-workspace-v3")) return;
    localStorage.setItem(
      "pherogent-workspace-v3",
      JSON.stringify({
        version: 3,
        activeProjectId: "project-e2e",
        projects: [
          {
            id: "project-e2e",
            name: "Margin flow",
            question: "",
            createdAt: "2026-11-17T00:00:00.000Z",
            sources: [
              {
                paper: {
                  id: "MED:1",
                  source: "MED",
                  title: "A measured mouse outcome",
                  authors: ["Author A"],
                  year: 2020,
                  journal: "Journal",
                  doi: "",
                  pmid: "",
                  pmcid: "",
                  url: "https://europepmc.org/article/MED/1",
                  abstract:
                    "Visual function improved in aged mice after reprogramming.",
                  openAccess: false,
                },
                note: "",
                status: "useful",
                savedAt: "2026-11-17T00:00:00.000Z",
              },
            ],
            manuscript: {
              title: "",
              sections: [
                {
                  id: "section-e2e",
                  heading: "",
                  text: "Reprogramming restored visual function in aged mice.",
                },
              ],
            },
          },
        ],
      }),
    );
  });
  await page.goto("/manuscript");
  await page.getByRole("button", { name: "Prepare sentences for review" }).click();

  // The section renders as proof text; the sentence opens in the margin.
  const sentence = page.getByRole("button", {
    name: "Reprogramming restored visual function in aged mice.",
  });
  await expect(sentence).toBeVisible();
  const reviewMargin = page.getByRole("complementary", { name: "Evidence review" });
  await reviewMargin
    .getByLabel("Source to check against")
    .selectOption({ label: "A measured mouse outcome" });

  // Keeping the original records an explicit decision as a margin note.
  await reviewMargin.getByRole("button", { name: "Keep original" }).click();
  await expect(reviewMargin.getByText("Original wording kept")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Evidence review" }).getByText(
      "Original wording kept",
    ),
  ).toBeVisible();

  // Undo reopens the sentence for review.
  await page.getByRole("button", { name: "Undo decision" }).click();
  await expect(page.getByText("Original wording kept")).toHaveCount(0);
});

test("importing a Markdown file splits headings into sections after confirmation", async ({
  page,
}) => {
  await page.goto("/manuscript");

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
