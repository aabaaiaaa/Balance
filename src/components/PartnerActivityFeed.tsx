"use client";

import React, { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { CHECK_IN_TYPE_LABELS } from "@/lib/constants";
import type { CheckIn, Activity, HouseholdTask, Contact, LifeArea, CheckInType } from "@/types/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PartnerActivity {
  id: string;
  type: "check-in" | "activity" | "task";
  title: string;
  detail: string;
  date: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function buildPartnerActivities(
  partnerDeviceId: string,
  checkIns: CheckIn[],
  activities: Activity[],
  householdTasks: HouseholdTask[],
  contacts: Contact[],
  lifeAreas: LifeArea[],
): PartnerActivity[] {
  const contactMap = new Map(contacts.map((c) => [c.id, c.name]));
  const areaMap = new Map(lifeAreas.map((a) => [a.id, a.name]));

  const items: PartnerActivity[] = [];

  // Partner check-ins
  for (const ci of checkIns) {
    if (ci.deviceId !== partnerDeviceId) continue;
    const contactName = contactMap.get(ci.contactId) ?? "Someone";
    const typeLabel = CHECK_IN_TYPE_LABELS[ci.type as CheckInType] ?? ci.type;
    items.push({
      id: `checkin-${ci.id}`,
      type: "check-in",
      title: `Checked in with ${contactName}`,
      detail: typeLabel,
      date: ci.date,
    });
  }

  // Partner activities
  for (const act of activities) {
    if (act.deviceId !== partnerDeviceId) continue;
    const areaName = areaMap.get(act.lifeAreaId) ?? "Activity";
    items.push({
      id: `activity-${act.id}`,
      type: "activity",
      title: act.description || `${areaName} activity`,
      detail: `${areaName} \u00B7 ${act.durationMinutes}m`,
      date: act.date,
    });
  }

  // Partner completed tasks
  for (const task of householdTasks) {
    if (task.deviceId !== partnerDeviceId) continue;
    if (task.status !== "done" || !task.completedAt) continue;
    items.push({
      id: `task-${task.id}`,
      type: "task",
      title: `Completed: ${task.title}`,
      detail: "Household task",
      date: task.completedAt,
    });
  }

  // Sort newest first, take top 20
  items.sort((a, b) => b.date - a.date);
  return items.slice(0, 20);
}

const ACTIVITY_ICONS: Record<PartnerActivity["type"], { bg: string; icon: React.ReactNode }> = {
  "check-in": {
    bg: "bg-indigo-100 dark:bg-indigo-900",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
  },
  activity: {
    bg: "bg-green-100 dark:bg-green-900",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  task: {
    bg: "bg-amber-100 dark:bg-amber-900",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PartnerActivityFeed({ partnerDeviceId }: { partnerDeviceId: string }) {
  const checkIns = useLiveQuery(() =>
    db.checkIns.filter((c) => c.deletedAt === null).toArray(),
  );
  const activities = useLiveQuery(() =>
    db.activities.filter((a) => a.deletedAt === null).toArray(),
  );
  const householdTasks = useLiveQuery(() =>
    db.householdTasks.filter((t) => t.deletedAt === null).toArray(),
  );
  const contacts = useLiveQuery(() =>
    db.contacts.filter((c) => c.deletedAt === null).toArray(),
  );
  const lifeAreas = useLiveQuery(() =>
    db.lifeAreas.filter((a) => a.deletedAt === null).toArray(),
  );

  const isLoading =
    checkIns === undefined ||
    activities === undefined ||
    householdTasks === undefined ||
    contacts === undefined ||
    lifeAreas === undefined;

  const partnerItems = useMemo(() => {
    if (isLoading) return [];
    return buildPartnerActivities(
      partnerDeviceId,
      checkIns!,
      activities!,
      householdTasks!,
      contacts!,
      lifeAreas!,
    );
  }, [isLoading, partnerDeviceId, checkIns, activities, householdTasks, contacts, lifeAreas]);

  if (isLoading) {
    return null;
  }

  if (partnerItems.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
          Partner Activity
        </h3>
        <span className="text-xs text-gray-400 dark:text-slate-500">
          {partnerItems.length} recent
        </span>
      </div>

      <div className="space-y-1.5">
        {partnerItems.map((item) => {
          const iconInfo = ACTIVITY_ICONS[item.type];
          return (
            <div
              key={item.id}
              className="flex items-start gap-2.5 rounded-lg px-2 py-1.5"
            >
              <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconInfo.bg}`}>
                {iconInfo.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 dark:text-slate-100 truncate">
                  {item.title}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {item.detail} &middot; {formatRelativeTime(item.date)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
