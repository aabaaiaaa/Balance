/**
 * Priority scoring algorithm for Balance.
 *
 * Calculates a priority score for every actionable item (contacts, life area
 * activities, household tasks, goals) and returns a sorted list of suggested
 * actions. Designed with an extensible scorer registry so new item types can
 * register their own scoring logic without modifying the core algorithm.
 *
 * Key factors:
 * - How overdue something is (days past target / target frequency)
 * - Relationship tier weight (partner > close family > friends)
 * - Life area imbalance (areas furthest below target score higher)
 * - User-set priority on household tasks
 * - Goal target dates approaching
 * - Partner-aware scoring (partner's device activity reduces priority)
 * - Snoozed items are excluded
 *
 * This module exports pure functions — no database access. All data is passed
 * in as arguments so the algorithm is easy to test.
 */

import type {
  Contact,
  CheckIn,
  LifeArea,
  Activity,
  HouseholdTask,
  Goal,
  SnoozedItem,
  SnoozedItemType,
  ContactTier,
  WeekStartDay,
} from "@/types/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single suggested action returned by the priority algorithm. */
export interface ScoredItem {
  /** Unique key for deduplication (e.g. "contact:5", "life-area:2"). */
  key: string;
  /** The type of item this suggestion relates to. */
  type: string;
  /** Human-readable title for the suggestion. */
  title: string;
  /** Human-readable reason for why this item is suggested. */
  reason: string;
  /** The calculated priority score (higher = more urgent). */
  score: number;
  /** The ID of the underlying entity. */
  itemId: number;
  /** Estimated duration in minutes (for "I have free time" filtering). */
  estimatedMinutes?: number;
}

/** Read-only data snapshot passed to every scorer. */
export interface ScoringContext {
  now: number;
  weekStartDay: WeekStartDay;
  partnerDeviceId: string | null;
  /** Start of the current week (ms timestamp). */
  weekStart: number;
}

/**
 * Interface that every item-type scorer must implement.
 *
 * Each scorer receives the full data snapshot and scoring context,
 * and returns an array of scored items for its type. Scorers are
 * responsible for filtering out soft-deleted records themselves.
 */
export interface ItemScorer {
  /** Unique type identifier (e.g. "contact", "life-area", "household-task"). */
  type: string;
  /** Compute scores for all actionable items of this type. */
  score(data: ScoringData, context: ScoringContext): ScoredItem[];
}

/** All data needed by the scoring algorithm, passed in as a snapshot. */
export interface ScoringData {
  contacts: Contact[];
  checkIns: CheckIn[];
  lifeAreas: LifeArea[];
  activities: Activity[];
  householdTasks: HouseholdTask[];
  goals: Goal[];
  snoozedItems: SnoozedItem[];
}

/** Options for running the priority algorithm. */
export interface PriorityOptions {
  now?: number;
  weekStartDay?: WeekStartDay;
  partnerDeviceId?: string | null;
}

// ---------------------------------------------------------------------------
// Scorer registry
// ---------------------------------------------------------------------------

const scorerRegistry: ItemScorer[] = [];

/** Register a scorer for a new item type. */
export function registerScorer(scorer: ItemScorer): void {
  const existing = scorerRegistry.findIndex((s) => s.type === scorer.type);
  if (existing >= 0) {
    scorerRegistry[existing] = scorer;
  } else {
    scorerRegistry.push(scorer);
  }
}

/** Remove a registered scorer by type. Useful for testing. */
export function unregisterScorer(type: string): void {
  const idx = scorerRegistry.findIndex((s) => s.type === type);
  if (idx >= 0) scorerRegistry.splice(idx, 1);
}

/** Get a copy of all registered scorers. */
export function getRegisteredScorers(): ItemScorer[] {
  return [...scorerRegistry];
}

/** Clear all registered scorers. Useful for testing. */
export function clearScorers(): void {
  scorerRegistry.length = 0;
}

// ---------------------------------------------------------------------------
// Week boundary helper
// ---------------------------------------------------------------------------

