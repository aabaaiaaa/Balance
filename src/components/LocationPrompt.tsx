"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { findNearbyPlaces } from "@/lib/location";
import type { SavedPlace } from "@/types/models";

/** Key prefix for localStorage dismissal timestamps. */
const DISMISS_STORAGE_PREFIX = "location_prompt_dismissed_";

/** Cooldown period for dismissed prompts (4 hours in ms). */
const DISMISS_COOLDOWN_MS = 4 * 60 * 60 * 1000;

interface LocationPromptProps {
  /** Called when user wants to log a check-in at a place linked to a contact. */
  onLogCheckIn: (contactId: number, placeName: string) => void;
  /** Called when user wants to log an activity at a place linked to a life area. */
  onLogActivity: (lifeAreaId: number, placeName: string) => void;
  /** Called when user wants to save a new place (not near any known place). Receives current GPS coordinates. */
  onNewPlace: (lat: number, lng: number) => void;
}

type PromptState =
  | { type: "hidden" }
  | { type: "loading" }
  | { type: "single"; place: SavedPlace }
  | { type: "multiple"; places: SavedPlace[] }
  | { type: "new-place" }
  | { type: "permission-denied" };

/**
 * Dashboard prompt that checks the user's location against saved places on mount.
 *
 * Passive: silently updates lastVisited/visitCount for nearby places.
 * Active: shows a contextual prompt for logging or saving a new place.
 */
