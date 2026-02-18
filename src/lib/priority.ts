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
  CheckInType,
  LifeArea,
  Activity,
  HouseholdTask,
  Goal,
  DateNight,
  SnoozedItem,
  SnoozedItemType,
  ContactTier,
  WeekStartDay,
  EnergyLevel,
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
  /** Life area name for display on suggestion cards. */
  lifeArea?: string;
  /** Sub-type hint (e.g. check-in type for contacts: "called", "texted"). */
  subType?: string;
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
  dateNights: DateNight[];
  snoozedItems: SnoozedItem[];
  /** Date night target frequency in days (from UserPreferences). */
  dateNightFrequencyDays?: number;
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
      if (contact.checkInFrequencyDays <= 0) continue;
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

      // Suggest a check-in type — prefer "called" as the default,
      // but use the most recent check-in type if available
      const recentCheckIn = data.checkIns
        .filter((ci) => ci.contactId === contact.id && ci.deletedAt === null)
        .sort((a, b) => b.date - a.date)[0];
      const suggestedType: CheckInType = recentCheckIn?.type ?? "called";
      const estimate = getTimeEstimate("contact", suggestedType);

      items.push({
        key: `contact:${contact.id}`,
        type: "contact",
        title: `Check in with ${contact.name}`,
        reason,
        score,
        itemId: contact.id,
        estimatedMinutes: estimate,
        lifeArea: "People",
        subType: suggestedType,
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
        estimatedMinutes: getTimeEstimate("life-area"),
        lifeArea: area.name,
      });
    }

    return items;
  },
};

/**
 * Household task scorer.
 *
 * Scores pending/in-progress household tasks by their user-set priority
 * and how long they've been waiting (based on updatedAt as a proxy for
 * creation time). In-progress tasks get a small boost.
 *
 * Priority weights: high = 3.0, medium = 2.0, low = 1.0
 * Age factor: days waiting * 0.1 (capped at 2.0 to avoid runaway scores)
 *
 * Uses each task's own estimatedMinutes for time filtering in "I have
 * free time" suggestions.
 */
export const householdTaskScorer: ItemScorer = {
  type: "household-task",
  score(data: ScoringData, ctx: ScoringContext): ScoredItem[] {
    const snoozedSet = buildSnoozedSet(data.snoozedItems, ctx.now);
    const items: ScoredItem[] = [];

    // Find the DIY/Household life area name for display
    const areaName = (() => {
      for (const area of data.lifeAreas) {
        if (area.deletedAt === null) {
          const lower = area.name.toLowerCase();
          if (lower.includes("diy") || lower.includes("household")) {
            return area.name;
          }
        }
      }
      return "DIY/Household";
    })();

    const PRIORITY_WEIGHTS: Record<string, number> = {
      high: 3.0,
      medium: 2.0,
      low: 1.0,
    };

    for (const task of data.householdTasks) {
      if (task.deletedAt !== null) continue;
      if (task.status === "done") continue;
      if (task.id === undefined) continue;
      if (isSnoozed(snoozedSet, "task", task.id)) continue;

      const priorityWeight = PRIORITY_WEIGHTS[task.priority] ?? 2.0;
      const daysWaiting = (ctx.now - task.updatedAt) / (1000 * 60 * 60 * 24);
      const ageFactor = Math.min(daysWaiting * 0.1, 2.0);

      let score = priorityWeight + ageFactor;

      // In-progress tasks get a small boost
      if (task.status === "in-progress") {
        score += 0.5;
      }

      const daysRounded = Math.floor(daysWaiting);
      const reason =
        daysRounded <= 0
          ? `${task.priority} priority task added today`
          : `${task.priority} priority task waiting ${daysRounded} day${daysRounded === 1 ? "" : "s"}`;

      items.push({
        key: `household-task:${task.id}`,
        type: "household-task",
        title: task.title,
        reason,
        score,
        itemId: task.id,
        estimatedMinutes: task.estimatedMinutes,
        lifeArea: areaName,
      });
    }

    return items;
  },
};

/**
 * Goal scorer.
 *
 * Scores active (not-yet-complete) goals based on:
 * - Target date urgency (overdue > due this week > due this month)
 * - Stalled progress (no updates in 14+ days with < 50% complete)
 * - Almost-done boost (> 80% complete, nudge to finish)
 *
 * Uses a default 30-minute estimate per work session for time filtering.
 */
