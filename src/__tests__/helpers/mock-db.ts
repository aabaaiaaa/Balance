/**
 * Shared test database helper.
 *
 * Components import `db` from `@/lib/db` which is a singleton. In tests we
 * need to swap it for a fresh instance on every test run. This module holds
 * the mutable reference that the jest.mock factory for `@/lib/db` proxies to.
 */
import "fake-indexeddb/auto";
import Dexie from "dexie";

// We create a fresh BalanceDatabase each time via resetTestDb().
// The type is imported at runtime, but we can't import from `@/lib/db`
// directly here as that would create the real singleton. Instead we
// replicate the schema inline (it's the same as BalanceDatabase but
// allows fresh instances without the module-level singleton).

export class TestBalanceDatabase extends Dexie {
  contacts!: Dexie.Table<any, number>;
  checkIns!: Dexie.Table<any, number>;
  lifeAreas!: Dexie.Table<any, number>;
  activities!: Dexie.Table<any, number>;
  householdTasks!: Dexie.Table<any, number>;
  goals!: Dexie.Table<any, number>;
  dateNights!: Dexie.Table<any, number>;
  dateNightIdeas!: Dexie.Table<any, number>;
  savedPlaces!: Dexie.Table<any, number>;
  snoozedItems!: Dexie.Table<any, number>;
  userPreferences!: Dexie.Table<any, string>;

  constructor(name = "TestBalanceDB") {
    super(name);
    this.version(1).stores({
      contacts: "++id, name, tier, updatedAt, deletedAt",
      checkIns: "++id, contactId, date, updatedAt, deletedAt",
      lifeAreas: "++id, name, updatedAt, deletedAt",
      activities: "++id, lifeAreaId, date, updatedAt, deletedAt",
      householdTasks: "++id, lifeAreaId, priority, status, updatedAt, deletedAt",
      goals: "++id, lifeAreaId, updatedAt, deletedAt",
      dateNights: "++id, date, updatedAt, deletedAt",
      dateNightIdeas: "++id, updatedAt, deletedAt",
      savedPlaces: "++id, label, updatedAt, deletedAt",
      snoozedItems: "++id, itemType, itemId, snoozedUntil, updatedAt, deletedAt",
      userPreferences: "id",
    });
  }
}

/** The current test database. Changed on every `resetTestDb()` call. */
export let currentTestDb: TestBalanceDatabase = new TestBalanceDatabase();

let dbCounter = 0;

/**
 * Create a fresh database instance. Call this in `beforeEach`.
 * Returns the new database instance.
 */
export async function resetTestDb(): Promise<TestBalanceDatabase> {
  // Close and delete the previous instance
  try {
    currentTestDb.close();
    await currentTestDb.delete();
  } catch {
    // Ignore errors on cleanup
  }

  dbCounter++;
  currentTestDb = new TestBalanceDatabase(`TestBalanceDB_${dbCounter}`);
  await currentTestDb.open();
  return currentTestDb;
}

/**
 * Clean up the test database. Call this in `afterEach`.
 */
export async function cleanupTestDb(): Promise<void> {
  try {
    currentTestDb.close();
    await currentTestDb.delete();
  } catch {
    // Ignore errors on cleanup
  }
}

/**
 * Seed default user preferences for tests.
 */
export async function seedPrefs(
  overrides: Record<string, any> = {}
): Promise<void> {
  await currentTestDb.userPreferences.put({
    id: "prefs",
    onboardingComplete: true,
    deviceId: "test-device-1",
    householdId: null,
    partnerDeviceId: null,
    lastSyncTimestamp: null,
    weekStartDay: "monday",
    dateNightFrequencyDays: 14,
    theme: "system",
    notificationsEnabled: false,
    updatedAt: Date.now(),
    deletedAt: null,
    ...overrides,
  });
}
