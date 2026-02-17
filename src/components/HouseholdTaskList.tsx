"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { HouseholdTaskForm } from "@/components/HouseholdTaskForm";
import type { HouseholdTask, TaskPriority } from "@/types/models";

interface HouseholdTaskListProps {
  lifeAreaId: number;
}

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-green-50 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "To do",
  "in-progress": "In progress",
  done: "Done",
};

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
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

export function HouseholdTaskList({ lifeAreaId }: HouseholdTaskListProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | undefined>(
    undefined,
  );
  const [showDone, setShowDone] = useState(false);

  // Fetch active (non-done) tasks, sorted by priority weight then creation
  const activeTasks = useLiveQuery(
    () =>
      db.householdTasks
        .where("lifeAreaId")
        .equals(lifeAreaId)
        .filter((t) => t.deletedAt === null && t.status !== "done")
        .toArray()
        .then((tasks) => {
          const priorityWeight: Record<TaskPriority, number> = {
            high: 3,
            medium: 2,
            low: 1,
          };
          return tasks.sort(
            (a, b) => priorityWeight[b.priority] - priorityWeight[a.priority],
          );
        }),
    [lifeAreaId],
  );

  // Fetch completed tasks (most recent first)
  const doneTasks = useLiveQuery(
    () =>
      db.householdTasks
        .where("lifeAreaId")
        .equals(lifeAreaId)
        .filter((t) => t.deletedAt === null && t.status === "done")
        .toArray()
        .then((tasks) =>
          tasks.sort(
            (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0),
          ),
        ),
    [lifeAreaId],
  );

  const handleComplete = useCallback(async (task: HouseholdTask) => {
    if (task.id === undefined) return;
    const prefs = await db.userPreferences.get("prefs");
    const deviceId = prefs?.deviceId ?? "unknown";
    const now = Date.now();

    await db.householdTasks.update(task.id, {
      status: "done",
      completedAt: now,
      updatedAt: now,
      deviceId,
    });
  }, []);

  const handleSetInProgress = useCallback(async (task: HouseholdTask) => {
    if (task.id === undefined) return;
    const prefs = await db.userPreferences.get("prefs");
    const deviceId = prefs?.deviceId ?? "unknown";
    const now = Date.now();

    await db.householdTasks.update(task.id, {
      status: "in-progress",
      updatedAt: now,
      deviceId,
    });
  }, []);

  const handleUncomplete = useCallback(async (task: HouseholdTask) => {
    if (task.id === undefined) return;
    const prefs = await db.userPreferences.get("prefs");
    const deviceId = prefs?.deviceId ?? "unknown";
    const now = Date.now();

    await db.householdTasks.update(task.id, {
      status: "pending",
      completedAt: null,
      updatedAt: now,
      deviceId,
    });
  }, []);

  const handleDelete = useCallback(async (task: HouseholdTask) => {
    if (task.id === undefined) return;
    const prefs = await db.userPreferences.get("prefs");
    const deviceId = prefs?.deviceId ?? "unknown";
    const now = Date.now();

    await db.householdTasks.update(task.id, {
      deletedAt: now,
      updatedAt: now,
      deviceId,
    });
  }, []);

  const handleEdit = useCallback((task: HouseholdTask) => {
    setEditingTaskId(task.id);
    setShowForm(true);
  }, []);

  const handleFormComplete = useCallback(() => {
    setShowForm(false);
    setEditingTaskId(undefined);
  }, []);

  const handleFormCancel = useCallback(() => {
    setShowForm(false);
    setEditingTaskId(undefined);
  }, []);

  if (showForm) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <HouseholdTaskForm
          lifeAreaId={lifeAreaId}
          taskId={editingTaskId}
          onComplete={handleFormComplete}
          onCancel={handleFormCancel}
        />
      </section>
    );
  }

  const activeCount = activeTasks?.length ?? 0;
  const doneCount = doneTasks?.length ?? 0;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Tasks
          {activeCount > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({activeCount})
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => {
            setEditingTaskId(undefined);
            setShowForm(true);
          }}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          + Add task
        </button>
      </div>

      {/* Active tasks */}
      {activeCount === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-400">
            No tasks yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeTasks!.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onSetInProgress={handleSetInProgress}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Done section */}
      {doneCount > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDone(!showDone)}
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
              className={`transition-transform ${showDone ? "rotate-90" : ""}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Done ({doneCount})
          </button>

          {showDone && (
            <div className="mt-2 space-y-2">
              {doneTasks!.map((task) => (
                <DoneTaskCard
                  key={task.id}
                  task={task}
                  onUncomplete={handleUncomplete}
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
// Task card sub-components
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onComplete,
  onSetInProgress,
  onEdit,
  onDelete,
}: {
  task: HouseholdTask;
  onComplete: (task: HouseholdTask) => void;
  onSetInProgress: (task: HouseholdTask) => void;
  onEdit: (task: HouseholdTask) => void;
  onDelete: (task: HouseholdTask) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start gap-3">
        {/* Checkbox to complete */}
        <button
          type="button"
          onClick={() => onComplete(task)}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-gray-300 transition-colors hover:border-green-400 hover:bg-green-50"
          aria-label={`Mark "${task.title}" as done`}
        >
          {task.status === "in-progress" && (
            <div className="h-2 w-2 rounded-sm bg-indigo-400" />
          )}
        </button>

        {/* Task content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[task.priority]}`}
            >
              {task.priority}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              ~{formatMinutes(task.estimatedMinutes)}
            </span>
            {task.status === "in-progress" && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                {STATUS_LABELS[task.status]}
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
            aria-label="Task actions"
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
              {/* Backdrop to close menu */}
              <button
                type="button"
                className="fixed inset-0 z-10"
                onClick={() => setShowActions(false)}
                aria-label="Close menu"
              />
              <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {task.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetInProgress(task);
                      setShowActions(false);
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Start
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onEdit(task);
                    setShowActions(false);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(task);
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
    </div>
  );
}

function DoneTaskCard({
  task,
  onUncomplete,
  onDelete,
}: {
  task: HouseholdTask;
  onUncomplete: (task: HouseholdTask) => void;
  onDelete: (task: HouseholdTask) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-start gap-3">
        {/* Checked checkbox */}
        <button
          type="button"
          onClick={() => onUncomplete(task)}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-green-400 bg-green-50 transition-colors hover:border-gray-300 hover:bg-white"
          aria-label={`Undo "${task.title}"`}
        >
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
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-400 line-through">{task.title}</p>
          {task.completedAt && (
            <p className="mt-0.5 text-[10px] text-gray-400">
              Completed {formatCompletedDate(task.completedAt)}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDelete(task)}
          className="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
          aria-label={`Delete "${task.title}"`}
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
