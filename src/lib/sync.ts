/**
 * Sync protocol module for peer-to-peer data exchange.
 *
 * Handles:
 * 1. Export — query changed records since a timestamp, serialise to JSON
 * 2. Import/Merge — last-write-wins conflict resolution for incoming records
 * 3. Two-way exchange — simultaneous send/receive over a WebRTC data channel
 * 4. Update lastSyncTimestamp after successful merge
 *
 * Entities that sync: Contact, CheckIn, LifeArea, Activity, HouseholdTask,
 *   Goal, DateNight, DateNightIdea, SavedPlace
 *
 * Entities that stay device-local (never sent):
 *   UserPreferences, SnoozedItem
 */

import type { Table } from "dexie";
import { db } from "@/lib/db";
import { mergeRecordBatch, type SyncableRecord, type BatchMergeResult } from "@/lib/merge";
import type { PeerConnection } from "@/lib/peer-connection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Names of entity types that are included in sync payloads. */
export const SYNCABLE_ENTITIES = [
  "contacts",
  "checkIns",
  "lifeAreas",
  "activities",
  "householdTasks",
  "goals",
  "dateNights",
  "dateNightIdeas",
  "savedPlaces",
] as const;

export type SyncableEntityName = (typeof SYNCABLE_ENTITIES)[number];

/** Metadata header included with each entity type in a sync payload. */
export interface EntityPayload<T = SyncableRecord> {
  entityType: SyncableEntityName;
  count: number;
  records: T[];
}

/** Complete sync payload sent between devices. */
export interface SyncPayload {
  /** Protocol version for forward compatibility. */
  version: 1;
  /** Timestamp when this payload was built. */
  exportedAt: number;
  /** Device ID of the sender. */
  deviceId: string;
  /** Timestamp of last successful sync (null for first sync). */
  lastSyncTimestamp: number | null;
  /** Data for each syncable entity type. */
  entities: EntityPayload[];
  /** Total record count across all entity types. */
  totalRecords: number;
}

/** Summary of a completed merge operation. */
export interface MergeSummary {
  /** Total records received from the remote side. */
  totalReceived: number;
  /** Total records sent to the remote side. */
  totalSent: number;
  /** Records upserted into local DB (remote was newer or new). */
  totalUpserted: number;
  /** Conflicts where local was kept (local was newer). */
  totalLocalWins: number;
  /** Conflicts where remote was applied (remote was newer). */
  totalRemoteWins: number;
  /** Per-entity merge details. */
  perEntity: Record<string, BatchMergeResult<SyncableRecord>>;
}

