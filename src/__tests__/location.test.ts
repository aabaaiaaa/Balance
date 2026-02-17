/**
 * Unit tests for the location utility module (lib/location.ts).
 *
 * Tests cover:
 * - Haversine distance calculation with known GPS coordinates
 * - Radius matching (point inside, outside, on boundary)
 * - Overlapping zone detection (multiple matches)
 * - Edge cases: identical points, antipodal points, poles, date line
 */

import {
  calculateDistance,
  isWithinRadius,
  findNearbyPlaces,
} from "@/lib/location";

// ---------------------------------------------------------------------------
// Known reference distances (verified against external calculators)
// ---------------------------------------------------------------------------

// London (51.5074° N, 0.1278° W) → Paris (48.8566° N, 2.3522° E) ≈ 343.5 km
const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 };
const LONDON_TO_PARIS_KM = 343.5;

// New York (40.7128° N, 74.0060° W) → Los Angeles (34.0522° N, 118.2437° W) ≈ 3944 km
const NEW_YORK = { lat: 40.7128, lng: -74.006 };
const LOS_ANGELES = { lat: 34.0522, lng: -118.2437 };
const NY_TO_LA_KM = 3944;

// Sydney (33.8688° S, 151.2093° E) → Tokyo (35.6762° N, 139.6503° E) ≈ 7823 km
const SYDNEY = { lat: -33.8688, lng: 151.2093 };
const TOKYO = { lat: 35.6762, lng: 139.6503 };
const SYDNEY_TO_TOKYO_KM = 7823;

// ---------------------------------------------------------------------------
// calculateDistance
// ---------------------------------------------------------------------------

describe("calculateDistance", () => {
  it("returns 0 for identical points", () => {
    const d = calculateDistance(51.5074, -0.1278, 51.5074, -0.1278);
    expect(d).toBe(0);
  });

  it("calculates London → Paris correctly (≈343.5 km)", () => {
    const d = calculateDistance(
      LONDON.lat, LONDON.lng,
      PARIS.lat, PARIS.lng,
    );
    // Allow 1% tolerance for Haversine vs real-world variations
    expect(d / 1000).toBeCloseTo(LONDON_TO_PARIS_KM, 0);
  });

  it("calculates New York → Los Angeles correctly (≈3944 km)", () => {
    const d = calculateDistance(
      NEW_YORK.lat, NEW_YORK.lng,
      LOS_ANGELES.lat, LOS_ANGELES.lng,
    );
    expect(d / 1000).toBeCloseTo(NY_TO_LA_KM, -2); // within 100 km
  });

  it("calculates Sydney → Tokyo correctly (≈7823 km)", () => {
    const d = calculateDistance(
      SYDNEY.lat, SYDNEY.lng,
      TOKYO.lat, TOKYO.lng,
    );
    expect(d / 1000).toBeCloseTo(SYDNEY_TO_TOKYO_KM, -2);
  });

  it("is symmetric — distance(A, B) === distance(B, A)", () => {
    const d1 = calculateDistance(
      LONDON.lat, LONDON.lng,
      PARIS.lat, PARIS.lng,
    );
    const d2 = calculateDistance(
      PARIS.lat, PARIS.lng,
      LONDON.lat, LONDON.lng,
    );
    expect(d1).toBeCloseTo(d2, 5);
  });

  it("handles crossing the prime meridian", () => {
    // Point just west of 0° → point just east of 0°
    const d = calculateDistance(51.5, -0.01, 51.5, 0.01);
    // ~1.37 km apart
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(2000);
  });

  it("handles crossing the date line (180° meridian)", () => {
    // Point at 179.9° → point at -179.9° (should be ~22 km at equator)
    const d = calculateDistance(0, 179.9, 0, -179.9);
    // These are 0.2° apart at the equator ≈ 22 km
    expect(d / 1000).toBeCloseTo(22.2, 0);
  });

  it("handles points at the poles", () => {
    // North pole to south pole ≈ 20,015 km (half circumference)
    const d = calculateDistance(90, 0, -90, 0);
    expect(d / 1000).toBeCloseTo(20015, -2);
  });

  it("handles very short distances (metres apart)", () => {
    // Two points ~100m apart (same street)
    const d = calculateDistance(51.5074, -0.1278, 51.5083, -0.1278);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });

  it("handles equatorial points", () => {
    // 1 degree of longitude at the equator ≈ 111.32 km
    const d = calculateDistance(0, 0, 0, 1);
    expect(d / 1000).toBeCloseTo(111.32, 0);
  });
});

// ---------------------------------------------------------------------------
// isWithinRadius
// ---------------------------------------------------------------------------

