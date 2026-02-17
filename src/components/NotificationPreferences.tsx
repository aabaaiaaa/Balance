"use client";

import { useCallback, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { DEFAULT_NOTIFICATION_TYPES } from "@/lib/constants";
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showItemNotification,
} from "@/lib/reminders";
import type { NotificationTypePreferences } from "@/types/models";
import type { ScoredItem } from "@/lib/priority";

const notificationTypeOptions: {
  key: keyof NotificationTypePreferences;
  label: string;
  description: string;
}[] = [
  {
    key: "contactCheckIns",
    label: "Contact check-ins",
    description: "Reminders when you're overdue to check in with someone",
  },
  {
    key: "lifeAreaImbalance",
    label: "Life area imbalance",
    description: "Alerts when a life area is below its weekly target",
  },
  {
    key: "taskReminders",
    label: "Task & goal reminders",
    description: "Reminders for pending household tasks and goals",
  },
];

export function NotificationPreferences() {
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const [testSent, setTestSent] = useState(false);
  const [permissionState, setPermissionState] = useState<string | null>(null);

  const notificationsEnabled = prefs?.notificationsEnabled ?? false;
  const notificationTypes =
    prefs?.notificationTypes ?? DEFAULT_NOTIFICATION_TYPES;

  const handleGlobalToggle = useCallback(async () => {
    if (!prefs) return;

    const newEnabled = !notificationsEnabled;

    if (newEnabled) {
      // Request browser permission when enabling
      const permission = await requestNotificationPermission();
      if (permission === "denied") {
        setPermissionState("denied");
        return;
      }
      if (permission === "unsupported") {
        setPermissionState("unsupported");
        return;
      }
      setPermissionState(null);
    }

    await db.userPreferences.update("prefs", {
      notificationsEnabled: newEnabled,
    });
  }, [prefs, notificationsEnabled]);

  const handleTypeToggle = useCallback(
    async (key: keyof NotificationTypePreferences) => {
      if (!prefs) return;

      const updated: NotificationTypePreferences = {
        ...notificationTypes,
        [key]: !notificationTypes[key],
      };

      await db.userPreferences.update("prefs", {
        notificationTypes: updated,
      });
    },
    [prefs, notificationTypes],
  );

  const handleTestNotification = useCallback(async () => {
    if (!isNotificationSupported()) {
      setPermissionState("unsupported");
      return;
    }

    const permission = getNotificationPermission();
    if (permission === "denied") {
      setPermissionState("denied");
      return;
    }

    if (permission !== "granted") {
      const result = await requestNotificationPermission();
      if (result !== "granted") {
        setPermissionState(result === "denied" ? "denied" : "unsupported");
        return;
      }
    }

    const testItem: ScoredItem = {
      key: "test:notification",
      type: "contact",
      title: "Test notification",
      reason: "This is a sample notification from Balance",
      score: 10,
      itemId: 0,
    };

    showItemNotification(testItem);
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  }, []);

  if (!prefs) return null;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
      <h3 className="font-medium text-gray-900 dark:text-slate-100">
        Notifications
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
        Reminders appear when you open the app.
      </p>

      {/* Global toggle */}
      <div className="mt-3 flex items-center justify-between">
        <label
          htmlFor="notifications-global"
          className="text-sm font-medium text-gray-700 dark:text-slate-300"
        >
          Enable notifications
        </label>
        <button
          id="notifications-global"
          type="button"
          role="switch"
          aria-checked={notificationsEnabled}
          onClick={handleGlobalToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
            notificationsEnabled ? "bg-indigo-600" : "bg-gray-200 dark:bg-slate-600"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              notificationsEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Permission warning */}
      {permissionState === "denied" && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          Notification permission was denied. Please enable it in your browser
          settings.
        </p>
      )}
      {permissionState === "unsupported" && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Notifications are not supported in this browser.
        </p>
      )}

      {/* Per-type toggles (only visible when globally enabled) */}
      {notificationsEnabled && (
        <div className="mt-4 space-y-3 border-t border-gray-100 dark:border-slate-700 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Reminder types
          </p>
          {notificationTypeOptions.map((opt) => (
            <label
              key={opt.key}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={notificationTypes[opt.key]}
                onChange={() => handleTypeToggle(opt.key)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {opt.label}
                </span>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {opt.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Test notification button */}
      {notificationsEnabled && (
        <div className="mt-4 border-t border-gray-100 dark:border-slate-700 pt-3">
          <button
            type="button"
            onClick={handleTestNotification}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {testSent ? "Notification sent!" : "Test notification"}
          </button>
        </div>
      )}
    </section>
  );
}
