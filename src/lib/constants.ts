import type { ContactTier } from "@/types/models";

/** Default check-in frequency (in days) for each relationship tier. */
export const DEFAULT_CHECK_IN_FREQUENCIES: Record<ContactTier, number> = {
  partner: 1,
  "close-family": 7,
  "extended-family": 21,
  "close-friends": 14,
  "wider-friends": 30,
};

/** Human-readable labels for each relationship tier. */
export const TIER_LABELS: Record<ContactTier, string> = {
  partner: "Partner",
  "close-family": "Close Family",
  "extended-family": "Extended Family",
  "close-friends": "Close Friends",
  "wider-friends": "Wider Friends",
};

/** All tier values in display order (closest relationship first). */
export const TIER_ORDER: ContactTier[] = [
  "partner",
  "close-family",
  "extended-family",
  "close-friends",
  "wider-friends",
];

/** Default life areas seeded on first launch. */
export const DEFAULT_LIFE_AREAS = [
  { name: "Self-care", icon: "heart", targetHoursPerWeek: 5 },
  { name: "DIY/Household", icon: "wrench", targetHoursPerWeek: 3 },
  { name: "Partner Time", icon: "users", targetHoursPerWeek: 7 },
  { name: "Social", icon: "message-circle", targetHoursPerWeek: 3 },
  { name: "Personal Goals", icon: "target", targetHoursPerWeek: 5 },
] as const;

/** Default date night frequency in days. */
export const DEFAULT_DATE_NIGHT_FREQUENCY_DAYS = 14;

/** Default saved place radius in metres. */
export const DEFAULT_PLACE_RADIUS_METRES = 200;