export const goalScorer: ItemScorer = {
  type: "goal",
  score(data: ScoringData, ctx: ScoringContext): ScoredItem[] {
    const snoozedSet = buildSnoozedSet(data.snoozedItems, ctx.now);
    const items: ScoredItem[] = [];

    // Find the Personal Goals life area name for display
    const areaName = (() => {
      for (const area of data.lifeAreas) {
        if (area.deletedAt === null) {
          const lower = area.name.toLowerCase();
          if (lower.includes("personal") && lower.includes("goal")) {
            return area.name;
          }
        }
      }
      return "Personal Goals";
    })();

    for (const goal of data.goals) {
      if (goal.deletedAt !== null) continue;
      if (goal.progressPercent >= 100) continue;
      if (goal.id === undefined) continue;
      if (isSnoozed(snoozedSet, "goal", goal.id)) continue;

      let score = 1.0; // Base score

      // Factor 1: Target date urgency
      if (goal.targetDate) {
        const daysUntil =
          (goal.targetDate - ctx.now) / (1000 * 60 * 60 * 24);
        if (daysUntil < 0) {
          // Overdue — high priority
          score += 3.0;
        } else if (daysUntil < 7) {
          // Due this week
          score += 2.0;
        } else if (daysUntil < 30) {
          // Due this month
          score += 1.0;
        }
      }

      // Factor 2: Stalled progress (no updates in 14+ days with low progress)
      const daysSinceUpdate =
        (ctx.now - goal.updatedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate > 14 && goal.progressPercent < 50) {
        score += 1.5;
      }

      // Factor 3: Almost done — nudge to finish
      if (goal.progressPercent > 80) {
        score += 0.5;
      }

      // Build reason string
      const doneMilestones = goal.milestones.filter((m) => m.done).length;
      const totalMilestones = goal.milestones.length;

      let reason: string;
      if (goal.targetDate) {
        const daysUntil =
          (goal.targetDate - ctx.now) / (1000 * 60 * 60 * 24);
        if (daysUntil < 0) {
          const overdueDays = Math.abs(Math.floor(daysUntil));
          reason = `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue, ${goal.progressPercent}% complete`;
        } else {
          const daysLeft = Math.ceil(daysUntil);
          reason = `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}, ${goal.progressPercent}% complete`;
        }
      } else if (totalMilestones > 0) {
        reason = `${doneMilestones}/${totalMilestones} milestones done`;
      } else {
        reason = `${goal.progressPercent}% complete`;
      }

      items.push({
        key: `goal:${goal.id}`,
        type: "goal",
        title: goal.title,
        reason,
        score,
        itemId: goal.id,
        estimatedMinutes: getTimeEstimate("goal"),
        lifeArea: areaName,
      });
    }

    return items;
  },
};

/**
 * Date night scorer.
 *
 * Scores based on how overdue the next date night is compared to the
 * user's preferred frequency (dateNightFrequencyDays, default 14).
 *
 * Date nights score higher than most other items when past their target
 * frequency to surface prominently on the dashboard.
 *
 * Score = (daysSinceLastDateNight / frequencyDays) * BASE_WEIGHT
 * BASE_WEIGHT is set high (6.0) so overdue date nights rank above
 * most contacts and tasks.
 *
 * Partner-aware: if the partner logged a date night recently (within
 * the frequency window), both partners already benefited — the scorer
 * naturally picks this up since DateNight records sync between devices.
 */
