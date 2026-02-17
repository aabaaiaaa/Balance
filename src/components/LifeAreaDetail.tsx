"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { findPlaceLabel } from "@/lib/location";
import { LifeAreaIcon } from "@/components/LifeAreaIcon";
import { ActivityForm } from "@/components/ActivityForm";
import { HouseholdTaskList } from "@/components/HouseholdTaskList";
import { GoalList } from "@/components/GoalList";
import { DateNightSection } from "@/components/DateNightSection";
import type { Activity, WeekStartDay } from "@/types/models";

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

  const savedPlaces = useLiveQuery(
    () => db.savedPlaces.filter((p) => p.deletedAt === null).toArray(),
    []
  );

  /** Resolve an activity's location to a saved place label. */
  const getActivityPlaceName = useMemo(() => {
    if (!savedPlaces || savedPlaces.length === 0) return () => null;
    return (activity: Activity): string | null => {
      if (!activity.location) return null;
      return findPlaceLabel(activity.location.lat, activity.location.lng, savedPlaces);
    };
  }, [savedPlaces]);

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

  // Show goals section for Personal Goals-type life areas
  const isPersonalGoalsArea = useMemo(() => {
    if (!area) return false;
    const lower = area.name.toLowerCase();
    return lower.includes("personal") && lower.includes("goal");
  }, [area]);

  // Show date night section for Partner Time-type life areas
  const isPartnerTimeArea = useMemo(() => {
    if (!area) return false;
    const lower = area.name.toLowerCase();
    return lower.includes("partner");
  }, [area]);

  if (area === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500 dark:text-slate-400">Loading life area...</p>
      </div>
    );
  }

  if (area === null) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500 dark:text-slate-400">Life area not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
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
          className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
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
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          Edit
        </button>
      </div>

      {/* Life area info & weekly summary */}
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <div className="flex items-start gap-3">
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
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{area.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
              Target: {targetHours}h per week
            </p>
          </div>
        </div>

        {/* Weekly summary */}
        <div className="mt-4 rounded-lg bg-gray-50 dark:bg-surface p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            This Week
          </h3>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 dark:text-slate-100">
              {formatDuration(totalMinutesThisWeek)}
            </span>
            <span className="text-sm text-gray-500 dark:text-slate-400">
              of {targetHours}h target
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-2.5 w-full rounded-full bg-gray-200 dark:bg-slate-700">
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

          <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
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
        <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
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

      {/* Goal list (shown only for Personal Goals-type life areas) */}
      {isPersonalGoalsArea && (
        <GoalList lifeAreaId={lifeAreaId} />
      )}

      {/* Date night section (shown only for Partner Time-type life areas) */}
      {isPartnerTimeArea && (
        <DateNightSection />
      )}

      {/* Activity history */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Recent Activities
          {recentActivities && recentActivities.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">
              ({recentActivities.length})
            </span>
          )}
        </h3>

        {!recentActivities || recentActivities.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
            <p className="text-sm text-gray-400 dark:text-slate-500">
              No activities yet. Tap the button above to log one.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActivities.map((activity) => {
              const placeName = getActivityPlaceName(activity);
              return (
                <div
                  key={activity.id}
                  className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                      {activity.description}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {formatActivityDate(activity.date)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                      {formatDuration(activity.durationMinutes)}
                    </span>
                    {placeName && (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {placeName}
                      </span>
                    )}
                    {activity.notes && (
                      <span className="truncate text-xs text-gray-600 dark:text-slate-300">
                        {activity.notes}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
