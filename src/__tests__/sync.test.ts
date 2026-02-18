/**
 * Unit tests for the sync protocol module.
 *
 * These tests mock Dexie to avoid needing IndexedDB in a Node test environment.
 */

import {
  buildSyncPayload,
  mergeSyncPayload,
  SYNCABLE_ENTITIES,
  type SyncPayload,
  type EntityPayload,
} from "@/lib/sync";
import type { SyncableRecord } from "@/lib/merge";

// ---------------------------------------------------------------------------
// Mock Dexie database
// ---------------------------------------------------------------------------

// In-memory store for each table
const mockStore: Record<string, SyncableRecord[]> = {};

function resetMockStore() {
  for (const name of [
    ...SYNCABLE_ENTITIES,
    "userPreferences",
    "snoozedItems",
  ]) {
    mockStore[name] = [];
  }
}

// Create a mock table that reads/writes from mockStore
function createMockTable(tableName: string) {
  return {
    toArray: jest.fn(async () => [...(mockStore[tableName] || [])]),
    where: jest.fn((field: string) => ({
      above: jest.fn((timestamp: number) => ({
        toArray: jest.fn(async () =>
          (mockStore[tableName] || []).filter(
            (r: Record<string, unknown>) =>
              (r[field] as number) > timestamp,
          ),
        ),
      })),
      aboveOrEqual: jest.fn((timestamp: number) => ({
        toArray: jest.fn(async () =>
          (mockStore[tableName] || []).filter(
            (r: Record<string, unknown>) =>
              (r[field] as number) >= timestamp,
          ),
        ),
      })),
    })),
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
    get: jest.fn(async (key: string) => {
      if (tableName === "userPreferences") {
        return (mockStore[tableName] || []).find(
          (r: Record<string, unknown>) => r.id === key,
        );
      }
      return undefined;
    }),
    update: jest.fn(
      async (key: string, changes: Record<string, unknown>) => {
        if (tableName === "userPreferences") {
          const store = mockStore[tableName] || [];
          const idx = store.findIndex(
            (r: Record<string, unknown>) => r.id === key,
          );
          if (idx >= 0) {
            store[idx] = { ...store[idx], ...changes };
          }
        }
      },
    ),
  };
}

