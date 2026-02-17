"use client";

import { useState, useCallback } from "react";
import { db } from "@/lib/db";
import {
  DEFAULT_CHECK_IN_FREQUENCIES,
  TIER_LABELS,
  TIER_ORDER,
} from "@/lib/constants";
import { useTheme } from "@/components/ThemeProvider";
import { useLiveQuery } from "dexie-react-hooks";
import type { Contact, ContactTier, LifeArea, Theme, WeekStartDay } from "@/types/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingContact {
  name: string;
  tier: ContactTier;
  checkInFrequencyDays: number;
}

interface OnboardingFlowProps {
  onComplete: () => void;
}

const TOTAL_STEPS = 6;

// ---------------------------------------------------------------------------
// Step 1: Welcome
// ---------------------------------------------------------------------------

function WelcomeStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-indigo-600"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
          <path d="M2 12h20" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">Welcome to Balance</h2>
      <p className="mt-3 max-w-sm text-sm text-gray-500">
        Balance helps you stay intentionally connected with the people who
        matter, take care of yourself, and make the most of your free time.
      </p>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Let&apos;s set things up in a few quick steps.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="mt-8 w-full max-w-xs rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
      >
        Get Started
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="mt-3 text-sm text-gray-400 transition-colors hover:text-gray-600"
      >
        Skip setup
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Add Contacts
// ---------------------------------------------------------------------------

