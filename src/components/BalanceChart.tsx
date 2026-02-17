"use client";

import { LifeAreaIcon } from "@/components/LifeAreaIcon";
import type { LifeArea } from "@/types/models";

interface BalanceChartProps {
  lifeAreas: LifeArea[];
  hoursPerArea: Map<number, number>;
}

export function BalanceChart({ lifeAreas, hoursPerArea }: BalanceChartProps) {
  if (lifeAreas.length === 0) return null;

  // Find the max value (either target or actual) to scale bars proportionally
  const maxValue = lifeAreas.reduce((max, area) => {
    const actual = hoursPerArea.get(area.id!) ?? 0;
    return Math.max(max, area.targetHoursPerWeek, actual);
  }, 0);

  const underTargetCount = lifeAreas.filter((area) => {
    const actual = hoursPerArea.get(area.id!) ?? 0;
    return area.targetHoursPerWeek > 0 && actual < area.targetHoursPerWeek * 0.5;
  }).length;

  return (
    <section aria-label="Weekly balance overview" className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Weekly Balance</h3>
        {underTargetCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            {underTargetCount} area{underTargetCount !== 1 ? "s" : ""} low
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {lifeAreas.map((area) => {
          const actual = hoursPerArea.get(area.id!) ?? 0;
          const target = area.targetHoursPerWeek;
          const percent = maxValue > 0 ? (actual / maxValue) * 100 : 0;
          const targetPercent = maxValue > 0 ? (target / maxValue) * 100 : 0;
          const isOnTrack = target > 0 && actual >= target;
          const isLow = target > 0 && actual < target * 0.5;
          const progressForTarget = target > 0 ? Math.min((actual / target) * 100, 100) : 0;

          return (
            <div key={area.id} className="flex items-center gap-2">
              {/* Icon */}
              <div
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  isOnTrack
                    ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400"
                    : isLow
                      ? "bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400"
                      : "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
                }`}
              >
                <LifeAreaIcon icon={area.icon} size={14} />
              </div>

              {/* Label and bar */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className={`font-medium ${isLow ? "text-amber-700 dark:text-amber-400" : "text-gray-700 dark:text-slate-300"}`}>
                    {area.name}
                  </span>
                  <span className="tabular-nums text-gray-400 dark:text-slate-500">
                    {actual.toFixed(1)}/{target}h
                  </span>
                </div>
                <div
                  className="relative mt-1 h-2 w-full rounded-full bg-gray-100 dark:bg-slate-700"
                  role="progressbar"
                  aria-valuenow={Math.round(progressForTarget)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${area.name}: ${actual.toFixed(1)} of ${target} hours`}
                >
                  {/* Target marker line */}
                  {targetPercent > 0 && targetPercent <= 100 && (
                    <div
                      className="absolute top-0 h-2 w-0.5 rounded-full bg-gray-300 dark:bg-slate-600"
                      style={{ left: `${targetPercent}%` }}
                      aria-hidden="true"
                    />
                  )}
                  {/* Actual progress bar */}
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isOnTrack
                        ? "bg-green-500"
                        : isLow
                          ? "bg-amber-400"
                          : "bg-indigo-400"
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
