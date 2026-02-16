import { test, expect } from "@playwright/test";

test("home page loads and shows app title", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Balance");
});
