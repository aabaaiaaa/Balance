import {
  calculatePriorities,
  registerScorer,
  unregisterScorer,
  clearScorers,
  getRegisteredScorers,
  getWeekStart,
  buildSnoozedSet,
  isSnoozed,
  contactScorer,
  lifeAreaScorer,
  householdTaskScorer,
  goalScorer,
  TIER_WEIGHTS,
  PARTNER_DISCOUNT_FACTOR,
  getTimeEstimate,
  setTimeEstimateDefault,
  getTimeEstimateDefaults,
  isEnergyAppropriate,
  getFilteredSuggestions,
  type ScoringData,
  type ScoredItem,
  type ItemScorer,
  type ScoringContext,
} from "@/lib/priority";
import type {
  Contact,
  CheckIn,
  LifeArea,
  Activity,
  HouseholdTask,
  Goal,
  SnoozedItem,
} from "@/types/models";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 1000 * 60 * 60 * 24;
const HOUR_MS = 1000 * 60 * 60;

/** Fixed "now" for deterministic tests — Monday 2026-02-16 12:00 UTC. */
const NOW = new Date("2026-02-16T12:00:00Z").getTime();

function makeContact(
  overrides: Partial<Contact> & { id: number },
): Contact {
  return {
    name: "Test Contact",
    tier: "close-friends",
    checkInFrequencyDays: 14,
    lastCheckIn: null,
    notes: "",
    phoneNumber: "",
    location: null,
    updatedAt: NOW,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

function makeCheckIn(
  overrides: Partial<CheckIn> & { id: number; contactId: number },
): CheckIn {
  return {
    date: NOW,
    type: "called",
    notes: "",
    location: null,
    updatedAt: NOW,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

function makeLifeArea(
  overrides: Partial<LifeArea> & { id: number },
): LifeArea {
  return {
    name: "Test Area",
    icon: "star",
    targetHoursPerWeek: 5,
    updatedAt: NOW,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

function makeActivity(
  overrides: Partial<Activity> & { id: number; lifeAreaId: number },
): Activity {
  return {
    description: "Test activity",
    durationMinutes: 60,
    date: NOW,
    notes: "",
    location: null,
    updatedAt: NOW,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

function makeSnoozedItem(
  overrides: Partial<SnoozedItem> & { id: number; itemId: number },
): SnoozedItem {
  return {
    itemType: "contact",
    snoozedUntil: NOW + DAY_MS,
    updatedAt: NOW,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

function emptyData(): ScoringData {
  return {
    contacts: [],
    checkIns: [],
    lifeAreas: [],
    activities: [],
    householdTasks: [],
    goals: [],
    snoozedItems: [],
  };
}

// ---------------------------------------------------------------------------
// getWeekStart
// ---------------------------------------------------------------------------

describe("getWeekStart", () => {
  it("returns Monday 00:00 UTC for weekStartDay=monday on a Wednesday", () => {
    // 2026-02-18 is a Wednesday
    const wed = new Date("2026-02-18T15:30:00Z").getTime();
    const start = getWeekStart(wed, "monday");
    expect(new Date(start).toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  it("returns Monday 00:00 UTC for weekStartDay=monday on Monday itself", () => {
    const mon = new Date("2026-02-16T08:00:00Z").getTime();
    const start = getWeekStart(mon, "monday");
    expect(new Date(start).toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  it("returns Sunday 00:00 UTC for weekStartDay=sunday on a Wednesday", () => {
    const wed = new Date("2026-02-18T15:30:00Z").getTime();
    const start = getWeekStart(wed, "sunday");
    expect(new Date(start).toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("returns Sunday 00:00 UTC for weekStartDay=sunday on Sunday itself", () => {
    const sun = new Date("2026-02-15T08:00:00Z").getTime();
    const start = getWeekStart(sun, "sunday");
    expect(new Date(start).toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });

  it("handles Saturday with monday start (goes back to previous Monday)", () => {
    const sat = new Date("2026-02-21T10:00:00Z").getTime();
    const start = getWeekStart(sat, "monday");
    expect(new Date(start).toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  it("handles Sunday with monday start (goes back to previous Monday)", () => {
    const sun = new Date("2026-02-22T10:00:00Z").getTime();
    const start = getWeekStart(sun, "monday");
    expect(new Date(start).toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// buildSnoozedSet & isSnoozed
// ---------------------------------------------------------------------------

describe("buildSnoozedSet", () => {
  it("includes items snoozed until the future", () => {
    const items = [
      makeSnoozedItem({ id: 1, itemId: 5, itemType: "contact", snoozedUntil: NOW + DAY_MS }),
    ];
    const set = buildSnoozedSet(items, NOW);
    expect(set.has("contact:5")).toBe(true);
  });

  it("excludes items whose snoozedUntil is in the past", () => {
    const items = [
      makeSnoozedItem({ id: 1, itemId: 5, itemType: "contact", snoozedUntil: NOW - 1 }),
    ];
    const set = buildSnoozedSet(items, NOW);
    expect(set.has("contact:5")).toBe(false);
  });

  it("excludes soft-deleted snoozed items", () => {
    const items = [
      makeSnoozedItem({
        id: 1,
        itemId: 5,
        itemType: "contact",
        snoozedUntil: NOW + DAY_MS,
        deletedAt: NOW,
      }),
    ];
    const set = buildSnoozedSet(items, NOW);
    expect(set.has("contact:5")).toBe(false);
  });

  it("builds set for multiple item types", () => {
    const items = [
      makeSnoozedItem({ id: 1, itemId: 5, itemType: "contact", snoozedUntil: NOW + DAY_MS }),
      makeSnoozedItem({ id: 2, itemId: 3, itemType: "task", snoozedUntil: NOW + DAY_MS }),
      makeSnoozedItem({ id: 3, itemId: 7, itemType: "goal", snoozedUntil: NOW + DAY_MS }),
    ];
    const set = buildSnoozedSet(items, NOW);
    expect(set.size).toBe(3);
    expect(isSnoozed(set, "contact", 5)).toBe(true);
    expect(isSnoozed(set, "task", 3)).toBe(true);
    expect(isSnoozed(set, "goal", 7)).toBe(true);
    expect(isSnoozed(set, "contact", 999)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scorer registry
// ---------------------------------------------------------------------------

describe("scorer registry", () => {
  const originalScorers = getRegisteredScorers();

  afterEach(() => {
    // Restore built-in scorers after each test
    clearScorers();
    for (const s of originalScorers) registerScorer(s);
  });

  it("has built-in contact and life-area scorers", () => {
    const types = getRegisteredScorers().map((s) => s.type);
    expect(types).toContain("contact");
    expect(types).toContain("life-area");
  });

  it("allows registering a custom scorer", () => {
    const custom: ItemScorer = {
      type: "custom-type",
      score: () => [
        { key: "custom:1", type: "custom-type", title: "Custom", reason: "test", score: 99, itemId: 1 },
      ],
    };
    registerScorer(custom);
    const types = getRegisteredScorers().map((s) => s.type);
    expect(types).toContain("custom-type");
  });

  it("replaces an existing scorer if same type is registered", () => {
    const custom1: ItemScorer = {
      type: "test-type",
      score: () => [{ key: "t:1", type: "test-type", title: "V1", reason: "", score: 1, itemId: 1 }],
    };
    const custom2: ItemScorer = {
      type: "test-type",
      score: () => [{ key: "t:1", type: "test-type", title: "V2", reason: "", score: 2, itemId: 1 }],
    };
    registerScorer(custom1);
    registerScorer(custom2);

    const scorers = getRegisteredScorers().filter((s) => s.type === "test-type");
    expect(scorers).toHaveLength(1);

    const result = scorers[0].score(emptyData(), {} as ScoringContext);
    expect(result[0].title).toBe("V2");
  });

  it("can unregister a scorer by type", () => {
    registerScorer({ type: "temp", score: () => [] });
    expect(getRegisteredScorers().map((s) => s.type)).toContain("temp");

    unregisterScorer("temp");
    expect(getRegisteredScorers().map((s) => s.type)).not.toContain("temp");
  });

  it("clearScorers removes all scorers", () => {
    clearScorers();
    expect(getRegisteredScorers()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Contact scorer
// ---------------------------------------------------------------------------

describe("contactScorer", () => {
  it("scores a contact with no check-ins highly", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [makeContact({ id: 1, name: "Alice", tier: "close-family", lastCheckIn: null })],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].key).toBe("contact:1");
    expect(results[0].reason).toContain("never checked in");
  });

  it("scores overdue contacts higher than recent ones", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Overdue",
          tier: "close-friends",
          checkInFrequencyDays: 7,
          lastCheckIn: NOW - 21 * DAY_MS, // 3 weeks ago
        }),
        makeContact({
          id: 2,
          name: "Recent",
          tier: "close-friends",
          checkInFrequencyDays: 7,
          lastCheckIn: NOW - 5 * DAY_MS, // 5 days ago
        }),
      ],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const overdue = results.find((r) => r.key === "contact:1")!;
    const recent = results.find((r) => r.key === "contact:2");

    expect(overdue.score).toBeGreaterThan(0);
    // Recent at 5/7 ratio with weight 2.0 = ~1.43 which is above threshold
    if (recent) {
      expect(overdue.score).toBeGreaterThan(recent.score);
    }
  });

  it("applies tier weight — partner scores higher than wider friends", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Partner",
          tier: "partner",
          checkInFrequencyDays: 1,
          lastCheckIn: NOW - 2 * DAY_MS,
        }),
        makeContact({
          id: 2,
          name: "Acquaintance",
          tier: "wider-friends",
          checkInFrequencyDays: 30,
          lastCheckIn: NOW - 60 * DAY_MS, // same 2x overdue ratio
        }),
      ],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const partner = results.find((r) => r.key === "contact:1")!;
    const acquaintance = results.find((r) => r.key === "contact:2")!;

    // Both have the same overdue ratio (2.0) but partner has weight 5.0 vs 1.0
    expect(partner.score).toBeGreaterThan(acquaintance.score);
    expect(partner.score / acquaintance.score).toBeCloseTo(
      TIER_WEIGHTS["partner"] / TIER_WEIGHTS["wider-friends"],
      1,
    );
  });

  it("excludes soft-deleted contacts", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({ id: 1, name: "Deleted", deletedAt: NOW - DAY_MS, lastCheckIn: null }),
      ],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("excludes snoozed contacts", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({ id: 1, name: "Snoozed", lastCheckIn: null }),
      ],
      snoozedItems: [
        makeSnoozedItem({ id: 1, itemId: 1, itemType: "contact", snoozedUntil: NOW + DAY_MS }),
      ],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("includes contacts with expired snooze", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({ id: 1, name: "UnSnoozed", lastCheckIn: null }),
      ],
      snoozedItems: [
        makeSnoozedItem({ id: 1, itemId: 1, itemType: "contact", snoozedUntil: NOW - 1 }),
      ],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(1);
  });

  it("applies partner discount when partner checked in this week", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Mum",
          tier: "close-family",
          checkInFrequencyDays: 7,
          lastCheckIn: NOW - 14 * DAY_MS,
        }),
      ],
      checkIns: [
        makeCheckIn({
          id: 1,
          contactId: 1,
          date: weekStart + HOUR_MS, // partner checked in this week
          deviceId: "partner-device",
        }),
      ],
    };

    const ctx: ScoringContext = {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: "partner-device",
      weekStart,
    };

    const results = contactScorer.score(data, ctx);
    expect(results).toHaveLength(1);

    // Now compare without partner
    const ctxNoPartner: ScoringContext = { ...ctx, partnerDeviceId: null };
    const resultsNoPartner = contactScorer.score(data, ctxNoPartner);

    expect(results[0].score).toBeCloseTo(
      resultsNoPartner[0].score * PARTNER_DISCOUNT_FACTOR,
      5,
    );
  });

  it("does not apply partner discount for own device check-ins", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Mum",
          tier: "close-family",
          checkInFrequencyDays: 7,
          lastCheckIn: NOW - 14 * DAY_MS,
        }),
      ],
      checkIns: [
        makeCheckIn({
          id: 1,
          contactId: 1,
          date: weekStart + HOUR_MS,
          deviceId: "device-a", // own device, not partner
        }),
      ],
    };

    const ctx: ScoringContext = {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: "partner-device",
      weekStart,
    };

    const results = contactScorer.score(data, ctx);
    const ctxNoPartner: ScoringContext = { ...ctx, partnerDeviceId: null };
    const resultsNoPartner = contactScorer.score(data, ctxNoPartner);

    // Scores should be the same — no discount applied for own check-ins
    expect(results[0].score).toBe(resultsNoPartner[0].score);
  });

  it("does not apply partner discount for check-ins before this week", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Mum",
          tier: "close-family",
          checkInFrequencyDays: 7,
          lastCheckIn: NOW - 14 * DAY_MS,
        }),
      ],
      checkIns: [
        makeCheckIn({
          id: 1,
          contactId: 1,
          date: weekStart - HOUR_MS, // last week
          deviceId: "partner-device",
        }),
      ],
    };

    const ctx: ScoringContext = {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: "partner-device",
      weekStart,
    };

    const results = contactScorer.score(data, ctx);
    const ctxNoPartner: ScoringContext = { ...ctx, partnerDeviceId: null };
    const resultsNoPartner = contactScorer.score(data, ctxNoPartner);

    expect(results[0].score).toBe(resultsNoPartner[0].score);
  });

  it("skips contacts without an id", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        { ...makeContact({ id: 1, lastCheckIn: null }), id: undefined },
      ],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("contact checked in today with short frequency still appears if score meets threshold", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Partner",
          tier: "partner",
          checkInFrequencyDays: 1,
          lastCheckIn: NOW - 1.5 * DAY_MS, // 1.5 days ago, overdue for daily
        }),
      ],
    };

    const results = contactScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(1);
    // overdueRatio = 1.5, weight = 5.0, score = 7.5, threshold = 0.5*5 = 2.5
    expect(results[0].score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Life area scorer
// ---------------------------------------------------------------------------

describe("lifeAreaScorer", () => {
  it("scores an area with no activities this week", () => {
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 5 })],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(3.0); // full deficit = 1.0 * 3.0
    expect(results[0].reason).toContain("No time logged");
  });

  it("scores a partially completed area less than a fully empty one", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 5 }),
        makeLifeArea({ id: 2, name: "Social", targetHoursPerWeek: 5 }),
      ],
      activities: [
        makeActivity({
          id: 1,
          lifeAreaId: 1,
          durationMinutes: 180, // 3 hours
          date: weekStart + HOUR_MS,
        }),
        // No activities for Social (area 2)
      ],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart,
    });

    const selfCare = results.find((r) => r.key === "life-area:1")!;
    const social = results.find((r) => r.key === "life-area:2")!;

    expect(selfCare.score).toBeLessThan(social.score);
    expect(selfCare.reason).toContain("3h of 5h");
  });

  it("excludes areas that have met their target", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 2 }),
      ],
      activities: [
        makeActivity({
          id: 1,
          lifeAreaId: 1,
          durationMinutes: 180, // 3 hours, exceeds 2h target
          date: weekStart + HOUR_MS,
        }),
      ],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart,
    });

    expect(results).toHaveLength(0);
  });

  it("excludes soft-deleted areas", () => {
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Deleted", deletedAt: NOW }),
      ],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("excludes areas with zero target hours", () => {
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "No target", targetHoursPerWeek: 0 }),
      ],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("counts partner activities toward the shared total", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "DIY", targetHoursPerWeek: 4 }),
      ],
      activities: [
        makeActivity({
          id: 1,
          lifeAreaId: 1,
          durationMinutes: 120,
          date: weekStart + HOUR_MS,
          deviceId: "partner-device",
        }),
        makeActivity({
          id: 2,
          lifeAreaId: 1,
          durationMinutes: 60,
          date: weekStart + 2 * HOUR_MS,
          deviceId: "device-a",
        }),
      ],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: "partner-device",
      weekStart,
    });

    // 3 hours out of 4 target → deficit = 1h, ratio = 0.25
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeCloseTo(0.25 * 3.0, 5);
  });

  it("only counts activities from the current week", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 5 }),
      ],
      activities: [
        makeActivity({
          id: 1,
          lifeAreaId: 1,
          durationMinutes: 300, // 5 hours
          date: weekStart - HOUR_MS, // last week
        }),
      ],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart,
    });

    // Activity is from last week, so it doesn't count
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(3.0); // full deficit
  });

  it("excludes soft-deleted activities from calculations", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 2 }),
      ],
      activities: [
        makeActivity({
          id: 1,
          lifeAreaId: 1,
          durationMinutes: 300,
          date: weekStart + HOUR_MS,
          deletedAt: NOW, // soft deleted
        }),
      ],
    };

    const results = lifeAreaScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart,
    });

    // Deleted activity doesn't count
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(3.0);
  });
});