export const dateNightScorer: ItemScorer = {
  type: "date-night",
  score(data: ScoringData, ctx: ScoringContext): ScoredItem[] {
    const frequencyDays = data.dateNightFrequencyDays ?? 14;
    if (frequencyDays <= 0) return [];

    // Check if date night is snoozed (uses synthetic ID 0)
    const snoozedSet = buildSnoozedSet(data.snoozedItems, ctx.now);
    if (isSnoozed(snoozedSet, "date-night", 0)) return [];

    // Find the Partner Time life area name
    const areaName = (() => {
      for (const area of data.lifeAreas) {
        if (area.deletedAt === null) {
          const lower = area.name.toLowerCase();
          if (lower.includes("partner")) {
            return area.name;
          }
        }
      }
      return "Partner Time";
    })();

    // Find the most recent non-deleted date night
    const activeDateNights = data.dateNights.filter((dn) => dn.deletedAt === null);
    const lastDateNight = activeDateNights.reduce<DateNight | null>(
      (latest, dn) => (!latest || dn.date > latest.date ? dn : latest),
      null,
    );

    const daysSinceLast = lastDateNight
      ? (ctx.now - lastDateNight.date) / (1000 * 60 * 60 * 24)
      : Infinity;

    const overdueRatio = daysSinceLast / frequencyDays;

    // Only suggest when at least 50% through the frequency window
    if (overdueRatio < 0.5) return [];

    // High base weight so date nights surface prominently when overdue
    const BASE_WEIGHT = 6.0;
    const score = overdueRatio * BASE_WEIGHT;

    const daysSinceRounded = daysSinceLast === Infinity ? null : Math.floor(daysSinceLast);

    const reason =
      daysSinceRounded === null
        ? "You haven\u2019t had a date night yet"
        : daysSinceRounded === 0
          ? "You had a date night today"
          : `Last date night was ${daysSinceRounded} day${daysSinceRounded === 1 ? "" : "s"} ago`;

    // Use a synthetic ID of 0 — there's only ever one "plan a date night" item
    return [
      {
        key: "date-night:0",
        type: "date-night",
        title: "Plan a date night",
        reason,
        score,
        itemId: 0,
        estimatedMinutes: getTimeEstimate("date-night"),
        lifeArea: areaName,
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Configurable time estimate defaults (in minutes)
// ---------------------------------------------------------------------------

/**
 * Default time estimates for item types/sub-types, used by the "I have free
 * time" flow to filter suggestions by available time. These are configurable
 * so they can be tuned without changing scorer logic.
 */
const timeEstimateDefaults: Record<string, number> = {
  // Contact check-in types
  "contact:called": 15,
  "contact:texted": 5,
  "contact:met-up": 60,
  "contact:video-call": 30,
  "contact:other": 15,
  // Fallback for contacts without a specific sub-type
  contact: 15,
  // Life area activities (generic)
  "life-area": 30,
  // Household tasks use their own estimatedMinutes field, but fall back here
  "household-task": 30,
  // Goals default to a single work session
  goal: 30,
  // Date nights are typically a full evening out
  "date-night": 120,
};

/** Get the default time estimate for an item type and optional sub-type. */
export function getTimeEstimate(type: string, subType?: string): number {
  if (subType) {
    const specific = timeEstimateDefaults[`${type}:${subType}`];
    if (specific !== undefined) return specific;
  }
  return timeEstimateDefaults[type] ?? 30;
}

/** Override a time estimate default. */
export function setTimeEstimateDefault(key: string, minutes: number): void {
  timeEstimateDefaults[key] = minutes;
}

/** Get all current time estimate defaults (for debugging/display). */
export function getTimeEstimateDefaults(): Record<string, number> {
  return { ...timeEstimateDefaults };
}

// ---------------------------------------------------------------------------
// Energy level filtering
// ---------------------------------------------------------------------------

/**
 * Maps energy levels to item types/life areas that are appropriate.
 * When energy is "low", high-effort activities are filtered out.
 * When energy is "energetic", everything is available.
 *
 * Life areas whose names match these patterns will be excluded at low energy.
 */
const LOW_ENERGY_EXCLUDED_PATTERNS = [
  "diy",
  "household",
];

/**
 * Check if a scored item is appropriate for the given energy level.
 * - "energetic": everything is appropriate
 * - "normal": everything is appropriate
 * - "low": filters out high-effort items (DIY/Household tasks, met-up contacts)
 */
export function isEnergyAppropriate(
  item: ScoredItem,
  energy: EnergyLevel,
): boolean {
  if (energy !== "low") return true;

  // At low energy, exclude in-person meet-ups (suggest texting/calling instead)
  if (item.type === "contact" && item.subType === "met-up") return false;

  // At low energy, exclude household tasks
  if (item.type === "household-task") return false;

  // At low energy, exclude DIY/Household life area activities
  if (item.type === "life-area" && item.lifeArea) {
    const lower = item.lifeArea.toLowerCase();
    if (LOW_ENERGY_EXCLUDED_PATTERNS.some((p) => lower.includes(p))) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Free time suggestion filter
// ---------------------------------------------------------------------------

/** Options for filtering suggestions for the "I have free time" flow. */
export interface FreeTimeFilterOptions extends PriorityOptions {
  availableMinutes: number;
  energy: EnergyLevel;
  maxSuggestions?: number;
}

/**
 * Get filtered suggestions for the "I have free time" flow.
 *
 * Runs the priority algorithm then filters by:
 * 1. Items that fit within the available time window
 * 2. Energy-appropriate suggestions
 * 3. Weighted toward the most overdue/imbalanced areas (already sorted by score)
 *
 * Returns up to `maxSuggestions` items (default 5).
 */
export function getFilteredSuggestions(
  data: ScoringData,
  options: FreeTimeFilterOptions,
): ScoredItem[] {
  const { availableMinutes, energy, maxSuggestions = 5, ...priorityOptions } = options;

  const allItems = calculatePriorities(data, priorityOptions);

  return allItems
    .filter((item) => {
      const estimate = item.estimatedMinutes ?? getTimeEstimate(item.type, item.subType);
      return estimate <= availableMinutes;
    })
    .filter((item) => isEnergyAppropriate(item, energy))
    .slice(0, maxSuggestions);
}

// ---------------------------------------------------------------------------
// Register built-in scorers
// ---------------------------------------------------------------------------

registerScorer(contactScorer);
registerScorer(lifeAreaScorer);
registerScorer(householdTaskScorer);
registerScorer(goalScorer);
registerScorer(dateNightScorer);

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
