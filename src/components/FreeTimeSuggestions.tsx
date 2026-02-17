"use client";

import { useState, useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  getFilteredSuggestions,
  getTimeEstimate,
  type ScoredItem,
  type ScoringData,
} from "@/lib/priority";
import { CheckInForm } from "@/components/CheckInForm";
import { ActivityForm } from "@/components/ActivityForm";
import { CHECK_IN_TYPE_LABELS } from "@/lib/constants";
import type { FreeTimeInputs } from "@/components/FreeTimeFlow";
import type { CheckInType } from "@/types/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FreeTimeSuggestionsProps {
  inputs: FreeTimeInputs;
  onDone: () => void;
}

type ActiveAction =
  | { type: "check-in"; contactId: number; contactName: string }
  | { type: "activity"; lifeAreaId: number; lifeAreaName: string };

// ---------------------------------------------------------------------------
// Helper: format minutes for display
// ---------------------------------------------------------------------------

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// ---------------------------------------------------------------------------
// Helper: life area badge colour
// ---------------------------------------------------------------------------

const AREA_COLOURS: Record<string, string> = {
  "Self-care": "bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300",
  "DIY/Household": "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300",
  "Partner Time": "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300",
  Social: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300",
  "Personal Goals": "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300",
  People: "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300",
};

function getAreaColour(area: string): string {
  return AREA_COLOURS[area] ?? "bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300";
}

// ---------------------------------------------------------------------------
// Suggestion card component
// ---------------------------------------------------------------------------

function SuggestionCard({
  item,
  onAccept,
  onDismiss,
}: {
  item: ScoredItem;
  onAccept: (item: ScoredItem) => void;
  onDismiss: (item: ScoredItem) => void;
}) {
  const estimate = item.estimatedMinutes ?? getTimeEstimate(item.type, item.subType);
  const areaLabel = item.lifeArea ?? "General";

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4 shadow-sm">
      {/* Header: area badge + estimated time */}
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getAreaColour(areaLabel)}`}
        >
          {areaLabel}
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
          ~{formatMinutes(estimate)}
        </span>
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title}</h4>

      {/* Reason */}
      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{item.reason}</p>

      {/* Sub-type hint for contacts */}
      {item.type === "contact" && item.subType && (
        <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
          Suggested: {CHECK_IN_TYPE_LABELS[item.subType as CheckInType] ?? item.subType}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onAccept(item)}
          className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
        >
          Do this
        </button>
        <button
          type="button"
          onClick={() => onDismiss(item)}
          className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card px-3 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FreeTimeSuggestions({ inputs, onDone }: FreeTimeSuggestionsProps) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);

  // Load all data needed for the priority algorithm
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
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));

  // Check if data is still loading
  const isLoading =
    contacts === undefined ||
    checkIns === undefined ||
    lifeAreas === undefined ||
    activities === undefined ||
    householdTasks === undefined ||
    goals === undefined ||
    snoozedItems === undefined ||
    prefs === undefined;

  // Build scoring data and compute suggestions
  const suggestions = useMemo(() => {
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

    const allSuggestions = getFilteredSuggestions(data, {
      availableMinutes: inputs.availableMinutes,
      energy: inputs.energy,
      weekStartDay: prefs?.weekStartDay ?? "monday",
      partnerDeviceId: prefs?.partnerDeviceId ?? null,
      // Request extra suggestions to account for dismissals
      maxSuggestions: 10,
    });

    // Filter out dismissed items and limit to 5
    return allSuggestions
      .filter((item) => !dismissedKeys.has(item.key))
      .slice(0, 5);
  }, [
    isLoading,
    contacts,
    checkIns,
    lifeAreas,
    activities,
    householdTasks,
    goals,
    snoozedItems,
    prefs,
    inputs,
    dismissedKeys,
  ]);

  const handleDismiss = useCallback((item: ScoredItem) => {
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(item.key);
      return next;
    });
  }, []);

  const handleAccept = useCallback(
    (item: ScoredItem) => {
      if (item.type === "contact") {
        const contact = contacts?.find((c) => c.id === item.itemId);
        setActiveAction({
          type: "check-in",
          contactId: item.itemId,
          contactName: contact?.name ?? "Contact",
        });
      } else if (item.type === "life-area") {
        const area = lifeAreas?.find((a) => a.id === item.itemId);
        setActiveAction({
          type: "activity",
          lifeAreaId: item.itemId,
          lifeAreaName: area?.name ?? "Activity",
        });
      } else if (item.type === "goal") {
        // Log an activity for the goal's life area
        const goal = goals?.find((g) => g.id === item.itemId);
        if (goal) {
          setActiveAction({
            type: "activity",
            lifeAreaId: goal.lifeAreaId,
            lifeAreaName: item.lifeArea ?? "Personal Goals",
          });
        }
      } else if (item.type === "household-task") {
        // Log an activity for the household task's life area
        const task = householdTasks?.find((t) => t.id === item.itemId);
        if (task) {
          setActiveAction({
            type: "activity",
            lifeAreaId: task.lifeAreaId,
            lifeAreaName: item.lifeArea ?? "DIY/Household",
          });
        }
      }
    },
    [contacts, lifeAreas, goals, householdTasks],
  );

  const handleActionComplete = useCallback(() => {
    setActiveAction(null);
    onDone();
  }, [onDone]);

  const handleActionCancel = useCallback(() => {
    setActiveAction(null);
  }, []);

  // Show the inline logging form when the user accepts a suggestion
  if (activeAction) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleActionCancel}
            className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
            aria-label="Back to suggestions"
          >
            &larr; Back
          </button>
          <span className="text-sm text-gray-400 dark:text-slate-500">
            {activeAction.type === "check-in"
              ? `Log check-in with ${activeAction.contactName}`
              : `Log activity for ${activeAction.lifeAreaName}`}
          </span>
        </div>

        {activeAction.type === "check-in" ? (
          <CheckInForm
            contactId={activeAction.contactId}
            onComplete={handleActionComplete}
            onCancel={handleActionCancel}
          />
        ) : (
          <ActivityForm
            lifeAreaId={activeAction.lifeAreaId}
            onComplete={handleActionComplete}
            onCancel={handleActionCancel}
          />
        )}
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Suggestions</h3>
        </div>
        <p className="text-sm text-gray-400 dark:text-slate-500">Loading suggestions...</p>
      </div>
    );
  }

  // No suggestions available
  if (suggestions.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Suggestions</h3>
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          >
            Done
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-surface p-6 text-center">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {dismissedKeys.size > 0
              ? "No more suggestions available. You've seen them all!"
              : "Nothing to suggest right now. You're all caught up!"}
          </p>
          <button
            type="button"
            onClick={onDone}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          Here&apos;s what to do
        </h3>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
        >
          Done
        </button>
      </div>

      {/* Time & energy summary */}
      <p className="text-xs text-gray-500 dark:text-slate-400">
        {formatMinutes(inputs.availableMinutes)} available
        {inputs.energy !== "normal" && (
          <> &middot; {inputs.energy === "energetic" ? "Feeling energetic" : "Low energy"}</>
        )}
      </p>

      {/* Suggestion cards */}
      <div className="space-y-3">
        {suggestions.map((item) => (
          <SuggestionCard
            key={item.key}
            item={item}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </div>
  );
}
