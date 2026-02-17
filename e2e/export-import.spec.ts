import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import {
  clearDatabase,
  waitForAppReady,
  navigateToTab,
  addContactViaUI,
  getContacts,
  getTableRecords,
} from "./helpers";

test.describe("Export/import — export data, clear storage, import file, verify restored", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);

    // Add some test data
    await navigateToTab(page, "People");
    await addContactViaUI(page, {
      name: "Alice",
      tier: "Close Family",
      frequency: 7,
    });
    await addContactViaUI(page, {
      name: "Bob",
      tier: "Close Friends",
      frequency: 14,
    });
  });

  test("export backup downloads a valid JSON file", async ({ page }) => {
    await navigateToTab(page, "Settings");

    // Set up a download listener
    const downloadPromise = page.waitForEvent("download");

    // Click the export button
    await page.getByRole("button", { name: "Download Backup" }).click();

    // Wait for the download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^balance-backup-.*\.json$/);

    // Verify the file content
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const content = fs.readFileSync(filePath!, "utf-8");
    const backup = JSON.parse(content);

    expect(backup.format).toBe("balance-backup");
    expect(backup.version).toBe(1);
    expect(backup.entities).toBeInstanceOf(Array);
    expect(backup.totalRecords).toBeGreaterThan(0);

    // Should contain our contacts
    const contactsEntity = backup.entities.find(
      (e: { entityType: string }) => e.entityType === "contacts",
    );
    expect(contactsEntity).toBeTruthy();
    expect(contactsEntity.count).toBeGreaterThanOrEqual(2);

    // Should have success message
    await expect(page.getByText("Backup downloaded successfully")).toBeVisible();
  });

  test("export then import with Replace All restores data", async ({ page }) => {
    await navigateToTab(page, "Settings");

    // Export first
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Backup" }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const backupContent = fs.readFileSync(filePath!, "utf-8");

    // Dismiss the success message
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForTimeout(300);

    // Clear the database
    await clearDatabase(page);
    await page.reload();
    await waitForAppReady(page);

    // Verify contacts are gone
    await navigateToTab(page, "People");
    await expect(page.getByText("No contacts yet")).toBeVisible();

    // Navigate to settings to import
    await navigateToTab(page, "Settings");

    // Write the backup to a temp file for the file chooser (unique per worker)
    const tmpDir = path.join(process.cwd(), "e2e", ".tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tmpFile = path.join(tmpDir, `test-backup-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, backupContent);

    // Click "Restore from Backup" and select the file
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restore from Backup" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tmpFile);

    // Wait for the summary to appear
    await expect(page.getByText("total records")).toBeVisible({ timeout: 5000 });

    // Choose "Replace all"
    await page.getByText("Replace all").first().click();
    await page.waitForTimeout(300);

    // Confirm the replace
    await expect(page.getByText("Replace all data?")).toBeVisible();
    await page.getByRole("button", { name: "Replace All Data" }).click();
    await page.waitForTimeout(1000);

    // Should show success
    await expect(page.getByText("Data replaced successfully")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // Reload and verify data is restored
    await page.reload();
    await waitForAppReady(page);
    await navigateToTab(page, "People");

    await expect(page.getByText("Alice")).toBeVisible();
    await expect(page.getByText("Bob")).toBeVisible();

    // Verify in IndexedDB
    const contacts = await getContacts(page);
    const active = contacts.filter((c) => c.deletedAt === null);
    expect(active.length).toBeGreaterThanOrEqual(2);

    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch { /* already cleaned */ }
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ok */ }
  });

  test("import with Merge mode combines data", async ({ page }) => {
    await navigateToTab(page, "Settings");

    // Export
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Backup" }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const backupContent = fs.readFileSync(filePath!, "utf-8");

    // Dismiss
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForTimeout(300);

    // Write the backup for import (unique per worker)
    const tmpDir = path.join(process.cwd(), "e2e", ".tmp");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tmpFile = path.join(tmpDir, `test-merge-backup-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, backupContent);

    // Import using Merge mode (data already exists)
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restore from Backup" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tmpFile);

    await expect(page.getByText("total records")).toBeVisible({ timeout: 5000 });

    // Choose "Merge"
    await page.getByText("Merge").first().click();
    await page.waitForTimeout(300);

    // Confirm
    await expect(page.getByText("Merge backup with existing data?")).toBeVisible();
    await page.getByRole("button", { name: "Merge Data" }).click();
    await page.waitForTimeout(1000);

    // Should show success
    await expect(page.getByText("Data merged successfully")).toBeVisible();

    // Clean up
    try { fs.unlinkSync(tmpFile); } catch { /* already cleaned */ }
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ok */ }
  });
});
