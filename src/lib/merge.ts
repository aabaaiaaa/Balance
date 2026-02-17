/**
 * Reusable merge utility for last-write-wins conflict resolution.
 *
 * This module is used by both the sync protocol (TASK-019) and the
 * data export/import feature (TASK-026). The merge logic is entity-type
 * agnostic — it compares `updatedAt` timestamps and propagates soft deletes.
 */

import type { SyncFields } from "@/types/models";

/**
 * Result of merging two records.
 */
export interface MergeResult<T> {
  /** The winning record after conflict resolution. */
  record: T;
  /** Which side won: "local", "remote", or "equal" (records identical). */
  winner: "local" | "remote" | "equal";
}

/**
 * A record with sync fields and a required `id` for matching.
 */
export type SyncableRecord = SyncFields & { id?: number };

/**
 * Merge a single remote record against a local record using last-write-wins.
 *
 * Rules:
 * 1. If no local record exists, the remote record wins ("remote").
 * 2. If timestamps are equal, keep local ("equal" — no change needed).
 * 3. If remote `updatedAt` > local `updatedAt`, remote wins.
 * 4. If local `updatedAt` > remote `updatedAt`, local wins.
 * 5. Soft deletes propagate: if the winning record has `deletedAt` set,
 *    the merged result preserves it.
 *
 * @param local  The local version of the record, or `undefined` if new.
 * @param remote The incoming remote record.
 * @returns The merge result with the winning record and winner indicator.
 */
export function mergeRecord<T extends SyncableRecord>(
  local: T | undefined,
  remote: T,
): MergeResult<T> {
  // No local version — remote wins unconditionally
  if (!local) {
    return { record: remote, winner: "remote" };
  }

  // Same timestamp — keep local (no-op)
  if (local.updatedAt === remote.updatedAt) {
    return { record: local, winner: "equal" };
  }

  // Last-write-wins
  if (remote.updatedAt > local.updatedAt) {
    return { record: remote, winner: "remote" };
  }

  return { record: local, winner: "local" };
}

/**
 * Merge a batch of remote records against local records using last-write-wins.
 *
 * Returns arrays of records to upsert (remote won or new) and a count of
 * conflicts resolved in each direction.
 *
 * @param localRecords  All local records for this entity type.
 * @param remoteRecords Incoming remote records for this entity type.
 * @returns Merge summary with records to upsert and conflict counts.
 */
export interface BatchMergeResult<T> {
  /** Records that should be upserted into the local database. */
  toUpsert: T[];
  /** Number of records where remote was newer (remote won). */
  remoteWins: number;
  /** Number of records where local was newer (local kept). */
  localWins: number;
  /** Number of records with identical timestamps (no change). */
  equal: number;
  /** Number of new records not previously in local DB. */
  newRecords: number;
}

export function mergeRecordBatch<T extends SyncableRecord>(
  localRecords: T[],
  remoteRecords: T[],
): BatchMergeResult<T> {
  // Build a lookup map of local records by id
  const localMap = new Map<number, T>();
  for (const record of localRecords) {
    if (record.id !== undefined) {
      localMap.set(record.id, record);
    }
  }

  const result: BatchMergeResult<T> = {
    toUpsert: [],
    remoteWins: 0,
    localWins: 0,
    equal: 0,
    newRecords: 0,
  };

  for (const remote of remoteRecords) {
    const local = remote.id !== undefined ? localMap.get(remote.id) : undefined;
    const merged = mergeRecord(local, remote);

    switch (merged.winner) {
      case "remote":
        result.toUpsert.push(merged.record);
        if (!local) {
          result.newRecords++;
        } else {
          result.remoteWins++;
        }
        break;
      case "local":
        result.localWins++;
        break;
      case "equal":
        result.equal++;
        break;
    }
  }

  return result;
}
