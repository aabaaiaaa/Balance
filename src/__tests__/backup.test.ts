/**
 * Unit tests for the data export/import module (lib/backup.ts).
 *
 * Tests cover:
 * - validateBackupFile() — valid and invalid inputs
 * - parseBackupSummary() — summary extraction
 * - buildBackup() — export produces valid JSON for all 11 entity types
 * - importReplaceAll() — clear and reload
 * - importMerge() — last-write-wins merge, UserPreferences special handling
 *
 * The Dexie database is mocked with an in-memory store.
 */

import {
  validateBackupFile,
  parseBackupSummary,
  buildBackup,
  importReplaceAll,
  importMerge,
  BACKUP_ENTITIES,
  type BackupFile,
  type BackupEntityPayload,
} from "@/lib/backup";
import type { SyncableRecord } from "@/lib/merge";

// ---------------------------------------------------------------------------
// Mock Dexie database (in-memory store)
// ---------------------------------------------------------------------------

const mockStore: Record<string, SyncableRecord[]> = {};

function resetMockStore() {
  for (const name of BACKUP_ENTITIES) {
    mockStore[name] = [];
  }
}

function createMockTable(tableName: string) {
  return {
    toArray: jest.fn(async () => [...(mockStore[tableName] || [])]),
    clear: jest.fn(async () => {
      mockStore[tableName] = [];
    }),
    bulkPut: jest.fn(async (records: SyncableRecord[]) => {
      const store = mockStore[tableName] || [];
      for (const record of records) {
        const existingIdx = store.findIndex((r) => r.id === record.id);
        if (existingIdx >= 0) {
          store[existingIdx] = record;
        } else {
          store.push(record);
        }
      }
      mockStore[tableName] = store;
    }),
  };
}

