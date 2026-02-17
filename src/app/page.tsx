"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

export default function DashboardPage() {
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const lastSync = prefs?.lastSyncTimestamp;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">
          Welcome to Balance
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Your priority dashboard will appear here.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-500">Top Priorities</h3>
        <p className="mt-2 text-sm text-gray-400">
          No priorities yet. Add some contacts and life areas to get started.
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-500">Balance Overview</h3>
        <p className="mt-2 text-sm text-gray-400">
          Your weekly balance chart will appear here.
        </p>
      </section>

      {/* Sync shortcut */}
      <Link
        href="/sync"
        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 active:bg-gray-100"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            Sync with Partner
          </p>
          <p className="text-xs text-gray-500">
            {lastSync
              ? `Last synced ${new Date(lastSync).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Tap to sync your data over Wi-Fi"}
          </p>
        </div>
      </Link>
    </div>
  );
}
