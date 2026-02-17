"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { LinkPartnerFlow } from "@/components/LinkPartnerFlow";
import { BackupRestore } from "@/components/BackupRestore";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/types/models";

const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
      <h3 className="font-medium text-gray-900 dark:text-slate-100">Preferences</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Theme</p>
      <div className="mt-2 flex gap-2">
        {themeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              theme === opt.value
                ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                : "border-gray-200 dark:border-slate-700 bg-white dark:bg-card text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const lastSync = prefs?.lastSyncTimestamp;
  const isLinked = !!prefs?.partnerDeviceId;

  const [showLinkFlow, setShowLinkFlow] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);

  const handleUnlink = useCallback(async () => {
    await db.userPreferences.update("prefs", {
      householdId: null,
      partnerDeviceId: null,
      lastSyncTimestamp: null,
    });
    setShowUnlinkConfirm(false);
  }, []);

  // Show the link partner flow full-screen
  if (showLinkFlow) {
    return (
      <LinkPartnerFlow onClose={() => setShowLinkFlow(false)} />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Settings</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Configure your preferences.
        </p>
      </section>

      {/* Partner section */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <h3 className="font-medium text-gray-900 dark:text-slate-100">Partner</h3>

        {isLinked ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm text-gray-700 dark:text-slate-300">Partner linked</p>
            </div>

            {lastSync && (
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                Last synced:{" "}
                {new Date(lastSync).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}

            {/* Unlink button */}
            {!showUnlinkConfirm ? (
              <button
                type="button"
                onClick={() => setShowUnlinkConfirm(true)}
                className="mt-3 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:text-red-700 dark:hover:text-red-300"
              >
                Unlink Partner
              </button>
            ) : (
              <div className="mt-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
                <p className="text-sm text-red-800 dark:text-red-200">
                  Unlinking will stop future syncing between your devices.
                  All previously synced data will remain on this device —
                  nothing is deleted.
                </p>
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Your partner can still use their app independently.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleUnlink}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 active:bg-red-800"
                  >
                    Confirm Unlink
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUnlinkConfirm(false)}
                    className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-400 dark:text-slate-500">
              No partner linked. Link your partner&apos;s device to share and
              sync data.
            </p>
            <button
              type="button"
              onClick={() => setShowLinkFlow(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Link Partner
            </button>
          </>
        )}
      </section>

      {/* Sync section */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <h3 className="font-medium text-gray-900 dark:text-slate-100">Sync</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Sync data with your partner over your local Wi-Fi network.
        </p>

        {!isLinked && (
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            Link a partner first to enable syncing.
          </p>
        )}

        {isLinked && lastSync && (
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            Last synced:{" "}
            {new Date(lastSync).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        {isLinked && (
          <Link
            href="/sync"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>
            Sync with Partner
          </Link>
        )}
      </section>

      {/* Saved Places section */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <h3 className="font-medium text-gray-900 dark:text-slate-100">Saved Places</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Manage your saved locations for proximity detection and visit tracking.
        </p>
        <Link
          href="/settings/saved-places"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Manage Saved Places
        </Link>
      </section>

      {/* Data section */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <h3 className="font-medium text-gray-900 dark:text-slate-100">Data</h3>
        <p className="mt-1 mb-3 text-sm text-gray-500 dark:text-slate-400">
          Export a full backup of your data or restore from a previous backup.
        </p>
        <BackupRestore />
      </section>

      {/* Preferences section */}
      <ThemeSelector />

      {/* About section */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <h3 className="font-medium text-gray-900 dark:text-slate-100">About</h3>
        <p className="mt-1 text-sm text-gray-400 dark:text-slate-500">Balance v0.1.0</p>
      </section>
    </div>
  );
}