/**
 * Calculate the start of the current week as a millisecond timestamp.
 * Respects the user's weekStartDay preference.
 */
export function getWeekStart(now: number, weekStartDay: WeekStartDay): number {
  const date = new Date(now);
  const currentDay = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const targetDay = weekStartDay === "monday" ? 1 : 0;

  let daysBack = currentDay - targetDay;
  if (daysBack < 0) daysBack += 7;

  const weekStart = new Date(date);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysBack);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart.getTime();
}

// ---------------------------------------------------------------------------
// Snoozed item helper
// ---------------------------------------------------------------------------

/**
 * Build a set of snoozed item keys for fast lookup.
 * Only includes items whose snoozedUntil is in the future.
 */
export function buildSnoozedSet(
  snoozedItems: SnoozedItem[],
  now: number,
): Set<string> {
  const set = new Set<string>();
  for (const item of snoozedItems) {
    if (item.deletedAt === null && item.snoozedUntil > now) {
      set.add(`${item.itemType}:${item.itemId}`);
    }
  }
  return set;
}

/** Check if an item is currently snoozed. */
export function isSnoozed(
  snoozedSet: Set<string>,
  itemType: SnoozedItemType,
  itemId: number,
): boolean {
  return snoozedSet.has(`${itemType}:${itemId}`);
}

// ---------------------------------------------------------------------------
// Tier weights (higher = more important relationship)
// ---------------------------------------------------------------------------

export const TIER_WEIGHTS: Record<ContactTier, number> = {
  partner: 5.0,
  "close-family": 3.0,
  "extended-family": 1.5,
  "close-friends": 2.0,
  "wider-friends": 1.0,
};

// ---------------------------------------------------------------------------
// Partner-aware discount factor
// ---------------------------------------------------------------------------

/**
 * When a partner has already performed a check-in or activity within the
 * current scoring window, the priority is multiplied by this factor.
 * Not zero — you may still want to check in yourself.
 */
export const PARTNER_DISCOUNT_FACTOR = 0.3;

// ---------------------------------------------------------------------------
// Built-in scorers
// ---------------------------------------------------------------------------

/**
 * Contact check-in scorer.
 *
 * Score = (daysSinceLastCheckIn / checkInFrequencyDays) * tierWeight
 *
 * A ratio > 1.0 means the contact is overdue. The tier weight ensures
 * more important relationships score higher.
 *
 * Partner-aware: if a partner device has logged a check-in for this
 * contact within the current week, apply a discount factor.
 */
export const contactScorer: ItemScorer = {
  type: "contact",
  score(data: ScoringData, ctx: ScoringContext): ScoredItem[] {
    const snoozedSet = buildSnoozedSet(data.snoozedItems, ctx.now);
    const items: ScoredItem[] = [];

    for (const contact of data.contacts) {
      if (contact.deletedAt !== null) continue;
      if (contact.id === undefined) continue;
      if (isSnoozed(snoozedSet, "contact", contact.id)) continue;

      const daysSinceLast = contact.lastCheckIn
        ? (ctx.now - contact.lastCheckIn) / (1000 * 60 * 60 * 24)
        : Infinity;

      const overdueRatio =
        contact.checkInFrequencyDays > 0
          ? daysSinceLast / contact.checkInFrequencyDays
          : daysSinceLast;

      const tierWeight = TIER_WEIGHTS[contact.tier] ?? 1.0;

      let score = Math.max(0, overdueRatio) * tierWeight;

      // Partner-aware: check if partner logged a check-in this week
      if (ctx.partnerDeviceId) {
        const partnerCheckInThisWeek = data.checkIns.some(
          (ci) =>
            ci.contactId === contact.id &&
            ci.deviceId === ctx.partnerDeviceId &&
            ci.date >= ctx.weekStart &&
            ci.deletedAt === null,
        );
        if (partnerCheckInThisWeek) {
          score *= PARTNER_DISCOUNT_FACTOR;
        }
      }

      // Only suggest if at least somewhat due (ratio >= 0.5)
      if (score < 0.5 * tierWeight) continue;

      const daysSinceRounded = daysSinceLast === Infinity
        ? null
        : Math.floor(daysSinceLast);

      const reason = daysSinceRounded === null
        ? `You've never checked in with ${contact.name}`
        : daysSinceRounded === 0
          ? `You checked in with ${contact.name} today`
          : `Last check-in with ${contact.name} was ${daysSinceRounded} day${daysSinceRounded === 1 ? "" : "s"} ago`;

      items.push({
        key: `contact:${contact.id}`,
        type: "contact",
        title: `Check in with ${contact.name}`,
        reason,
        score,
        itemId: contact.id,
        estimatedMinutes: 15,
      });
    }

    return items;
  },
};

