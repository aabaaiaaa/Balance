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
                onboardingComplete: true,
                deviceId: "test-device-" + Math.random().toString(36).slice(2, 10),
                householdId: null,
                partnerDeviceId: null,
                lastSyncTimestamp: null,
                weekStartDay: "monday",
                dateNightFrequencyDays: 14,
                theme: "system",
                notificationsEnabled: false,
                notificationTypes: { contactCheckIns: true, lifeAreaImbalance: true, taskReminders: true },
                lastAppOpenTimestamp: null,
                lastNotificationTimestamps: {},
                syncHistory: [],
                remoteSyncConfig: null,
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
  // Wait for the page to have some content (app hydrating)
  await page.waitForTimeout(1000);

  // The app's seedDatabase() may have created prefs with onboardingComplete:false,
  // which blocks the header from rendering. Ensure seed data exists with
  // onboardingComplete:true, then reload if needed.
  const didSeed = await seedTestData(page);

  // Also ensure onboardingComplete is true so the app shell renders
  const wasOnboarding = await ensureOnboardingComplete(page);

  if (didSeed || wasOnboarding) {
    await page.reload();
  }

  // The app shows "Balance" in the header once hydrated and onboarding is complete
  await page.locator("h1").filter({ hasText: "Balance" }).waitFor({ timeout: 15000 });

  // Wait for dashboard to finish loading (all useLiveQuery hooks resolved)
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Loading your dashboard..."),
    { timeout: 15000 },
  );
  // Small buffer for React to finish re-rendering
  await page.waitForTimeout(500);
}

