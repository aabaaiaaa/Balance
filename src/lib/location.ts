/**
 * Location utility functions for distance calculation and proximity matching.
 *
 * Uses the Haversine formula to calculate distances between GPS coordinates.
 * All distance calculations work offline — no external APIs needed.
 */

import type { SavedPlace } from "@/types/models";

/** Earth's mean radius in metres. */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Calculate the great-circle distance between two GPS coordinates
 * using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 (degrees).
 * @param lng1 Longitude of point 1 (degrees).
 * @param lat2 Latitude of point 2 (degrees).
 * @param lng2 Longitude of point 2 (degrees).
 * @returns Distance in metres.
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Check whether a GPS position is within a saved place's radius.
 *
 * @param lat  Current latitude (degrees).
 * @param lng  Current longitude (degrees).
 * @param place The saved place to check against.
 * @returns `true` if the position is within the place's radius.
 */
export function isWithinRadius(
  lat: number,
  lng: number,
  place: Pick<SavedPlace, "lat" | "lng" | "radius">,
): boolean {
  const distance = calculateDistance(lat, lng, place.lat, place.lng);
  return distance <= place.radius;
}

/**
 * Find all saved places whose radius contains the given GPS position.
 *
 * @param lat    Current latitude (degrees).
 * @param lng    Current longitude (degrees).
 * @param places Array of saved places to check.
 * @returns Array of matching places (may be empty).
 */
export function findNearbyPlaces<T extends Pick<SavedPlace, "lat" | "lng" | "radius">>(
  lat: number,
  lng: number,
  places: T[],
): T[] {
  return places.filter((place) => isWithinRadius(lat, lng, place));
}

/**
 * Find the label of the nearest saved place that contains the given position.
 *
 * If the position falls within multiple places, returns the closest one.
 * Returns null if no saved place matches.
 */
export function findPlaceLabel(
  lat: number,
  lng: number,
  places: Pick<SavedPlace, "lat" | "lng" | "radius" | "label">[],
): string | null {
  let nearest: { label: string; distance: number } | null = null;

  for (const place of places) {
    const distance = calculateDistance(lat, lng, place.lat, place.lng);
    if (distance <= place.radius) {
      if (!nearest || distance < nearest.distance) {
        nearest = { label: place.label, distance };
      }
    }
  }

  return nearest?.label ?? null;
}
