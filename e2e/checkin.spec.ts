import { test, expect } from "@playwright/test";
import {
  clearDatabase,
  waitForAppReady,
  navigateToTab,
  addContactViaUI,
  getContacts,
  getCheckIns,
} from "./helpers";

test.describe("Check-in logging — log a check-in and verify last contacted updates", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);

    // Add a contact first
    await navigateToTab(page, "People");
    await addContactViaUI(page, {
      name: "Sarah",
      tier: "Close Friends",
      frequency: 14,
    });
  });

  test("log check-in from contact detail, verify last contacted date updates", async ({
    page,
  }) => {
    // Tap the contact to open detail view
    await page.getByText("Sarah").click();
    await page.waitForTimeout(300);

    // Should see contact detail with "Never" for last check-in
    await expect(page.getByText("Never", { exact: true })).toBeVisible();

    // Tap "Log Check-in" button
    await page.getByRole("button", { name: "Log Check-in" }).click();

    // The check-in form should appear — fill it in
    await expect(page.getByText("Log Check-in").first()).toBeVisible();

    // Select "Phone call" type (default)
    await expect(page.locator("#checkin-type")).toHaveValue("called");

    // Add optional notes
    await page.locator("#checkin-notes").fill("Caught up about the weekend");

    // Save the check-in
    await page.getByRole("button", { name: "Save Check-in" }).click();
    await page.waitForTimeout(500);

    // After saving, we should be back on the detail view
    // The "last check-in" should no longer say "Never" — it should say "Today"
    await expect(page.getByText("Today", { exact: true })).toBeVisible();

    // The check-in should appear in the Recent Check-ins section
    await expect(page.getByText("Phone call")).toBeVisible();
    await expect(page.getByText("Caught up about the weekend")).toBeVisible();

    // Verify in IndexedDB
    const checkIns = await getCheckIns(page);
    const sarahCheckIns = checkIns.filter((c) => c.deletedAt === null);
    expect(sarahCheckIns.length).toBe(1);
    expect(sarahCheckIns[0].type).toBe("called");
    expect(sarahCheckIns[0].notes).toBe("Caught up about the weekend");

    // Verify contact's lastCheckIn was updated
    const contacts = await getContacts(page);
    const sarah = contacts.find(
      (c) => c.name === "Sarah" && c.deletedAt === null,
    );
    expect(sarah).toBeTruthy();
    expect(sarah!.lastCheckIn).toBeTruthy();
    expect(typeof sarah!.lastCheckIn).toBe("number");
  });

  test("log check-in from dashboard quick action", async ({ page }) => {
    test.setTimeout(60_000);
    // Navigate to dashboard — Sarah should appear as overdue
    await navigateToTab(page, "Dashboard");
    // Wait for dashboard data to finish loading
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading your dashboard..."),
      { timeout: 15000 },
    );
    await expect(page.getByText("Sarah").first()).toBeVisible({ timeout: 10000 });

    // Click the "Log it" quick action button for Sarah
    await page.getByRole("button", { name: /Log Check in with Sarah/ }).click();
    await page.waitForTimeout(300);

    // Should see the check-in form (the dashboard shows it inline)
    await expect(page.getByText("Log Check-in").first()).toBeVisible();

    // Save the check-in with defaults
    await page.getByRole("button", { name: "Save Check-in" }).click();
    await page.waitForTimeout(500);

    // Verify check-in was recorded in IndexedDB
    const checkIns = await getCheckIns(page);
    expect(checkIns.filter((c) => c.deletedAt === null).length).toBe(1);

    // Contact's lastCheckIn should be updated
    const contacts = await getContacts(page);
    const sarah = contacts.find(
      (c) => c.name === "Sarah" && c.deletedAt === null,
    );
    expect(sarah!.lastCheckIn).toBeTruthy();
  });

  test("check-in with different type (texted)", async ({ page }) => {
    // Open Sarah's detail
    await page.getByText("Sarah").click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Log Check-in" }).click();

    // Change type to "texted"
    await page.locator("#checkin-type").selectOption("texted");

    // Save
    await page.getByRole("button", { name: "Save Check-in" }).click();
    await page.waitForTimeout(500);

    // Verify the check-in type in history
    await expect(page.getByText("Text message")).toBeVisible();

    // Verify in IndexedDB
    const checkIns = await getCheckIns(page);
    expect(checkIns[0].type).toBe("texted");
  });
});
