"use client";

import { useState, useEffect } from "react";
import {
  onServiceWorkerUpdate,
  applyServiceWorkerUpdate,
} from "@/lib/register-sw";

export function UpdatePrompt() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    onServiceWorkerUpdate((reg) => {
      setRegistration(reg);
    });
  }, []);

  if (!registration) return null;

  return (
    <div className="fixed top-16 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-slide-down">
      <div className="flex items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-card px-4 py-3 shadow-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600 dark:text-indigo-400"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Update available</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            A new version of Balance is ready.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setRegistration(null)}
            className="rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => applyServiceWorkerUpdate(registration)}
            className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}