/**
 * Life area imbalance scorer.
 *
 * Scores life areas that are below their weekly target. The further below
 * target, the higher the score. Areas with zero target are skipped.
 *
 * Score = (targetHours - hoursLogged) / targetHours * BASE_WEIGHT
 *
 * Partner-aware: partner's activities logged this week count toward the
 * household's shared total for the same life area.
 */
export const lifeAreaScorer: ItemScorer = {
  type: "life-area",
  score(data: ScoringData, ctx: ScoringContext): ScoredItem[] {
    const items: ScoredItem[] = [];

    for (const area of data.lifeAreas) {
      if (area.deletedAt !== null) continue;
      if (area.id === undefined) continue;
      if (area.targetHoursPerWeek <= 0) continue;

      // Sum activities for this area this week (from all devices, including partner)
      const minutesThisWeek = data.activities
        .filter(
          (a) =>
            a.lifeAreaId === area.id &&
            a.date >= ctx.weekStart &&
            a.deletedAt === null,
        )
        .reduce((sum, a) => sum + a.durationMinutes, 0);

      const hoursThisWeek = minutesThisWeek / 60;
      const deficit = area.targetHoursPerWeek - hoursThisWeek;

      // Only suggest if below target
      if (deficit <= 0) continue;

      const deficitRatio = deficit / area.targetHoursPerWeek;
      const BASE_WEIGHT = 3.0;
      const score = deficitRatio * BASE_WEIGHT;

      const hoursRounded = Math.round(hoursThisWeek * 10) / 10;
      const reason = hoursRounded === 0
        ? `No time logged for ${area.name} this week (target: ${area.targetHoursPerWeek}h)`
        : `${hoursRounded}h of ${area.targetHoursPerWeek}h target for ${area.name} this week`;

      items.push({
        key: `life-area:${area.id}`,
        type: "life-area",
        title: `Spend time on ${area.name}`,
        reason,
        score,
        itemId: area.id,
        estimatedMinutes: 30,
      });
    }

    return items;
  },
};

// ---------------------------------------------------------------------------
// Register built-in scorers
// ---------------------------------------------------------------------------

registerScorer(contactScorer);
registerScorer(lifeAreaScorer);

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

/**
 * Calculate priority scores for all actionable items and return them
 * sorted by score (highest first).
 *
 * This is a pure function — all data is passed in. It delegates to
 * registered scorers and aggregates the results.
 */
export function calculatePriorities(
  data: ScoringData,
  options: PriorityOptions = {},
): ScoredItem[] {
  const now = options.now ?? Date.now();
  const weekStartDay = options.weekStartDay ?? "monday";
  const partnerDeviceId = options.partnerDeviceId ?? null;
  const weekStart = getWeekStart(now, weekStartDay);

  const ctx: ScoringContext = {
    now,
    weekStartDay,
    partnerDeviceId,
    weekStart,
  };

  const allItems: ScoredItem[] = [];

  for (const scorer of scorerRegistry) {
    const scored = scorer.score(data, ctx);
    allItems.push(...scored);
  }

  // Sort by score descending
  allItems.sort((a, b) => b.score - a.score);

  return allItems;
}
