"use client";

import { useState, useCallback, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { TaskPriority, HouseholdTask } from "@/types/models";

interface HouseholdTaskFormProps {
  lifeAreaId: number;
  /** If provided, the form will edit this existing task instead of creating a new one. */
  taskId?: number;
  onComplete: () => void;
  onCancel: () => void;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function HouseholdTaskForm({
  lifeAreaId,
  taskId,
  onComplete,
  onCancel,
}: HouseholdTaskFormProps) {
  const [title, setTitle] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = taskId !== undefined;

  // Load existing task data when editing
  const existingTask = useLiveQuery(
    () => (taskId !== undefined ? db.householdTasks.get(taskId) : undefined),
    [taskId],
  );

  useEffect(() => {
    if (existingTask) {
      setTitle(existingTask.title);
      setEstimatedMinutes(String(existingTask.estimatedMinutes));
      setPriority(existingTask.priority);
    }
  }, [existingTask]);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    const duration = parseInt(estimatedMinutes, 10);
    if (isNaN(duration) || duration <= 0) {
      setError("Estimated time must be a positive number of minutes.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      if (isEditing && taskId !== undefined) {
        await db.householdTasks.update(taskId, {
          title: trimmedTitle,
          estimatedMinutes: duration,
          priority,
          updatedAt: now,
          deviceId,
        });
      } else {
        await db.householdTasks.add({
          lifeAreaId,
          title: trimmedTitle,
          estimatedMinutes: duration,
          priority,
          status: "pending",
          completedAt: null,
          updatedAt: now,
          deviceId,
          deletedAt: null,
        });
      }

      onComplete();
    } catch (err) {
      console.error("Failed to save task:", err);
      setError("Failed to save task. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [lifeAreaId, taskId, isEditing, title, estimatedMinutes, priority, onComplete]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          {isEditing ? "Edit Task" : "Add Task"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label
            htmlFor="task-title"
            className="block text-sm font-medium text-gray-700 dark:text-slate-300"
          >
            Title <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fix leaky tap"
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Estimated time */}
        <div>
          <label
            htmlFor="task-estimated-minutes"
            className="block text-sm font-medium text-gray-700 dark:text-slate-300"
          >
            Estimated time (minutes) <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="task-estimated-minutes"
            type="number"
            min={1}
            step={1}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
            placeholder="30"
            className="mt-1 block w-24 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Priority
          </label>
          <div className="mt-1 flex gap-2">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(opt.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  priority === opt.value
                    ? opt.value === "high"
                      ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
                      : opt.value === "medium"
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                        : "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                    : "border-gray-200 dark:border-slate-700 bg-white dark:bg-card text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : isEditing ? "Update Task" : "Add Task"}
      </button>
    </div>
  );
}
