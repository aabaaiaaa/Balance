"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { TIER_LABELS, CHECK_IN_TYPE_LABELS } from "@/lib/constants";
import { findPlaceLabel } from "@/lib/location";
import { CheckInForm } from "@/components/CheckInForm";
import type { Contact, CheckIn } from "@/types/models";

interface ContactDetailProps {
  contactId: number;
  onBack: () => void;
  onEdit: (contactId: number) => void;
}

const TIER_BADGE_STYLES: Record<Contact["tier"], string> = {
  partner: "bg-pink-100 text-pink-700",
  "close-family": "bg-purple-100 text-purple-700",
  "extended-family": "bg-blue-100 text-blue-700",
  "close-friends": "bg-green-100 text-green-700",
  "wider-friends": "bg-gray-100 text-gray-600",
};

export function ContactDetail({ contactId, onBack, onEdit }: ContactDetailProps) {
  const [showCheckInForm, setShowCheckInForm] = useState(false);
  const [renderTime] = useState(() => Date.now());

  const contact = useLiveQuery(
    () => db.contacts.get(contactId),
    [contactId]
  );

  const recentCheckIns = useLiveQuery(
    () =>
      db.checkIns
        .where("contactId")
        .equals(contactId)
        .filter((c) => c.deletedAt === null)
        .reverse()
        .sortBy("date")
        .then((results) => results.slice(0, 10)),
    [contactId]
  );

  const savedPlaces = useLiveQuery(
    () => db.savedPlaces.filter((p) => p.deletedAt === null).toArray(),
    []
  );

  /** Resolve a check-in's location to a saved place label. */
  const getCheckInPlaceName = useMemo(() => {
    if (!savedPlaces || savedPlaces.length === 0) return () => null;
    return (checkIn: CheckIn): string | null => {
      if (!checkIn.location) return null;
      return findPlaceLabel(checkIn.location.lat, checkIn.location.lng, savedPlaces);
    };
  }, [savedPlaces]);

  if (contact === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500">Loading contact...</p>
      </div>
    );
  }

  if (contact === null) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500">Contact not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Back to contacts
        </button>
      </div>
    );
  }

  const daysSinceCheckIn = contact.lastCheckIn
    ? Math.floor((renderTime - contact.lastCheckIn) / (1000 * 60 * 60 * 24))
    : null;

  const overdueStatus = getOverdueInfo(contact, renderTime);

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          aria-label="Back to contacts"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={() => onEdit(contactId)}
          className="text-sm text-indigo-600 hover:text-indigo-800"
        >
          Edit
        </button>
      </div>

      {/* Contact info */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span
            className={`h-3 w-3 flex-shrink-0 rounded-full ${overdueStatus.dotClass}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold text-gray-900">
                {contact.name}
              </h2>
              <span
                className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TIER_BADGE_STYLES[contact.tier]}`}
              >
                {TIER_LABELS[contact.tier]}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">{overdueStatus.label}</p>
          </div>
        </div>

        {/* Details */}
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Check-in every</span>
            <span className="font-medium text-gray-900">
              {contact.checkInFrequencyDays} day{contact.checkInFrequencyDays !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Last check-in</span>
            <span className="font-medium text-gray-900">
              {daysSinceCheckIn !== null
                ? daysSinceCheckIn === 0
                  ? "Today"
                  : daysSinceCheckIn === 1
                    ? "Yesterday"
                    : `${daysSinceCheckIn} days ago`
                : "Never"}
            </span>
          </div>
          {contact.phoneNumber && (
            <div className="flex justify-between text-gray-600">
              <span>Phone</span>
              <a
                href={`tel:${contact.phoneNumber}`}
                className="font-medium text-indigo-600 hover:text-indigo-800"
              >
                {contact.phoneNumber}
              </a>
            </div>
          )}
          {contact.notes && (
            <div className="border-t border-gray-100 pt-2">
              <p className="text-gray-600">{contact.notes}</p>
            </div>
          )}
        </div>
      </section>

      {/* Log check-in button / form */}
      {showCheckInForm ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <CheckInForm
            contactId={contactId}
            onComplete={() => setShowCheckInForm(false)}
            onCancel={() => setShowCheckInForm(false)}
          />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setShowCheckInForm(true)}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
        >
          Log Check-in
        </button>
      )}

      {/* Check-in history */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Recent Check-ins
          {recentCheckIns && recentCheckIns.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">
              ({recentCheckIns.length})
            </span>
          )}
        </h3>

        {!recentCheckIns || recentCheckIns.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-400">
              No check-ins yet. Tap the button above to log one.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentCheckIns.map((checkIn) => {
              const placeName = getCheckInPlaceName(checkIn);
              return (
                <div
                  key={checkIn.id}
                  className="rounded-xl border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {CHECK_IN_TYPE_LABELS[checkIn.type]}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatCheckInDate(checkIn.date, renderTime)}
                    </span>
                  </div>
                  {placeName && (
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {placeName}
                    </p>
                  )}
                  {checkIn.notes && (
                    <p className="mt-1 text-xs text-gray-600">{checkIn.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function getOverdueInfo(contact: Contact, now: number): { label: string; dotClass: string } {
  if (contact.lastCheckIn === null) {
    return { label: "Never contacted", dotClass: "bg-red-500" };
  }

  const daysSince = Math.floor(
    (now - contact.lastCheckIn) / (1000 * 60 * 60 * 24)
  );

  if (daysSince >= contact.checkInFrequencyDays) {
    const overdueDays = daysSince - contact.checkInFrequencyDays;
    return {
      label: `${daysSince}d ago (${overdueDays}d overdue)`,
      dotClass: "bg-red-500",
    };
  }

  const remaining = contact.checkInFrequencyDays - daysSince;
  if (remaining <= Math.max(1, Math.ceil(contact.checkInFrequencyDays * 0.25))) {
    return { label: `${daysSince}d ago (due soon)`, dotClass: "bg-amber-500" };
  }

  return { label: `${daysSince}d ago`, dotClass: "bg-green-500" };
}

function formatCheckInDate(timestamp: number, now: number): string {
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return new Date(timestamp).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }) + " today";
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}
