/**
 * Client-side reminder system for Balance.
 *
 * Fires on app open (not in the background). Since this is a serverless PWA
 * with no push notification server, reminders only appear when the app is
 * actively opened.
 *
 * On each app open:
 * 1. Check the priority algorithm for overdue items
 * 2. If the app hasn't been opened in over a day, produce a "welcome back" summary
 * 3. Use the Notification API to show 1-2 OS-level notifications for the most
 *    urgent items (respecting 24h cooldown per item)
 */

import type { ScoredItem, ScoringData } from "@/lib/priority";
import { calculatePriorities, getWeekStart } from "@/lib/priority";
import {
  MAX_NOTIFICATIONS_PER_SESSION,
  NOTIFICATION_COOLDOWN_MS,
  WELCOME_BACK_THRESHOLD_MS,
} from "@/lib/constants";
import type { NotificationTypePreferences, WeekStartDay } from "@/types/models";
import { DEFAULT_NOTIFICATION_TYPES } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary data for the "Welcome back" banner. */
export interface WelcomeBackSummary {
  /** Whether to show the banner (app not opened in > 24h). */
  show: boolean;
  /** Summary message parts (e.g., "3 contacts overdue", "self-care time is low"). */
  parts: string[];
}

/** Result of running the on-open reminder check. */
export interface ReminderCheckResult {
  /** Welcome-back summary (may have show=false). */
  welcomeBack: WelcomeBackSummary;
  /** Items that had OS notifications sent for them. */
  notifiedItems: ScoredItem[];
  /** All priority items (for the dashboard). */
  priorities: ScoredItem[];
}

// ---------------------------------------------------------------------------
// Welcome back detection
// ---------------------------------------------------------------------------

/**
 * Determine whether to show the "Welcome back" banner and what to say.
 */
export function buildWelcomeBackSummary(
  lastAppOpenTimestamp: number | null,
  now: number,
  data: ScoringData,
  weekStartDay: WeekStartDay,
): WelcomeBackSummary {
  // Not enough time since last open
  if (
    lastAppOpenTimestamp !== null &&
    now - lastAppOpenTimestamp < WELCOME_BACK_THRESHOLD_MS
  ) {
    return { show: false, parts: [] };
  }

  const parts: string[] = [];

  // Count overdue contacts
  const overdueContacts = data.contacts.filter((c) => {
    if (c.deletedAt !== null) return false;
    if (!c.lastCheckIn) return true;
    const daysSince = (now - c.lastCheckIn) / (1000 * 60 * 60 * 24);
    return daysSince > c.checkInFrequencyDays;
  });
  if (overdueContacts.length > 0) {
    parts.push(
      `${overdueContacts.length} contact${overdueContacts.length !== 1 ? "s" : ""} overdue`,
    );
  }

  // Check life areas below 50% of target this week
  const weekStart = getWeekStart(now, weekStartDay);
  const lowAreas: string[] = [];
  for (const area of data.lifeAreas) {
    if (area.deletedAt !== null || area.targetHoursPerWeek <= 0) continue;
    const minutesThisWeek = data.activities
      .filter(
        (a) =>
          a.lifeAreaId === area.id &&
          a.date >= weekStart &&
          a.deletedAt === null,
      )
      .reduce((sum, a) => sum + a.durationMinutes, 0);
    const hoursThisWeek = minutesThisWeek / 60;
    if (hoursThisWeek < area.targetHoursPerWeek * 0.5) {
      lowAreas.push(area.name);
    }
  }
  if (lowAreas.length === 1) {
    parts.push(`${lowAreas[0]} time is low this week`);
  } else if (lowAreas.length > 1) {
    parts.push(`${lowAreas.length} life areas are low this week`);
  }

  // Count pending household tasks
  const pendingTasks = data.householdTasks.filter(
    (t) => t.deletedAt === null && t.status !== "done",
  );
  if (pendingTasks.length > 0) {
    parts.push(
      `${pendingTasks.length} household task${pendingTasks.length !== 1 ? "s" : ""} pending`,
    );
  }

  return {
    show: parts.length > 0,
    parts,
  };
}

// ---------------------------------------------------------------------------
// Notification API helpers
// ---------------------------------------------------------------------------

