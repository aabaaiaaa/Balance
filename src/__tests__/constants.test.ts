import {
  DEFAULT_CHECK_IN_FREQUENCIES,
  TIER_LABELS,
  TIER_ORDER,
  DEFAULT_LIFE_AREAS,
  DEFAULT_DATE_NIGHT_FREQUENCY_DAYS,
  DEFAULT_PLACE_RADIUS_METRES,
} from "@/lib/constants";

describe("constants", () => {
  describe("DEFAULT_CHECK_IN_FREQUENCIES", () => {
    it("defines frequencies for all tiers", () => {
      expect(DEFAULT_CHECK_IN_FREQUENCIES).toEqual({
        partner: 1,
        "close-family": 7,
        "extended-family": 21,
        "close-friends": 14,
        "wider-friends": 30,
      });
    });

    it("has partner as the most frequent", () => {
      const values = Object.values(DEFAULT_CHECK_IN_FREQUENCIES);
      expect(Math.min(...values)).toBe(DEFAULT_CHECK_IN_FREQUENCIES.partner);
    });
  });

  describe("TIER_LABELS", () => {
    it("provides human-readable labels for all tiers", () => {
      expect(TIER_LABELS.partner).toBe("Partner");
      expect(TIER_LABELS["close-family"]).toBe("Close Family");
      expect(TIER_LABELS["extended-family"]).toBe("Extended Family");
      expect(TIER_LABELS["close-friends"]).toBe("Close Friends");
      expect(TIER_LABELS["wider-friends"]).toBe("Wider Friends");
    });
  });

  describe("TIER_ORDER", () => {
    it("lists tiers from closest to widest", () => {
      expect(TIER_ORDER).toEqual([
        "partner",
        "close-family",
        "extended-family",
        "close-friends",
        "wider-friends",
      ]);
    });

    it("has the same tiers as DEFAULT_CHECK_IN_FREQUENCIES", () => {
      const frequencyTiers = Object.keys(DEFAULT_CHECK_IN_FREQUENCIES).sort();
      const orderTiers = [...TIER_ORDER].sort();
      expect(orderTiers).toEqual(frequencyTiers);
    });
  });

  describe("DEFAULT_LIFE_AREAS", () => {
    it("has five default areas", () => {
      expect(DEFAULT_LIFE_AREAS).toHaveLength(5);
    });

    it("includes the required default areas", () => {
      const names = DEFAULT_LIFE_AREAS.map((a) => a.name);
      expect(names).toContain("Self-care");
      expect(names).toContain("DIY/Household");
      expect(names).toContain("Partner Time");
      expect(names).toContain("Social");
      expect(names).toContain("Personal Goals");
    });

    it("each area has a name, icon, and targetHoursPerWeek", () => {
      for (const area of DEFAULT_LIFE_AREAS) {
        expect(area.name).toBeTruthy();
        expect(area.icon).toBeTruthy();
        expect(area.targetHoursPerWeek).toBeGreaterThan(0);
      }
    });
  });

  describe("other defaults", () => {
    it("date night frequency defaults to 14 days", () => {
      expect(DEFAULT_DATE_NIGHT_FREQUENCY_DAYS).toBe(14);
    });

    it("place radius defaults to 200 metres", () => {
      expect(DEFAULT_PLACE_RADIUS_METRES).toBe(200);
    });
  });
});
