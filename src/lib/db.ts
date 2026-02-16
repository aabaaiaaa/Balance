import Dexie, { type Table } from "dexie";

/**
 * Balance app local database using Dexie.js (IndexedDB wrapper).
 *
 * Version 1 defines the initial schema with all core tables.
 * Each table includes sync-related fields: updatedAt, deviceId, deletedAt.
 * Only indexed/queryable fields are declared here — Dexie stores all
 * object properties regardless of schema declaration.
 */
export class BalanceDatabase extends Dexie {
  contacts!: Table;
  checkIns!: Table;
  lifeAreas!: Table;
  activities!: Table;
  householdTasks!: Table;
  goals!: Table;
  dateNights!: Table;
  dateNightIdeas!: Table;
  savedPlaces!: Table;
  snoozedItems!: Table;
  userPreferences!: Table;

  constructor() {
    super("BalanceDB");

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

/** Singleton database instance for the application. */
export const db = new BalanceDatabase();

/**
 * Open the database connection. Dexie auto-opens on first query,
 * but this can be called explicitly during app initialisation to
 * surface errors early.
 */
export async function openDatabase(): Promise<BalanceDatabase> {
  await db.open();
  return db;
}

/**
 * Close the database connection. Useful for testing teardown.
 */
export async function closeDatabase(): Promise<void> {
  db.close();
}

/**
 * Delete the entire database. Use with caution — intended for
 * "Clear all data" in settings and test cleanup.
 */
export async function deleteDatabase(): Promise<void> {
  await db.delete();
}
