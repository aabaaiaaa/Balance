import { type Page, type BrowserContext } from "@playwright/test";

/**
 * Shared helpers for Balance E2E tests.
 *
 * IndexedDB is managed directly via page.evaluate() so we can seed
 * data before the app hydrates, and query it afterwards for assertions.
 */

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/** Clear all IndexedDB data for the BalanceDB database. */
export async function clearDatabase(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Delete the BalanceDB database and wait for it to complete
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("BalanceDB");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // resolve even on error
      req.onblocked = () => resolve(); // resolve even if blocked
    });
  });
}

/**
 * Seed the database with default data (prefs + life areas).
 * The app's seedDatabase() is not wired into the UI, so E2E tests
 * must seed manually after clearing the database.
 * Returns true if data was seeded (i.e. prefs didn't already exist).
 */
export async function seedTestData(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    return new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open("BalanceDB");
      request.onsuccess = () => {
        const idb = request.result;
        try {
          const tx = idb.transaction(["userPreferences", "lifeAreas"], "readwrite");
          const prefsStore = tx.objectStore("userPreferences");
          const areasStore = tx.objectStore("lifeAreas");

          let seeded = false;

          // Check if prefs already exist
          const getReq = prefsStore.get("prefs");
          getReq.onsuccess = () => {
            if (!getReq.result) {
              seeded = true;
              // Seed default preferences
              prefsStore.put({
                id: "prefs",
                onboardingComplete: false,
                deviceId: "test-device-" + Math.random().toString(36).slice(2, 10),
                householdId: null,
                partnerDeviceId: null,
                lastSyncTimestamp: null,
                weekStartDay: "monday",
                dateNightFrequencyDays: 14,
                theme: "system",
              });

              // Seed default life areas
              const now = Date.now();
              const areas = [
                { name: "Self-care", icon: "heart", targetHoursPerWeek: 5 },
                { name: "DIY/Household", icon: "wrench", targetHoursPerWeek: 3 },
                { name: "Partner Time", icon: "users", targetHoursPerWeek: 7 },
                { name: "Social", icon: "message-circle", targetHoursPerWeek: 3 },
                { name: "Personal Goals", icon: "target", targetHoursPerWeek: 5 },
              ];
              for (const area of areas) {
                areasStore.add({
                  ...area,
                  updatedAt: now,
                  deviceId: "test-device",
                  deletedAt: null,
                });
              }
            }
          };

          tx.oncomplete = () => {
            idb.close();
            resolve(seeded);
          };
          tx.onerror = () => {
            idb.close();
            reject(tx.error);
          };
        } catch (e) {
          idb.close();
          reject(e);
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/** Wait for the app to initialise (seed data + first paint). */
export async function waitForAppReady(page: Page): Promise<void> {
  // The app shows "Balance" in the header once hydrated
  await page.locator("h1").filter({ hasText: "Balance" }).waitFor({ timeout: 15000 });
  // Give Dexie a moment to open and create tables
  await page.waitForTimeout(500);
  // Ensure the database is seeded (the app's seedDatabase is not wired into the UI).
  // Write seed data via raw IDB, then reload so Dexie's useLiveQuery picks it up.
  const didSeed = await seedTestData(page);
  if (didSeed) {
    await page.reload();
    await page.locator("h1").filter({ hasText: "Balance" }).waitFor({ timeout: 15000 });
  }
  // Wait for dashboard to finish loading (all useLiveQuery hooks resolved)
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Loading your dashboard..."),
    { timeout: 15000 },
  );
  // Small buffer for React to finish re-rendering
  await page.waitForTimeout(500);
}

/** Read all contacts from IndexedDB. */
export async function getContacts(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    return new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = indexedDB.open("BalanceDB");
      request.onsuccess = () => {
        const idb = request.result;
        const tx = idb.transaction("contacts", "readonly");
        const store = tx.objectStore("contacts");
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          idb.close();
          resolve(getAll.result);
        };
        getAll.onerror = () => {
          idb.close();
          reject(getAll.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/** Read all check-ins from IndexedDB. */
export async function getCheckIns(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    return new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = indexedDB.open("BalanceDB");
      request.onsuccess = () => {
        const idb = request.result;
        const tx = idb.transaction("checkIns", "readonly");
        const store = tx.objectStore("checkIns");
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          idb.close();
          resolve(getAll.result);
        };
        getAll.onerror = () => {
          idb.close();
          reject(getAll.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/** Read all records from any IndexedDB object store. */
export async function getTableRecords(
  page: Page,
  tableName: string,
): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (table) => {
    return new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = indexedDB.open("BalanceDB");
      request.onsuccess = () => {
        const idb = request.result;
        try {
          const tx = idb.transaction(table, "readonly");
          const store = tx.objectStore(table);
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            idb.close();
            resolve(getAll.result);
          };
          getAll.onerror = () => {
            idb.close();
            reject(getAll.error);
          };
        } catch (e) {
          idb.close();
          resolve([]); // Table may not exist yet
        }
      };
      request.onerror = () => reject(request.error);
    });
  }, tableName);
}

/** Update user preferences in IndexedDB. */
export async function updatePreferences(
  page: Page,
  updates: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(async (upd) => {
    return new Promise<void>((resolve, reject) => {
      // Open without version to connect to existing DB (Dexie uses version 10 internally)
      const request = indexedDB.open("BalanceDB");
      request.onsuccess = () => {
        const idb = request.result;
        try {
          const tx = idb.transaction("userPreferences", "readwrite");
          const store = tx.objectStore("userPreferences");
          const getReq = store.get("prefs");
          getReq.onsuccess = () => {
            const prefs = getReq.result;
            if (prefs) {
              Object.assign(prefs, upd);
              store.put(prefs);
            }
            tx.oncomplete = () => {
              idb.close();
              resolve();
            };
            tx.onerror = () => {
              idb.close();
              reject(tx.error);
            };
          };
          getReq.onerror = () => {
            idb.close();
            reject(getReq.error);
          };
        } catch (e) {
          idb.close();
          reject(e);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }, updates);
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/** Navigate to a tab via the bottom navigation bar. */
export async function navigateToTab(page: Page, tabName: string): Promise<void> {
  await page.locator("nav").getByText(tabName, { exact: true }).click();
  // Wait for page to load after navigation (static export = full page load)
  await page.locator("h1").filter({ hasText: "Balance" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Contact form helpers
// ---------------------------------------------------------------------------

/** Add a contact through the UI (from the People page). */
export async function addContactViaUI(
  page: Page,
  contact: {
    name: string;
    tier?: string;
    frequency?: number;
    phoneNumber?: string;
    notes?: string;
  },
): Promise<void> {
  // Click the FAB to add a contact
  await page.getByLabel("Add contact").click();

  // Fill in the name
  await page.locator("#contact-name").fill(contact.name);

  // Select tier if specified
  if (contact.tier) {
    await page.locator("#contact-tier").selectOption({ label: contact.tier });
  }

  // Set frequency if specified
  if (contact.frequency) {
    await page.locator("#contact-frequency").fill(String(contact.frequency));
  }

  // Set phone number if specified
  if (contact.phoneNumber) {
    await page.locator("#contact-phone").fill(contact.phoneNumber);
  }

  // Set notes if specified
  if (contact.notes) {
    await page.locator("#contact-notes").fill(contact.notes);
  }

  // Submit the form
  await page.getByRole("button", { name: "Add Contact" }).click();
  // Wait for navigation back to list
  await page.waitForTimeout(500);
}
