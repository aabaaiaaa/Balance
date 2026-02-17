import {
  mergeRecord,
  mergeRecordBatch,
  type SyncableRecord,
} from "@/lib/merge";

// ---------------------------------------------------------------------------
// Helper to build test records
// ---------------------------------------------------------------------------

function makeRecord(
  id: number,
  updatedAt: number,
  deletedAt: number | null = null,
  deviceId = "device-a",
): SyncableRecord {
  return { id, updatedAt, deviceId, deletedAt };
}

// ---------------------------------------------------------------------------
// mergeRecord
// ---------------------------------------------------------------------------

describe("mergeRecord", () => {
  it("remote wins when no local record exists", () => {
    const remote = makeRecord(1, 1000);
    const result = mergeRecord(undefined, remote);

    expect(result.winner).toBe("remote");
    expect(result.record).toBe(remote);
  });

  it("keeps local when timestamps are equal", () => {
    const local = makeRecord(1, 1000, null, "device-a");
    const remote = makeRecord(1, 1000, null, "device-b");
    const result = mergeRecord(local, remote);

    expect(result.winner).toBe("equal");
    expect(result.record).toBe(local);
  });

  it("remote wins when remote is newer", () => {
    const local = makeRecord(1, 1000);
    const remote = makeRecord(1, 2000, null, "device-b");
    const result = mergeRecord(local, remote);

    expect(result.winner).toBe("remote");
    expect(result.record).toBe(remote);
  });

  it("local wins when local is newer", () => {
    const local = makeRecord(1, 2000);
    const remote = makeRecord(1, 1000, null, "device-b");
    const result = mergeRecord(local, remote);

    expect(result.winner).toBe("local");
    expect(result.record).toBe(local);
  });

  it("propagates soft delete when remote wins with deletedAt", () => {
    const local = makeRecord(1, 1000);
    const remote = makeRecord(1, 2000, 2000, "device-b");
    const result = mergeRecord(local, remote);

    expect(result.winner).toBe("remote");
    expect(result.record.deletedAt).toBe(2000);
  });

  it("preserves local soft delete when local wins", () => {
    const local = makeRecord(1, 2000, 2000);
    const remote = makeRecord(1, 1000, null, "device-b");
    const result = mergeRecord(local, remote);

    expect(result.winner).toBe("local");
    expect(result.record.deletedAt).toBe(2000);
  });

  it("handles remote soft delete undoing local active record", () => {
    const local = makeRecord(1, 1000, null);
    const remote = makeRecord(1, 3000, 3000, "device-b");
    const result = mergeRecord(local, remote);

    expect(result.winner).toBe("remote");
    expect(result.record.deletedAt).toBe(3000);
  });

  it("handles very close timestamps correctly", () => {
    const local = makeRecord(1, 1000);
    const remote = makeRecord(1, 1001, null, "device-b");
    const result = mergeRecord(local, remote);

    expect(result.winner).toBe("remote");
  });
});

// ---------------------------------------------------------------------------
// mergeRecordBatch
// ---------------------------------------------------------------------------

describe("mergeRecordBatch", () => {
  it("returns empty upsert list when no remote records", () => {
    const local = [makeRecord(1, 1000), makeRecord(2, 2000)];
    const result = mergeRecordBatch(local, []);

    expect(result.toUpsert).toHaveLength(0);
    expect(result.remoteWins).toBe(0);
    expect(result.localWins).toBe(0);
    expect(result.equal).toBe(0);
    expect(result.newRecords).toBe(0);
  });

  it("inserts all remote records when local is empty", () => {
    const remote = [makeRecord(1, 1000), makeRecord(2, 2000)];
    const result = mergeRecordBatch([], remote);

    expect(result.toUpsert).toHaveLength(2);
    expect(result.newRecords).toBe(2);
    expect(result.remoteWins).toBe(0);
  });

  it("correctly categorises mixed results", () => {
    const local = [
      makeRecord(1, 1000), // remote will be newer → remote wins
      makeRecord(2, 3000), // remote will be older → local wins
      makeRecord(3, 2000), // remote will be same → equal
    ];
    const remote = [
      makeRecord(1, 2000, null, "device-b"), // newer
      makeRecord(2, 1000, null, "device-b"), // older
      makeRecord(3, 2000, null, "device-b"), // same
      makeRecord(4, 1000, null, "device-b"), // new record
    ];

    const result = mergeRecordBatch(local, remote);

    expect(result.remoteWins).toBe(1);
    expect(result.localWins).toBe(1);
    expect(result.equal).toBe(1);
    expect(result.newRecords).toBe(1);
    expect(result.toUpsert).toHaveLength(2); // remote wins + new
  });

  it("propagates soft deletes in batch", () => {
    const local = [makeRecord(1, 1000)];
    const remote = [makeRecord(1, 2000, 2000, "device-b")];

    const result = mergeRecordBatch(local, remote);

    expect(result.toUpsert).toHaveLength(1);
    expect(result.toUpsert[0].deletedAt).toBe(2000);
    expect(result.remoteWins).toBe(1);
  });

  it("handles large batches", () => {
    const local = Array.from({ length: 100 }, (_, i) =>
      makeRecord(i + 1, 1000 + i),
    );
    const remote = Array.from({ length: 100 }, (_, i) =>
      makeRecord(i + 1, 1000 + i + (i % 2 === 0 ? 100 : -100), null, "device-b"),
    );

    const result = mergeRecordBatch(local, remote);

    // Even indices: remote is newer (+100) → remote wins = 50
    // Odd indices: remote is older (-100) → local wins = 50
    expect(result.remoteWins).toBe(50);
    expect(result.localWins).toBe(50);
    expect(result.toUpsert).toHaveLength(50);
  });

  it("handles records without ids gracefully", () => {
    const local = [makeRecord(1, 1000)];
    const remote: SyncableRecord[] = [
      { updatedAt: 2000, deviceId: "device-b", deletedAt: null },
    ];

    // Records without IDs won't match any local record
    const result = mergeRecordBatch(local, remote);
    expect(result.newRecords).toBe(1);
    expect(result.toUpsert).toHaveLength(1);
  });
});
