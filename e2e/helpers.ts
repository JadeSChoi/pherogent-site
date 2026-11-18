import type { Page } from "@playwright/test";

/** Navigates via the contents rail, as an author would. The rail is the
 * only navigation inside the complementary landmark. */
export const go = (page: Page, name: RegExp) =>
  page.getByRole("complementary").getByRole("link", { name }).click();