/** Check if the Notification API is available. */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Get the current notification permission state. */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

/** Request notification permission from the user. Returns the permission state. */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

/**
 * Show an OS-level notification for a priority item.
 * Returns true if the notification was shown.
 */
export function showItemNotification(item: ScoredItem): boolean {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    new Notification(item.title, {
      body: item.reason,
      tag: item.key, // Prevents duplicate notifications for the same item
      icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icons/icon-192x192.png`,
    });
    return true;
  } catch {
    // Notification constructor can throw in some environments
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core reminder check
// ---------------------------------------------------------------------------

/**
 * Check whether a scored item is allowed by the per-type notification preferences.
 */
export function isItemTypeEnabled(
  item: ScoredItem,
  notificationTypes: NotificationTypePreferences,
): boolean {
  switch (item.type) {
    case "contact":
      return notificationTypes.contactCheckIns;
    case "life-area":
      return notificationTypes.lifeAreaImbalance;
    case "household-task":
    case "goal":
      return notificationTypes.taskReminders;
    default:
      return true;
  }
}

/**
 * Filter priority items to find those eligible for OS notifications.
 *
 * Respects:
 * - Per-type notification preferences
 * - 24h cooldown per item (based on lastNotificationTimestamps)
 * - Maximum notifications per session
 */
export function getNotifiableItems(
  priorities: ScoredItem[],
  lastNotificationTimestamps: Record<string, number>,
  now: number,
  notificationTypes?: NotificationTypePreferences,
): ScoredItem[] {
  const eligible: ScoredItem[] = [];
  const types = notificationTypes ?? DEFAULT_NOTIFICATION_TYPES;

  for (const item of priorities) {
    if (eligible.length >= MAX_NOTIFICATIONS_PER_SESSION) break;

    // Filter by notification type preference
    if (!isItemTypeEnabled(item, types)) continue;

    const lastNotified = lastNotificationTimestamps[item.key];
    if (lastNotified && now - lastNotified < NOTIFICATION_COOLDOWN_MS) {
      continue; // Skip — notified too recently
    }

    eligible.push(item);
  }

  return eligible;
}

/**
 * Run the full on-open reminder check.
 *
 * Call this once when the app opens. It:
 * 1. Calculates priorities
 * 2. Builds the welcome-back summary
 * 3. Sends OS notifications for the most urgent items
 * 4. Returns updated notification timestamps
 */
export function runReminderCheck(
  data: ScoringData,
  options: {
    lastAppOpenTimestamp: number | null;
    notificationsEnabled: boolean;
    notificationTypes?: NotificationTypePreferences;
    lastNotificationTimestamps: Record<string, number>;
    weekStartDay: WeekStartDay;
    partnerDeviceId: string | null;
    now?: number;
  },
): ReminderCheckResult & {
  updatedNotificationTimestamps: Record<string, number>;
} {
  const now = options.now ?? Date.now();

  // Calculate priorities
  const priorities = calculatePriorities(data, {
    now,
    weekStartDay: options.weekStartDay,
    partnerDeviceId: options.partnerDeviceId,
  });

  // Build welcome-back summary
  const welcomeBack = buildWelcomeBackSummary(
    options.lastAppOpenTimestamp,
    now,
    data,
    options.weekStartDay,
  );

  // Send OS notifications for the most urgent items
  const notifiedItems: ScoredItem[] = [];
  const updatedTimestamps = { ...options.lastNotificationTimestamps };

  if (options.notificationsEnabled) {
    const eligible = getNotifiableItems(
      priorities,
      options.lastNotificationTimestamps,
      now,
      options.notificationTypes,
    );

    for (const item of eligible) {
      const sent = showItemNotification(item);
      if (sent) {
        notifiedItems.push(item);
        updatedTimestamps[item.key] = now;
      }
    }
  }

  // Clean up old notification timestamps (remove entries older than 48h)
  const cutoff = now - 2 * NOTIFICATION_COOLDOWN_MS;
  for (const key of Object.keys(updatedTimestamps)) {
    if (updatedTimestamps[key] < cutoff) {
      delete updatedTimestamps[key];
    }
  }

  return {
    welcomeBack,
    notifiedItems,
    priorities,
    updatedNotificationTimestamps: updatedTimestamps,
  };
}
