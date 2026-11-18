import { expect, test } from "@playwright/test";
import { go } from "./helpers";

test("the prepared example demonstrates the whole flow with zero AI calls", async ({
  page,
}) => {
  await page.goto("/chat");

  // The one surface reaches all eleven sections.
  const picker = page.getByRole("navigation", { name: "Sections" });
  for (const label of ["Research organizer", "Data processing", "Final review"]) {
    await expect(picker.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  }

  await page.getByRole("button", { name: "Load the prepared example" }).click();
  await expect(page.getByText("Prepared example · no AI ran")).toBeVisible();
  await expect(page.getByText(/prewritten example/)).toBeVisible();

  // The prepared draft applies, reviews, and appends like a live one.
  await page.getByRole("button", { name: "Use as section draft" }).click();
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByRole("button", { name: "Add a copy to Manuscript" }).click();
  await expect(page.getByText(/Added to the Manuscript as a new section/)).toBeVisible();

  // Zero AI calls were made: the ledger holds no runs for this visitor.
  const status = await page.evaluate(
    () =>
      fetch("/api/agent/status").then((response) => response.json()) as Promise<{
        budget: { userRunsToday: number };
      }>,
  );
  expect(status.budget.userRunsToday).toBe(0);
});

test("a consented section chat runs end to end against the faked provider", async ({
  page,
}) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: /Methods/ }).click();
  await page.getByLabel("Message").fill("How should I describe the perfusion?");
  await page.getByRole("button", { name: "Preview & send" }).click();

  // Consent is on the exact outgoing message and bounded context; the
  // envelope names only the section id — no prompt, model, or budget.
  const dialog = page.getByRole("dialog");
  const outgoing = dialog.locator(".evidence-check-outgoing");
  await expect(outgoing).toContainText('"consent": true');
  await expect(outgoing).toContainText('"stage": "methods"');
  await expect(outgoing).toContainText("How should I describe the perfusion?");
  const consent = dialog.getByRole("button", { name: "Consent and send" });
  await expect(consent).toBeEnabled();
  await consent.click();

  // The reply lands in the Methods conversation through the real route,
  // ledger, and runSectionReply pipeline.
  await expect(
    page.getByText(/For the methods section, on "How should I describe the perfusion\?"/),
  ).toBeVisible();
  await expect(page.getByText("AI reply · author review required")).toBeVisible();

  // Apply the suggested draft, review it, and append it to the Manuscript.
  await page.getByRole("button", { name: "Use as section draft" }).click();
  await expect(page.getByLabel("Draft text")).toHaveValue(/Mice were perfused/);
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByRole("button", { name: "Add a copy to Manuscript" }).click();
  await expect(page.getByText(/Added to the Manuscript as a new section/)).toBeVisible();

  // The copy is a new Section after the original, which is untouched.
  await go(page, /Manuscript/);
  await expect(page.getByLabel("Section 2 heading")).toHaveValue("Methods");
  await expect(page.getByLabel("Section 2 text")).toHaveValue(/Mice were perfused/);
  await expect(page.getByLabel("Section 1 text")).toHaveValue("");

  // The conversation and draft survive navigation and reload.
  await go(page, /Section chat/);
  await page.reload();
  await expect(page.getByText("AI reply · author review required")).toBeVisible();
  await expect(page.getByLabel("Draft text")).toHaveValue(/Mice were perfused/);

  // The run reserved and completed in the durable ledger.
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
});
