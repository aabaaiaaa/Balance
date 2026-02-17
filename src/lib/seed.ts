import { db } from "@/lib/db";
import { DEFAULT_LIFE_AREAS, DEFAULT_DATE_NIGHT_FREQUENCY_DAYS } from "@/lib/constants";
import { generateDeviceId } from "@/lib/device-id";
import type { LifeArea, UserPreferences } from "@/types/models";

/**
 * Initialise the database with default data on first launch.
 *
 * This function is idempotent — it checks whether preferences already
 * exist before seeding. Call it once during app startup.
 */
export async function seedDatabase(): Promise<void> {
  const existing = await db.userPreferences.get("prefs");
  if (existing) {
    return; // Already initialised
  }

  const deviceId = generateDeviceId();
  const now = Date.now();

  await db.transaction("rw", db.userPreferences, db.lifeAreas, async () => {
    // Create default user preferences
    const prefs: UserPreferences = {
      id: "prefs",
      onboardingComplete: false,
      deviceId,
      householdId: null,
      partnerDeviceId: null,
      lastSyncTimestamp: null,
      weekStartDay: "monday",
      dateNightFrequencyDays: DEFAULT_DATE_NIGHT_FREQUENCY_DAYS,
      theme: "system",
    };
    await db.userPreferences.put(prefs);

    // Seed default life areas
    const lifeAreas: LifeArea[] = DEFAULT_LIFE_AREAS.map((area) => ({
      name: area.name,
      icon: area.icon,
      targetHoursPerWeek: area.targetHoursPerWeek,
      updatedAt: now,
      deviceId,
      deletedAt: null,
    }));
    await db.lifeAreas.bulkAdd(lifeAreas);
  });
}
