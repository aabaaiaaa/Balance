"use client";

import { useState, useCallback, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Milestone } from "@/types/models";

interface GoalFormProps {
  lifeAreaId: number;
  /** If provided, the form will edit this existing goal instead of creating a new one. */
  goalId?: number;
  onComplete: () => void;
  onCancel: () => void;
}

export function GoalForm({
  lifeAreaId,
  goalId,
  onComplete,
  onCancel,
}: GoalFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [newMilestone, setNewMilestone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = goalId !== undefined;

  // Load existing goal data when editing
  const existingGoal = useLiveQuery(
    () => (goalId !== undefined ? db.goals.get(goalId) : undefined),
    [goalId],
  );

  useEffect(() => {
    if (existingGoal) {
      setTitle(existingGoal.title);
      setDescription(existingGoal.description);
      setMilestones([...existingGoal.milestones]);
      if (existingGoal.targetDate) {
        const d = new Date(existingGoal.targetDate);
        setTargetDate(d.toISOString().split("T")[0]);
      }
    }
  }, [existingGoal]);

  const handleAddMilestone = useCallback(() => {
    const trimmed = newMilestone.trim();
    if (!trimmed) return;
    setMilestones((prev) => [...prev, { title: trimmed, done: false }]);
    setNewMilestone("");
  }, [newMilestone]);

  const handleRemoveMilestone = useCallback((index: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      const parsedTargetDate = targetDate
        ? new Date(targetDate + "T00:00:00").getTime()
        : null;

      // Calculate progress from milestones
      const totalMilestones = milestones.length;
      const doneMilestones = milestones.filter((m) => m.done).length;
      const progressPercent =
        totalMilestones > 0
          ? Math.round((doneMilestones / totalMilestones) * 100)
          : 0;

      if (isEditing && goalId !== undefined) {
        await db.goals.update(goalId, {
          title: trimmedTitle,
          description: description.trim(),
          targetDate: parsedTargetDate,
          milestones,
          progressPercent,
          updatedAt: now,
          deviceId,
        });
      } else {
        await db.goals.add({
          lifeAreaId,
          title: trimmedTitle,
          description: description.trim(),
          targetDate: parsedTargetDate,
          milestones,
          progressPercent,
          updatedAt: now,
          deviceId,
          deletedAt: null,
        });
      }

      onComplete();
    } catch (err) {
      console.error("Failed to save goal:", err);
      setError("Failed to save goal. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [
    lifeAreaId,
    goalId,
    isEditing,
    title,
    description,
    targetDate,
    milestones,
    onComplete,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {isEditing ? "Edit Goal" : "Add Goal"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label
            htmlFor="goal-title"
            className="block text-sm font-medium text-gray-700"
          >
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="goal-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Learn to play guitar"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="goal-description"
            className="block text-sm font-medium text-gray-700"
          >
            Description
          </label>
          <textarea
            id="goal-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this goal involve?"
            rows={2}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Target date */}
        <div>
          <label
            htmlFor="goal-target-date"
            className="block text-sm font-medium text-gray-700"
          >
            Target date (optional)
          </label>
          <input
            id="goal-target-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="mt-1 block w-44 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Milestones */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Milestones
          </label>

          {milestones.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {milestones.map((m, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5"
                >
                  <span className="flex-1 text-sm text-gray-700">
                    {m.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(i)}
                    className="shrink-0 text-gray-400 hover:text-red-500"
                    aria-label={`Remove milestone "${m.title}"`}
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
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddMilestone();
                }
              }}
              placeholder="Add a milestone..."
              className="block flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleAddMilestone}
              disabled={!newMilestone.trim()}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : isEditing ? "Update Goal" : "Add Goal"}
      </button>
    </div>
  );
}
