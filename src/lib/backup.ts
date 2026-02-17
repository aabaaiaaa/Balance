/**
 * Data export/import module for backup and device migration.
 *
 * Unlike sync (which excludes device-local entities), backup includes
 * everything — it's a complete snapshot of the device's state.
 *
 * Uses the shared merge utility (lib/merge.ts) for the "Merge" import mode.
 */

import type { Table } from "dexie";
import { db } from "@/lib/db";
import { mergeRecordBatch, type SyncableRecord, type BatchMergeResult } from "@/lib/merge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All entity types included in a backup (including device-local ones). */
export const BACKUP_ENTITIES = [
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
] as const;

export type BackupEntityName = (typeof BACKUP_ENTITIES)[number];

/** A single entity type's data within a backup file. */
export interface BackupEntityPayload {
  entityType: BackupEntityName;
  count: number;
  records: unknown[];
}

/** The complete backup file structure. */
export interface BackupFile {
  /** Format identifier to validate the file. */
  format: "balance-backup";
  /** Schema version for forward compatibility. */
  version: 1;
  /** Timestamp when the backup was created. */
  exportedAt: number;
  /** Per-entity data. */
  entities: BackupEntityPayload[];
  /** Total record count across all entity types. */
  totalRecords: number;
}

/** Summary shown to the user before they choose an import mode. */
export interface BackupSummary {
  exportedAt: number;
  version: number;
  entities: Record<string, number>;
  totalRecords: number;
}

/** Result of an import operation. */
export interface ImportResult {
  mode: "replace" | "merge";
  totalImported: number;
  /** Per-entity merge details (only populated for merge mode). */
  perEntity: Record<string, BatchMergeResult<SyncableRecord>>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a parsed JSON object is a valid backup file.
 * Returns the validated backup or throws a descriptive error.
 */
export function validateBackupFile(data: unknown): BackupFile {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup file: not a JSON object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.format !== "balance-backup") {
    throw new Error(
      'Invalid backup file: missing or incorrect "format" field. ' +
      "This doesn't appear to be a Balance backup file."
    );
  }

  if (obj.version !== 1) {
    throw new Error(
      `Incompatible backup version: ${obj.version}. ` +
      "This app supports version 1 backups."
    );
  }

  if (typeof obj.exportedAt !== "number") {
    throw new Error("Invalid backup file: missing export timestamp");
  }

  if (!Array.isArray(obj.entities)) {
    throw new Error("Invalid backup file: missing entities array");
  }

  for (const entity of obj.entities) {
    if (
      !entity ||
      typeof entity !== "object" ||
      typeof entity.entityType !== "string" ||
      typeof entity.count !== "number" ||
      !Array.isArray(entity.records)
    ) {
      throw new Error(
        `Invalid backup file: malformed entity payload for "${entity?.entityType ?? "unknown"}"`
      );
    }
  }

  return data as BackupFile;
}

/**
 * Parse a backup file's JSON and return a summary for the user.
 */
export function parseBackupSummary(backup: BackupFile): BackupSummary {
  const entities: Record<string, number> = {};
  for (const ep of backup.entities) {
    entities[ep.entityType] = ep.count;
  }

  return {
    exportedAt: backup.exportedAt,
    version: backup.version,
    entities,
    totalRecords: backup.totalRecords,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Get the Dexie table for a given backup entity name.
 */
function getTable(entityName: BackupEntityName): Table {
  return db[entityName] as unknown as Table;
}

/**
 * Export all data from the local database into a BackupFile object.
 */
export async function buildBackup(): Promise<BackupFile> {
  const entities: BackupEntityPayload[] = [];
  let totalRecords = 0;

  for (const entityName of BACKUP_ENTITIES) {
    const table = getTable(entityName);
    const records = await table.toArray();
    entities.push({
      entityType: entityName,
      count: records.length,
      records,
    });
    totalRecords += records.length;
  }

  return {
    format: "balance-backup",
    version: 1,
    exportedAt: Date.now(),
    entities,
    totalRecords,
  };
}

/**
 * Trigger a browser file download of the backup JSON.
 */
export function downloadBackup(backup: BackupFile): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const date = new Date(backup.exportedAt);
  const dateStr = date.toISOString().split("T")[0]; // e.g. 2026-02-16
  const filename = `balance-backup-${dateStr}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Import: Replace All
// ---------------------------------------------------------------------------

/**
 * Clear all existing data and import everything from the backup.
 * Used for device migration — starts fresh with the backup's state.
 */
export async function importReplaceAll(backup: BackupFile): Promise<ImportResult> {
  let totalImported = 0;

  // Clear all tables first
  for (const entityName of BACKUP_ENTITIES) {
    const table = getTable(entityName);
    await table.clear();
  }

  // Import all records
  for (const ep of backup.entities) {
    if (ep.count === 0) continue;

    const table = getTable(ep.entityType);
    await table.bulkPut(ep.records);
    totalImported += ep.count;
  }

  return {
    mode: "replace",
    totalImported,
    perEntity: {},
  };
}

// ---------------------------------------------------------------------------
// Import: Merge (last-write-wins)
// ---------------------------------------------------------------------------

/**
 * Merge backup data with existing local data using last-write-wins
 * conflict resolution (same logic as peer-to-peer sync).
 *
 * For entity types with sync fields (updatedAt, deletedAt), uses the
 * shared merge utility. For UserPreferences (which has no sync fields),
 * the backup version replaces local if the backup is newer.
 */
export async function importMerge(backup: BackupFile): Promise<ImportResult> {
  let totalImported = 0;
  const perEntity: Record<string, BatchMergeResult<SyncableRecord>> = {};

  for (const ep of backup.entities) {
    if (ep.count === 0) continue;

    const table = getTable(ep.entityType);

    // UserPreferences uses a string key ("prefs") and doesn't have
    // updatedAt/deletedAt — handle it separately
    if (ep.entityType === "userPreferences") {
      // For merge mode, keep local preferences (device-specific settings).
      // Only import if no local preferences exist.
      const localPrefs = await table.toArray();
      if (localPrefs.length === 0 && ep.records.length > 0) {
        await table.bulkPut(ep.records);
        totalImported += ep.records.length;
      }
      continue;
    }

    // Standard merge using the shared utility
    const localRecords = (await table.toArray()) as SyncableRecord[];
    const remoteRecords = ep.records as SyncableRecord[];

    const mergeResult = mergeRecordBatch(localRecords, remoteRecords);
    perEntity[ep.entityType] = mergeResult;
    totalImported += mergeResult.toUpsert.length;

    if (mergeResult.toUpsert.length > 0) {
      await table.bulkPut(mergeResult.toUpsert);
    }
  }

  return {
    mode: "merge",
    totalImported,
    perEntity,
  };
}
