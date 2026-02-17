"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ContactForm } from "@/components/ContactForm";
import { TIER_LABELS } from "@/lib/constants";

type ViewState =
  | { mode: "list" }
  | { mode: "add" }
  | { mode: "edit"; contactId: number };

export default function PeoplePage() {
  const [view, setView] = useState<ViewState>({ mode: "list" });

  // Fetch all active (non-deleted) contacts
  const contacts = useLiveQuery(
    () =>
      db.contacts
        .filter((c) => c.deletedAt === null)
        .toArray(),
    []
  );

  if (view.mode === "add") {
    return (
      <ContactForm
        onComplete={() => setView({ mode: "list" })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  if (view.mode === "edit") {
    return (
      <ContactForm
        contactId={view.contactId}
        onComplete={() => setView({ mode: "list" })}
        onCancel={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900">People</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your contacts and relationship tiers.
        </p>
      </section>

      {!contacts || contacts.length === 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-400">
            No contacts yet. Tap the button below to add someone.
          </p>
        </section>
      ) : (
        <section className="space-y-2">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() =>
                contact.id != null &&
                setView({ mode: "edit", contactId: contact.id })
              }
              className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">
                  {contact.name}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {TIER_LABELS[contact.tier]} · every{" "}
                  {contact.checkInFrequencyDays}d
                </p>
              </div>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-2 flex-shrink-0 text-gray-400"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </section>
      )}

      {/* Floating action button */}
      <button
        type="button"
        onClick={() => setView({ mode: "add" })}
        className="fixed bottom-20 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Add contact"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
