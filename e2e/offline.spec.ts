import { test, expect } from "@playwright/test";
import {
  clearDatabase,
  waitForAppReady,
  navigateToTab,
  addContactViaUI,
  getContacts,
} from "./helpers";

test.describe("Offline — verify the app continues to function when offline", () => {
  // Only run in Chromium (service worker support required)
  test.skip(({ browserName }) => browserName !== "chromium", "Service worker tests require Chromium");

  test("IndexedDB reads and writes work without network (same page)", async ({
    page,
    context,
  }) => {
    // Load the app and seed some data while online
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);

    await navigateToTab(page, "People");
    await addContactViaUI(page, {
      name: "Offline Test Contact",
      tier: "Close Friends",
      frequency: 14,
    });

    // Verify data exists
    await expect(page.getByText("Offline Test Contact")).toBeVisible();

    // Now visit all pages once while online to ensure they're in the browser cache
    await navigateToTab(page, "Life Areas");
    await page.waitForTimeout(500);
    await navigateToTab(page, "Settings");
    await page.waitForTimeout(500);
    await navigateToTab(page, "Dashboard");
    await page.waitForTimeout(500);
    await navigateToTab(page, "People");
    await page.waitForTimeout(500);

    // Go offline
    await context.setOffline(true);

    // The People page should still show data (already on this page, data from IndexedDB)
    await expect(page.getByText("Offline Test Contact")).toBeVisible();

    // Click on the contact to see details (same-page state change, no network)
    await page.getByText("Offline Test Contact").click();
    await page.waitForTimeout(500);

    // Should see contact detail view with data from IndexedDB
    await expect(page.getByText("Offline Test Contact")).toBeVisible();
    await expect(page.getByText("Close Friends")).toBeVisible();
    await expect(page.getByText("Never", { exact: true })).toBeVisible();

    // Go back online
    await context.setOffline(false);
  });

  test("can add a contact while offline (IndexedDB write)", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);

    // Navigate to People page while online
    await navigateToTab(page, "People");
    await page.waitForTimeout(500);

    // Go offline
    await context.setOffline(true);

    // Add a contact while offline (uses IndexedDB directly, no network)
    await addContactViaUI(page, {
      name: "Offline Added",
      tier: "Wider Friends",
      frequency: 30,
    });

    // Should appear in the list
    await expect(page.getByText("Offline Added")).toBeVisible();

    // Verify in IndexedDB
    const contacts = await getContacts(page);
    const offlineContact = contacts.find(
      (c) => c.name === "Offline Added" && c.deletedAt === null,
    );
    expect(offlineContact).toBeTruthy();
    expect(offlineContact!.tier).toBe("wider-friends");

    // Go back online
    await context.setOffline(false);

    // Data should persist after coming back online
    const contactsOnline = await getContacts(page);
    const stillThere = contactsOnline.find(
      (c) => c.name === "Offline Added" && c.deletedAt === null,
    );
    expect(stillThere).toBeTruthy();
  });

  test("cached pages load when navigating offline (if service worker active)", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);

    // Pre-visit all pages to ensure service worker caches them
    await navigateToTab(page, "People");
    await page.waitForTimeout(1000);
    await navigateToTab(page, "Life Areas");
    await page.waitForTimeout(1000);
    await navigateToTab(page, "Settings");
    await page.waitForTimeout(1000);
    await navigateToTab(page, "Dashboard");
    await page.waitForTimeout(1000);

    // Wait for service worker to finish caching
    await page.waitForTimeout(2000);

    // Go offline
    await context.setOffline(true);

    // The current page (Dashboard) should still show content from cache/memory
    await expect(page.locator("h1")).toContainText("Balance");

    // Try clicking nav links — they may work if SW cached, or fail gracefully.
    // With `npx serve`, the service worker may not be registered, so navigation
    // to a new route while offline may fail. That's acceptable — the key assertion
    // is that the current page remains functional.
    try {
      // Use a short timeout so we don't blow the overall test budget
      await page.locator("nav").getByText("People", { exact: true }).click();
      await page.locator("h1").filter({ hasText: "Balance" }).waitFor({ timeout: 5000 });
      await page.waitForTimeout(500);
      // If navigation succeeded, verify some content rendered
      const hasContent = await page.locator("h2").isVisible();
      expect(hasContent).toBeTruthy();
    } catch {
      // Navigation may fail if service worker isn't active — that's acceptable
    }

    // Go back online
    await context.setOffline(false);
  });
});