// Mock the db module
jest.mock("@/lib/db", () => {
  const tables: Record<string, ReturnType<typeof createMockTable>> = {};

  // Create mock tables for all entity types
  const allTables = [
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
  ];

  for (const name of allTables) {
    tables[name] = createMockTable(name);
  }

  return {
    db: tables,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContact(
  id: number,
  updatedAt: number,
  deviceId = "device-a",
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
    deviceId,
    deletedAt,
  };
}

function makeCheckIn(
  id: number,
  contactId: number,
  updatedAt: number,
  deviceId = "device-a",
): SyncableRecord & Record<string, unknown> {
  return {
    id,
    contactId,
    date: updatedAt,
    type: "called",
    notes: "",
    location: null,
    updatedAt,
    deviceId,
    deletedAt: null,
  };
}

// ---------------------------------------------------------------------------
// buildSyncPayload
// ---------------------------------------------------------------------------

describe("buildSyncPayload", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("produces a valid payload with version and metadata", async () => {
    const payload = await buildSyncPayload(null, "device-a");

    expect(payload.version).toBe(1);
    expect(payload.deviceId).toBe("device-a");
    expect(payload.lastSyncTimestamp).toBeNull();
    expect(payload.exportedAt).toBeGreaterThan(0);
    expect(payload.entities).toHaveLength(SYNCABLE_ENTITIES.length);
  });

  it("includes all syncable entity types", async () => {
    const payload = await buildSyncPayload(null, "device-a");
    const entityTypes = payload.entities.map((e) => e.entityType);

    for (const expected of SYNCABLE_ENTITIES) {
      expect(entityTypes).toContain(expected);
    }
  });

  it("excludes UserPreferences and SnoozedItem from payload", async () => {
    // Add data to device-local tables
    mockStore["userPreferences"] = [
      {
        id: "prefs" as unknown as number,
        deviceId: "device-a",
        updatedAt: 1000,
        deletedAt: null,
      },
    ];
    mockStore["snoozedItems"] = [
      { id: 1, itemType: "contact", itemId: 1, snoozedUntil: 9999, updatedAt: 1000, deviceId: "device-a", deletedAt: null } as unknown as SyncableRecord,
    ];

    const payload = await buildSyncPayload(null, "device-a");
    const entityTypes = payload.entities.map((e) => e.entityType);

    expect(entityTypes).not.toContain("userPreferences");
    expect(entityTypes).not.toContain("snoozedItems");
  });

  it("returns all records on first sync (sinceTimestamp = null)", async () => {
    mockStore["contacts"] = [
      makeContact(1, 1000),
      makeContact(2, 2000),
      makeContact(3, 3000),
    ];

    const payload = await buildSyncPayload(null, "device-a");
    const contactsEntity = payload.entities.find(
      (e) => e.entityType === "contacts",
    );

    expect(contactsEntity?.count).toBe(3);
    expect(contactsEntity?.records).toHaveLength(3);
  });

  it("returns only changed records since last sync", async () => {
    mockStore["contacts"] = [
      makeContact(1, 1000), // before cutoff
      makeContact(2, 2000), // at cutoff (included)
      makeContact(3, 3000), // after cutoff
    ];

    const payload = await buildSyncPayload(2000, "device-a");
    const contactsEntity = payload.entities.find(
      (e) => e.entityType === "contacts",
    );

    // Records 2 (updatedAt=2000) and 3 (updatedAt=3000) are at or after timestamp 2000
    expect(contactsEntity?.count).toBe(2);
    expect(contactsEntity?.records[0].id).toBe(2);
    expect(contactsEntity?.records[1].id).toBe(3);
  });

  it("calculates correct totalRecords across entity types", async () => {
    mockStore["contacts"] = [makeContact(1, 1000), makeContact(2, 2000)];
    mockStore["checkIns"] = [makeCheckIn(1, 1, 1000)];

    const payload = await buildSyncPayload(null, "device-a");

    expect(payload.totalRecords).toBe(3);
  });

  it("includes entity type and count metadata", async () => {
    mockStore["contacts"] = [makeContact(1, 1000)];

    const payload = await buildSyncPayload(null, "device-a");
    const contactsEntity = payload.entities.find(
      (e) => e.entityType === "contacts",
    );

    expect(contactsEntity).toBeDefined();
    expect(contactsEntity?.entityType).toBe("contacts");
    expect(contactsEntity?.count).toBe(1);
  });

  it("includes soft-deleted records in payload", async () => {
    mockStore["contacts"] = [
      makeContact(1, 2000, "device-a", 2000), // soft-deleted
      makeContact(2, 1000),
    ];

    const payload = await buildSyncPayload(null, "device-a");
    const contactsEntity = payload.entities.find(
      (e) => e.entityType === "contacts",
    );

    expect(contactsEntity?.count).toBe(2);
    expect(contactsEntity?.records[0].deletedAt).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// mergeSyncPayload
// ---------------------------------------------------------------------------

describe("mergeSyncPayload", () => {
  beforeEach(() => {
    resetMockStore();
  });

  function buildPayload(entities: EntityPayload[]): SyncPayload {
    const totalRecords = entities.reduce((sum, e) => sum + e.count, 0);
    return {
      version: 1,
      exportedAt: Date.now(),
      deviceId: "device-b",
      lastSyncTimestamp: null,
      entities,
      totalRecords,
    };
  }

  it("inserts new records not in local DB", async () => {
    const remoteContacts = [makeContact(1, 1000, "device-b")];
    const payload = buildPayload([
      { entityType: "contacts", count: 1, records: remoteContacts },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalReceived).toBe(1);
    expect(summary.totalUpserted).toBe(1);
    expect(mockStore["contacts"]).toHaveLength(1);
    expect(mockStore["contacts"][0].id).toBe(1);
  });

  it("upserts when remote is newer", async () => {
    mockStore["contacts"] = [makeContact(1, 1000, "device-a")];

    const remoteContacts = [makeContact(1, 2000, "device-b")];
    const payload = buildPayload([
      { entityType: "contacts", count: 1, records: remoteContacts },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalRemoteWins).toBe(1);
    expect(summary.totalUpserted).toBe(1);
    expect(mockStore["contacts"][0].updatedAt).toBe(2000);
    expect(mockStore["contacts"][0].deviceId).toBe("device-b");
  });

  it("keeps local when local is newer", async () => {
    mockStore["contacts"] = [makeContact(1, 3000, "device-a")];

    const remoteContacts = [makeContact(1, 1000, "device-b")];
    const payload = buildPayload([
      { entityType: "contacts", count: 1, records: remoteContacts },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalLocalWins).toBe(1);
    expect(summary.totalUpserted).toBe(0);
    expect(mockStore["contacts"][0].updatedAt).toBe(3000);
    expect(mockStore["contacts"][0].deviceId).toBe("device-a");
  });

  it("propagates soft deletes from remote", async () => {
    mockStore["contacts"] = [makeContact(1, 1000, "device-a")];

    const remoteContacts = [makeContact(1, 2000, "device-b", 2000)];
    const payload = buildPayload([
      { entityType: "contacts", count: 1, records: remoteContacts },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalRemoteWins).toBe(1);
    expect(mockStore["contacts"][0].deletedAt).toBe(2000);
  });

  it("handles identical timestamps (equal — no change)", async () => {
    mockStore["contacts"] = [makeContact(1, 1000, "device-a")];

    const remoteContacts = [makeContact(1, 1000, "device-b")];
    const payload = buildPayload([
      { entityType: "contacts", count: 1, records: remoteContacts },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalUpserted).toBe(0);
    expect(summary.totalLocalWins).toBe(0);
    expect(summary.totalRemoteWins).toBe(0);
    // perEntity should show equal
    expect(summary.perEntity["contacts"]?.equal).toBe(1);
  });

  it("merges multiple entity types in a single payload", async () => {
    mockStore["contacts"] = [makeContact(1, 1000, "device-a")];
    mockStore["checkIns"] = [];

    const payload = buildPayload([
      {
        entityType: "contacts",
        count: 1,
        records: [makeContact(1, 2000, "device-b")],
      },
      {
        entityType: "checkIns",
        count: 1,
        records: [makeCheckIn(1, 1, 3000, "device-b")],
      },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalReceived).toBe(2);
    expect(summary.totalUpserted).toBe(2);
    expect(mockStore["contacts"]).toHaveLength(1);
    expect(mockStore["checkIns"]).toHaveLength(1);
  });

  it("skips entity types with zero records", async () => {
    const payload = buildPayload([
      { entityType: "contacts", count: 0, records: [] },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalUpserted).toBe(0);
    expect(summary.perEntity["contacts"]).toBeUndefined();
  });

  it("handles mixed new and existing records in same entity", async () => {
    mockStore["contacts"] = [
      makeContact(1, 1000, "device-a"), // existing — remote newer
      makeContact(2, 3000, "device-a"), // existing — local newer
    ];

    const remoteContacts = [
      makeContact(1, 2000, "device-b"), // newer → upsert
      makeContact(2, 1000, "device-b"), // older → skip
      makeContact(3, 1000, "device-b"), // new → insert
    ];
    const payload = buildPayload([
      { entityType: "contacts", count: 3, records: remoteContacts },
    ]);

    const summary = await mergeSyncPayload(payload);

    expect(summary.totalUpserted).toBe(2); // record 1 (remote win) + record 3 (new)
    expect(summary.totalRemoteWins).toBe(1);
    expect(summary.totalLocalWins).toBe(1);
    expect(summary.perEntity["contacts"]?.newRecords).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// SyncPayload serialisation
// ---------------------------------------------------------------------------

describe("SyncPayload serialisation", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("produces valid JSON that can be round-tripped", async () => {
    mockStore["contacts"] = [makeContact(1, 1000)];

    const payload = await buildSyncPayload(null, "device-a");
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json) as SyncPayload;

    expect(parsed.version).toBe(1);
    expect(parsed.deviceId).toBe("device-a");
    expect(parsed.entities).toHaveLength(SYNCABLE_ENTITIES.length);

    const contacts = parsed.entities.find((e) => e.entityType === "contacts");
    expect(contacts?.records).toHaveLength(1);
    expect(contacts?.records[0].id).toBe(1);
  });

  it("preserves all record fields through JSON serialisation", async () => {
    const contact = makeContact(1, 1000, "device-a", null);
    mockStore["contacts"] = [contact];

    const payload = await buildSyncPayload(null, "device-a");
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json) as SyncPayload;

    const record = parsed.entities.find(
      (e) => e.entityType === "contacts",
    )?.records[0] as Record<string, unknown>;

    expect(record.name).toBe("Contact 1");
    expect(record.tier).toBe("close-friends");
    expect(record.updatedAt).toBe(1000);
    expect(record.deviceId).toBe("device-a");
    expect(record.deletedAt).toBeNull();
  });
});