export function LocationPrompt({
  onLogCheckIn,
  onLogActivity,
  onNewPlace,
}: LocationPromptProps) {
  const [promptState, setPromptState] = useState<PromptState>({ type: "loading" });
  const [selectedPlace, setSelectedPlace] = useState<SavedPlace | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const hasChecked = useRef(false);

  const savedPlaces = useLiveQuery(
    () => db.savedPlaces.filter((p) => p.deletedAt === null).toArray(),
    []
  );

  const contacts = useLiveQuery(
    () => db.contacts.filter((c) => c.deletedAt === null).toArray(),
    []
  );

  const lifeAreas = useLiveQuery(
    () => db.lifeAreas.filter((a) => a.deletedAt === null).toArray(),
    []
  );

  // Run the location check once on mount when data is available
  useEffect(() => {
    if (hasChecked.current) return;
    if (savedPlaces === undefined || contacts === undefined || lifeAreas === undefined) return;

    hasChecked.current = true;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPromptState({ type: "hidden" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCurrentPosition({ lat, lng });
        const nearbyPlaces = findNearbyPlaces(lat, lng, savedPlaces);

        // Passive tracking: update lastVisited and visitCount for all nearby places
        await updatePassiveVisits(nearbyPlaces);

        // Filter out dismissed places (within 4-hour cooldown)
        const activePlaces = nearbyPlaces.filter((p) => !isDismissed(p.id!));

        if (activePlaces.length === 0 && nearbyPlaces.length > 0) {
          // Near places but all dismissed
          setPromptState({ type: "hidden" });
        } else if (activePlaces.length === 1) {
          setPromptState({ type: "single", place: activePlaces[0] });
        } else if (activePlaces.length > 1) {
          setPromptState({ type: "multiple", places: activePlaces });
        } else if (savedPlaces.length > 0) {
          // Have saved places but not near any — offer to save this new location
          setPromptState({ type: "new-place" });
        } else {
          // No saved places at all — don't show anything yet
          setPromptState({ type: "hidden" });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPromptState({ type: "permission-denied" });
        } else {
          setPromptState({ type: "hidden" });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [savedPlaces, contacts, lifeAreas]);

  const handleDismiss = useCallback((placeIds: number[]) => {
    const now = Date.now();
    for (const id of placeIds) {
      try {
        localStorage.setItem(`${DISMISS_STORAGE_PREFIX}${id}`, String(now));
      } catch {
        // localStorage may be unavailable
      }
    }
    setPromptState({ type: "hidden" });
  }, []);

  const handleDismissNewPlace = useCallback(() => {
    setPromptState({ type: "hidden" });
  }, []);

  const handleSelectPlace = useCallback((place: SavedPlace) => {
    setSelectedPlace(place);
  }, []);

  const handleLogForPlace = useCallback(
    (place: SavedPlace) => {
      // Determine what to log based on linked contacts/life areas
      const linkedContacts = place.linkedContactIds ?? [];
      const linkedAreas = place.linkedLifeAreaIds ?? [];

      if (linkedContacts.length > 0) {
        // Log a check-in with the first linked contact
        onLogCheckIn(parseInt(linkedContacts[0], 10), place.label);
      } else if (linkedAreas.length > 0) {
        // Log an activity for the first linked life area
        onLogActivity(parseInt(linkedAreas[0], 10), place.label);
      }

      // Dismiss after acting
      handleDismiss([place.id!]);
    },
    [onLogCheckIn, onLogActivity, handleDismiss]
  );

  // Don't render anything while loading or hidden
  if (promptState.type === "loading" || promptState.type === "hidden" || promptState.type === "permission-denied") {
    return null;
  }

  // "New place? Save it" prompt
  if (promptState.type === "new-place") {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-600"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-900">
              New place? Save it
            </p>
            <p className="mt-0.5 text-xs text-blue-700">
              Save this location for quick logging next time
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => {
                if (currentPosition) {
                  onNewPlace(currentPosition.lat, currentPosition.lng);
                }
              }}
              disabled={!currentPosition}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleDismissNewPlace}
              className="rounded-lg px-2 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-100"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Single place prompt
  if (promptState.type === "single") {
    const place = promptState.place;
    const linkedContacts = place.linkedContactIds ?? [];
    const linkedAreas = place.linkedLifeAreaIds ?? [];
    const hasLink = linkedContacts.length > 0 || linkedAreas.length > 0;

    // Build contextual message
    let message = `You're near ${place.label}`;
    let actionLabel = "Log visit";

    if (linkedContacts.length > 0) {
      const contact = contacts?.find((c) => c.id === parseInt(linkedContacts[0], 10));
      if (contact) {
        message = `You're near ${contact.name}'s place`;
        actionLabel = "Log visit";
      }
    } else if (linkedAreas.length > 0) {
      const area = lifeAreas?.find((a) => a.id === parseInt(linkedAreas[0], 10));
      if (area) {
        message = `You're at ${place.label}`;
        actionLabel = `Log ${area.name.toLowerCase()}`;
      }
    }

    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-green-900">{message}</p>
            {hasLink && (
              <p className="mt-0.5 text-xs text-green-700">
                Tap to log a quick entry
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            {hasLink && (
              <button
                type="button"
                onClick={() => handleLogForPlace(place)}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
              >
                {actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDismiss([place.id!])}
              className="rounded-lg px-2 py-1.5 text-xs text-green-600 transition-colors hover:bg-green-100"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Multiple overlapping places — show picker or selected place
  if (promptState.type === "multiple") {
    const places = promptState.places;
    const allPlaceIds = places.map((p) => p.id!);

    if (selectedPlace) {
      const linkedContacts = selectedPlace.linkedContactIds ?? [];
      const linkedAreas = selectedPlace.linkedLifeAreaIds ?? [];
      const hasLink = linkedContacts.length > 0 || linkedAreas.length > 0;

      return (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-green-600"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-900">
                Logging at {selectedPlace.label}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {hasLink && (
                <button
                  type="button"
                  onClick={() => handleLogForPlace(selectedPlace)}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700"
                >
                  Log visit
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPlace(null)}
                className="rounded-lg px-2 py-1.5 text-xs text-green-600 transition-colors hover:bg-green-100"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-green-900">Where are you?</p>
            <p className="mt-0.5 text-xs text-green-700">
              You&apos;re near multiple saved places
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDismiss(allPlaceIds)}
            className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-green-600 transition-colors hover:bg-green-100"
          >
            Not now
          </button>
        </div>
        <div className="space-y-1.5">
          {places.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => handleSelectPlace(place)}
              className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm font-medium text-gray-900 transition-colors hover:bg-green-100"
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
                className="shrink-0 text-green-500"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {place.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleDismiss(allPlaceIds)}
            className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-sm text-gray-500 transition-colors hover:bg-gray-100"
          >
            Just browsing
          </button>
        </div>
      </div>
    );
  }

  return null;
}

/** Silently update lastVisited and visitCount for nearby places. */
async function updatePassiveVisits(nearbyPlaces: SavedPlace[]): Promise<void> {
  if (nearbyPlaces.length === 0) return;

  const now = Date.now();
  const prefs = await db.userPreferences.get("prefs");
  const deviceId = prefs?.deviceId ?? "unknown";

  await db.transaction("rw", db.savedPlaces, async () => {
    for (const place of nearbyPlaces) {
      if (place.id === undefined) continue;
      await db.savedPlaces.update(place.id, {
        lastVisited: now,
        visitCount: (place.visitCount ?? 0) + 1,
        updatedAt: now,
        deviceId,
      });
    }
  });
}

/** Check if a place was dismissed within the 4-hour cooldown. */
function isDismissed(placeId: number): boolean {
  try {
    const stored = localStorage.getItem(`${DISMISS_STORAGE_PREFIX}${placeId}`);
    if (!stored) return false;
    const dismissedAt = parseInt(stored, 10);
    if (isNaN(dismissedAt)) return false;
    return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}
