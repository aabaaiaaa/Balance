"use client";

import { useState } from "react";
import type { WelcomeBackSummary } from "@/lib/reminders";

interface WelcomeBackBannerProps {
  summary: WelcomeBackSummary;
}

/**
 * A dismissible banner shown at the top of the dashboard when the user
 * hasn't opened the app in over a day. Summarises what needs attention.
 */
export function WelcomeBackBanner({ summary }: WelcomeBackBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!summary.show || dismissed || summary.parts.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-amber-600 dark:text-amber-400"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Welcome back!
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            {summary.parts.join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-amber-400 dark:text-amber-600 transition-colors hover:text-amber-600 dark:hover:text-amber-400"
          aria-label="Dismiss welcome back banner"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
