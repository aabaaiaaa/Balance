"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { SavedPlaceForm } from "@/components/SavedPlaceForm";

export default function SavedPlacesPage() {
  const [editingPlaceId, setEditingPlaceId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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

  const getContactName = useCallback(
    (id: string) => {
      if (!contacts) return id;
      const contact = contacts.find((c) => String(c.id) === id);
      return contact?.name ?? id;
    },
    [contacts]
  );

  const getLifeAreaName = useCallback(
    (id: string) => {
      if (!lifeAreas) return id;
      const area = lifeAreas.find((a) => String(a.id) === id);
      return area?.name ?? id;
    },
    [lifeAreas]
  );

  const handleFormComplete = useCallback(() => {
    setEditingPlaceId(null);
    setShowAddForm(false);
  }, []);

  const handleFormCancel = useCallback(() => {
    setEditingPlaceId(null);
    setShowAddForm(false);
  }, []);

  // Show add/edit form
  if (showAddForm || editingPlaceId !== null) {
    return (
      <div className="space-y-4">
        <SavedPlaceForm
          placeId={editingPlaceId ?? undefined}
          onComplete={handleFormComplete}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="text-sm text-gray-500 hover:text-gray-700"
              aria-label="Back to settings"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <h2 className="text-xl font-semibold text-gray-900">Saved Places</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Manage your saved locations for proximity detection.
          </p>
        </div>
      </div>

      {/* Places list */}
      {!savedPlaces ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : savedPlaces.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-gray-300">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <p className="mt-3 text-sm text-gray-500">No saved places yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Save places to track visits and link them to contacts or life areas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {savedPlaces.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => setEditingPlaceId(place.id!)}
              className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500 flex-shrink-0">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="font-medium text-gray-900">{place.label}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 flex-shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              {/* Linked contacts and life areas */}
              {(place.linkedContactIds.length > 0 || place.linkedLifeAreaIds.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {place.linkedContactIds.map((id) => (
                    <span key={`contact-${id}`} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                      {getContactName(id)}
                    </span>
                  ))}
                  {place.linkedLifeAreaIds.map((id) => (
                    <span key={`area-${id}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      {getLifeAreaName(id)}
                    </span>
                  ))}
                </div>
              )}

              {/* Visit stats */}
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                <span>{place.visitCount} visit{place.visitCount !== 1 ? "s" : ""}</span>
                {place.lastVisited && (
                  <span>
                    Last visited:{" "}
                    {new Date(place.lastVisited).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
                <span className="ml-auto">{place.radius}m radius</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* FAB to add new place */}
      <button
        type="button"
        onClick={() => setShowAddForm(true)}
        className="fixed bottom-24 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-colors hover:bg-indigo-700 active:bg-indigo-800"
        aria-label="Add saved place"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
