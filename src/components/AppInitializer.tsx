"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { seedDatabase } from "@/lib/seed";

// Lazy-load the OnboardingFlow — it's only shown once on first launch
const OnboardingFlow = dynamic(
  () => import("@/components/OnboardingFlow").then((m) => ({ default: m.OnboardingFlow })),
  { loading: () => <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-gray-400">Loading...</p></div> }
);

interface AppInitializerProps {
  children: React.ReactNode;
}

/**
 * Wraps the app content and handles:
 * 1. Database seeding on first launch
 * 2. Showing the onboarding flow when `onboardingComplete` is false
 *
 * Once onboarding is complete, it renders children (the normal app).
 */
export function AppInitializer({ children }: AppInitializerProps) {
  const [seeded, setSeeded] = useState(false);

  // Seed the database on first mount and clean up expired snoozed items
  useEffect(() => {
    seedDatabase()
      .then(async () => {
        // Clean up expired SnoozedItem records on app open
        const now = Date.now();
        await db.snoozedItems
          .where("snoozedUntil")
          .below(now)
          .delete();
        setSeeded(true);
      })
      .catch((err) => {
        console.error("Failed to seed database:", err);
        setSeeded(true); // Continue anyway so the app doesn't get stuck
      });
  }, []);

  // Watch the onboarding flag reactively
  const prefs = useLiveQuery(
    () => (seeded ? db.userPreferences.get("prefs") : undefined),
    [seeded],
  );

  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingDismissed(true);
  }, []);

  // Still loading — show nothing to avoid flash
  if (!seeded || prefs === undefined) {
    return null;
  }

  // Onboarding not complete — show the flow (without header/nav)
  if (!prefs.onboardingComplete && !onboardingDismissed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  // Normal app
  return <>{children}</>;
}
