"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { LifeAreaCard } from "@/components/LifeAreaCard";
import { LifeAreaForm } from "@/components/LifeAreaForm";
import type { WeekStartDay } from "@/types/models";

type ViewState =
  | { mode: "list" }
  | { mode: "add" }
  | { mode: "edit"; lifeAreaId: number };

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

export default function LifeAreasPage() {
  const [view, setView] = useState<ViewState>({ mode: "list" });

  // Fetch all active life areas
  const lifeAreas = useLiveQuery(
    () => db.lifeAreas.filter((a) => a.deletedAt === null).toArray(),
    []
  );

  // Fetch user preferences for weekStartDay
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"), []);

  const weekStartDay = prefs?.weekStartDay ?? "monday";
  const weekStartTimestamp = useMemo(() => getWeekStart(weekStartDay), [weekStartDay]);

  // Fetch all activities since the start of this week
  const activities = useLiveQuery(
    () =>
      db.activities
        .where("date")
        .aboveOrEqual(weekStartTimestamp)
        .filter((a) => a.deletedAt === null)
        .toArray(),
    [weekStartTimestamp]
  );

  // Calculate hours per life area this week
  const hoursPerArea = useMemo(() => {
    const map = new Map<number, number>();
    if (!activities) return map;
    for (const activity of activities) {
      const current = map.get(activity.lifeAreaId) ?? 0;
      map.set(activity.lifeAreaId, current + activity.durationMinutes / 60);
    }
    return map;
  }, [activities]);

  if (view.mode === "add") {
    return (
      <LifeAreaForm
        onComplete={() => setView({ mode: "list" })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  if (view.mode === "edit") {
    return (
      <LifeAreaForm
        lifeAreaId={view.lifeAreaId}
        onComplete={() => setView({ mode: "list" })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">Life Areas</h2>
        <p className="mt-1 text-sm text-gray-500">
          Track and balance the areas that matter to you.
        </p>
      </section>

      {!lifeAreas || lifeAreas.length === 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-400">
            No life areas yet. Tap the button below to add one.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {lifeAreas.map((area) => (
            <LifeAreaCard
              key={area.id}
              area={area}
              hoursThisWeek={hoursPerArea.get(area.id!) ?? 0}
              onTap={(id) => setView({ mode: "edit", lifeAreaId: id })}
            />
          ))}
        </div>
      )}

      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setView({ mode: "add" })}
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Add life area"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
