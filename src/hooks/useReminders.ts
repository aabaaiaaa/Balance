"use client";

import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import {
  runReminderCheck,
  type WelcomeBackSummary,
} from "@/lib/reminders";
import type { ScoringData } from "@/lib/priority";
import type { UserPreferences } from "@/types/models";

interface UseRemindersOptions {
  /** All scoring data (contacts, checkIns, etc.) — pass when loaded. */
  data: ScoringData | null;
  /** User preferences — pass when loaded. */
  prefs: UserPreferences | undefined;
}

interface UseRemindersResult {
  /** The welcome-back summary (null until the check has run). */
  welcomeBack: WelcomeBackSummary | null;
  /** Whether the reminder check has completed. */
  checked: boolean;
}

/**
 * Hook that runs the on-open reminder check once when the app is opened.
 *
 * It:
 * 1. Waits for data and prefs to be loaded
 * 2. Runs the reminder check exactly once
 * 3. Updates lastAppOpenTimestamp and lastNotificationTimestamps in prefs
 * 4. Returns the welcome-back summary for the dashboard to display
 */
export function useReminders({
  data,
  prefs,
}: UseRemindersOptions): UseRemindersResult {
  const [welcomeBack, setWelcomeBack] = useState<WelcomeBackSummary | null>(
    null,
  );
  const [checked, setChecked] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    // Only run once per app session, and only when data is ready
    if (hasRun.current || !data || !prefs) return;
    hasRun.current = true;

    const now = Date.now();

    const result = runReminderCheck(data, {
      lastAppOpenTimestamp: prefs.lastAppOpenTimestamp ?? null,
      notificationsEnabled: prefs.notificationsEnabled ?? false,
      notificationTypes: prefs.notificationTypes,
      lastNotificationTimestamps: prefs.lastNotificationTimestamps ?? {},
      weekStartDay: prefs.weekStartDay,
      partnerDeviceId: prefs.partnerDeviceId,
      now,
    });

    setWelcomeBack(result.welcomeBack);
    setChecked(true);

    // Update preferences with new timestamps
    db.userPreferences
      .update("prefs", {
        lastAppOpenTimestamp: now,
        lastNotificationTimestamps: result.updatedNotificationTimestamps,
      })
      .catch((err) => {
        console.error("Failed to update reminder timestamps:", err);
      });
  }, [data, prefs]);

  return { welcomeBack, checked };
}
