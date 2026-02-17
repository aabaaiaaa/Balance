"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { LifeAreaIcon } from "@/components/LifeAreaIcon";
import { ActivityForm } from "@/components/ActivityForm";
import { HouseholdTaskList } from "@/components/HouseholdTaskList";
import type { WeekStartDay } from "@/types/models";

interface LifeAreaDetailProps {
  lifeAreaId: number;
  onBack: () => void;
  onEdit: (lifeAreaId: number) => void;
}

/** Get the start-of-week timestamp based on the user's weekStartDay preference. */
function getWeekStart(weekStartDay: WeekStartDay): number {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const targetDay = weekStartDay === "monday" ? 1 : 0;

  let daysBack = currentDay - targetDay;
  if (daysBack < 0) daysBack += 7;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysBack);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart.getTime();
}

export function LifeAreaDetail({ lifeAreaId, onBack, onEdit }: LifeAreaDetailProps) {
  const [showActivityForm, setShowActivityForm] = useState(false);

  const area = useLiveQuery(
    () => db.lifeAreas.get(lifeAreaId),
    [lifeAreaId]
  );

  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"), []);
  const weekStartDay = prefs?.weekStartDay ?? "monday";
  const weekStartTimestamp = useMemo(() => getWeekStart(weekStartDay), [weekStartDay]);

  // Fetch activities for this area this week (for the summary)
  const weekActivities = useLiveQuery(
    () =>
      db.activities
        .where("date")
        .aboveOrEqual(weekStartTimestamp)
        .filter((a) => a.lifeAreaId === lifeAreaId && a.deletedAt === null)
        .toArray(),
    [lifeAreaId, weekStartTimestamp]
  );

  // Fetch recent activities (last 20) for history
  const recentActivities = useLiveQuery(
    () =>
      db.activities
        .where("lifeAreaId")
        .equals(lifeAreaId)
        .filter((a) => a.deletedAt === null)
        .reverse()
        .sortBy("date")
        .then((results) => results.slice(0, 20)),
    [lifeAreaId]
  );

  // Weekly summary calculations
  const totalMinutesThisWeek = useMemo(() => {
    if (!weekActivities) return 0;
    return weekActivities.reduce((sum, a) => sum + a.durationMinutes, 0);
  }, [weekActivities]);

  const hoursThisWeek = totalMinutesThisWeek / 60;
  const targetHours = area?.targetHoursPerWeek ?? 0;
  const progressPercent = targetHours > 0 ? Math.min((hoursThisWeek / targetHours) * 100, 100) : 0;
  const isOnTrack = hoursThisWeek >= targetHours;
  const isLow = targetHours > 0 && hoursThisWeek < targetHours * 0.5;

  // Show household tasks section for DIY/Household-type life areas
  const isHouseholdArea = useMemo(() => {
    if (!area) return false;
    const lower = area.name.toLowerCase();
    return lower.includes("diy") || lower.includes("household");
  }, [area]);

  if (area === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500">Loading life area...</p>
      </div>
    );
  }

  if (area === null) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500">Life area not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Back to life areas
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          aria-label="Back to life areas"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={() => onEdit(lifeAreaId)}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Edit
        </button>
      </div>

      {/* Life area info & weekly summary */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              isOnTrack
                ? "bg-green-100 text-green-600"
                : isLow
                  ? "bg-amber-100 text-amber-600"
                  : "bg-indigo-100 text-indigo-600"
            }`}
          >
            <LifeAreaIcon icon={area.icon} size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-gray-900">{area.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Target: {targetHours}h per week
            </p>
          </div>
        </div>

        {/* Weekly summary */}
        <div className="mt-4 rounded-lg bg-gray-50 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            This Week
          </h3>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">
              {formatDuration(totalMinutesThisWeek)}
            </span>
            <span className="text-sm text-gray-500">
              of {targetHours}h target
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-2.5 w-full rounded-full bg-gray-200">
            <div
              className={`h-2.5 rounded-full transition-all ${
                isOnTrack
                  ? "bg-green-500"
                  : isLow
                    ? "bg-amber-400"
                    : "bg-indigo-400"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <p className="mt-1.5 text-xs text-gray-500">
            {isOnTrack
              ? "On track! You've met your target this week."
              : targetHours > 0
                ? `${formatDuration(Math.round((targetHours - hoursThisWeek) * 60))} remaining to reach your target.`
                : "No target set for this area."}
          </p>
        </div>
      </section>

      {/* Log activity button / form */}
      {showActivityForm ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <ActivityForm
            lifeAreaId={lifeAreaId}
            onComplete={() => setShowActivityForm(false)}
            onCancel={() => setShowActivityForm(false)}
          />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setShowActivityForm(true)}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
        >
          Log Activity
        </button>
      )}

      {/* Household task list (shown only for DIY/Household-type life areas) */}
      {isHouseholdArea && (
        <HouseholdTaskList lifeAreaId={lifeAreaId} />
      )}

      {/* Activity history */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Recent Activities
          {recentActivities && recentActivities.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({recentActivities.length})
            </span>
          )}
        </h3>

        {!recentActivities || recentActivities.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">
              No activities yet. Tap the button above to log one.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="rounded-xl border border-gray-200 bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {activity.description}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatActivityDate(activity.date)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                    {formatDuration(activity.durationMinutes)}
                  </span>
                  {activity.notes && (
                    <span className="truncate text-xs text-gray-600">
                      {activity.notes}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Format minutes into a human-readable duration string. */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

/** Format an activity date for display in the history list. */
function formatActivityDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return (
      new Date(timestamp).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }) + " today"
    );
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}