/** Ensure onboardingComplete is true in prefs so the app renders the normal shell. Returns true if it was changed. */
async function ensureOnboardingComplete(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    return new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open("BalanceDB");
      request.onsuccess = () => {
        const idb = request.result;
        try {
          const tx = idb.transaction("userPreferences", "readwrite");
          const store = tx.objectStore("userPreferences");
          const getReq = store.get("prefs");
          getReq.onsuccess = () => {
            const prefs = getReq.result;
            let changed = false;
            if (prefs && !prefs.onboardingComplete) {
              prefs.onboardingComplete = true;
              store.put(prefs);
              changed = true;
            }
            tx.oncomplete = () => {
              idb.close();
              resolve(changed);
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
  });
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
// Volume seed helper
// ---------------------------------------------------------------------------

/**
 * Seed the database with realistic volumes of data for stress-testing.
 *
 * Creates:
 * - 25 contacts across all 5 tiers
 * - 150 check-ins spread across contacts
 * - 30 activities spread across the 5 life areas
 * - 12 household tasks (mix of priorities and statuses)
 * - 5 goals (some with milestones, some overdue)
 * - 8 date nights with ideas
 *
 * Assumes seedTestData has already been called (prefs + life areas exist).
 */
export async function bulkSeedData(page: Page, deviceId = "test-device"): Promise<void> {
  await page.evaluate(async (devId: string) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("BalanceDB");
      request.onsuccess = () => {
        const idb = request.result;
        try {
          const tx = idb.transaction(
            ["contacts", "checkIns", "activities", "householdTasks", "goals", "dateNights", "dateNightIdeas"],
            "readwrite",
          );

          const contactsStore = tx.objectStore("contacts");
          const checkInsStore = tx.objectStore("checkIns");
          const activitiesStore = tx.objectStore("activities");
          const tasksStore = tx.objectStore("householdTasks");
          const goalsStore = tx.objectStore("goals");
          const dateNightsStore = tx.objectStore("dateNights");
          const ideasStore = tx.objectStore("dateNightIdeas");

          const now = Date.now();
          const DAY = 24 * 60 * 60 * 1000;

          // -- Contacts: 25 across all tiers --
          const tiers: Array<{ tier: string; freq: number; count: number }> = [
            { tier: "partner", freq: 1, count: 2 },
            { tier: "close-family", freq: 7, count: 5 },
            { tier: "extended-family", freq: 21, count: 5 },
            { tier: "close-friends", freq: 14, count: 8 },
            { tier: "wider-friends", freq: 30, count: 5 },
          ];

          const contactNames = [
            // partner (2)
            "Alex", "Jordan",
            // close-family (5)
            "Mum", "Dad", "Sister", "Brother", "Nan",
            // extended-family (5)
            "Uncle Bob", "Aunt Sarah", "Cousin Mike", "Cousin Emma", "Uncle Tom",
            // close-friends (8)
            "Charlie", "Sam", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Quinn",
            // wider-friends (5)
            "Pat", "Drew", "Avery", "Blake", "Sage",
          ];

          let nameIdx = 0;
          const contactIds: number[] = [];
          let nextContactId = 1;

          for (const { tier, freq, count } of tiers) {
            for (let i = 0; i < count; i++) {
              const name = contactNames[nameIdx++] || `Contact ${nameIdx}`;
              const daysAgo = Math.floor(Math.random() * freq * 2);
              const lastCheckIn = now - daysAgo * DAY;

              contactsStore.add({
                name,
                tier,
                checkInFrequencyDays: freq,
                lastCheckIn,
                phoneNumber: "",
                notes: "",
                location: null,
                updatedAt: now,
                deviceId: devId,
                deletedAt: null,
              });
              contactIds.push(nextContactId++);
            }
          }

          // -- Check-ins: 150 spread across contacts --
          // Give some contacts many check-ins (20+) and others just 1-2
          const checkInTypes = ["called", "texted", "met-up", "video-call", "other"];
          const heavyContacts = contactIds.slice(0, 6); // first 6 get 20+ each
          const lightContacts = contactIds.slice(6);

          // Heavy contacts: 20 check-ins each = 120
          for (const cId of heavyContacts) {
            for (let j = 0; j < 20; j++) {
              const daysAgo = j * 3 + Math.floor(Math.random() * 3);
              checkInsStore.add({
                contactId: cId,
                date: now - daysAgo * DAY,
                type: checkInTypes[j % checkInTypes.length],
                notes: j === 0 ? "Most recent" : "",
                location: null,
                updatedAt: now,
                deviceId: devId,
                deletedAt: null,
              });
            }
          }

          // Light contacts: ~2 each to reach ~150 total (remaining ~30 / 19 contacts)
          for (const cId of lightContacts) {
            const count = 1 + Math.floor(Math.random() * 2);
            for (let j = 0; j < count; j++) {
              const daysAgo = j * 7 + Math.floor(Math.random() * 7);
              checkInsStore.add({
                contactId: cId,
                date: now - daysAgo * DAY,
                type: checkInTypes[j % checkInTypes.length],
                notes: "",
                location: null,
                updatedAt: now,
                deviceId: devId,
                deletedAt: null,
              });
            }
          }

          // -- Activities: 30 spread across 5 life areas (IDs 1-5) --
          const activityDescriptions = [
            "Morning run", "Yoga session", "Fixed shelf", "Cleaned kitchen",
            "Movie night", "Board game", "Coffee with friend", "Read a chapter",
            "Guitar practice", "Meditation", "Walk in park", "Cooked dinner",
            "Painted room", "Study session", "Journaling", "Gym workout",
            "Grocery shopping", "Garden work", "Called old friend", "Date night prep",
            "Bike ride", "Swimming", "Deep clean", "Budget review",
            "Side project", "Volunteering", "Game night", "Long walk",
            "Stretching", "Meal prep",
          ];

          for (let i = 0; i < 30; i++) {
            const lifeAreaId = (i % 5) + 1;
            const daysAgo = Math.floor(i / 2) + Math.floor(Math.random() * 3);
            activitiesStore.add({
              lifeAreaId,
              description: activityDescriptions[i],
              durationMinutes: 15 + Math.floor(Math.random() * 90),
              date: now - daysAgo * DAY,
              notes: "",
              location: null,
              updatedAt: now,
              deviceId: devId,
              deletedAt: null,
            });
          }

          // -- Household tasks: 12 (for DIY/Household, lifeAreaId = 2) --
          const taskTitles = [
            "Fix leaky tap", "Paint hallway", "Organize garage", "Replace lightbulb",
            "Clean gutters", "Fix fence", "Deep clean oven", "Sort recycling",
            "Mow lawn", "Repair door handle", "Install shelf", "Clear attic",
          ];
          const priorities = ["high", "medium", "low"];
          const statuses = ["pending", "in-progress", "done"];

          for (let i = 0; i < 12; i++) {
            const status = statuses[i % 3];
            tasksStore.add({
              lifeAreaId: 2, // DIY/Household
              title: taskTitles[i],
              estimatedMinutes: 15 + Math.floor(Math.random() * 120),
              priority: priorities[Math.floor(i / 4)],
              status,
              completedAt: status === "done" ? now - Math.floor(Math.random() * 14) * DAY : null,
              updatedAt: now,
              deviceId: devId,
              deletedAt: null,
            });
          }

          // -- Goals: 5 (for Personal Goals, lifeAreaId = 5) --
          const goalData = [
            { title: "Learn Spanish", desc: "B1 level by year end", target: now + 180 * DAY, progress: 35, milestones: [{ title: "Complete A1 course", done: true }, { title: "Complete A2 course", done: false }] },
            { title: "Run a half marathon", desc: "Train for spring event", target: now + 90 * DAY, progress: 60, milestones: [{ title: "Run 10k", done: true }, { title: "Run 15k", done: false }] },
            { title: "Read 24 books", desc: "2 books per month", target: now - 30 * DAY, progress: 40, milestones: [] }, // overdue
            { title: "Save emergency fund", desc: "3 months of expenses", target: now + 365 * DAY, progress: 85, milestones: [] }, // near-complete
            { title: "Learn guitar", desc: "Play 5 songs", target: null, progress: 20, milestones: [] },
          ];

          for (const g of goalData) {
            goalsStore.add({
              lifeAreaId: 5, // Personal Goals
              title: g.title,
              description: g.desc,
              targetDate: g.target,
              milestones: g.milestones,
              progressPercent: g.progress,
              updatedAt: now,
              deviceId: devId,
              deletedAt: null,
            });
          }

          // -- Date nights: 8 --
          for (let i = 0; i < 8; i++) {
            const daysAgo = i * 14 + Math.floor(Math.random() * 7);
            dateNightsStore.add({
              date: now - daysAgo * DAY,
              notes: i === 0 ? "Great evening out" : "",
              ideaUsed: i % 2 === 0 ? "Restaurant night" : "Movie night",
              updatedAt: now,
              deviceId: devId,
              deletedAt: null,
            });
          }

          // -- Date night ideas: 5 --
          const ideaTitles = ["Cooking class", "Sunset picnic", "Escape room", "Wine tasting", "Stargazing"];
          for (const title of ideaTitles) {
            ideasStore.add({
              title,
              updatedAt: now,
              deviceId: devId,
              deletedAt: null,
            });
          }

          tx.oncomplete = () => {
            idb.close();
            resolve();
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
  }, deviceId);
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
