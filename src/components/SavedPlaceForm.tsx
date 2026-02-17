"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_PLACE_RADIUS_METRES } from "@/lib/constants";
import { useLocation } from "@/hooks/useLocation";
import type { SavedPlace } from "@/types/models";

interface SavedPlaceFormProps {
  placeId?: number;
  onComplete: () => void;
  onCancel: () => void;
}

export function SavedPlaceForm({ placeId, onComplete, onCancel }: SavedPlaceFormProps) {
  const isEditing = placeId != null;

  const existingPlace = useLiveQuery(
    () => (placeId != null ? db.savedPlaces.get(placeId) : undefined),
    [placeId]
  );

  const contacts = useLiveQuery(
    () => db.contacts.filter((c) => c.deletedAt === null).toArray(),
    []
  );

  const lifeAreas = useLiveQuery(
    () => db.lifeAreas.filter((a) => a.deletedAt === null).toArray(),
    []
  );

  const [label, setLabel] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(DEFAULT_PLACE_RADIUS_METRES);
  const [linkedContactIds, setLinkedContactIds] = useState<string[]>([]);
  const [linkedLifeAreaIds, setLinkedLifeAreaIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { loading: locationLoading, error: locationError, permission: locationPermission, requestPosition } = useLocation();

  useEffect(() => {
    if (existingPlace) {
      setLabel(existingPlace.label);
      setLat(existingPlace.lat);
      setLng(existingPlace.lng);
      setRadius(existingPlace.radius);
      setLinkedContactIds(existingPlace.linkedContactIds);
      setLinkedLifeAreaIds(existingPlace.linkedLifeAreaIds);
    }
  }, [existingPlace]);

  const handleSetCurrentLocation = useCallback(async () => {
    const pos = await requestPosition();
    if (pos) {
      setLat(pos.lat);
      setLng(pos.lng);
    }
  }, [requestPosition]);

  const toggleContact = useCallback((contactId: string) => {
    setLinkedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  }, []);

  const toggleLifeArea = useCallback((areaId: string) => {
    setLinkedLifeAreaIds((prev) =>
      prev.includes(areaId)
        ? prev.filter((id) => id !== areaId)
        : [...prev, areaId]
    );
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError("Label is required.");
      return;
    }
    if (lat === null || lng === null) {
      setError("Location coordinates are required. Use 'Set to current location' to capture your position.");
      return;
    }
    if (radius < 10) {
      setError("Radius must be at least 10 metres.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      if (isEditing && placeId != null) {
        await db.savedPlaces.update(placeId, {
          label: trimmedLabel,
          lat,
          lng,
          radius,
          linkedContactIds,
          linkedLifeAreaIds,
          updatedAt: now,
          deviceId,
        });
      } else {
        const newPlace: SavedPlace = {
          label: trimmedLabel,
          lat,
          lng,
          radius,
          linkedContactIds,
          linkedLifeAreaIds,
          lastVisited: null,
          visitCount: 0,
          updatedAt: now,
          deviceId,
          deletedAt: null,
        };
        await db.savedPlaces.add(newPlace);
      }

      onComplete();
    } catch (err) {
      console.error("Failed to save place:", err);
      setError("Failed to save place. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [label, lat, lng, radius, linkedContactIds, linkedLifeAreaIds, isEditing, placeId, onComplete]);

  const handleDelete = useCallback(async () => {
    if (placeId == null) return;

    setSaving(true);
    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      await db.savedPlaces.update(placeId, {
        deletedAt: now,
        updatedAt: now,
        deviceId,
      });

      onComplete();
    } catch (err) {
      console.error("Failed to delete place:", err);
      setError("Failed to delete place. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }, [placeId, onComplete]);

  if (isEditing && existingPlace === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500 dark:text-slate-400">Loading place...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          {isEditing ? "Edit Place" : "Add Place"}
        </h2>
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
        {/* Label */}
        <div>
          <label htmlFor="place-label" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Label <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          <input
            id="place-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Mum's house, The gym, Office"
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Location <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          {lat !== null && lng !== null ? (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-3 py-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400 flex-shrink-0">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-sm text-green-800 dark:text-green-300">
                {lat.toFixed(4)}, {lng.toFixed(4)}
              </span>
              <button
                type="button"
                onClick={handleSetCurrentLocation}
                disabled={locationLoading || locationPermission === "unavailable"}
                className="ml-auto text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 disabled:opacity-50"
              >
                {locationLoading ? "Updating..." : "Update"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSetCurrentLocation}
              disabled={locationLoading || locationPermission === "unavailable"}
              className="mt-1 inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {locationLoading ? "Getting location..." : "Set to current location"}
            </button>
          )}
          {locationError && (
            <p className="mt-1 text-xs text-amber-600">{locationError}</p>
          )}
          {locationPermission === "unavailable" && (
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Location is not available in this browser.</p>
          )}
          {locationPermission === "prompt" && lat === null && (
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Tap the button above to capture your current GPS position. This helps track visits and link places to contacts.
            </p>
          )}
        </div>

        {/* Radius */}
        <div>
          <label htmlFor="place-radius" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Radius (metres)
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="place-radius"
              type="number"
              min={10}
              step={10}
              value={radius}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setRadius(val);
              }}
              className="block w-24 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-sm text-gray-600 dark:text-slate-300">m</span>
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            Used for proximity detection. Default is {DEFAULT_PLACE_RADIUS_METRES}m.
          </p>
        </div>

        {/* Linked contacts */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Linked contacts <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
          </label>
          {contacts && contacts.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {contacts.map((contact) => {
                const id = String(contact.id);
                const isLinked = linkedContactIds.includes(id);
                return (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggleContact(id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isLinked
                        ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                        : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600"
                    }`}
                  >
                    {isLinked ? "✓ " : ""}
                    {contact.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">No contacts available.</p>
          )}
        </div>

        {/* Linked life areas */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Linked life areas <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
          </label>
          {lifeAreas && lifeAreas.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {lifeAreas.map((area) => {
                const id = String(area.id);
                const isLinked = linkedLifeAreaIds.includes(id);
                return (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => toggleLifeArea(id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isLinked
                        ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                        : "bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600"
                    }`}
                  >
                    {isLinked ? "✓ " : ""}
                    {area.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">No life areas available.</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEditing ? "Save Changes" : "Save Place"}
        </button>

        {isEditing && !showDeleteConfirm && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-lg border border-red-200 dark:border-red-800 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950 active:bg-red-100 dark:active:bg-red-900"
          >
            Delete Place
          </button>
        )}

        {isEditing && showDeleteConfirm && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">
              Are you sure you want to delete this place?
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
