"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
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
import { CheckInForm } from "@/components/CheckInForm";
import { ActivityForm } from "@/components/ActivityForm";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LocationPrompt } from "@/components/LocationPrompt";
import { DateNightForm } from "@/components/DateNightForm";
import { WelcomeBackBanner } from "@/components/WelcomeBackBanner";
import { CHECK_IN_TYPE_LABELS } from "@/lib/constants";
import type { FreeTimeInputs } from "@/components/FreeTimeFlow";
import { useLocation } from "@/hooks/useLocation";
import { useReminders } from "@/hooks/useReminders";
import type { CheckInType, WeekStartDay, SnoozedItemType, Contact, DateNight } from "@/types/models";

// Lazy-load heavy components that are conditionally rendered
const FreeTimeSuggestions = dynamic(
  () => import("@/components/FreeTimeSuggestions").then((m) => ({ default: m.FreeTimeSuggestions })),
);
const PlaceQuickCreate = dynamic(
  () => import("@/components/PlaceQuickCreate").then((m) => ({ default: m.PlaceQuickCreate })),
);
const PartnerActivityFeed = dynamic(
  () => import("@/components/PartnerActivityFeed").then((m) => ({ default: m.PartnerActivityFeed })),
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuickAction =
  | { type: "check-in"; contactId: number; contactName: string }
  | { type: "activity"; lifeAreaId: number; lifeAreaName: string }
  | { type: "date-night" };

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
  "Self-care": "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300",
  "DIY/Household": "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  "Partner Time": "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
  Social: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  "Personal Goals": "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  People: "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
};

function getAreaColour(area: string): string {
  return AREA_COLOURS[area] ?? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300";
}

/** Build a time-of-day greeting. */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Snooze item type mapping
// ---------------------------------------------------------------------------

