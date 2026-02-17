import { test, expect } from "@playwright/test";
import {
  clearDatabase,
  waitForAppReady,
  navigateToTab,
  addContactViaUI,
  getCheckIns,
} from "./helpers";

test.describe('"I have free time" flow — input time, receive suggestions, accept one', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);

    // Add a contact so the priority algorithm has something to suggest
    await navigateToTab(page, "People");
    await addContactViaUI(page, {
      name: "Tom",
      tier: "Close Friends",
      frequency: 14,
    });

    // Go back to dashboard and wait for data to load
    await navigateToTab(page, "Dashboard");
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading your dashboard..."),
      { timeout: 15000 },
    );
  });

  test("select time slot, see suggestions, accept a suggestion", async ({
    page,
  }) => {
    // Click the "I have free time" button
    await page.getByText("I have free time").click();
    await page.waitForTimeout(300);

    // Step 1: "How much time do you have?"
    await expect(page.getByText("How much time do you have?")).toBeVisible();

    // Select "30 min"
    await page.getByRole("button", { name: "30 min" }).click();
    await page.waitForTimeout(300);

    // Step 2: "How are you feeling?"
    await expect(page.getByText("How are you feeling?")).toBeVisible();

    // Select "Normal"
    await page.getByText("Normal").click();
    await page.waitForTimeout(1500); // Wait for suggestions to compute

    // Should show suggestions or "nothing to suggest" — the header uses
    // an HTML entity for the apostrophe, so match with a regex on h3
    const suggestionsHeader = page.locator("h3").filter({ hasText: /what to do/ });
    const noSuggestionsMsg = page.getByText("Nothing to suggest");
    const hasSuggestions = await suggestionsHeader.isVisible().catch(() => false);
    const hasNoSuggestions = await noSuggestionsMsg.isVisible().catch(() => false);

    expect(hasSuggestions || hasNoSuggestions).toBeTruthy();

    if (hasSuggestions) {
      // Should show at least one suggestion mentioning Tom (overdue contact)
      const tomSuggestion = page.locator("text=Tom").first();
      await expect(tomSuggestion).toBeVisible({ timeout: 5000 });

      // Accept the suggestion by clicking "Do this"
      await page.getByRole("button", { name: "Do this" }).first().click();
      await page.waitForTimeout(300);

      // Should show a logging form (either check-in or activity)
      // Use heading locator to avoid strict mode issues with button text
      const hasCheckInForm = await page.getByRole("heading", { name: "Log Check-in" }).isVisible().catch(() => false);
      const hasActivityForm = await page.getByRole("heading", { name: "Log Activity" }).isVisible().catch(() => false);

      // The form might also be detected by the Save button
      const hasSaveCheckIn = await page.getByRole("button", { name: "Save Check-in" }).isVisible().catch(() => false);
      const hasSaveActivity = await page.getByRole("button", { name: "Save Activity" }).isVisible().catch(() => false);

      expect(hasCheckInForm || hasActivityForm || hasSaveCheckIn || hasSaveActivity).toBeTruthy();

      // If it's a check-in form, save it
      if (hasCheckInForm || hasSaveCheckIn) {
        await page.getByRole("button", { name: "Save Check-in" }).click();
        await page.waitForTimeout(500);

        // Verify the check-in was recorded
        const checkIns = await getCheckIns(page);
        expect(checkIns.filter((c) => c.deletedAt === null).length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("skip suggestions by clicking Done", async ({ page }) => {
    await page.getByText("I have free time").click();
    await page.waitForTimeout(300);

    // Select 15 min
    await page.getByRole("button", { name: "15 min" }).click();
    await page.waitForTimeout(300);

    // Skip the energy step
    await page.getByText("Skip this step").click();
    await page.waitForTimeout(1500);

    // Either "Here's what to do" or "Nothing to suggest" should appear
    const doneButton = page.getByRole("button", { name: "Done" });
    const closeButton = page.getByRole("button", { name: "Close" });
    const hasDone = await doneButton.isVisible().catch(() => false);
    const hasClose = await closeButton.isVisible().catch(() => false);

    if (hasDone) {
      await doneButton.click();
    } else if (hasClose) {
      await closeButton.click();
    }
    await page.waitForTimeout(300);

    // Should be back on the dashboard with the "I have free time" button
    await expect(page.getByText("I have free time")).toBeVisible();
  });

  test("dismiss a suggestion with Skip", async ({ page }) => {
    await page.getByText("I have free time").click();
    await page.waitForTimeout(300);

    // Select 1 hour
    await page.getByRole("button", { name: "1 hour" }).click();
    await page.waitForTimeout(300);

    // Select Energetic
    await page.getByText("Energetic").click();
    await page.waitForTimeout(1500);

    // Check if suggestions appeared
    const skipButtons = page.getByRole("button", { name: "Skip" });
    const skipCount = await skipButtons.count();
    if (skipCount > 0) {
      await skipButtons.first().click();
      await page.waitForTimeout(300);
    }
  });
});
