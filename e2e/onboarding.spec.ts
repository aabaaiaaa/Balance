import { test, expect } from "@playwright/test";
import {
  clearDatabase,
  waitForAppReady,
  addContactViaUI,
  navigateToTab,
  getContacts,
} from "./helpers";

test.describe("Onboarding — fresh load, add first contact, verify dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Start with a clean database
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);
  });

  test("fresh app loads with default life areas and empty contacts", async ({
    page,
  }) => {
    // Dashboard should show the greeting
    await expect(page.locator("h2").first()).toContainText(/Good (morning|afternoon|evening)/);

    // Navigate to People tab — should show empty state
    await navigateToTab(page, "People");
    await page.waitForTimeout(500);
    await expect(page.getByText("No contacts yet")).toBeVisible();

    // Navigate to Life Areas tab — should show the 5 default life areas
    await navigateToTab(page, "Life Areas");
    // Each life area name appears in both the balance chart and the card,
    // so use .first() to avoid strict mode violations
    await expect(page.getByText("Self-care").first()).toBeVisible();
    await expect(page.getByText("DIY/Household").first()).toBeVisible();
    await expect(page.getByText("Partner Time").first()).toBeVisible();
    await expect(page.getByText("Social").first()).toBeVisible();
    await expect(page.getByText("Personal Goals").first()).toBeVisible();
  });

  test("add first contact, set check-in frequency, verify it appears on dashboard", async ({
    page,
  }) => {
    // Navigate to People tab
    await navigateToTab(page, "People");

    // Add a contact
    await addContactViaUI(page, {
      name: "Mum",
      tier: "Close Family",
      frequency: 7,
    });

    // Contact should now appear in the People list under Close Family
    await expect(page.getByText("Mum")).toBeVisible();
    await expect(page.getByText("Close Family").first()).toBeVisible();

    // Verify it's stored in IndexedDB
    const contacts = await getContacts(page);
    const mum = contacts.find(
      (c) => c.name === "Mum" && c.deletedAt === null,
    );
    expect(mum).toBeTruthy();
    expect(mum!.tier).toBe("close-family");
    expect(mum!.checkInFrequencyDays).toBe(7);

    // Navigate to dashboard — the contact should appear as a priority
    // (since lastCheckIn is null, it's overdue)
    await navigateToTab(page, "Dashboard");
    // Wait for dashboard data to finish loading
    await page.waitForFunction(
      () => !document.body.textContent?.includes("Loading your dashboard..."),
      { timeout: 15000 },
    );
    await expect(page.getByText("Mum").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/1 contact.* overdue/)).toBeVisible({ timeout: 5000 });
  });

  test("add contact with default frequency from tier", async ({ page }) => {
    await navigateToTab(page, "People");
    await page.getByLabel("Add contact").click();

    // Fill in name
    await page.locator("#contact-name").fill("Dave");

    // Select Close Friends tier — frequency should auto-fill to 14
    await page.locator("#contact-tier").selectOption({ label: "Close Friends" });

    // Check that the frequency field has the default value (14 for close friends)
    await expect(page.locator("#contact-frequency")).toHaveValue("14");

    // Verify the default label text
    await expect(
      page.getByText("Default for Close Friends: every 14 days"),
    ).toBeVisible();

    // Save without changing frequency
    await page.getByRole("button", { name: "Add Contact" }).click();
    await page.waitForTimeout(500);

    // Verify in IndexedDB
    const contacts = await getContacts(page);
    const dave = contacts.find(
      (c) => c.name === "Dave" && c.deletedAt === null,
    );
    expect(dave).toBeTruthy();
    expect(dave!.checkInFrequencyDays).toBe(14);
  });
});
