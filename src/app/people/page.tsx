"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ContactForm } from "@/components/ContactForm";
import { ContactCard } from "@/components/ContactCard";
import { ContactDetail } from "@/components/ContactDetail";
import { TIER_LABELS, TIER_ORDER } from "@/lib/constants";
import type { Contact, ContactTier } from "@/types/models";

type ViewState =
  | { mode: "list" }
  | { mode: "add" }
  | { mode: "edit"; contactId: number }
  | { mode: "detail"; contactId: number };

/** Group contacts by tier, preserving TIER_ORDER and omitting empty tiers. */
function groupByTier(
  contacts: Contact[]
): { tier: ContactTier; label: string; contacts: Contact[] }[] {
  const map = new Map<ContactTier, Contact[]>();

  for (const contact of contacts) {
    const group = map.get(contact.tier);
    if (group) {
      group.push(contact);
    } else {
      map.set(contact.tier, [contact]);
    }
  }

  return TIER_ORDER.filter((t) => map.has(t)).map((t) => ({
    tier: t,
    label: TIER_LABELS[t],
    contacts: map.get(t)!,
  }));
}

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

  if (view.mode === "detail") {
    return (
      <ContactDetail
        contactId={view.contactId}
        onBack={() => setView({ mode: "list" })}
        onEdit={(id) => setView({ mode: "edit", contactId: id })}
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

  const groups = contacts ? groupByTier(contacts) : [];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">People</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Your contacts grouped by relationship tier.
        </p>
      </section>

      {!contacts || contacts.length === 0 ? (
        <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
          <p className="text-sm text-gray-400 dark:text-slate-500">
            No contacts yet. Tap the button below to add someone.
          </p>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.tier}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
              {group.label}
              <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">
                ({group.contacts.length})
              </span>
            </h3>
            <div className="space-y-2">
              {group.contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onTap={(id) => setView({ mode: "detail", contactId: id })}
                />
              ))}
            </div>
          </section>
        ))
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
