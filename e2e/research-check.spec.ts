import { expect, test } from "@playwright/test";
import { go } from "./helpers";

const QUESTION = "Does OSK partial reprogramming restore vision?";
const paperTitle =
  "Reprogramming to recover youthful epigenetic information and restore vision.";

test("the consented Research check runs end to end against the faked provider", async ({
  page,
}) => {
  await page.goto("/research");

  // Ask the question and preview: the exact outgoing content, not sent yet.
  await page.getByLabel("Research question").fill(QUESTION);
  await page.getByRole("button", { name: "Preview Research check" }).click();
  const consentDialog = page.getByRole("dialog");
  const outgoing = consentDialog.locator(".research-check-outgoing");
  await expect(outgoing).toContainText('"consent": true');
  await expect(outgoing).toContainText(QUESTION);
  const consent = consentDialog.getByRole("button", { name: "Consent and send" });
  await expect(consent).toBeEnabled();

  // Consent runs the full freeform pipeline — plan, search, screen, read,
  // judge, verify — through the real route, reservation ledger, and quote
  // verification, against the entry's fake provider and fake Europe PMC.
  await consent.click();
  await expect(page.getByText("AI research note")).toBeVisible();

  // The progress list is the server's own streamed steps.
  const progress = page.getByRole("list", { name: "Run progress" });
  await expect(progress).toContainText("Searching Europe PMC: OSK reprogramming vision");
  await expect(progress).toContainText("exact quotations verified against retrieved text");

  // The note: code-built established findings, model uncertainties, and the
  // evidence card whose quote the server verified verbatim.
  await expect(
    page.getByText("Partial reprogramming reversed vision loss in aged mice. [MED:33268865]"),
  ).toBeVisible();
  await expect(
    page.getByText("Human evidence was not reported in this abstract."),
  ).toBeVisible();
  await expect(
    page.getByText("reverses vision loss in a mouse model of glaucoma and in aged mice"),
  ).toBeVisible();
  await expect(page.getByText(/verified this quote appears verbatim/)).toBeVisible();

  // Nothing reached the Project yet: saving is the author's own action.
  await page.getByRole("button", { name: "Save sources to library" }).click();
  await expect(page.getByText(/1 source saved to the Library/)).toBeVisible();
  await page.getByRole("button", { name: "Save findings to notebook" }).click();
  await expect(page.getByText(/Findings saved to the notebook/)).toBeVisible();

  // The paper is now a saved source in the Library, to read — not a citation.
  await go(page, /Library/);
  await expect(
    page.getByRole("region", { name: "Saved sources" }).getByText(paperTitle),
  ).toBeVisible();

  // The saved findings landed in the Notebook, labeled as AI suggestions.
  await go(page, /Manuscript/);
  const findings = page.getByLabel("Findings & interpretation");
  await expect(findings).toHaveValue(new RegExp(`### AI research check: .*${QUESTION}`.replace(/[?]/g, "\\?")));
  await expect(findings).toHaveValue(/AI suggestions saved by the author/);

  // The run reserved its allowance in the durable ledger and completed:
  // three model calls (plan, screen, judge) at the fake provider's 200
  // input + 100 output tokens each.
  const status = await page.evaluate(
    () =>
      fetch("/api/agent/status").then((response) => response.json()) as Promise<{
        budget: { userRunsToday: number };
        usage: { modelCalls: number; totalTokens: number };
      }>,
  );
  expect(status.budget.userRunsToday).toBe(1);
  expect(status.usage.modelCalls).toBe(3);
  expect(status.usage.totalTokens).toBe(900);
});
