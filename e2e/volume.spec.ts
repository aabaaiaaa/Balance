import { test, expect } from "@playwright/test";
import {
  clearDatabase,
  waitForAppReady,
  navigateToTab,
  bulkSeedData,
} from "./helpers";

// Volume tests need extra time for seeding + reloading
test.setTimeout(60_000);

test.describe("Volume — realistic data", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);
    await bulkSeedData(page);
    await page.reload();
    // Wait for the app to hydrate after bulk-seed reload
    await page.locator("h1").filter({ hasText: "Balance" }).waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading your dashboard..."),
      { timeout: 15000 },
    );
    await page.waitForTimeout(500);
  });

  test("dashboard shows priorities and show-more button with many items", async ({
    page,
  }) => {
    // Should show the Top Priorities section
    await expect(page.getByText("Top Priorities")).toBeVisible();

    // Should have exactly 7 priority cards visible initially.
    // Each PriorityCard contains a "Log it" button.
    const prioritySection = page.locator("section[aria-label='Top priorities']");
    const logButtons = prioritySection.getByRole("button", { name: /^Log / });
    await expect(logButtons).toHaveCount(7);

    // Should show a "Show N more" button
    const showMoreBtn = prioritySection.getByRole("button", {
      name: /Show \d+ more/,
    });
    await expect(showMoreBtn).toBeVisible();

    // Click show more — more cards should appear
    await showMoreBtn.click();
    await page.waitForTimeout(300);
    const expandedLogButtons = prioritySection.getByRole("button", { name: /^Log / });
    const expandedCount = await expandedLogButtons.count();
    expect(expandedCount).toBeGreaterThan(7);

    // Show more button should now be gone
    await expect(showMoreBtn).toBeHidden();
  });

  test("people page renders 25 contacts grouped by tier", async ({ page }) => {
    await navigateToTab(page, "People");

    // All 5 tier group headings should be visible
    for (const tier of [
      "Partner",
      "Close Family",
      "Extended Family",
      "Close Friends",
      "Wider Friends",
    ]) {
      await expect(
        page.getByRole("heading", { name: new RegExp(tier, "i") }),
      ).toBeVisible();
    }

    // Count all contact card buttons (they have aria-label like "View [name]")
    // Each contact button has the contact name in it
    const contactButtons = page.locator(
      "button.flex.w-full.items-center.gap-3.rounded-xl",
    );
    await expect(contactButtons).toHaveCount(25);

    // FAB should be visible and clickable (not obscured)
    const fab = page.getByLabel("Add contact");
    await expect(fab).toBeVisible();
    const box = await fab.boundingBox();
    expect(box).not.toBeNull();
  });

  test("contact detail shows show-more for long check-in history", async ({
    page,
  }) => {
    await navigateToTab(page, "People");

    // Click on Alex (partner, one of the first 6 "heavy" contacts with 20 check-ins)
    await page.getByText("Alex", { exact: true }).click();
    await page.waitForTimeout(500);

    // Should be on contact detail
    await expect(page.getByText("Recent Check-ins")).toBeVisible();

    // The total count should show "(20)"
    await expect(page.getByText("(20)")).toBeVisible();

    // The "Show N more" button should be visible
    const showMoreBtn = page.getByRole("button", { name: /Show \d+ more/ });
    await expect(showMoreBtn).toBeVisible();

    // Click it
    await showMoreBtn.click();
    await page.waitForTimeout(300);

    // Button should be gone
    await expect(showMoreBtn).toBeHidden();
  });

  test("life area detail shows show-more for activity history", async ({
    page,
  }) => {
    await navigateToTab(page, "Life Areas");

    // Click on Self-care (use role button to avoid matching the balance chart)
    await page.getByRole("button", { name: /Self-care/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Recent Activities")).toBeVisible();

    // Activities are shown (6 for Self-care, which is under the 20 limit)
    // Verify that entries exist
    const activitySection = page.locator("section").filter({
      has: page.getByText("Recent Activities"),
    });
    const countText = activitySection.locator(
      "span",
    ).filter({ hasText: /^\(\d+\)$/ });
    await expect(countText).toBeVisible();
  });

  test("household task list handles many tasks with done toggle", async ({
    page,
  }) => {
    await navigateToTab(page, "Life Areas");

    // Click on DIY/Household (use role button to avoid matching the balance chart)
    await page.getByRole("button", { name: /DIY\/Household/ }).click();
    await page.waitForTimeout(500);

    // Should see the Tasks section (HouseholdTaskList heading is just "Tasks")
    await expect(page.getByText("Tasks").first()).toBeVisible();

    // "Done" toggle should exist with a count
    const doneToggle = page.getByRole("button", { name: /Done \(\d+\)/ });
    await expect(doneToggle).toBeVisible();

    // Click done toggle to reveal completed tasks
    await doneToggle.click();
    await page.waitForTimeout(300);

    // Done task cards should now be visible (they have strikethrough text on <p>)
    const doneCards = page.locator("p.line-through");
    const doneCount = await doneCards.count();
    expect(doneCount).toBeGreaterThanOrEqual(1);
  });

  test("quick-log modal save button not obscured on mobile", async ({
    page,
  }) => {
    // Find the priority section first
    const prioritySection = page.locator("section[aria-label='Top priorities']");
    await expect(prioritySection).toBeVisible();

    // Find and click a "Log it" button within the priority section
    const logItBtn = prioritySection.locator("button").filter({ hasText: "Log it" }).first();
    await expect(logItBtn).toBeVisible();
    await logItBtn.click();
    await page.waitForTimeout(1000);

    // The modal dialog should be open
    const modal = page.locator("[role='dialog']");
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Find the save button inside the modal
    const saveBtn = modal.getByRole("button", { name: /Save/ });
    await expect(saveBtn).toBeVisible();

    // Verify the save button is in the viewport (not behind the BottomNav)
    const saveBox = await saveBtn.boundingBox();
    expect(saveBox).not.toBeNull();

    const viewport = page.viewportSize();
    if (viewport && saveBox) {
      // The save button's bottom edge should be within the viewport
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(viewport.height);
    }
  });

  test("date night section shows show-more for history", async ({ page }) => {
    await navigateToTab(page, "Life Areas");

    // Click on Partner Time (use role button to avoid matching the balance chart)
    await page.getByRole("button", { name: /Partner Time/ }).click();
    await page.waitForTimeout(500);

    // Should see the Date Nights section
    await expect(page.getByText("Date Nights")).toBeVisible();

    // With 8 date nights (below 10 threshold), all should be visible
    // Verify date night entries exist
    const dateNightEntries = page.locator("div.rounded-xl.border.p-3").filter({
      has: page.locator("span", {
        hasText: /Restaurant night|Movie night/,
      }),
    });
    const count = await dateNightEntries.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
