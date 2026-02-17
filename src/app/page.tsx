"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { FreeTimeFlow } from "@/components/FreeTimeFlow";
import type { FreeTimeInputs } from "@/components/FreeTimeFlow";

export default function DashboardPage() {
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const lastSync = prefs?.lastSyncTimestamp;

  const [showFreeTimeFlow, setShowFreeTimeFlow] = useState(false);
  const [freeTimeInputs, setFreeTimeInputs] = useState<FreeTimeInputs | null>(
    null,
  );

  const handleFreeTimeComplete = (inputs: FreeTimeInputs) => {
    setFreeTimeInputs(inputs);
    setShowFreeTimeFlow(false);
    // Inputs are stored in state for the suggestion algorithm (TASK-014)
  };

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

      {/* "I have free time" button / flow */}
      {showFreeTimeFlow ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <FreeTimeFlow
            onComplete={handleFreeTimeComplete}
            onCancel={() => setShowFreeTimeFlow(false)}
          />
        </section>
      ) : freeTimeInputs ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-900">
                {freeTimeInputs.availableMinutes >= 60
                  ? `${Math.floor(freeTimeInputs.availableMinutes / 60)}h${freeTimeInputs.availableMinutes % 60 > 0 ? ` ${freeTimeInputs.availableMinutes % 60}m` : ""}`
                  : `${freeTimeInputs.availableMinutes}m`}{" "}
                free &middot;{" "}
                {freeTimeInputs.energy === "energetic"
                  ? "Feeling energetic"
                  : freeTimeInputs.energy === "low"
                    ? "Low energy"
                    : "Normal energy"}
              </p>
              <p className="mt-0.5 text-xs text-indigo-700">
                Suggestions will appear here once enabled.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFreeTimeInputs(null);
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Clear
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setShowFreeTimeFlow(true)}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-4 transition-colors hover:border-indigo-400 hover:bg-indigo-100 active:bg-indigo-150"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-indigo-900">
              I have free time
            </p>
            <p className="text-xs text-indigo-700">
              Get suggestions for the best use of your time
            </p>
          </div>
        </button>
      )}

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