describe("isWithinRadius", () => {
  const HOME = { lat: 51.5074, lng: -0.1278, radius: 200 }; // 200m radius

  it("returns true for a point inside the radius", () => {
    // ~50m away
    const result = isWithinRadius(51.5078, -0.1278, HOME);
    expect(result).toBe(true);
  });

  it("returns true for the exact centre point", () => {
    const result = isWithinRadius(51.5074, -0.1278, HOME);
    expect(result).toBe(true);
  });

  it("returns false for a point outside the radius", () => {
    // ~500m away
    const result = isWithinRadius(51.512, -0.1278, HOME);
    expect(result).toBe(false);
  });

  it("handles large radius (city-wide — 10km)", () => {
    const cityWide = { lat: 51.5074, lng: -0.1278, radius: 10_000 };
    // ~5 km away
    const result = isWithinRadius(51.55, -0.1278, cityWide);
    expect(result).toBe(true);
  });

  it("returns false for a distant point", () => {
    // Paris is ~343 km away, radius is 200m
    const result = isWithinRadius(PARIS.lat, PARIS.lng, HOME);
    expect(result).toBe(false);
  });

  it("handles zero radius (exact match only)", () => {
    const zeroRadius = { lat: 51.5074, lng: -0.1278, radius: 0 };
    expect(isWithinRadius(51.5074, -0.1278, zeroRadius)).toBe(true);
    expect(isWithinRadius(51.5075, -0.1278, zeroRadius)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findNearbyPlaces
// ---------------------------------------------------------------------------

describe("findNearbyPlaces", () => {
  // Central London: three nearby places with overlapping zones
  const GYM = {
    id: 1,
    label: "The Gym",
    lat: 51.5074,
    lng: -0.1278,
    radius: 200,
    linkedContactIds: [],
    linkedLifeAreaIds: ["1"],
    lastVisited: null,
    visitCount: 0,
    updatedAt: 1000,
    deviceId: "d1",
    deletedAt: null,
  };

  const CAFE = {
    id: 2,
    label: "Costa Coffee",
    lat: 51.5076,
    lng: -0.1275,
    radius: 150,
    linkedContactIds: [],
    linkedLifeAreaIds: ["4"],
    lastVisited: null,
    visitCount: 0,
    updatedAt: 1000,
    deviceId: "d1",
    deletedAt: null,
  };

  const MUMS_HOUSE = {
    id: 3,
    label: "Mum's house",
    lat: 51.52,
    lng: -0.13,
    radius: 100,
    linkedContactIds: ["1"],
    linkedLifeAreaIds: [],
    lastVisited: null,
    visitCount: 0,
    updatedAt: 1000,
    deviceId: "d1",
    deletedAt: null,
  };

  const allPlaces = [GYM, CAFE, MUMS_HOUSE];

  it("returns empty array when no places are nearby", () => {
    // User is in Paris
    const matches = findNearbyPlaces(PARIS.lat, PARIS.lng, allPlaces);
    expect(matches).toHaveLength(0);
  });

  it("returns a single match when near one place only", () => {
    // User is near Mum's house (within 100m)
    const matches = findNearbyPlaces(51.5201, -0.1301, allPlaces);
    expect(matches).toHaveLength(1);
    expect(matches[0].label).toBe("Mum's house");
  });

  it("returns multiple matches for overlapping zones", () => {
    // User is between the gym and cafe (both within radius)
    const matches = findNearbyPlaces(51.5075, -0.12765, allPlaces);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const labels = matches.map((m) => m.label);
    expect(labels).toContain("The Gym");
    expect(labels).toContain("Costa Coffee");
  });

  it("returns all matches when position is within all zones", () => {
    // Construct places that all overlap at a single point
    const overlapping = [
      { lat: 0, lng: 0, radius: 1000 },
      { lat: 0, lng: 0, radius: 500 },
      { lat: 0, lng: 0, radius: 200 },
    ];
    const matches = findNearbyPlaces(0, 0, overlapping);
    expect(matches).toHaveLength(3);
  });

  it("returns empty array when places list is empty", () => {
    const matches = findNearbyPlaces(51.5074, -0.1278, []);
    expect(matches).toHaveLength(0);
  });

  it("preserves the full place object in results", () => {
    const matches = findNearbyPlaces(51.5074, -0.1278, allPlaces);
    const gym = matches.find((m) => m.label === "The Gym");
    expect(gym).toBeDefined();
    expect(gym!.id).toBe(1);
    expect(gym!.linkedLifeAreaIds).toEqual(["1"]);
  });

  it("distinguishes point just inside vs just outside radius", () => {
    // Place with exact 100m radius
    const place = { lat: 0, lng: 0, radius: 100 };

    // Point ~90m away (within 100m)
    const inside = findNearbyPlaces(0.0008, 0, [place]);
    expect(inside).toHaveLength(1);

    // Point ~150m away (outside 100m)
    const outside = findNearbyPlaces(0.0014, 0, [place]);
    expect(outside).toHaveLength(0);
  });
});