// ---------------------------------------------------------------------------
// calculatePriorities (integration)
// ---------------------------------------------------------------------------

describe("calculatePriorities", () => {
  it("returns empty array when no data", () => {
    const results = calculatePriorities(emptyData(), { now: NOW });
    expect(results).toEqual([]);
  });

  it("returns items sorted by score descending", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Very overdue",
          tier: "partner",
          checkInFrequencyDays: 1,
          lastCheckIn: NOW - 7 * DAY_MS,
        }),
        makeContact({
          id: 2,
          name: "Slightly overdue",
          tier: "wider-friends",
          checkInFrequencyDays: 30,
          lastCheckIn: NOW - 31 * DAY_MS,
        }),
      ],
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 5 }),
      ],
    };

    const results = calculatePriorities(data, { now: NOW });

    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("mixes contact and life area items", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Alice",
          lastCheckIn: null,
        }),
      ],
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 5 }),
      ],
    };

    const results = calculatePriorities(data, { now: NOW });

    const types = results.map((r) => r.type);
    expect(types).toContain("contact");
    expect(types).toContain("life-area");
  });

  it("respects weekStartDay option", () => {
    const weekStartMon = getWeekStart(NOW, "monday");
    const weekStartSun = getWeekStart(NOW, "sunday");

    // Activity logged between Sunday and Monday should count differently
    const activityDate = weekStartMon - 12 * HOUR_MS; // Sunday evening

    const data: ScoringData = {
      ...emptyData(),
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 1 }),
      ],
      activities: [
        makeActivity({
          id: 1,
          lifeAreaId: 1,
          durationMinutes: 120,
          date: activityDate,
        }),
      ],
    };

    const resultsMon = calculatePriorities(data, { now: NOW, weekStartDay: "monday" });
    const resultsSun = calculatePriorities(data, { now: NOW, weekStartDay: "sunday" });

    // With Monday start, Sunday activity is last week → area is empty → scored
    // With Sunday start, Sunday activity is this week → area is met → not scored
    const monArea = resultsMon.find((r) => r.type === "life-area");
    const sunArea = resultsSun.find((r) => r.type === "life-area");

    expect(monArea).toBeDefined();
    expect(sunArea).toBeUndefined();
  });

  it("passes partnerDeviceId through to scorers", () => {
    const weekStart = getWeekStart(NOW, "monday");
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Mum",
          tier: "close-family",
          checkInFrequencyDays: 7,
          lastCheckIn: NOW - 14 * DAY_MS,
        }),
      ],
      checkIns: [
        makeCheckIn({
          id: 1,
          contactId: 1,
          date: weekStart + HOUR_MS,
          deviceId: "partner-device",
        }),
      ],
    };

    const withPartner = calculatePriorities(data, {
      now: NOW,
      partnerDeviceId: "partner-device",
    });
    const withoutPartner = calculatePriorities(data, {
      now: NOW,
      partnerDeviceId: null,
    });

    const scoreWith = withPartner.find((r) => r.key === "contact:1")!.score;
    const scoreWithout = withoutPartner.find((r) => r.key === "contact:1")!.score;

    expect(scoreWith).toBeLessThan(scoreWithout);
  });

  it("includes items from custom registered scorers", () => {
    const custom: ItemScorer = {
      type: "custom",
      score: () => [
        { key: "custom:1", type: "custom", title: "Custom item", reason: "test", score: 100, itemId: 1 },
      ],
    };
    registerScorer(custom);

    const results = calculatePriorities(emptyData(), { now: NOW });
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("custom");
    expect(results[0].score).toBe(100);

    unregisterScorer("custom");
  });

  it("handles all contacts at the same priority", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({ id: 1, name: "A", tier: "close-friends", checkInFrequencyDays: 14, lastCheckIn: NOW - 14 * DAY_MS }),
        makeContact({ id: 2, name: "B", tier: "close-friends", checkInFrequencyDays: 14, lastCheckIn: NOW - 14 * DAY_MS }),
        makeContact({ id: 3, name: "C", tier: "close-friends", checkInFrequencyDays: 14, lastCheckIn: NOW - 14 * DAY_MS }),
      ],
    };

    const results = calculatePriorities(data, { now: NOW });
    const contactResults = results.filter((r) => r.type === "contact");

    expect(contactResults).toHaveLength(3);
    // All should have the same score
    expect(contactResults[0].score).toBe(contactResults[1].score);
    expect(contactResults[1].score).toBe(contactResults[2].score);
  });

  it("defaults now to Date.now() when not specified", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({ id: 1, name: "Alice", lastCheckIn: null }),
      ],
    };

    // Just verifying it doesn't throw
    const results = calculatePriorities(data);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns estimatedMinutes on scored items", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({ id: 1, name: "Alice", lastCheckIn: null }),
      ],
      lifeAreas: [
        makeLifeArea({ id: 1, name: "Self-care", targetHoursPerWeek: 5 }),
      ],
    };

    const results = calculatePriorities(data, { now: NOW });
    for (const item of results) {
      expect(item.estimatedMinutes).toBeDefined();
      expect(item.estimatedMinutes).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Helper factories for household tasks and goals
// ---------------------------------------------------------------------------

function makeHouseholdTask(
  overrides: Partial<HouseholdTask> & { id: number },
): HouseholdTask {
  return {
    lifeAreaId: 1,
    title: "Test Task",
    estimatedMinutes: 30,
    priority: "medium",
    status: "pending",
    completedAt: null,
    updatedAt: NOW,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

function makeGoal(
  overrides: Partial<Goal> & { id: number },
): Goal {
  return {
    lifeAreaId: 1,
    title: "Test Goal",
    description: "",
    targetDate: null,
    milestones: [],
    progressPercent: 0,
    updatedAt: NOW,
    deviceId: "device-a",
    deletedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Household task scorer
// ---------------------------------------------------------------------------

describe("householdTaskScorer", () => {
  it("scores pending tasks", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, title: "Fix tap", priority: "high", status: "pending" }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("household-task:1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("scores high priority higher than low priority", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, title: "High", priority: "high", updatedAt: NOW }),
        makeHouseholdTask({ id: 2, title: "Low", priority: "low", updatedAt: NOW }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const high = results.find((r) => r.key === "household-task:1")!;
    const low = results.find((r) => r.key === "household-task:2")!;
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("gives in-progress tasks a boost over pending tasks of same priority", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, title: "In Progress", priority: "medium", status: "in-progress", updatedAt: NOW }),
        makeHouseholdTask({ id: 2, title: "Pending", priority: "medium", status: "pending", updatedAt: NOW }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const inProgress = results.find((r) => r.key === "household-task:1")!;
    const pending = results.find((r) => r.key === "household-task:2")!;
    expect(inProgress.score).toBeGreaterThan(pending.score);
  });

  it("excludes done tasks", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, title: "Done", status: "done" }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("excludes soft-deleted tasks", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, deletedAt: NOW }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("excludes snoozed tasks", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1 }),
      ],
      snoozedItems: [
        makeSnoozedItem({ id: 1, itemId: 1, itemType: "task", snoozedUntil: NOW + DAY_MS }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("uses task estimatedMinutes for time estimate", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, estimatedMinutes: 45 }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results[0].estimatedMinutes).toBe(45);
  });

  it("increases score for older tasks (age factor)", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, title: "Old", priority: "medium", updatedAt: NOW - 14 * DAY_MS }),
        makeHouseholdTask({ id: 2, title: "New", priority: "medium", updatedAt: NOW }),
      ],
    };

    const results = householdTaskScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const old = results.find((r) => r.key === "household-task:1")!;
    const fresh = results.find((r) => r.key === "household-task:2")!;
    expect(old.score).toBeGreaterThan(fresh.score);
  });
});

