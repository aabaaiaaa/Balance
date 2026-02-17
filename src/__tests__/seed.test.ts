import "fake-indexeddb/auto";
import { BalanceDatabase } from "@/lib/db";
import { DEFAULT_LIFE_AREAS, DEFAULT_DATE_NIGHT_FREQUENCY_DAYS } from "@/lib/constants";

// We need to mock the db module to use our test database instance
// and mock the device-id module for deterministic tests.
let testDb: BalanceDatabase;

jest.mock("@/lib/db", () => {
  // Lazy-init: create the test DB when first accessed
  return {
    get db() {
      if (!testDb) {
        const { BalanceDatabase } = jest.requireActual("@/lib/db");
        testDb = new BalanceDatabase();
      }
      return testDb;
    },
    BalanceDatabase: jest.requireActual("@/lib/db").BalanceDatabase,
  };
});

jest.mock("@/lib/device-id", () => ({
  generateDeviceId: () => "test-device-id-123",
}));

// Import seedDatabase AFTER mocks are set up
import { seedDatabase } from "@/lib/seed";

beforeEach(async () => {
  const { BalanceDatabase } = jest.requireActual("@/lib/db");
  testDb = new BalanceDatabase();
  await testDb.open();
});

afterEach(async () => {
  testDb.close();
  await testDb.delete();
});

describe("seedDatabase", () => {
  it("creates default user preferences", async () => {
    await seedDatabase();

    const prefs = await testDb.userPreferences.get("prefs");
    expect(prefs).toBeDefined();
    expect(prefs!.deviceId).toBe("test-device-id-123");
    expect(prefs!.onboardingComplete).toBe(false);
    expect(prefs!.weekStartDay).toBe("monday");
    expect(prefs!.theme).toBe("system");
    expect(prefs!.dateNightFrequencyDays).toBe(DEFAULT_DATE_NIGHT_FREQUENCY_DAYS);
    expect(prefs!.householdId).toBeNull();
    expect(prefs!.partnerDeviceId).toBeNull();
    expect(prefs!.lastSyncTimestamp).toBeNull();
  });

  it("seeds default life areas", async () => {
    await seedDatabase();

    const areas = await testDb.lifeAreas.toArray();
    expect(areas).toHaveLength(DEFAULT_LIFE_AREAS.length);

    const names = areas.map((a: { name: string }) => a.name);
    for (const defaultArea of DEFAULT_LIFE_AREAS) {
      expect(names).toContain(defaultArea.name);
    }
  });

  it("sets sync fields on seeded life areas", async () => {
    await seedDatabase();

    const areas = await testDb.lifeAreas.toArray();
    for (const area of areas) {
      expect(area.deviceId).toBe("test-device-id-123");
      expect(area.updatedAt).toBeGreaterThan(0);
      expect(area.deletedAt).toBeNull();
    }
  });

  it("is idempotent — does not duplicate data on second call", async () => {
    await seedDatabase();
    await seedDatabase();

    const prefsCount = await testDb.userPreferences.count();
    expect(prefsCount).toBe(1);

    const areasCount = await testDb.lifeAreas.count();
    expect(areasCount).toBe(DEFAULT_LIFE_AREAS.length);
  });
});
