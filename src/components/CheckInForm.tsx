"use client";

import { useState, useCallback } from "react";
import { db } from "@/lib/db";
import { CHECK_IN_TYPE_LABELS, CHECK_IN_TYPES } from "@/lib/constants";
import type { CheckInType } from "@/types/models";

interface CheckInFormProps {
  contactId: number;
  onComplete: () => void;
  onCancel: () => void;
}

export function CheckInForm({ contactId, onComplete, onCancel }: CheckInFormProps) {
  const [type, setType] = useState<CheckInType>("called");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => toLocalDateTimeString(Date.now()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const timestamp = new Date(date).getTime();
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

      await db.transaction("rw", [db.checkIns, db.contacts], async () => {
        await db.checkIns.add({
          contactId,
          date: timestamp,
          type,
          notes: notes.trim(),
          location: null,
          updatedAt: now,
          deviceId,
          deletedAt: null,
        });

        // Update the contact's lastCheckIn if this check-in is more recent
        const contact = await db.contacts.get(contactId);
        if (contact && (contact.lastCheckIn === null || timestamp > contact.lastCheckIn)) {
          await db.contacts.update(contactId, {
            lastCheckIn: timestamp,
            updatedAt: now,
            deviceId,
          });
        }
      });

      onComplete();
    } catch (err) {
      console.error("Failed to save check-in:", err);
      setError("Failed to save check-in. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [contactId, type, notes, date, onComplete]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Log Check-in</h3>
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
        {/* Check-in type */}
        <div>
          <label htmlFor="checkin-type" className="block text-sm font-medium text-gray-700">
            Type
          </label>
          <select
            id="checkin-type"
            value={type}
            onChange={(e) => setType(e.target.value as CheckInType)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            {CHECK_IN_TYPES.map((t) => (
              <option key={t} value={t}>
                {CHECK_IN_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label htmlFor="checkin-date" className="block text-sm font-medium text-gray-700">
            Date
          </label>
          <input
            id="checkin-date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="checkin-notes" className="block text-sm font-medium text-gray-700">
            Notes <span className="text-xs text-gray-400">(optional)</span>
          </label>
          <textarea
            id="checkin-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go?"
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Check-in"}
      </button>
    </div>
  );
}

/** Convert a timestamp to a `datetime-local` input value string. */
function toLocalDateTimeString(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
