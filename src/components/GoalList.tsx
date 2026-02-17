"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { GoalForm } from "@/components/GoalForm";
import type { Goal } from "@/types/models";

interface GoalListProps {
  lifeAreaId: number;
}

function formatDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = timestamp - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return overdueDays === 1 ? "1 day overdue" : `${overdueDays} days overdue`;
  }
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays < 7) return `Due in ${diffDays} days`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? "Due in 1 week" : `Due in ${weeks} weeks`;
  }

  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCompletedDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function GoalList({ lifeAreaId }: GoalListProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | undefined>(
    undefined,
  );
  const [showCompleted, setShowCompleted] = useState(false);

  // Active goals (not 100% complete)
  const activeGoals = useLiveQuery(
    () =>
      db.goals
        .where("lifeAreaId")
        .equals(lifeAreaId)
        .filter((g) => g.deletedAt === null && g.progressPercent < 100)
        .toArray()
        .then((goals) =>
          goals.sort((a, b) => {
            // Sort by target date (soonest first), then by updatedAt
            if (a.targetDate && b.targetDate)
              return a.targetDate - b.targetDate;
            if (a.targetDate) return -1;
            if (b.targetDate) return 1;
            return b.updatedAt - a.updatedAt;
          }),
        ),
    [lifeAreaId],
  );

  // Completed goals
  const completedGoals = useLiveQuery(
    () =>
      db.goals
        .where("lifeAreaId")
        .equals(lifeAreaId)
        .filter((g) => g.deletedAt === null && g.progressPercent >= 100)
        .toArray()
        .then((goals) => goals.sort((a, b) => b.updatedAt - a.updatedAt)),
    [lifeAreaId],
  );

  const handleToggleMilestone = useCallback(
    async (goal: Goal, milestoneIndex: number) => {
      if (goal.id === undefined) return;
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      const updatedMilestones = goal.milestones.map((m, i) =>
        i === milestoneIndex ? { ...m, done: !m.done } : m,
      );

      const totalMilestones = updatedMilestones.length;
      const doneMilestones = updatedMilestones.filter((m) => m.done).length;
      const progressPercent =
        totalMilestones > 0
          ? Math.round((doneMilestones / totalMilestones) * 100)
          : 0;

      await db.goals.update(goal.id, {
        milestones: updatedMilestones,
        progressPercent,
        updatedAt: now,
        deviceId,
      });
    },
    [],
  );

  const handleDelete = useCallback(async (goal: Goal) => {
    if (goal.id === undefined) return;
    const prefs = await db.userPreferences.get("prefs");
    const deviceId = prefs?.deviceId ?? "unknown";
    const now = Date.now();

    await db.goals.update(goal.id, {
      deletedAt: now,
      updatedAt: now,
      deviceId,
    });
  }, []);

  const handleEdit = useCallback((goal: Goal) => {
    setEditingGoalId(goal.id);
    setShowForm(true);
  }, []);

  const handleFormComplete = useCallback(() => {
    setShowForm(false);
    setEditingGoalId(undefined);
  }, []);

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
    setEditingGoalId(undefined);
  }, []);

  if (showForm) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <GoalForm
          lifeAreaId={lifeAreaId}
          goalId={editingGoalId}
          onComplete={handleFormComplete}
          onCancel={handleFormCancel}
        />
      </section>
    );
  }

  const activeCount = activeGoals?.length ?? 0;
  const completedCount = completedGoals?.length ?? 0;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Goals
          {activeCount > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({activeCount})
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => {
            setEditingGoalId(undefined);
            setShowForm(true);
          }}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          + Add goal
        </button>
      </div>

      {/* Active goals */}
      {activeCount === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-400">
            No goals yet. Add one to track what you&apos;re working toward.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeGoals!.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onToggleMilestone={handleToggleMilestone}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Completed goals */}
      {completedCount > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showCompleted ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Completed ({completedCount})
          </button>

          {showCompleted && (
            <div className="mt-2 space-y-2">
              {completedGoals!.map((goal) => (
                <CompletedGoalCard
                  key={goal.id}
                  goal={goal}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Goal card sub-components
// ---------------------------------------------------------------------------

function GoalCard({
  goal,
  onToggleMilestone,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  onToggleMilestone: (goal: Goal, milestoneIndex: number) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const doneMilestones = goal.milestones.filter((m) => m.done).length;
  const totalMilestones = goal.milestones.length;
  const isOverdue =
    goal.targetDate !== null && goal.targetDate < Date.now();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{goal.title}</p>

          {/* Meta badges */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {/* Progress */}
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
              {goal.progressPercent}%
            </span>

            {/* Target date */}
            {goal.targetDate && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  isOverdue
                    ? "bg-red-50 text-red-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {formatDate(goal.targetDate)}
              </span>
            )}

            {/* Milestone count */}
            {totalMilestones > 0 && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                {doneMilestones}/{totalMilestones} milestones
              </span>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowActions(!showActions)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Goal actions"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {showActions && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10"
                onClick={() => setShowActions(false)}
                aria-label="Close menu"
              />
              <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    onEdit(goal);
                    setShowActions(false);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(goal);
                    setShowActions(false);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalMilestones > 0 && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
          <div
            className="h-1.5 rounded-full bg-indigo-500 transition-all"
            style={{ width: `${goal.progressPercent}%` }}
          />
        </div>
      )}

      {/* Description (if present) */}
      {goal.description && (
        <p className="mt-2 text-xs text-gray-500">{goal.description}</p>
      )}

      {/* Expandable milestones */}
      {totalMilestones > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {expanded ? "Hide milestones" : "Show milestones"}
          </button>

          {expanded && (
            <ul className="mt-1.5 space-y-1">
              {goal.milestones.map((m, i) => (
                <li key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleMilestone(goal, i)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      m.done
                        ? "border-green-400 bg-green-50"
                        : "border-gray-300 hover:border-green-400 hover:bg-green-50"
                    }`}
                    aria-label={`${m.done ? "Uncheck" : "Check"} "${m.title}"`}
                  >
                    {m.done && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-green-600"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`text-xs ${
                      m.done
                        ? "text-gray-400 line-through"
                        : "text-gray-700"
                    }`}
                  >
                    {m.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CompletedGoalCard({
  goal,
  onDelete,
}: {
  goal: Goal;
  onDelete: (goal: Goal) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-green-400 bg-green-50">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-400 line-through">{goal.title}</p>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Completed {formatCompletedDate(goal.updatedAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onDelete(goal)}
          className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
          aria-label={`Delete "${goal.title}"`}
        >
          <svg
            width="14"
            height="14"
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