jest.mock("@/lib/db", () => {
  const tables: Record<string, ReturnType<typeof createMockTable>> = {};

  for (const name of [
    "contacts",
    "checkIns",
    "lifeAreas",
    "activities",
    "householdTasks",
    "goals",
    "dateNights",
    "dateNightIdeas",
    "savedPlaces",
    "snoozedItems",
    "userPreferences",
  ]) {
    tables[name] = createMockTable(name);
  }

  return {
    db: {
      ...tables,
      transaction: jest.fn(
        async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => {
          await fn();
        },
      ),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-02-16T12:00:00Z").getTime();

function makeContact(
  id: number,
  updatedAt: number = NOW,
  deletedAt: number | null = null,
): SyncableRecord & Record<string, unknown> {
  return {
    id,
    name: `Contact ${id}`,
    tier: "close-friends",
    checkInFrequencyDays: 14,
    lastCheckIn: null,
    notes: "",
    phoneNumber: "",
    location: null,
    updatedAt,
    deviceId: "device-a",
    deletedAt,
  };
}

function makeCheckIn(
  id: number,
  contactId: number,
  updatedAt: number = NOW,
): SyncableRecord & Record<string, unknown> {
  return {
    id,
    contactId,
    date: updatedAt,
    type: "called",
    notes: "",
    location: null,
    updatedAt,
    deviceId: "device-a",
    deletedAt: null,
  };
}

function makeLifeArea(
  id: number,
  updatedAt: number = NOW,
): SyncableRecord & Record<string, unknown> {
  return {
    id,
    name: `Area ${id}`,
    icon: "star",
    targetHoursPerWeek: 5,
    updatedAt,
    deviceId: "device-a",
    deletedAt: null,
  };
}

function makeUserPrefs(): Record<string, unknown> {
  return {
    id: "prefs",
    onboardingComplete: true,
    deviceId: "device-a",
    householdId: null,
    partnerDeviceId: null,
    lastSyncTimestamp: null,
    weekStartDay: "monday",
    dateNightFrequencyDays: 14,
    theme: "system",
  };
}

function makeSnoozedItem(
  id: number,
  updatedAt: number = NOW,
): SyncableRecord & Record<string, unknown> {
  return {
    id,
    itemType: "contact",
    itemId: 1,
    snoozedUntil: NOW + 86_400_000,
    updatedAt,
    deviceId: "device-a",
    deletedAt: null,
  };
}

function buildMinimalBackup(
  overrides?: Partial<BackupFile>,
  entities?: BackupEntityPayload[],
): BackupFile {
  const ents = entities ?? [
    { entityType: "contacts" as const, count: 0, records: [] },
  ];
  const totalRecords = ents.reduce((sum, e) => sum + e.count, 0);
  return {
    format: "balance-backup",
    version: 1,
    exportedAt: NOW,
    entities: ents,
    totalRecords,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateBackupFile
// ---------------------------------------------------------------------------

describe("validateBackupFile", () => {
  it("accepts a valid backup file", () => {
    const file = buildMinimalBackup();
    const result = validateBackupFile(file);
    expect(result.format).toBe("balance-backup");
    expect(result.version).toBe(1);
  });

  it("throws for null input", () => {
    expect(() => validateBackupFile(null)).toThrow("not a JSON object");
  });

  it("throws for non-object input", () => {
    expect(() => validateBackupFile("string")).toThrow("not a JSON object");
    expect(() => validateBackupFile(42)).toThrow("not a JSON object");
  });

  it("throws for missing format field", () => {
    expect(() =>
      validateBackupFile({ version: 1, exportedAt: NOW, entities: [], totalRecords: 0 }),
    ).toThrow('missing or incorrect "format" field');
  });

  it("throws for wrong format field", () => {
    expect(() =>
      validateBackupFile({
        format: "not-balance",
        version: 1,
        exportedAt: NOW,
        entities: [],
        totalRecords: 0,
      }),
    ).toThrow("doesn't appear to be a Balance backup file");
  });

  it("throws for unsupported version", () => {
    expect(() =>
      validateBackupFile({
        format: "balance-backup",
        version: 2,
        exportedAt: NOW,
        entities: [],
        totalRecords: 0,
      }),
    ).toThrow("Incompatible backup version: 2");
  });

  it("throws for missing exportedAt", () => {
    expect(() =>
      validateBackupFile({
        format: "balance-backup",
        version: 1,
        entities: [],
        totalRecords: 0,
      }),
    ).toThrow("missing export timestamp");
  });

  it("throws for non-number exportedAt", () => {
    expect(() =>
      validateBackupFile({
        format: "balance-backup",
        version: 1,
        exportedAt: "2026-02-16",
        entities: [],
        totalRecords: 0,
      }),
    ).toThrow("missing export timestamp");
  });

  it("throws for missing entities array", () => {
    expect(() =>
      validateBackupFile({
        format: "balance-backup",
        version: 1,
        exportedAt: NOW,
        totalRecords: 0,
      }),
    ).toThrow("missing entities array");
  });

  it("throws for malformed entity payload", () => {
    expect(() =>
      validateBackupFile({
        format: "balance-backup",
        version: 1,
        exportedAt: NOW,
        entities: [{ entityType: "contacts" }], // missing count and records
        totalRecords: 0,
      }),
    ).toThrow("malformed entity payload");
  });

  it("throws for entity with non-array records", () => {
    expect(() =>
      validateBackupFile({
        format: "balance-backup",
        version: 1,
        exportedAt: NOW,
        entities: [{ entityType: "contacts", count: 1, records: "not-array" }],
        totalRecords: 1,
      }),
    ).toThrow("malformed entity payload");
  });

  it("accepts a backup with all 11 entity types present", () => {
    const entities = BACKUP_ENTITIES.map((name) => ({
      entityType: name,
      count: 0,
      records: [],
    }));
    const file = buildMinimalBackup({}, entities);
    const result = validateBackupFile(file);
    expect(result.entities).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// parseBackupSummary
// ---------------------------------------------------------------------------

describe("parseBackupSummary", () => {
  it("extracts entity counts correctly", () => {
    const backup = buildMinimalBackup({}, [
      { entityType: "contacts", count: 5, records: [] },
      { entityType: "checkIns", count: 20, records: [] },
      { entityType: "lifeAreas", count: 5, records: [] },
    ]);
    backup.totalRecords = 30;

    const summary = parseBackupSummary(backup);

    expect(summary.entities["contacts"]).toBe(5);
    expect(summary.entities["checkIns"]).toBe(20);
    expect(summary.entities["lifeAreas"]).toBe(5);
    expect(summary.totalRecords).toBe(30);
  });

  it("preserves export timestamp and version", () => {
    const backup = buildMinimalBackup({ exportedAt: 1234567890, version: 1 });

    const summary = parseBackupSummary(backup);

    expect(summary.exportedAt).toBe(1234567890);
    expect(summary.version).toBe(1);
  });

  it("handles empty backup", () => {
    const backup = buildMinimalBackup({}, []);
    backup.totalRecords = 0;

    const summary = parseBackupSummary(backup);

    expect(summary.totalRecords).toBe(0);
    expect(Object.keys(summary.entities)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildBackup
// ---------------------------------------------------------------------------

describe("buildBackup", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("exports all 11 entity types", async () => {
    const backup = await buildBackup();

    expect(backup.format).toBe("balance-backup");
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBeGreaterThan(0);
    expect(backup.entities).toHaveLength(BACKUP_ENTITIES.length);

    const entityTypes = backup.entities.map((e) => e.entityType);
    for (const expected of BACKUP_ENTITIES) {
      expect(entityTypes).toContain(expected);
    }
  });

  it("includes UserPreferences (unlike sync)", async () => {
    mockStore["userPreferences"] = [makeUserPrefs() as unknown as SyncableRecord];

    const backup = await buildBackup();
    const prefs = backup.entities.find((e) => e.entityType === "userPreferences");

    expect(prefs).toBeDefined();
    expect(prefs!.count).toBe(1);
    expect(prefs!.records).toHaveLength(1);
  });

  it("includes SnoozedItems (unlike sync)", async () => {
    mockStore["snoozedItems"] = [makeSnoozedItem(1) as unknown as SyncableRecord];

    const backup = await buildBackup();
    const snoozed = backup.entities.find((e) => e.entityType === "snoozedItems");

    expect(snoozed).toBeDefined();
    expect(snoozed!.count).toBe(1);
  });

  it("counts totalRecords correctly across entity types", async () => {
    mockStore["contacts"] = [makeContact(1), makeContact(2)];
    mockStore["checkIns"] = [makeCheckIn(1, 1), makeCheckIn(2, 1), makeCheckIn(3, 2)];
    mockStore["lifeAreas"] = [makeLifeArea(1)];

    const backup = await buildBackup();

    expect(backup.totalRecords).toBe(6);
  });

  it("includes soft-deleted records", async () => {
    mockStore["contacts"] = [
      makeContact(1),
      makeContact(2, NOW, NOW), // soft-deleted
    ];

    const backup = await buildBackup();
    const contacts = backup.entities.find((e) => e.entityType === "contacts");

    expect(contacts!.count).toBe(2);
  });

  it("produces valid JSON that round-trips correctly", async () => {
    mockStore["contacts"] = [makeContact(1)];

    const backup = await buildBackup();
    const json = JSON.stringify(backup);
    const parsed = JSON.parse(json);

    // Should pass validation after round-trip
    const validated = validateBackupFile(parsed);
    expect(validated.format).toBe("balance-backup");
    expect(validated.entities.find((e) => e.entityType === "contacts")!.count).toBe(1);
  });

  it("returns empty entities when database is empty", async () => {
    const backup = await buildBackup();

    expect(backup.totalRecords).toBe(0);
    for (const entity of backup.entities) {
      expect(entity.count).toBe(0);
      expect(entity.records).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// importReplaceAll
// ---------------------------------------------------------------------------

describe("importReplaceAll", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("clears existing data and imports all records", async () => {
    // Pre-existing data
    mockStore["contacts"] = [makeContact(99)];
    mockStore["checkIns"] = [makeCheckIn(99, 99)];

    // Backup with different data
    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 2,
        records: [makeContact(1), makeContact(2)] as unknown[],
      },
      {
        entityType: "checkIns",
        count: 1,
        records: [makeCheckIn(1, 1)] as unknown[],
      },
    ]);
    backup.totalRecords = 3;

    const result = await importReplaceAll(backup);

    expect(result.mode).toBe("replace");
    expect(result.totalImported).toBe(3);
    // Old data should be gone
    expect(mockStore["contacts"]).toHaveLength(2);
    expect(mockStore["contacts"].find((r) => (r as Record<string, unknown>).id === 99)).toBeUndefined();
  });

  it("clears all tables even when backup has no data for them", async () => {
    mockStore["contacts"] = [makeContact(1)];
    mockStore["lifeAreas"] = [makeLifeArea(1)];

    // Backup with only contacts, no life areas
    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 1,
        records: [makeContact(2)] as unknown[],
      },
    ]);
    backup.totalRecords = 1;

    await importReplaceAll(backup);

    // Life areas should be cleared (backup didn't include them)
    expect(mockStore["lifeAreas"]).toHaveLength(0);
  });

  it("skips entities with zero records", async () => {
    const backup = buildMinimalBackup({}, [
      { entityType: "contacts", count: 0, records: [] },
      {
        entityType: "lifeAreas",
        count: 1,
        records: [makeLifeArea(1)] as unknown[],
      },
    ]);
    backup.totalRecords = 1;

    const result = await importReplaceAll(backup);

    expect(result.totalImported).toBe(1);
    expect(mockStore["lifeAreas"]).toHaveLength(1);
  });

  it("returns empty perEntity for replace mode", async () => {
    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 1,
        records: [makeContact(1)] as unknown[],
      },
    ]);
    backup.totalRecords = 1;

    const result = await importReplaceAll(backup);

    expect(result.perEntity).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// importMerge
// ---------------------------------------------------------------------------

describe("importMerge", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("inserts new records not in local DB", async () => {
    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 2,
        records: [makeContact(1), makeContact(2)] as unknown[],
      },
    ]);
    backup.totalRecords = 2;

    const result = await importMerge(backup);

    expect(result.mode).toBe("merge");
    expect(result.totalImported).toBe(2);
    expect(mockStore["contacts"]).toHaveLength(2);
    expect(result.perEntity["contacts"]?.newRecords).toBe(2);
  });

  it("keeps local record when local is newer", async () => {
    mockStore["contacts"] = [makeContact(1, NOW + 1000)]; // local is newer

    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 1,
        records: [makeContact(1, NOW)] as unknown[], // backup is older
      },
    ]);
    backup.totalRecords = 1;

    const result = await importMerge(backup);

    expect(result.perEntity["contacts"]?.localWins).toBe(1);
    expect(result.totalImported).toBe(0);
    expect(mockStore["contacts"][0].updatedAt).toBe(NOW + 1000); // local kept
  });

  it("upserts when backup record is newer", async () => {
    mockStore["contacts"] = [makeContact(1, NOW)]; // local

    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 1,
        records: [makeContact(1, NOW + 2000)] as unknown[], // backup is newer
      },
    ]);
    backup.totalRecords = 1;

    const result = await importMerge(backup);

    expect(result.perEntity["contacts"]?.remoteWins).toBe(1);
    expect(result.totalImported).toBe(1);
    expect(mockStore["contacts"][0].updatedAt).toBe(NOW + 2000);
  });

  it("handles identical timestamps (equal — no change)", async () => {
    mockStore["contacts"] = [makeContact(1, NOW)];

    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 1,
        records: [makeContact(1, NOW)] as unknown[],
      },
    ]);
    backup.totalRecords = 1;

    const result = await importMerge(backup);

    expect(result.perEntity["contacts"]?.equal).toBe(1);
    expect(result.totalImported).toBe(0);
  });

  it("propagates soft deletes from backup", async () => {
    mockStore["contacts"] = [makeContact(1, NOW)];

    const deletedContact = makeContact(1, NOW + 1000, NOW + 1000); // soft-deleted, newer
    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 1,
        records: [deletedContact] as unknown[],
      },
    ]);
    backup.totalRecords = 1;

    const result = await importMerge(backup);

    expect(result.perEntity["contacts"]?.remoteWins).toBe(1);
    expect(mockStore["contacts"][0].deletedAt).toBe(NOW + 1000);
  });

  it("keeps local UserPreferences when they exist", async () => {
    const localPrefs = makeUserPrefs();
    (localPrefs as Record<string, unknown>).theme = "dark"; // local preference
    mockStore["userPreferences"] = [localPrefs as unknown as SyncableRecord];

    const backupPrefs = makeUserPrefs();
    (backupPrefs as Record<string, unknown>).theme = "light"; // different in backup

    const backup = buildMinimalBackup({}, [
      {
        entityType: "userPreferences",
        count: 1,
        records: [backupPrefs] as unknown[],
      },
    ]);
    backup.totalRecords = 1;

    await importMerge(backup);

    // Should keep local preferences
    expect(
      (mockStore["userPreferences"][0] as Record<string, unknown>).theme,
    ).toBe("dark");
  });

  it("imports UserPreferences when no local preferences exist", async () => {
    mockStore["userPreferences"] = []; // empty

    const backup = buildMinimalBackup({}, [
      {
        entityType: "userPreferences",
        count: 1,
        records: [makeUserPrefs()] as unknown[],
      },
    ]);
    backup.totalRecords = 1;

    const result = await importMerge(backup);

    expect(mockStore["userPreferences"]).toHaveLength(1);
    expect(result.totalImported).toBe(1);
  });

  it("merges multiple entity types in a single backup", async () => {
    mockStore["contacts"] = [makeContact(1, NOW)]; // existing
    mockStore["checkIns"] = []; // empty

    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 1,
        records: [makeContact(1, NOW + 1000)] as unknown[], // newer
      },
      {
        entityType: "checkIns",
        count: 2,
        records: [makeCheckIn(1, 1), makeCheckIn(2, 1)] as unknown[],
      },
    ]);
    backup.totalRecords = 3;

    const result = await importMerge(backup);

    expect(result.totalImported).toBe(3); // 1 contact upsert + 2 new check-ins
    expect(mockStore["contacts"]).toHaveLength(1);
    expect(mockStore["checkIns"]).toHaveLength(2);
  });

  it("skips entity types with zero records", async () => {
    const backup = buildMinimalBackup({}, [
      { entityType: "contacts", count: 0, records: [] },
    ]);
    backup.totalRecords = 0;

    const result = await importMerge(backup);

    expect(result.totalImported).toBe(0);
    expect(result.perEntity["contacts"]).toBeUndefined();
  });

  it("handles mixed new and existing records in same entity", async () => {
    mockStore["contacts"] = [
      makeContact(1, NOW),       // remote newer → upsert
      makeContact(2, NOW + 5000), // remote older → keep local
    ];

    const backup = buildMinimalBackup({}, [
      {
        entityType: "contacts",
        count: 3,
        records: [
          makeContact(1, NOW + 1000), // newer → upsert
          makeContact(2, NOW),        // older → skip
          makeContact(3, NOW),        // new → insert
        ] as unknown[],
      },
    ]);
    backup.totalRecords = 3;

    const result = await importMerge(backup);

    expect(result.totalImported).toBe(2); // contact 1 (remote win) + contact 3 (new)
    expect(result.perEntity["contacts"]?.remoteWins).toBe(1);
    expect(result.perEntity["contacts"]?.localWins).toBe(1);
    expect(result.perEntity["contacts"]?.newRecords).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Full export → import round-trip
// ---------------------------------------------------------------------------

describe("export → import round-trip", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("round-trips data through export → validate → replace", async () => {
    // Seed some data
    mockStore["contacts"] = [makeContact(1), makeContact(2)];
    mockStore["checkIns"] = [makeCheckIn(1, 1)];
    mockStore["lifeAreas"] = [makeLifeArea(1)];
    mockStore["userPreferences"] = [makeUserPrefs() as unknown as SyncableRecord];

    // Export
    const backup = await buildBackup();

    // Validate
    const validated = validateBackupFile(backup);

    // Clear and replace
    resetMockStore();
    const result = await importReplaceAll(validated);

    expect(result.totalImported).toBe(5);
    expect(mockStore["contacts"]).toHaveLength(2);
    expect(mockStore["checkIns"]).toHaveLength(1);
    expect(mockStore["lifeAreas"]).toHaveLength(1);
    expect(mockStore["userPreferences"]).toHaveLength(1);
  });

  it("round-trips through JSON serialisation", async () => {
    mockStore["contacts"] = [makeContact(1)];

    const backup = await buildBackup();
    const json = JSON.stringify(backup);
    const parsed = JSON.parse(json);
    const validated = validateBackupFile(parsed);

    resetMockStore();
    const result = await importReplaceAll(validated);

    expect(result.totalImported).toBe(1);
    expect(mockStore["contacts"]).toHaveLength(1);
  });
});
