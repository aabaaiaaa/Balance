"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function SettingsPage() {
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const lastSync = prefs?.lastSyncTimestamp;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure your preferences.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Partner</h3>
        <p className="mt-1 text-sm text-gray-400">
          No partner linked. Sync with your partner to share data.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Sync</h3>
        <p className="mt-1 text-sm text-gray-500">
          Sync data with your partner over your local Wi-Fi network.
        </p>

        {lastSync && (
          <p className="mt-1 text-xs text-gray-400">
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
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Data</h3>
        <p className="mt-1 text-sm text-gray-400">
          Export, import, and manage your local data.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">About</h3>
        <p className="mt-1 text-sm text-gray-400">Balance v0.1.0</p>
      </section>
    </div>
  );
}
