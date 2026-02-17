"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

interface DateNightFormProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function DateNightForm({ onComplete, onCancel }: DateNightFormProps) {
  const [date, setDate] = useState(() => toLocalDateString(Date.now()));
  const [notes, setNotes] = useState("");
  const [ideaUsed, setIdeaUsed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ideas = useLiveQuery(
    () => db.dateNightIdeas.filter((i) => i.deletedAt === null).toArray(),
    [],
  );

  const handleSave = useCallback(async () => {
    const timestamp = new Date(date + "T20:00").getTime();
    if (isNaN(timestamp)) {
      setError("Please enter a valid date.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      await db.dateNights.add({
        date: timestamp,
        notes: notes.trim(),
        ideaUsed: ideaUsed,
        updatedAt: now,
        deviceId,
        deletedAt: null,
      });

      onComplete();
    } catch (err) {
      console.error("Failed to save date night:", err);
      setError("Failed to save date night. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [date, notes, ideaUsed, onComplete]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Log Date Night</h3>
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
        <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Date */}
        <div>
          <label htmlFor="datenight-date" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Date
          </label>
          <input
            id="datenight-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 bg-white dark:bg-card focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Idea used (optional) */}
        {ideas && ideas.length > 0 && (
          <div>
            <label htmlFor="datenight-idea" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              What did you do? <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
            </label>
            <select
              id="datenight-idea"
              value={ideaUsed ?? ""}
              onChange={(e) => setIdeaUsed(e.target.value || null)}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 bg-white dark:bg-card focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">Pick from your ideas...</option>
              {ideas.map((idea) => (
                <option key={idea.id} value={idea.title}>
                  {idea.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div>
          <label htmlFor="datenight-notes" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Notes <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
          </label>
          <textarea
            id="datenight-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How was it?"
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Date Night"}
      </button>
    </div>
  );
}

/** Convert a timestamp to a `date` input value string (YYYY-MM-DD). */
function toLocalDateString(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