/** Map scored item types to SnoozedItem types. Returns null for types that can't be snoozed. */
function toSnoozedItemType(scoredType: string): SnoozedItemType | null {
  switch (scoredType) {
    case "contact": return "contact";
    case "household-task": return "task";
    case "goal": return "goal";
    case "date-night": return "date-night";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Priority item card
// ---------------------------------------------------------------------------

function PriorityCard({
  item,
  contact,
  onQuickAction,
  onSnooze,
}: {
  item: ScoredItem;
  contact: Contact | null;
  onQuickAction: (item: ScoredItem) => void;
  onSnooze: (item: ScoredItem) => void;
}) {
  const estimate = item.estimatedMinutes ?? getTimeEstimate(item.type, item.subType);
  const areaLabel = item.lifeArea ?? "General";

  const showCallButton = item.type === "contact" && contact?.phoneNumber;
  const canSnooze = toSnoozedItemType(item.type) !== null;

  return (
    <div
      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left"
    >
      {/* Item info */}
      <div className="mb-2">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${getAreaColour(areaLabel)}`}
          >
            {areaLabel}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-slate-500">
            ~{formatMinutes(estimate)}
          </span>
        </div>
        <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{item.title}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{item.reason}</p>
        {item.type === "contact" && item.subType && (
          <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">
            Suggested: {CHECK_IN_TYPE_LABELS[item.subType as CheckInType] ?? item.subType}
          </p>
        )}
      </div>

      {/* Quick action buttons */}
      <div className="flex items-center gap-2">
        {/* Call button — only for contacts with a phone number */}
        {showCallButton && (
          <a
            href={`tel:${contact.phoneNumber}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-lg bg-green-50 dark:bg-green-950 px-2.5 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 transition-colors hover:bg-green-100 dark:hover:bg-green-900 active:bg-green-200 dark:active:bg-green-800"
            aria-label={`Call ${contact.name}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Call
          </a>
        )}

        {/* Log it button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickAction(item);
          }}
          aria-label={`Log ${item.title}`}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900 active:bg-indigo-200 dark:active:bg-indigo-800"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Log it
        </button>

        {/* Snooze button — only for snoozable items */}
        {canSnooze && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSnooze(item);
            }}
            aria-label={`Snooze ${item.title} for 24 hours`}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900 active:bg-amber-200 dark:active:bg-amber-800"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Snooze
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [showFreeTimeFlow, setShowFreeTimeFlow] = useState(false);
  const [freeTimeInputs, setFreeTimeInputs] = useState<FreeTimeInputs | null>(null);
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [quickCreateLocation, setQuickCreateLocation] = useState<{ lat: number; lng: number } | null>(null);
  const { loading: imHereLoading, requestPosition } = useLocation();

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
  const dateNights = useLiveQuery(() =>
    db.dateNights.filter((dn) => dn.deletedAt === null).toArray(),
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
    dateNights === undefined ||
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

  // Build scoring data for priority algorithm and reminders
  const scoringData = useMemo<ScoringData | null>(() => {
    if (isLoading) return null;
    return {
      contacts: contacts ?? [],
      checkIns: checkIns ?? [],
      lifeAreas: lifeAreas ?? [],
      activities: activities ?? [],
      householdTasks: householdTasks ?? [],
      goals: goals ?? [],
      dateNights: dateNights ?? [],
      snoozedItems: snoozedItems ?? [],
      dateNightFrequencyDays: prefs?.dateNightFrequencyDays ?? 14,
    };
  }, [isLoading, contacts, checkIns, lifeAreas, activities, householdTasks, goals, dateNights, snoozedItems, prefs]);

  // Run on-open reminder check (welcome back banner + OS notifications)
  const { welcomeBack } = useReminders({ data: scoringData, prefs });

  // Calculate priority items
  const priorities = useMemo(() => {
    if (!scoringData) return [];

    return calculatePriorities(scoringData, {
      weekStartDay: prefs?.weekStartDay ?? "monday",
      partnerDeviceId: prefs?.partnerDeviceId ?? null,
    }).slice(0, 7);
  }, [scoringData, prefs]);

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
      } else if (item.type === "date-night") {
        setQuickAction({ type: "date-night" });
      }
    },
    [contacts, lifeAreas],
  );

  const handleSnooze = useCallback(async (item: ScoredItem) => {
    const snoozedType = toSnoozedItemType(item.type);
    if (!snoozedType) return;

    try {
      const currentPrefs = await db.userPreferences.get("prefs");
      const deviceId = currentPrefs?.deviceId ?? "unknown";
      const now = Date.now();
      const snoozedUntil = now + 24 * 60 * 60 * 1000; // 24 hours from now

      await db.snoozedItems.add({
        itemType: snoozedType,
        itemId: item.itemId,
        snoozedUntil,
        updatedAt: now,
        deviceId,
        deletedAt: null,
      });
    } catch (err) {
      console.error("Failed to snooze item:", err);
    }
  }, []);

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

  const handleNewPlace = useCallback((lat: number, lng: number) => {
    setQuickCreateLocation({ lat, lng });
  }, []);

  const handleImHere = useCallback(async () => {
    const pos = await requestPosition();
    if (pos) {
      setQuickCreateLocation({ lat: pos.lat, lng: pos.lng });
    }
  }, [requestPosition]);

  const handleQuickCreateComplete = useCallback(() => {
    setQuickCreateLocation(null);
  }, []);

  const handleQuickCreateCancel = useCallback(() => {
    setQuickCreateLocation(null);
  }, []);

  // If the quick-create place flow is active, show it
  if (quickCreateLocation) {
    return (
      <div className="space-y-4">
        <PlaceQuickCreate
          lat={quickCreateLocation.lat}
          lng={quickCreateLocation.lng}
          onComplete={handleQuickCreateComplete}
          onCancel={handleQuickCreateCancel}
        />
      </div>
    );
  }

  return (
    <>
    {/* Bottom-sheet modal for quick Log it action */}
    {quickAction && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label={
          quickAction.type === "check-in"
            ? `Log check-in with ${quickAction.contactName}`
            : quickAction.type === "date-night"
              ? "Log a date night"
              : `Log activity for ${quickAction.lifeAreaName}`
        }
        onKeyDown={(e) => {
          if (e.key === "Escape") handleQuickActionCancel();
        }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={handleQuickActionCancel}
          aria-hidden="true"
        />
        {/* Sheet content */}
        <div className="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white dark:bg-card p-4 pb-20 sm:pb-4 shadow-xl max-h-[85vh] overflow-y-auto">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500 dark:text-slate-400">
              {quickAction.type === "check-in"
                ? `Log check-in with ${quickAction.contactName}`
                : quickAction.type === "date-night"
                  ? "Log a date night"
                  : `Log activity for ${quickAction.lifeAreaName}`}
            </span>
          </div>

          {quickAction.type === "check-in" ? (
            <CheckInForm
              contactId={quickAction.contactId}
              onComplete={handleQuickActionComplete}
              onCancel={handleQuickActionCancel}
            />
          ) : quickAction.type === "date-night" ? (
            <DateNightForm
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
      </div>
    )}

    <div className="space-y-6">
      {/* Greeting with life-balance summary */}
      <section aria-label="Dashboard summary">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{getGreeting()}</h2>
        {isLoading ? (
          <p className="mt-1 text-sm text-gray-400 dark:text-slate-500" aria-live="polite">Loading your dashboard...</p>
        ) : summaryParts.length > 0 ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            {summaryParts.join(" · ")}
          </p>
        ) : (contacts ?? []).length === 0 && (lifeAreas ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Add some contacts and life areas to get started.
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            You&apos;re on track — nothing overdue right now.
          </p>
        )}
      </section>

      {/* Welcome back banner (shown after 24h+ absence) */}
      {welcomeBack && <WelcomeBackBanner summary={welcomeBack} />}

      {/* Install prompt for mobile users */}
      <InstallPrompt />

      {/* Location-aware quick logging suggestions */}
      <LocationPrompt
        onLogCheckIn={handleLocationCheckIn}
        onLogActivity={handleLocationActivity}
        onNewPlace={handleNewPlace}
      />

      {/* "I'm here" button for quick place saving */}
      <button
        type="button"
        onClick={handleImHere}
        disabled={imHereLoading}
        aria-label={imHereLoading ? "Getting location" : "Save current location for quick logging"}
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600 disabled:opacity-50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
            {imHereLoading ? "Getting location..." : "I\u2019m here"}
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">Save this place for quick logging</p>
        </div>
      </button>

      {/* "I have free time" button / flow */}
      {showFreeTimeFlow ? (
        <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
          <FreeTimeFlow
            onComplete={handleFreeTimeComplete}
            onCancel={() => setShowFreeTimeFlow(false)}
          />
        </section>
      ) : freeTimeInputs ? (
        <section className="rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950 p-4">
          <FreeTimeSuggestions
            inputs={freeTimeInputs}
            onDone={() => setFreeTimeInputs(null)}
          />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setShowFreeTimeFlow(true)}
          aria-label="I have free time — get suggestions for the best use of your time"
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950 p-4 transition-colors hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900 active:bg-indigo-150 dark:active:bg-indigo-800"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600" aria-hidden="true">
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
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
              I have free time
            </p>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Get suggestions for the best use of your time
            </p>
          </div>
        </button>
      )}

      {/* Top Priorities */}
      <section aria-label="Top priorities" className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Top Priorities</h3>
          {priorities.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-slate-500">
              {priorities.length} item{priorities.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">Loading priorities...</p>
        ) : priorities.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500">
            No priorities right now. Add some contacts and life areas to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {priorities.map((item) => (
              <PriorityCard
                key={item.key}
                item={item}
                contact={item.type === "contact" ? contacts?.find((c) => c.id === item.itemId) ?? null : null}
                onQuickAction={handleQuickAction}
                onSnooze={handleSnooze}
              />
            ))}
          </div>
        )}
      </section>

      {/* Partner Activity Feed */}
      {prefs?.partnerDeviceId && (
        <PartnerActivityFeed partnerDeviceId={prefs.partnerDeviceId} />
      )}

      {/* Mini Balance Chart */}
      {!isLoading && lifeAreas && lifeAreas.length > 0 && (
        <BalanceChart lifeAreas={lifeAreas} hoursPerArea={hoursPerArea} />
      )}

      {/* Sync shortcut */}
      <Link
        href="/sync"
        aria-label="Sync with Partner"
        className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600 dark:text-indigo-400"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
            Sync with Partner
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
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
    </>
  );
}
