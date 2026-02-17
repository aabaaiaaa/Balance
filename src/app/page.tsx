"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  calculatePriorities,
  getTimeEstimate,
  type ScoredItem,
  type ScoringData,
} from "@/lib/priority";
import { BalanceChart } from "@/components/BalanceChart";
import { FreeTimeFlow } from "@/components/FreeTimeFlow";
import { FreeTimeSuggestions } from "@/components/FreeTimeSuggestions";
import { CheckInForm } from "@/components/CheckInForm";
import { ActivityForm } from "@/components/ActivityForm";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LocationPrompt } from "@/components/LocationPrompt";
import { CHECK_IN_TYPE_LABELS } from "@/lib/constants";
import type { FreeTimeInputs } from "@/components/FreeTimeFlow";
import type { CheckInType, WeekStartDay } from "@/types/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuickAction =
  | { type: "check-in"; contactId: number; contactName: string }
  | { type: "activity"; lifeAreaId: number; lifeAreaName: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the start-of-week timestamp based on the user's weekStartDay preference. */
function getWeekStart(weekStartDay: WeekStartDay): number {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday
  const targetDay = weekStartDay === "monday" ? 1 : 0;

  let daysBack = currentDay - targetDay;
  if (daysBack < 0) daysBack += 7;

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysBack);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart.getTime();
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

const AREA_COLOURS: Record<string, string> = {
  "Self-care": "bg-pink-100 text-pink-700",
  "DIY/Household": "bg-amber-100 text-amber-700",
  "Partner Time": "bg-purple-100 text-purple-700",
  Social: "bg-blue-100 text-blue-700",
  "Personal Goals": "bg-green-100 text-green-700",
  People: "bg-indigo-100 text-indigo-700",
};

function getAreaColour(area: string): string {
  return AREA_COLOURS[area] ?? "bg-gray-100 text-gray-700";
}

/** Build a time-of-day greeting. */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Priority item card
// ---------------------------------------------------------------------------

function PriorityCard({
  item,
  onQuickAction,
  onTap,
}: {
  item: ScoredItem;
  onQuickAction: (item: ScoredItem) => void;
  onTap: (item: ScoredItem) => void;
}) {
  const estimate = item.estimatedMinutes ?? getTimeEstimate(item.type, item.subType);
  const areaLabel = item.lifeArea ?? "General";

  const actionLabel =
    item.type === "contact" ? "Log check-in" : "Log activity";

  return (
    <button
      type="button"
      onClick={() => onTap(item)}
      className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      <div className="flex items-start gap-3">
        {/* Left side: content */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${getAreaColour(areaLabel)}`}
            >
              {areaLabel}
            </span>
            <span className="text-[10px] text-gray-400">
              ~{formatMinutes(estimate)}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-900">{item.title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{item.reason}</p>
          {item.type === "contact" && item.subType && (
            <p className="mt-0.5 text-[10px] text-gray-400">
              Suggested: {CHECK_IN_TYPE_LABELS[item.subType as CheckInType] ?? item.subType}
            </p>
          )}
        </div>

        {/* Quick action button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickAction(item);
          }}
          className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 active:bg-indigo-200"
        >
          {actionLabel}
        </button>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [showFreeTimeFlow, setShowFreeTimeFlow] = useState(false);
  const [freeTimeInputs, setFreeTimeInputs] = useState<FreeTimeInputs | null>(null);
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);

  // Load all data needed for the dashboard
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const contacts = useLiveQuery(() =>
    db.contacts.filter((c) => c.deletedAt === null).toArray(),
  );
  const checkIns = useLiveQuery(() =>
    db.checkIns.filter((c) => c.deletedAt === null).toArray(),
  );
  const lifeAreas = useLiveQuery(() =>
    db.lifeAreas.filter((a) => a.deletedAt === null).toArray(),
  );
  const activities = useLiveQuery(() =>
    db.activities.filter((a) => a.deletedAt === null).toArray(),
  );
  const householdTasks = useLiveQuery(() =>
    db.householdTasks.filter((t) => t.deletedAt === null).toArray(),
  );
  const goals = useLiveQuery(() =>
    db.goals.filter((g) => g.deletedAt === null).toArray(),
  );
  const snoozedItems = useLiveQuery(() =>
    db.snoozedItems.filter((s) => s.deletedAt === null).toArray(),
  );

  const lastSync = prefs?.lastSyncTimestamp;
  const weekStartDay = prefs?.weekStartDay ?? "monday";
  const weekStartTimestamp = useMemo(() => getWeekStart(weekStartDay), [weekStartDay]);

  const isLoading =
    contacts === undefined ||
    checkIns === undefined ||
    lifeAreas === undefined ||
    activities === undefined ||
    householdTasks === undefined ||
    goals === undefined ||
    snoozedItems === undefined ||
    prefs === undefined;

  // Calculate hours per life area this week (for BalanceChart)
  const hoursPerArea = useMemo(() => {
    const map = new Map<number, number>();
    if (!activities) return map;
    for (const activity of activities) {
      if (activity.date >= weekStartTimestamp) {
        const current = map.get(activity.lifeAreaId) ?? 0;
        map.set(activity.lifeAreaId, current + activity.durationMinutes / 60);
      }
    }
    return map;
  }, [activities, weekStartTimestamp]);

  // Calculate priority items
  const priorities = useMemo(() => {
    if (isLoading) return [];

    const data: ScoringData = {
      contacts: contacts ?? [],
      checkIns: checkIns ?? [],
      lifeAreas: lifeAreas ?? [],
      activities: activities ?? [],
      householdTasks: householdTasks ?? [],
      goals: goals ?? [],
      snoozedItems: snoozedItems ?? [],
    };

    return calculatePriorities(data, {
      weekStartDay: prefs?.weekStartDay ?? "monday",
      partnerDeviceId: prefs?.partnerDeviceId ?? null,
    }).slice(0, 7);
  }, [isLoading, contacts, checkIns, lifeAreas, activities, householdTasks, goals, snoozedItems, prefs]);

  // Build summary stats for the greeting
  const summaryParts = useMemo(() => {
    if (isLoading) return [];

    const parts: string[] = [];

    // Count overdue contacts
    const now = Date.now();
    const overdueContacts = (contacts ?? []).filter((c) => {
      if (!c.lastCheckIn) return true; // never checked in = overdue
      const daysSince = (now - c.lastCheckIn) / (1000 * 60 * 60 * 24);
      return daysSince > c.checkInFrequencyDays;
    });
    if (overdueContacts.length > 0) {
      parts.push(
        `${overdueContacts.length} contact${overdueContacts.length !== 1 ? "s" : ""} overdue`
      );
    }

    // Check life areas below target
    const lowAreas = (lifeAreas ?? []).filter((area) => {
      if (area.targetHoursPerWeek <= 0) return false;
      const hours = hoursPerArea.get(area.id!) ?? 0;
      return hours < area.targetHoursPerWeek * 0.5;
    });
    if (lowAreas.length === 1) {
      parts.push(`${lowAreas[0].name} is low this week`);
    } else if (lowAreas.length > 1) {
      parts.push(`${lowAreas.length} areas low this week`);
    }

    return parts;
  }, [isLoading, contacts, lifeAreas, hoursPerArea]);

  const handleFreeTimeComplete = (inputs: FreeTimeInputs) => {
    setFreeTimeInputs(inputs);
    setShowFreeTimeFlow(false);
  };

  const handleQuickAction = useCallback(
    (item: ScoredItem) => {
      if (item.type === "contact") {
        const contact = contacts?.find((c) => c.id === item.itemId);
        setQuickAction({
          type: "check-in",
          contactId: item.itemId,
          contactName: contact?.name ?? "Contact",
        });
      } else if (item.type === "life-area") {
        const area = lifeAreas?.find((a) => a.id === item.itemId);
        setQuickAction({
          type: "activity",
          lifeAreaId: item.itemId,
          lifeAreaName: area?.name ?? "Activity",
        });
      }
    },
    [contacts, lifeAreas],
  );

  const handleTapItem = useCallback(
    (item: ScoredItem) => {
      // For items, open the quick action form directly (same as tapping the button)
      // since the detail views live on other tab pages
      handleQuickAction(item);
    },
    [handleQuickAction],
  );

  const handleQuickActionComplete = useCallback(() => {
    setQuickAction(null);
  }, []);

  const handleQuickActionCancel = useCallback(() => {
    setQuickAction(null);
  }, []);

  const handleLocationCheckIn = useCallback(
    (contactId: number, placeName: string) => {
      const contact = contacts?.find((c) => c.id === contactId);
      setQuickAction({
        type: "check-in",
        contactId,
        contactName: contact?.name ?? placeName,
      });
    },
    [contacts],
  );

  const handleLocationActivity = useCallback(
    (lifeAreaId: number, placeName: string) => {
      const area = lifeAreas?.find((a) => a.id === lifeAreaId);
      setQuickAction({
        type: "activity",
        lifeAreaId,
        lifeAreaName: area?.name ?? placeName,
      });
    },
    [lifeAreas],
  );

  const handleNewPlace = useCallback(() => {
    // Navigate to saved places settings to create a new place
    window.location.href = "/settings/saved-places";
  }, []);

  // If a quick action form is active, show it
  if (quickAction) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleQuickActionCancel}
            className="text-sm text-gray-500 hover:text-gray-700"
            aria-label="Back to dashboard"
          >
            &larr; Back
          </button>
          <span className="text-sm text-gray-400">
            {quickAction.type === "check-in"
              ? `Log check-in with ${quickAction.contactName}`
              : `Log activity for ${quickAction.lifeAreaName}`}
          </span>
        </div>

        {quickAction.type === "check-in" ? (
          <CheckInForm
            contactId={quickAction.contactId}
            onComplete={handleQuickActionComplete}
            onCancel={handleQuickActionCancel}
          />
        ) : (
          <ActivityForm
            lifeAreaId={quickAction.lifeAreaId}
            onComplete={handleQuickActionComplete}
            onCancel={handleQuickActionCancel}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting with life-balance summary */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900">{getGreeting()}</h2>
        {isLoading ? (
          <p className="mt-1 text-sm text-gray-400">Loading your dashboard...</p>
        ) : summaryParts.length > 0 ? (
          <p className="mt-1 text-sm text-gray-500">
            {summaryParts.join(" · ")}
          </p>
        ) : (contacts ?? []).length === 0 && (lifeAreas ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">
            Add some contacts and life areas to get started.
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-500">
            You&apos;re on track — nothing overdue right now.
          </p>
        )}
      </section>

      {/* Install prompt for mobile users */}
      <InstallPrompt />

      {/* Location-aware quick logging suggestions */}
      <LocationPrompt
        onLogCheckIn={handleLocationCheckIn}
        onLogActivity={handleLocationActivity}
        onNewPlace={handleNewPlace}
      />

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
          <FreeTimeSuggestions
            inputs={freeTimeInputs}
            onDone={() => setFreeTimeInputs(null)}
          />
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

      {/* Top Priorities */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Top Priorities</h3>
          {priorities.length > 0 && (
            <span className="text-xs text-gray-400">
              {priorities.length} item{priorities.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400">Loading priorities...</p>
        ) : priorities.length === 0 ? (
          <p className="text-sm text-gray-400">
            No priorities right now. Add some contacts and life areas to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {priorities.map((item) => (
              <PriorityCard
                key={item.key}
                item={item}
                onQuickAction={handleQuickAction}
                onTap={handleTapItem}
              />
            ))}
          </div>
        )}
      </section>

      {/* Mini Balance Chart */}
      {!isLoading && lifeAreas && lifeAreas.length > 0 && (
        <BalanceChart lifeAreas={lifeAreas} hoursPerArea={hoursPerArea} />
      )}

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
