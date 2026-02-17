"use client";

import { useEffect, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { seedDatabase } from "@/lib/seed";
import { OnboardingFlow } from "@/components/OnboardingFlow";

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

  // Seed the database on first mount
  useEffect(() => {
    seedDatabase()
      .then(() => setSeeded(true))
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