// ---------------------------------------------------------------------------
// Goal scorer
// ---------------------------------------------------------------------------

describe("goalScorer", () => {
  it("scores active goals", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({ id: 1, title: "Learn guitar", progressPercent: 30 }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("goal:1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("excludes completed goals (100%)", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({ id: 1, progressPercent: 100 }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("scores overdue goals higher than future goals", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({
          id: 1,
          title: "Overdue",
          progressPercent: 20,
          targetDate: NOW - 7 * DAY_MS, // 7 days overdue
        }),
        makeGoal({
          id: 2,
          title: "Future",
          progressPercent: 20,
          targetDate: NOW + 60 * DAY_MS, // 2 months out
        }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const overdue = results.find((r) => r.key === "goal:1")!;
    const future = results.find((r) => r.key === "goal:2")!;
    expect(overdue.score).toBeGreaterThan(future.score);
  });

  it("boosts goals due this week", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({
          id: 1,
          title: "Due this week",
          progressPercent: 50,
          targetDate: NOW + 3 * DAY_MS,
        }),
        makeGoal({
          id: 2,
          title: "No deadline",
          progressPercent: 50,
          targetDate: null,
        }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const thisWeek = results.find((r) => r.key === "goal:1")!;
    const noDeadline = results.find((r) => r.key === "goal:2")!;
    expect(thisWeek.score).toBeGreaterThan(noDeadline.score);
  });

  it("boosts stalled goals (no updates in 14+ days, < 50% progress)", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({
          id: 1,
          title: "Stalled",
          progressPercent: 20,
          updatedAt: NOW - 20 * DAY_MS, // stalled for 20 days
        }),
        makeGoal({
          id: 2,
          title: "Active",
          progressPercent: 20,
          updatedAt: NOW - 1 * DAY_MS, // updated yesterday
        }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const stalled = results.find((r) => r.key === "goal:1")!;
    const active = results.find((r) => r.key === "goal:2")!;
    expect(stalled.score).toBeGreaterThan(active.score);
  });

  it("boosts almost-done goals (> 80% progress)", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({
          id: 1,
          title: "Almost done",
          progressPercent: 90,
          updatedAt: NOW,
        }),
        makeGoal({
          id: 2,
          title: "Half done",
          progressPercent: 50,
          updatedAt: NOW,
        }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    const almostDone = results.find((r) => r.key === "goal:1")!;
    const halfDone = results.find((r) => r.key === "goal:2")!;
    expect(almostDone.score).toBeGreaterThan(halfDone.score);
  });

  it("excludes snoozed goals", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({ id: 1, progressPercent: 20 }),
      ],
      snoozedItems: [
        makeSnoozedItem({ id: 1, itemId: 1, itemType: "goal", snoozedUntil: NOW + DAY_MS }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("excludes soft-deleted goals", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({ id: 1, deletedAt: NOW }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results).toHaveLength(0);
  });

  it("uses 30-minute default time estimate", () => {
    const data: ScoringData = {
      ...emptyData(),
      goals: [
        makeGoal({ id: 1, progressPercent: 20 }),
      ],
    };

    const results = goalScorer.score(data, {
      now: NOW,
      weekStartDay: "monday",
      partnerDeviceId: null,
      weekStart: getWeekStart(NOW, "monday"),
    });

    expect(results[0].estimatedMinutes).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// getTimeEstimate
// ---------------------------------------------------------------------------

describe("getTimeEstimate", () => {
  it("returns 15 for contact:called", () => {
    expect(getTimeEstimate("contact", "called")).toBe(15);
  });

  it("returns 5 for contact:texted", () => {
    expect(getTimeEstimate("contact", "texted")).toBe(5);
  });

  it("returns 60 for contact:met-up", () => {
    expect(getTimeEstimate("contact", "met-up")).toBe(60);
  });

  it("returns 30 for life-area", () => {
    expect(getTimeEstimate("life-area")).toBe(30);
  });

  it("returns 30 for goal", () => {
    expect(getTimeEstimate("goal")).toBe(30);
  });

  it("returns 30 as fallback for unknown types", () => {
    expect(getTimeEstimate("unknown-type")).toBe(30);
  });

  it("can be overridden with setTimeEstimateDefault", () => {
    const original = getTimeEstimate("contact", "called");
    setTimeEstimateDefault("contact:called", 20);
    expect(getTimeEstimate("contact", "called")).toBe(20);
    // Restore
    setTimeEstimateDefault("contact:called", original);
  });
});

// ---------------------------------------------------------------------------
// isEnergyAppropriate
// ---------------------------------------------------------------------------

describe("isEnergyAppropriate", () => {
  const meetUpItem: ScoredItem = {
    key: "contact:1",
    type: "contact",
    title: "Meet Alice",
    reason: "test",
    score: 5,
    itemId: 1,
    subType: "met-up",
  };

  const householdItem: ScoredItem = {
    key: "household-task:1",
    type: "household-task",
    title: "Fix tap",
    reason: "test",
    score: 3,
    itemId: 1,
    lifeArea: "DIY/Household",
  };

  const textItem: ScoredItem = {
    key: "contact:2",
    type: "contact",
    title: "Text Bob",
    reason: "test",
    score: 3,
    itemId: 2,
    subType: "texted",
  };

  it("returns true for all items when energy is energetic", () => {
    expect(isEnergyAppropriate(meetUpItem, "energetic")).toBe(true);
    expect(isEnergyAppropriate(householdItem, "energetic")).toBe(true);
  });

  it("returns true for all items when energy is normal", () => {
    expect(isEnergyAppropriate(meetUpItem, "normal")).toBe(true);
    expect(isEnergyAppropriate(householdItem, "normal")).toBe(true);
  });

  it("excludes met-up contacts at low energy", () => {
    expect(isEnergyAppropriate(meetUpItem, "low")).toBe(false);
  });

  it("excludes household tasks at low energy", () => {
    expect(isEnergyAppropriate(householdItem, "low")).toBe(false);
  });

  it("allows texting contacts at low energy", () => {
    expect(isEnergyAppropriate(textItem, "low")).toBe(true);
  });

  it("excludes DIY life area activities at low energy", () => {
    const diyArea: ScoredItem = {
      key: "life-area:1",
      type: "life-area",
      title: "DIY",
      reason: "test",
      score: 2,
      itemId: 1,
      lifeArea: "DIY/Household",
    };
    expect(isEnergyAppropriate(diyArea, "low")).toBe(false);
  });

  it("allows self-care at low energy", () => {
    const selfCare: ScoredItem = {
      key: "life-area:2",
      type: "life-area",
      title: "Self-care",
      reason: "test",
      score: 2,
      itemId: 2,
      lifeArea: "Self-care",
    };
    expect(isEnergyAppropriate(selfCare, "low")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getFilteredSuggestions
// ---------------------------------------------------------------------------

describe("getFilteredSuggestions", () => {
  it("filters by available time", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: [
        makeContact({
          id: 1,
          name: "Alice",
          lastCheckIn: null,
          tier: "close-friends",
        }),
      ],
      householdTasks: [
        makeHouseholdTask({
          id: 1,
          title: "Big task",
          estimatedMinutes: 120,
          priority: "high",
        }),
      ],
    };

    // Only 15 minutes available — big task shouldn't appear
    const results = getFilteredSuggestions(data, {
      now: NOW,
      availableMinutes: 15,
      energy: "energetic",
    });

    const taskResult = results.find((r) => r.type === "household-task");
    expect(taskResult).toBeUndefined();
  });

  it("filters by energy level", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({
          id: 1,
          title: "DIY task",
          estimatedMinutes: 15,
          priority: "high",
        }),
      ],
      contacts: [
        makeContact({
          id: 1,
          name: "Bob",
          lastCheckIn: null,
        }),
      ],
    };

    const results = getFilteredSuggestions(data, {
      now: NOW,
      availableMinutes: 60,
      energy: "low",
    });

    // Household tasks should be filtered out at low energy
    const taskResult = results.find((r) => r.type === "household-task");
    expect(taskResult).toBeUndefined();
  });

  it("limits to maxSuggestions", () => {
    const data: ScoringData = {
      ...emptyData(),
      contacts: Array.from({ length: 10 }, (_, i) =>
        makeContact({ id: i + 1, name: `Person ${i}`, lastCheckIn: null }),
      ),
    };

    const results = getFilteredSuggestions(data, {
      now: NOW,
      availableMinutes: 60,
      energy: "energetic",
      maxSuggestions: 3,
    });

    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns empty array when no items fit", () => {
    const data: ScoringData = {
      ...emptyData(),
      householdTasks: [
        makeHouseholdTask({ id: 1, estimatedMinutes: 120, priority: "high" }),
      ],
    };

    const results = getFilteredSuggestions(data, {
      now: NOW,
      availableMinutes: 5, // too short for anything
      energy: "energetic",
    });

    // Only the household task is a scored item, and it's 120 min, too long
    expect(results.filter((r) => r.type === "household-task")).toHaveLength(0);
  });
});
