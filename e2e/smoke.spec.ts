import { test, expect } from "@playwright/test";
import { clearDatabase, waitForAppReady } from "./helpers";

test("home page loads and shows app title", async ({ page }) => {
  await page.goto("/");
  await clearDatabase(page);
  await page.reload();
  await waitForAppReady(page);
  await expect(page.locator("h1")).toContainText("Balance");
});
