"use client";

import { useState, useCallback } from "react";
import { db } from "@/lib/db";
import { useLocation } from "@/hooks/useLocation";
import type { Location } from "@/types/models";

interface ActivityFormProps {
  lifeAreaId: number;
  onComplete: () => void;
  onCancel: () => void;
}

export function ActivityForm({ lifeAreaId, onComplete, onCancel }: ActivityFormProps) {
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(() => toLocalDateTimeString(Date.now()));
  const [location, setLocation] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { loading: locationLoading, error: locationError, permission: locationPermission, requestPosition } = useLocation();

  const handleUseLocation = useCallback(async () => {
    const pos = await requestPosition();
    if (pos) {
      setLocation({ lat: pos.lat, lng: pos.lng });
    }
  }, [requestPosition]);

  const handleClearLocation = useCallback(() => {
    setLocation(null);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setError("Description is required.");
      return;
    }

    const duration = parseInt(durationMinutes, 10);
    if (isNaN(duration) || duration <= 0) {
      setError("Duration must be a positive number of minutes.");
      return;
    }

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

      await db.activities.add({
        lifeAreaId,
        description: trimmedDesc,
        durationMinutes: duration,
        date: timestamp,
        notes: notes.trim(),
        location,
        updatedAt: now,
        deviceId,
        deletedAt: null,
      });

      onComplete();
    } catch (err) {
      console.error("Failed to save activity:", err);
      setError("Failed to save activity. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [lifeAreaId, description, durationMinutes, notes, date, onComplete]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Log Activity</h3>
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
        {/* Description */}
        <div>
          <label htmlFor="activity-description" className="block text-sm font-medium text-gray-700">
            Description <span className="text-red-500">*</span>
          </label>
          <input
            id="activity-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you do?"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Duration */}
        <div>
          <label htmlFor="activity-duration" className="block text-sm font-medium text-gray-700">
            Duration (minutes) <span className="text-red-500">*</span>
          </label>
          <input
            id="activity-duration"
            type="number"
            min={1}
            step={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="30"
            className="mt-1 block w-24 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Date */}
        <div>
          <label htmlFor="activity-date" className="block text-sm font-medium text-gray-700">
            Date
          </label>
          <input
            id="activity-date"
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="activity-notes" className="block text-sm font-medium text-gray-700">
            Notes <span className="text-xs text-gray-400">(optional)</span>
          </label>
          <textarea
            id="activity-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any extra details..."
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Location <span className="text-xs text-gray-400">(optional)</span>
          </label>
          {location ? (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-green-600 flex-shrink-0">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-sm text-green-800">
                {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
              </span>
              <button
                type="button"
                onClick={handleClearLocation}
                className="ml-auto text-xs text-green-600 hover:text-green-800"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleUseLocation}
              disabled={locationLoading || locationPermission === "unavailable"}
              className="mt-1 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {locationLoading ? "Getting location..." : "Use my location"}
            </button>
          )}
          {locationError && (
            <p className="mt-1 text-xs text-amber-600">{locationError}</p>
          )}
          {locationPermission === "unavailable" && (
            <p className="mt-1 text-xs text-gray-400">Location is not available in this browser.</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Activity"}
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
