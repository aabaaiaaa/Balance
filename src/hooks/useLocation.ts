"use client";

import { useState, useCallback } from "react";

export interface LocationPosition {
  lat: number;
  lng: number;
}

export type LocationPermission = "prompt" | "granted" | "denied" | "unavailable";

interface UseLocationReturn {
  /** Current position, or null if not yet fetched. */
  position: LocationPosition | null;
  /** Whether a location fetch is in progress. */
  loading: boolean;
  /** Error message if the fetch failed. */
  error: string | null;
  /** Current permission state. */
  permission: LocationPermission;
  /** Request the current position from the browser Geolocation API. */
  requestPosition: () => Promise<LocationPosition | null>;
}

/**
 * Hook that wraps the browser Geolocation API.
 *
 * Requests permission and returns the current position on demand.
 * Handles permission gracefully — if denied or unavailable, returns
 * a clear error and everything else still works.
 */
export function useLocation(): UseLocationReturn {
  const [position, setPosition] = useState<LocationPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<LocationPermission>(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return "unavailable";
    }
    return "prompt";
  });

  const requestPosition = useCallback(async (): Promise<LocationPosition | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unavailable");
      setError("Location is not available in this browser.");
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // Accept cached positions up to 1 minute old
        });
      });

      const loc: LocationPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      setPosition(loc);
      setPermission("granted");
      setLoading(false);
      return loc;
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      setLoading(false);

      if (geoErr.code === geoErr.PERMISSION_DENIED) {
        setPermission("denied");
        setError("Location permission was denied. You can enable it in your browser settings.");
      } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE) {
        setError("Your location could not be determined. Please try again.");
      } else if (geoErr.code === geoErr.TIMEOUT) {
        setError("Location request timed out. Please try again.");
      } else {
        setError("Failed to get your location.");
      }
      return null;
    }
  }, []);

  return { position, loading, error, permission, requestPosition };
}
