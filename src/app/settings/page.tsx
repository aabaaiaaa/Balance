"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { LinkPartnerFlow } from "@/components/LinkPartnerFlow";
import { BackupRestore } from "@/components/BackupRestore";

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
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configure your preferences.
        </p>
      </section>

      {/* Partner section */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Partner</h3>

        {isLinked ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <p className="text-sm text-gray-700">Partner linked</p>
            </div>

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

            {/* Unlink button */}
            {!showUnlinkConfirm ? (
              <button
                type="button"
                onClick={() => setShowUnlinkConfirm(true)}
                className="mt-3 text-sm font-medium text-red-600 transition-colors hover:text-red-700"
              >
                Unlink Partner
              </button>
            ) : (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">
                  Unlinking will stop future syncing between your devices.
                  All previously synced data will remain on this device —
                  nothing is deleted.
                </p>
                <p className="mt-1 text-xs text-red-600">
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
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-gray-400">
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
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Sync</h3>
        <p className="mt-1 text-sm text-gray-500">
          Sync data with your partner over your local Wi-Fi network.
        </p>

        {!isLinked && (
          <p className="mt-1 text-xs text-gray-400">
            Link a partner first to enable syncing.
          </p>
        )}

        {isLinked && lastSync && (
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

      {/* Data section */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">Data</h3>
        <p className="mt-1 mb-3 text-sm text-gray-500">
          Export a full backup of your data or restore from a previous backup.
        </p>
        <BackupRestore />
      </section>

      {/* About section */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="font-medium text-gray-900">About</h3>
        <p className="mt-1 text-sm text-gray-400">Balance v0.1.0</p>
      </section>
    </div>
  );
}
