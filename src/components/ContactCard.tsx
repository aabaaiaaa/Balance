"use client";

import type { Contact } from "@/types/models";
import { TIER_LABELS } from "@/lib/constants";

/** Colour classes for each relationship tier badge. */
const TIER_BADGE_STYLES: Record<Contact["tier"], string> = {
  partner: "bg-pink-100 text-pink-700",
  "close-family": "bg-purple-100 text-purple-700",
  "extended-family": "bg-blue-100 text-blue-700",
  "close-friends": "bg-green-100 text-green-700",
  "wider-friends": "bg-gray-100 text-gray-600",
};

interface OverdueStatus {
  label: string;
  /** Tailwind classes for the dot indicator */
  dotClass: string;
}

function getOverdueStatus(
  lastCheckIn: number | null,
  frequencyDays: number
): OverdueStatus {
  if (lastCheckIn === null) {
    return { label: "Never contacted", dotClass: "bg-red-500" };
  }

  const daysSince = Math.floor(
    (Date.now() - lastCheckIn) / (1000 * 60 * 60 * 24)
  );

  // Red: overdue (past the frequency target)
  if (daysSince >= frequencyDays) {
    const overdueDays = daysSince - frequencyDays;
    return {
      label: `${daysSince}d ago (${overdueDays}d overdue)`,
      dotClass: "bg-red-500",
    };
  }

  // Amber: due soon (within 25% of the frequency remaining)
  const remaining = frequencyDays - daysSince;
  if (remaining <= Math.max(1, Math.ceil(frequencyDays * 0.25))) {
    return { label: `${daysSince}d ago (due soon)`, dotClass: "bg-amber-500" };
  }

  // Green: recently contacted
  return { label: `${daysSince}d ago`, dotClass: "bg-green-500" };
}

interface ContactCardProps {
  contact: Contact;
  onTap: (contactId: number) => void;
}

export function ContactCard({ contact, onTap }: ContactCardProps) {
  const status = getOverdueStatus(
    contact.lastCheckIn,
    contact.checkInFrequencyDays
  );

  return (
    <button
      type="button"
      onClick={() => contact.id != null && onTap(contact.id)}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      {/* Overdue indicator dot */}
      <span
        className={`h-3 w-3 flex-shrink-0 rounded-full ${status.dotClass}`}
        aria-label={status.label}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-gray-900">{contact.name}</p>
          <span
            className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TIER_BADGE_STYLES[contact.tier]}`}
          >
            {TIER_LABELS[contact.tier]}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-gray-500">{status.label}</p>
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
        className="flex-shrink-0 text-gray-400"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