function AddContactsStep({
  onNext,
  onSkip,
  onBack,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [contacts, setContacts] = useState<OnboardingContact[]>([]);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<ContactTier>("close-family");
  const [frequency, setFrequency] = useState(DEFAULT_CHECK_IN_FREQUENCIES["close-family"]);
  const [frequencyManual, setFrequencyManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTierChange = useCallback(
    (newTier: ContactTier) => {
      setTier(newTier);
      if (!frequencyManual) {
        setFrequency(DEFAULT_CHECK_IN_FREQUENCIES[newTier]);
      }
    },
    [frequencyManual],
  );

  const handleAddContact = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (frequency < 1) {
      setError("Frequency must be at least 1 day.");
      return;
    }
    setError(null);
    setContacts((prev) => [
      ...prev,
      { name: trimmed, tier, checkInFrequencyDays: frequency },
    ]);
    setName("");
    setTier("close-family");
    setFrequency(DEFAULT_CHECK_IN_FREQUENCIES["close-family"]);
    setFrequencyManual(false);
  }, [name, tier, frequency]);

  const handleRemoveContact = useCallback((index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveAndContinue = useCallback(async () => {
    if (contacts.length === 0) {
      onNext();
      return;
    }
    setSaving(true);
    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      const newContacts: Contact[] = contacts.map((c) => ({
        name: c.name,
        tier: c.tier,
        checkInFrequencyDays: c.checkInFrequencyDays,
        lastCheckIn: null,
        phoneNumber: "",
        notes: "",
        location: null,
        updatedAt: now,
        deviceId,
        deletedAt: null,
      }));

      await db.contacts.bulkAdd(newContacts);
      onNext();
    } catch (err) {
      console.error("Failed to save contacts:", err);
      setError("Failed to save contacts. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [contacts, onNext]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Add your important people</h2>
        <p className="mt-1 text-sm text-gray-500">
          Who do you want to stay in touch with? Add 3-5 key contacts to get started.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Added contacts list */}
      {contacts.length > 0 && (
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">
                  {TIER_LABELS[c.tier]} &middot; every {c.checkInFrequencyDays}d
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveContact(i)}
                className="ml-2 text-xs text-gray-400 transition-colors hover:text-red-500"
                aria-label={`Remove ${c.name}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add contact form */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label htmlFor="onboarding-contact-name" className="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="onboarding-contact-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mum, Dave, Sarah"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddContact();
              }
            }}
          />
        </div>

        <div>
          <label htmlFor="onboarding-contact-tier" className="block text-sm font-medium text-gray-700">
            Relationship
          </label>
          <select
            id="onboarding-contact-tier"
            value={tier}
            onChange={(e) => handleTierChange(e.target.value as ContactTier)}
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="onboarding-contact-freq" className="block text-sm font-medium text-gray-700">
            Check-in every
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="onboarding-contact-freq"
              type="number"
              min={1}
              value={frequency || ""}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && num > 0) {
                  setFrequency(num);
                  setFrequencyManual(true);
                } else if (e.target.value === "") {
                  setFrequency(0);
                  setFrequencyManual(true);
                }
              }}
              className="block w-20 rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-sm text-gray-600">days</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddContact}
          className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 active:bg-indigo-200"
        >
          + Add Contact
        </button>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSaveAndContinue}
          disabled={saving}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : contacts.length > 0
              ? `Continue (${contacts.length} added)`
              : "Continue"}
        </button>
      </div>
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          Skip this step
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Balance Targets
// ---------------------------------------------------------------------------

function BalanceTargetsStep({
  onNext,
  onSkip,
  onBack,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const lifeAreas = useLiveQuery(
    () => db.lifeAreas.filter((a) => a.deletedAt === null).toArray(),
    [],
  );
  const [saving, setSaving] = useState(false);
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);

  const getTarget = (area: LifeArea): number => {
    if (area.id != null && targets[area.id] !== undefined) {
      return targets[area.id];
    }
    return area.targetHoursPerWeek;
  };

  const handleTargetChange = useCallback((areaId: number, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setTargets((prev) => ({ ...prev, [areaId]: num }));
    } else if (value === "") {
      setTargets((prev) => ({ ...prev, [areaId]: 0 }));
    }
  }, []);

  const handleSaveAndContinue = useCallback(async () => {
    const entries = Object.entries(targets);
    if (entries.length === 0) {
      onNext();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      for (const [idStr, hours] of entries) {
        const id = parseInt(idStr, 10);
        await db.lifeAreas.update(id, {
          targetHoursPerWeek: hours,
          updatedAt: now,
          deviceId,
        });
      }
      onNext();
    } catch (err) {
      console.error("Failed to save targets:", err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [targets, onNext]);

  const areaIcons: Record<string, React.ReactNode> = {
    heart: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-pink-500">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    wrench: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    users: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-purple-500">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    "message-circle": (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    target: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  };

  if (lifeAreas === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-400">Loading life areas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Set your balance targets</h2>
        <p className="mt-1 text-sm text-gray-500">
          How many hours per week do you want to spend on each area? You can always
          change these later.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        {lifeAreas.map((area) => (
          <div
            key={area.id}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100">
              {areaIcons[area.icon] ?? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{area.name}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                step={0.5}
                value={getTarget(area)}
                onChange={(e) => area.id != null && handleTargetChange(area.id, e.target.value)}
                className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                aria-label={`Hours per week for ${area.name}`}
              />
              <span className="text-xs text-gray-500">h/wk</span>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSaveAndContinue}
          disabled={saving}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          Skip this step
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Week Start Day
// ---------------------------------------------------------------------------

function WeekStartDayStep({
  onNext,
  onSkip,
  onBack,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [day, setDay] = useState<WeekStartDay>("monday");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await db.userPreferences.update("prefs", { weekStartDay: day });
      onNext();
    } catch (err) {
      console.error("Failed to save week start day:", err);
    } finally {
      setSaving(false);
    }
  }, [day, onNext]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Choose your week start day</h2>
        <p className="mt-1 text-sm text-gray-500">
          When does your week begin? This affects weekly balance targets and summaries.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setDay("monday")}
          className={`flex-1 rounded-xl border-2 px-4 py-6 text-center transition-colors ${
            day === "monday"
              ? "border-indigo-600 bg-indigo-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className={`text-lg font-semibold ${day === "monday" ? "text-indigo-700" : "text-gray-900"}`}>
            Monday
          </p>
          <p className="mt-1 text-xs text-gray-500">Most common</p>
        </button>
        <button
          type="button"
          onClick={() => setDay("sunday")}
          className={`flex-1 rounded-xl border-2 px-4 py-6 text-center transition-colors ${
            day === "sunday"
              ? "border-indigo-600 bg-indigo-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className={`text-lg font-semibold ${day === "sunday" ? "text-indigo-700" : "text-gray-900"}`}>
            Sunday
          </p>
          <p className="mt-1 text-xs text-gray-500">US standard</p>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          Skip this step
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Theme Selection
// ---------------------------------------------------------------------------

function ThemeStep({
  onNext,
  onSkip,
  onBack,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { theme, setTheme } = useTheme();

  const themeOptions: { value: Theme; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: "light",
      label: "Light",
      description: "Always use light mode",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Dark",
      description: "Always use dark mode",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
    },
    {
      value: "system",
      label: "System",
      description: "Match your device settings",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Choose your theme</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick a look that suits you. The preview updates live as you tap.
        </p>
      </div>

      <div className="space-y-3">
        {themeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={`flex w-full items-center gap-4 rounded-xl border-2 px-4 py-4 text-left transition-colors ${
              theme === opt.value
                ? "border-indigo-600 bg-indigo-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                theme === opt.value
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {opt.icon}
            </div>
            <div>
              <p className={`text-sm font-semibold ${theme === opt.value ? "text-indigo-700" : "text-gray-900"}`}>
                {opt.label}
              </p>
              <p className="text-xs text-gray-500">{opt.description}</p>
            </div>
            {theme === opt.value && (
              <div className="ml-auto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
        >
          Continue
        </button>
      </div>
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          Skip this step
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6: All Set
// ---------------------------------------------------------------------------

function AllSetStep({
  onFinish,
  onBack,
}: {
  onFinish: () => void;
  onBack: () => void;
}) {
  const [finishing, setFinishing] = useState(false);

  const handleFinish = useCallback(async () => {
    setFinishing(true);
    try {
      await db.userPreferences.update("prefs", { onboardingComplete: true });
      onFinish();
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
    } finally {
      setFinishing(false);
    }
  }, [onFinish]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-green-600"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">You&apos;re all set!</h2>
      <p className="mt-3 max-w-sm text-sm text-gray-500">
        Your Balance app is ready. You can always update your contacts, life areas,
        and preferences from the app.
      </p>
      <button
        type="button"
        onClick={handleFinish}
        disabled={finishing}
        className="mt-8 w-full max-w-xs rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
      >
        {finishing ? "Loading..." : "Go to Dashboard"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-3 text-sm text-gray-400 transition-colors hover:text-gray-600"
      >
        Go back
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === current
              ? "w-6 bg-indigo-600"
              : i < current
                ? "w-1.5 bg-indigo-300"
                : "w-1.5 bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main OnboardingFlow
// ---------------------------------------------------------------------------

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);

  const handleSkipAll = useCallback(async () => {
    await db.userPreferences.update("prefs", { onboardingComplete: true });
    onComplete();
  }, [onComplete]);

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <StepIndicator current={step} total={TOTAL_STEPS} />

      {step === 0 && <WelcomeStep onNext={goNext} onSkip={handleSkipAll} />}
      {step === 1 && <AddContactsStep onNext={goNext} onSkip={goNext} onBack={goBack} />}
      {step === 2 && <BalanceTargetsStep onNext={goNext} onSkip={goNext} onBack={goBack} />}
      {step === 3 && <WeekStartDayStep onNext={goNext} onSkip={goNext} onBack={goBack} />}
      {step === 4 && <ThemeStep onNext={goNext} onSkip={goNext} onBack={goBack} />}
      {step === 5 && <AllSetStep onFinish={onComplete} onBack={goBack} />}
    </div>
  );
}
