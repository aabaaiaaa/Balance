import type { CheckInType, ContactTier, NotificationTypePreferences } from "@/types/models";

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

/** Human-readable labels for each check-in type. */
export const CHECK_IN_TYPE_LABELS: Record<CheckInType, string> = {
  called: "Phone call",
  texted: "Text message",
  "met-up": "Met in person",
  "video-call": "Video call",
  other: "Other",
};

/** All check-in type values in display order. */
export const CHECK_IN_TYPES: CheckInType[] = [
  "called",
  "texted",
  "met-up",
  "video-call",
  "other",
];

/** Maximum number of OS notifications to show per app-open session. */
export const MAX_NOTIFICATIONS_PER_SESSION = 2;

/** Minimum hours between showing the same notification item again (24h). */
export const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Minimum hours since last app open to show the "Welcome back" banner (24h). */
export const WELCOME_BACK_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Default per-type notification preferences (all enabled). */
export const DEFAULT_NOTIFICATION_TYPES: NotificationTypePreferences = {
  contactCheckIns: true,
  lifeAreaImbalance: true,
  taskReminders: true,
};
