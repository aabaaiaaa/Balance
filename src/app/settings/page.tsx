"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLiveQuery } from "dexie-react-hooks";
import { db, deleteDatabase } from "@/lib/db";
import { BackupRestore } from "@/components/BackupRestore";
import { useTheme } from "@/components/ThemeProvider";
import { NotificationPreferences } from "@/components/NotificationPreferences";
import type { Theme, WeekStartDay, RemoteSyncConfig } from "@/types/models";

// Lazy-load the LinkPartnerFlow — only shown when user taps "Link Partner"
const LinkPartnerFlow = dynamic(
  () => import("@/components/LinkPartnerFlow").then((m) => ({ default: m.LinkPartnerFlow })),
);

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

const weekStartOptions: { value: WeekStartDay; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
];

function RemoteSyncSettings() {
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const [showSettings, setShowSettings] = useState(false);
  const config = prefs?.remoteSyncConfig;

  const [stunServer, setStunServer] = useState("");
  const [turnServer, setTurnServer] = useState("");
  const [turnUsername, setTurnUsername] = useState("");
  const [turnCredential, setTurnCredential] = useState("");

  // Sync local form state when prefs load
  const configStun = config?.stunServer ?? "";
  const configTurn = config?.turnServer ?? "";
  const configTurnUser = config?.turnUsername ?? "";
  const configTurnCred = config?.turnCredential ?? "";

  useEffect(() => {
    if (config) {
      setStunServer(configStun);
      setTurnServer(configTurn);
      setTurnUsername(configTurnUser);
      setTurnCredential(configTurnCred);
    }
  }, [config, configStun, configTurn, configTurnUser, configTurnCred]);

  const handleSave = useCallback(async () => {
    const newConfig: RemoteSyncConfig = {
      stunServer: stunServer.trim(),
      turnServer: turnServer.trim(),
      turnUsername: turnUsername.trim(),
      turnCredential: turnCredential.trim(),
    };
    await db.userPreferences.update("prefs", { remoteSyncConfig: newConfig });
    setShowSettings(false);
  }, [stunServer, turnServer, turnUsername, turnCredential]);

  const handleClear = useCallback(async () => {
    await db.userPreferences.update("prefs", { remoteSyncConfig: null });
    setStunServer("");
    setTurnServer("");
    setTurnUsername("");
    setTurnCredential("");
  }, []);

  const hasCustomConfig = config && (config.stunServer || config.turnServer);

  return (
    <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
      <h3 className="font-medium text-gray-900 dark:text-slate-100">Remote Sync</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
        Optionally configure custom STUN/TURN servers for syncing across
        different networks. Leave blank to use defaults.
      </p>

      {hasCustomConfig && !showSettings && (
        <div className="mt-2 space-y-1">
          {config.stunServer && (
            <p className="text-xs text-gray-400 dark:text-slate-500">
              STUN: {config.stunServer}
            </p>
          )}
          {config.turnServer && (
            <p className="text-xs text-gray-400 dark:text-slate-500">
              TURN: {config.turnServer}
            </p>
          )}
        </div>
      )}

      {!showSettings ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 transition-colors hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            {hasCustomConfig ? "Edit servers" : "Configure servers"}
          </button>
          {hasCustomConfig && (
            <button
              type="button"
              onClick={handleClear}
              className="text-sm font-medium text-gray-500 dark:text-slate-400 transition-colors hover:text-gray-700 dark:hover:text-slate-300"
            >
              Reset to defaults
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label
              htmlFor="stun-server"
              className="block text-xs font-medium text-gray-600 dark:text-slate-300"
            >
              STUN server URL
            </label>
            <input
              id="stun-server"
              type="text"
              value={stunServer}
              onChange={(e) => setStunServer(e.target.value)}
              placeholder="stun:stun.l.google.com:19302"
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Leave blank to use Google&apos;s public STUN server
            </p>
          </div>

          <div>
            <label
              htmlFor="turn-server"
              className="block text-xs font-medium text-gray-600 dark:text-slate-300"
            >
              TURN server URL (optional)
            </label>
            <input
              id="turn-server"
              type="text"
              value={turnServer}
              onChange={(e) => setTurnServer(e.target.value)}
              placeholder="turn:turn.example.com:3478"
              className="mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Required for connections behind symmetric NATs
            </p>
          </div>

          {turnServer.trim() && (
            <>
              <div>
                <label
                  htmlFor="turn-username"
                  className="block text-xs font-medium text-gray-600 dark:text-slate-300"
                >
                  TURN username
                </label>
                <input
                  id="turn-username"
                  type="text"
                  value={turnUsername}
                  onChange={(e) => setTurnUsername(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="turn-credential"
                  className="block text-xs font-medium text-gray-600 dark:text-slate-300"
                >
                  TURN credential
                </label>
                <input
                  id="turn-credential"
                  type="password"
                  value={turnCredential}
                  onChange={(e) => setTurnCredential(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const weekStartDay = prefs?.weekStartDay ?? "monday";

  const handleWeekStartChange = useCallback(async (day: WeekStartDay) => {
    await db.userPreferences.update("prefs", { weekStartDay: day });
  }, []);

  return (
    <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
      <h3 className="font-medium text-gray-900 dark:text-slate-100">Preferences</h3>

      {/* Week start day */}
      <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">Week starts on</p>
      <div className="mt-2 flex gap-2">
        {weekStartOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleWeekStartChange(opt.value)}
            className={`flex flex-1 items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              weekStartDay === opt.value
                ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                : "border-gray-200 dark:border-slate-700 bg-white dark:bg-card text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Theme */}
      <p className="mt-4 text-sm text-gray-500 dark:text-slate-400">Theme</p>
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
  const syncHistory = prefs?.syncHistory ?? [];

  const [showLinkFlow, setShowLinkFlow] = useState(false);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [showSyncHistory, setShowSyncHistory] = useState(false);

  const handleUnlink = useCallback(async () => {
    await db.userPreferences.update("prefs", {
      householdId: null,
      partnerDeviceId: null,
      lastSyncTimestamp: null,
    });
    setShowUnlinkConfirm(false);
  }, []);

  const handleClearData = useCallback(async () => {
    try {
      await deleteDatabase();
      setShowClearDataConfirm(false);
      window.location.reload();
    } catch {
      setShowClearDataConfirm(false);
    }
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

        {/* Sync history */}
        {syncHistory.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowSyncHistory(!showSyncHistory)}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${showSyncHistory ? "rotate-90" : ""}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              Sync history ({syncHistory.length})
            </button>
            {showSyncHistory && (
              <ul className="mt-2 space-y-1">
                {syncHistory.map((ts) => (
                  <li key={ts} className="text-xs text-gray-400 dark:text-slate-500">
                    {new Date(ts).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Remote Sync section */}
      <RemoteSyncSettings />

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

      {/* Notifications section */}
      <NotificationPreferences />

      {/* Data section */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <h3 className="font-medium text-gray-900 dark:text-slate-100">Data</h3>
        <p className="mt-1 mb-3 text-sm text-gray-500 dark:text-slate-400">
          Export a full backup of your data or restore from a previous backup.
        </p>
        <BackupRestore />

        <div className="mt-4 border-t border-gray-200 dark:border-slate-700 pt-4">
          <p className="mb-2 text-sm text-gray-500 dark:text-slate-400">
            Or transfer directly to another device over Wi-Fi.
          </p>
          <Link
            href="/device-transfer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card px-4 py-2 text-sm font-medium text-gray-900 dark:text-slate-100 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
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
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Transfer to Another Device
          </Link>
        </div>

        <div className="mt-4 border-t border-gray-200 dark:border-slate-700 pt-4">
          {!showClearDataConfirm ? (
            <button
              type="button"
              onClick={() => setShowClearDataConfirm(true)}
              className="text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:text-red-700 dark:hover:text-red-300"
            >
              Clear all local data
            </button>
          ) : (
            <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
              <p className="text-sm text-red-800 dark:text-red-200">
                This will permanently delete all your data including contacts,
                check-ins, activities, goals, and preferences. This action
                cannot be undone.
              </p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Consider exporting a backup first.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleClearData}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 active:bg-red-800"
                >
                  Delete Everything
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearDataConfirm(false)}
                  className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Preferences section */}
      <PreferencesSection />

      {/* About section */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <h3 className="font-medium text-gray-900 dark:text-slate-100">About</h3>
        <p className="mt-1 text-sm text-gray-400 dark:text-slate-500">Balance v{process.env.NEXT_PUBLIC_APP_VERSION}</p>
      </section>
    </div>
  );
}
