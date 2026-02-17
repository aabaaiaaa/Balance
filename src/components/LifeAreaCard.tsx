"use client";

import { LifeAreaIcon } from "@/components/LifeAreaIcon";
import type { LifeArea } from "@/types/models";

interface LifeAreaCardProps {
  area: LifeArea;
  hoursThisWeek: number;
  onTap: (id: number) => void;
}

export function LifeAreaCard({ area, hoursThisWeek, onTap }: LifeAreaCardProps) {
  const target = area.targetHoursPerWeek;
  const progressPercent = target > 0 ? Math.min((hoursThisWeek / target) * 100, 100) : 0;
  const isOnTrack = hoursThisWeek >= target;
  const isLow = target > 0 && hoursThisWeek < target * 0.5;

  return (
    <button
      type="button"
      onClick={() => area.id != null && onTap(area.id)}
      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            isOnTrack
              ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
              : isLow
                ? "bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400"
                : "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
          }`}
        >
          <LifeAreaIcon icon={area.icon} size={20} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900 dark:text-slate-100">{area.name}</h3>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-gray-400 dark:text-slate-500"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>

          {/* Hours & target */}
          <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <span>
              {hoursThisWeek.toFixed(1)}h this week
            </span>
            <span>Target: {target}h</span>
          </div>

          {/* Progress bar */}
          <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100 dark:bg-slate-700">
            <div
              className={`h-2 rounded-full transition-all ${
                isOnTrack
                  ? "bg-green-500"
                  : isLow
                    ? "bg-amber-400"
                    : "bg-indigo-400"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  );
}