/** Progress callback for tracking sync state. */
export interface SyncProgress {
  phase: "sending" | "receiving" | "merging" | "complete" | "error";
  recordsSent: number;
  recordsReceived: number;
  message: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

// ---------------------------------------------------------------------------
// Sync payload messages sent over the data channel
// ---------------------------------------------------------------------------

/** Message types for the sync protocol over the data channel. */
type SyncMessageType = "sync-payload" | "sync-complete";

interface SyncMessage {
  type: SyncMessageType;
  payload?: SyncPayload;
}

// ---------------------------------------------------------------------------
// Export: Build a sync payload from local data
// ---------------------------------------------------------------------------

/**
 * Get the Dexie table for a given syncable entity name.
 */
function getTable(entityName: SyncableEntityName): Table {
  return db[entityName] as unknown as Table;
}

/**
 * Query records from a single table that have been modified since `sinceTimestamp`.
 * If `sinceTimestamp` is null (first sync), returns all records.
 */
async function queryChangedRecords(
  entityName: SyncableEntityName,
  sinceTimestamp: number | null,
): Promise<SyncableRecord[]> {
  const table = getTable(entityName);

  if (sinceTimestamp === null) {
    // First sync — return everything
    return (await table.toArray()) as SyncableRecord[];
  }

  // Return records modified since the last sync
  return (await table
    .where("updatedAt")
    .above(sinceTimestamp)
    .toArray()) as SyncableRecord[];
}

/**
 * Build a complete sync payload containing all records changed since the last sync.
 *
 * @param sinceTimestamp Timestamp of last sync, or null for first/full sync.
 * @param deviceId      This device's unique ID.
 * @returns The sync payload ready to be serialised and sent.
 */
export async function buildSyncPayload(
  sinceTimestamp: number | null,
  deviceId: string,
): Promise<SyncPayload> {
  const entities: EntityPayload[] = [];
  let totalRecords = 0;

  for (const entityName of SYNCABLE_ENTITIES) {
    const records = await queryChangedRecords(entityName, sinceTimestamp);
    entities.push({
      entityType: entityName,
      count: records.length,
      records,
    });
    totalRecords += records.length;
  }

  return {
    version: 1,
    exportedAt: Date.now(),
    deviceId,
    lastSyncTimestamp: sinceTimestamp,
    entities,
    totalRecords,
  };
}

// ---------------------------------------------------------------------------
// Import/Merge: Apply incoming sync payload to local database
// ---------------------------------------------------------------------------

/**
 * Merge an incoming sync payload into the local database using last-write-wins.
 *
 * For each entity type in the payload:
 * - Fetch matching local records
 * - Compare `updatedAt` timestamps
 * - Upsert records where remote is newer or new
 * - Keep local records where local is newer
 * - Propagate soft deletes (deletedAt)
 *
 * @param payload The incoming sync payload from the remote device.
 * @returns A summary of what was merged.
 */
export async function mergeSyncPayload(
  payload: SyncPayload,
): Promise<MergeSummary> {
  const summary: MergeSummary = {
    totalReceived: payload.totalRecords,
    totalSent: 0,
    totalUpserted: 0,
    totalLocalWins: 0,
    totalRemoteWins: 0,
    perEntity: {},
  };

  for (const entityPayload of payload.entities) {
    if (entityPayload.count === 0) continue;

    const { entityType, records: remoteRecords } = entityPayload;
    const table = getTable(entityType);

    // Fetch all local records to compare against
    const localRecords = (await table.toArray()) as SyncableRecord[];

    // Run the merge
    const mergeResult = mergeRecordBatch(localRecords, remoteRecords);
    summary.perEntity[entityType] = mergeResult;
    summary.totalUpserted += mergeResult.toUpsert.length;
    summary.totalLocalWins += mergeResult.localWins;
    summary.totalRemoteWins += mergeResult.remoteWins;

    // Apply upserts to the database
    if (mergeResult.toUpsert.length > 0) {
      await table.bulkPut(mergeResult.toUpsert);
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Two-way exchange over WebRTC data channel
// ---------------------------------------------------------------------------

/**
 * Perform a two-way sync exchange over an open WebRTC data channel.
 *
 * Both sides send their sync payload simultaneously and merge incoming data
 * as it arrives. A progress callback fires to update the UI.
 *
 * @param peerConnection An open PeerConnection instance.
 * @param onProgress     Callback for sync progress updates.
 * @returns A promise that resolves with the merge summary.
 */
export async function performSync(
  peerConnection: PeerConnection,
  onProgress?: SyncProgressCallback,
): Promise<MergeSummary> {
  // 1. Read local preferences to get deviceId and lastSyncTimestamp
  const prefs = await db.userPreferences.get("prefs");
  if (!prefs) {
    throw new Error("User preferences not initialised — cannot sync");
  }

  const { deviceId, lastSyncTimestamp } = prefs;

  // 2. Build our outgoing sync payload
  const outgoing = await buildSyncPayload(lastSyncTimestamp, deviceId);
  const outgoingJson = JSON.stringify({ type: "sync-payload", payload: outgoing } as SyncMessage);

  onProgress?.({
    phase: "sending",
    recordsSent: outgoing.totalRecords,
    recordsReceived: 0,
    message: `Sending ${outgoing.totalRecords} records...`,
  });

  // 3. Set up a promise to receive the remote payload
  const receivePromise = new Promise<SyncPayload>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for sync payload from partner"));
    }, 60_000); // 60 second timeout for sync data

    peerConnection.onMessage((data: string) => {
      try {
        const message = JSON.parse(data) as SyncMessage;
        if (message.type === "sync-payload" && message.payload) {
          clearTimeout(timeout);
          resolve(message.payload);
        }
      } catch {
        // Ignore non-JSON messages or parse errors
      }
    });
  });

  // 4. Send our payload (simultaneously — don't wait for receive)
  peerConnection.send(outgoingJson);

  // 5. Wait for the remote payload
  onProgress?.({
    phase: "receiving",
    recordsSent: outgoing.totalRecords,
    recordsReceived: 0,
    message: "Waiting for partner's data...",
  });

  const incoming = await receivePromise;

  onProgress?.({
    phase: "merging",
    recordsSent: outgoing.totalRecords,
    recordsReceived: incoming.totalRecords,
    message: `Merging ${incoming.totalRecords} incoming records...`,
  });

  // 6. Merge the incoming payload
  const summary = await mergeSyncPayload(incoming);
  summary.totalSent = outgoing.totalRecords;

  // 7. Update lastSyncTimestamp
  const syncTimestamp = Date.now();
  await db.userPreferences.update("prefs", {
    lastSyncTimestamp: syncTimestamp,
  });

  // 8. Send completion acknowledgement
  const completeMessage: SyncMessage = { type: "sync-complete" };
  peerConnection.send(JSON.stringify(completeMessage));

  onProgress?.({
    phase: "complete",
    recordsSent: outgoing.totalRecords,
    recordsReceived: incoming.totalRecords,
    message: `Sync complete — sent ${outgoing.totalRecords}, received ${incoming.totalRecords}, ${summary.totalRemoteWins} conflicts resolved`,
  });

  return summary;
}
