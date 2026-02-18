"use client";

import { useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  DEFAULT_CHECK_IN_FREQUENCIES,
  DEFAULT_PLACE_RADIUS_METRES,
  TIER_LABELS,
  TIER_ORDER,
} from "@/lib/constants";
import type { ContactTier } from "@/types/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlacePurpose = "contact" | "activity" | "diy" | "just-save";

type Step =
  | { type: "name" }
  | { type: "purpose" }
  | { type: "pick-contact" }
  | { type: "new-contact" }
  | { type: "pick-area" }
  | { type: "diy-task" }
  | { type: "done" };

interface PlaceQuickCreateProps {
  /** Current GPS coordinates to save. */
  lat: number;
  lng: number;
  /** Called when the flow completes (place saved). */
  onComplete: () => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlaceQuickCreate({
  lat,
  lng,
  onComplete,
  onCancel,
}: PlaceQuickCreateProps) {
  const [step, setStep] = useState<Step>({ type: "name" });
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data for linking
  const contacts = useLiveQuery(
    () => db.contacts.filter((c) => c.deletedAt === null).toArray(),
    []
  );
  const lifeAreas = useLiveQuery(
    () => db.lifeAreas.filter((a) => a.deletedAt === null).toArray(),
    []
  );
  const householdTasks = useLiveQuery(
    () => db.householdTasks.filter((t) => t.deletedAt === null).toArray(),
    []
  );

  // New contact form state
  const [contactName, setContactName] = useState("");
  const [contactTier, setContactTier] = useState<ContactTier>("close-friends");
  const [contactPhone, setContactPhone] = useState("");

  // Activity log state
  const [logActivity, setLogActivity] = useState(false);
  const [activityDesc, setActivityDesc] = useState("");
  const [activityDuration, setActivityDuration] = useState("30");

  // DIY task state
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMinutes, setTaskMinutes] = useState("30");

  // Check if DIY/Household life area exists
  const diyArea = lifeAreas?.find(
    (a) => a.name === "DIY/Household" || a.name.toLowerCase().includes("diy")
  );

  const hasDiyTasks = householdTasks !== undefined;

  // ------ Helpers ------

  const getDeviceId = async () => {
    const prefs = await db.userPreferences.get("prefs");
    return prefs?.deviceId ?? "unknown";
  };

  const savePlaceWithLinks = useCallback(
    async (linkedContactIds: string[], linkedLifeAreaIds: string[]) => {
      const deviceId = await getDeviceId();
      const now = Date.now();

      await db.savedPlaces.add({
        label: label.trim(),
        lat,
        lng,
        radius: DEFAULT_PLACE_RADIUS_METRES,
        linkedContactIds,
        linkedLifeAreaIds,
        lastVisited: now,
        visitCount: 1,
        updatedAt: now,
        deviceId,
        deletedAt: null,
      });
    },
    [label, lat, lng]
  );

  // ------ Step: Name ------

  const handleNameNext = useCallback(() => {
    if (!label.trim()) {
      setError("Please enter a name for this place.");
      return;
    }
    setError(null);
    setStep({ type: "purpose" });
  }, [label]);

  // ------ Step: Purpose — save actions ------

  const handleJustSave = useCallback(async () => {
    setSaving(true);
    try {
      await savePlaceWithLinks([], []);
      setStep({ type: "done" });
    } catch {
      setError("Failed to save place. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [savePlaceWithLinks]);

  // ------ Contact flow ------

  const handlePickContact = useCallback(
    async (contactId: number) => {
      setSaving(true);
      try {
        const deviceId = await getDeviceId();
        const now = Date.now();

        // Save the place linked to this contact
        await savePlaceWithLinks([String(contactId)], []);

        // Also update the contact's location field
        await db.contacts.update(contactId, {
          location: { lat, lng, label: label.trim() },
          updatedAt: now,
          deviceId,
        });

        setStep({ type: "done" });
      } catch {
        setError("Failed to save. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [savePlaceWithLinks, lat, lng, label]
  );

  const handleSaveNewContact = useCallback(async () => {
    const trimmedName = contactName.trim();
    if (!trimmedName) {
      setError("Contact name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const now = Date.now();

      // Create the contact
      const newContactId = await db.contacts.add({
        name: trimmedName,
        tier: contactTier,
        checkInFrequencyDays: DEFAULT_CHECK_IN_FREQUENCIES[contactTier],
        lastCheckIn: null,
        phoneNumber: contactPhone.trim(),
        notes: "",
        location: { lat, lng, label: label.trim() },
        updatedAt: now,
        deviceId,
        deletedAt: null,
      });

      // Save the place linked to the new contact
      await savePlaceWithLinks([String(newContactId)], []);

      setStep({ type: "done" });
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [contactName, contactTier, contactPhone, lat, lng, label, savePlaceWithLinks]);

  // ------ Activity spot flow ------

  const handleSaveWithLifeArea = useCallback(
    async (areaId: number) => {
      setSaving(true);
      try {
        await savePlaceWithLinks([], [String(areaId)]);

        if (logActivity && activityDesc.trim()) {
          const deviceId = await getDeviceId();
          const now = Date.now();
          const duration = parseInt(activityDuration, 10) || 30;

          await db.activities.add({
            lifeAreaId: areaId,
            description: activityDesc.trim(),
            durationMinutes: duration,
            date: now,
            notes: "",
            location: { lat, lng },
            updatedAt: now,
            deviceId,
            deletedAt: null,
          });
        }

        setStep({ type: "done" });
      } catch {
        setError("Failed to save. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [savePlaceWithLinks, logActivity, activityDesc, activityDuration, lat, lng]
  );

  // ------ DIY/errand flow ------

  const handleSaveDiy = useCallback(async () => {
    if (!diyArea) return;

    setSaving(true);
    try {
      await savePlaceWithLinks([], [String(diyArea.id!)]);

      if (createTask && taskTitle.trim()) {
        const deviceId = await getDeviceId();
        const now = Date.now();
        const minutes = parseInt(taskMinutes, 10) || 30;

        await db.householdTasks.add({
          lifeAreaId: diyArea.id!,
          title: taskTitle.trim(),
          estimatedMinutes: minutes,
          priority: "medium",
          status: "pending",
          completedAt: null,
          updatedAt: now,
          deviceId,
          deletedAt: null,
        });
      }

      setStep({ type: "done" });
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [diyArea, savePlaceWithLinks, createTask, taskTitle, taskMinutes]);

  const handlePurposeSelect = useCallback(
    (purpose: PlacePurpose) => {
      setError(null);
      switch (purpose) {
        case "contact":
          setStep({ type: "pick-contact" });
          break;
        case "activity":
          setStep({ type: "pick-area" });
          break;
        case "diy":
          if (hasDiyTasks && diyArea) {
            setStep({ type: "diy-task" });
          } else if (diyArea) {
            // No household task support, just save linked to DIY area
            handleSaveWithLifeArea(diyArea.id!);
          }
          break;
        case "just-save":
          handleJustSave();
          break;
      }
    },
    [hasDiyTasks, diyArea, handleSaveWithLifeArea, handleJustSave]
  );

  // ======== RENDER ========

  // Done state — auto-dismiss
  if (step.type === "done") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600 dark:text-green-400"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              &ldquo;{label.trim()}&rdquo; saved!
            </p>
            <p className="text-xs text-green-700 dark:text-green-300">
              Location saved for quick logging next time
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onComplete}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        {step.type !== "name" && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (step.type === "purpose") setStep({ type: "name" });
              else if (step.type === "pick-contact" || step.type === "pick-area" || step.type === "diy-task")
                setStep({ type: "purpose" });
              else if (step.type === "new-contact") setStep({ type: "pick-contact" });
            }}
            className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
            aria-label="Go back"
          >
            &larr;
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-600 dark:text-blue-400"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Save New Place</h3>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Step 1: Name */}
      {step.type === "name" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="place-name" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
              Name this place
            </label>
            <input
              id="place-name"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNameNext();
              }}
              placeholder={'e.g. "The park", "Jo\'s house", "That nice cafe"'}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={handleNameNext}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Next
          </button>
        </div>
      )}

      {/* Step 2: Purpose */}
      {step.type === "purpose" && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
            What is &ldquo;{label.trim()}&rdquo; for?
          </p>

          <button
            type="button"
            onClick={() => handlePurposeSelect("contact")}
            disabled={saving}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Someone&apos;s place</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Link to a contact</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handlePurposeSelect("activity")}
            disabled={saving}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 dark:bg-pink-900">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-pink-600 dark:text-pink-400">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Activity spot</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Link to a life area (gym, cafe, etc.)</p>
            </div>
          </button>

          {diyArea && (
            <button
              type="button"
              onClick={() => handlePurposeSelect("diy")}
              disabled={saving}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">DIY/errand location</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {hasDiyTasks ? "Optionally add a task here" : "Link to DIY/Household"}
                </p>
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() => handlePurposeSelect("just-save")}
            disabled={saving}
            className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-gray-600 dark:text-slate-300">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Just save it</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Link it later</p>
            </div>
          </button>
        </div>
      )}

      {/* Step 3a: Pick existing contact */}
      {step.type === "pick-contact" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Whose place is this?</p>

          {contacts && contacts.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handlePickContact(contact.id!)}
                  disabled={saving}
                  className="flex w-full items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card px-3 py-2 text-left text-sm text-gray-900 dark:text-slate-100 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900 text-xs font-medium text-indigo-700 dark:text-indigo-300">
                    {contact.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{contact.name}</span>
                  <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">
                    {TIER_LABELS[contact.tier]}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setStep({ type: "new-contact" })}
            disabled={saving}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950 px-3 py-2 text-left text-sm font-medium text-indigo-700 dark:text-indigo-300 transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add new contact
          </button>
        </div>
      )}

      {/* Step 3a-ii: New contact form */}
      {step.type === "new-contact" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Add a new contact</p>

          <div>
            <label htmlFor="qc-contact-name" className="block text-xs font-medium text-gray-600 dark:text-slate-300">
              Name <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="qc-contact-name"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Jo, Mum, Dave"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="qc-contact-tier" className="block text-xs font-medium text-gray-600 dark:text-slate-300">
              Relationship
            </label>
            <select
              id="qc-contact-tier"
              value={contactTier}
              onChange={(e) => setContactTier(e.target.value as ContactTier)}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-card px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              {TIER_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="qc-contact-phone" className="block text-xs font-medium text-gray-600 dark:text-slate-300">
              Phone <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
            </label>
            <input
              id="qc-contact-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="07700 900000"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSaveNewContact}
            disabled={saving}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Contact & Place"}
          </button>
        </div>
      )}

      {/* Step 3b: Pick life area for activity spot */}
      {step.type === "pick-area" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">What kind of activity?</p>

          {lifeAreas && lifeAreas.length > 0 && (
            <div className="space-y-1">
              {lifeAreas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => {
                    if (!logActivity) {
                      handleSaveWithLifeArea(area.id!);
                    }
                  }}
                  disabled={saving || logActivity}
                  className="flex w-full items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card px-3 py-2 text-left text-sm text-gray-900 dark:text-slate-100 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <span className="text-base">{getAreaEmoji(area.name)}</span>
                  <span>{area.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-surface p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={logActivity}
                onChange={(e) => setLogActivity(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">Log an activity here now</span>
            </label>

            {logActivity && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={activityDesc}
                  onChange={(e) => setActivityDesc(e.target.value)}
                  placeholder="What are you doing?"
                  className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={activityDuration}
                    onChange={(e) => setActivityDuration(e.target.value)}
                    className="block w-20 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-500 dark:text-slate-400">minutes</span>
                </div>

                <p className="text-xs text-gray-500 dark:text-slate-400">Pick a life area above to save</p>
                {lifeAreas && lifeAreas.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {lifeAreas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => handleSaveWithLifeArea(area.id!)}
                        disabled={saving || !activityDesc.trim()}
                        className="rounded-lg bg-indigo-50 dark:bg-indigo-950 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900 disabled:opacity-50"
                      >
                        {area.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3c: DIY/errand — optional task */}
      {step.type === "diy-task" && diyArea && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Saving to DIY/Household
          </p>

          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-surface p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={createTask}
                onChange={(e) => setCreateTask(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">Add a task for this place</span>
            </label>

            {createTask && (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="What needs doing?"
                  className="block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={taskMinutes}
                    onChange={(e) => setTaskMinutes(e.target.value)}
                    className="block w-20 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-500 dark:text-slate-400">estimated minutes</span>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSaveDiy}
            disabled={saving || (createTask && !taskTitle.trim())}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : createTask ? "Save Place & Task" : "Save Place"}
          </button>
        </div>
      )}

      {/* Saving overlay */}
      {saving && step.type === "purpose" && (
        <p className="text-center text-sm text-gray-400 dark:text-slate-500">Saving...</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAreaEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("self-care") || lower.includes("selfcare")) return "\u2764\uFE0F";
  if (lower.includes("diy") || lower.includes("household")) return "\uD83D\uDD27";
  if (lower.includes("partner")) return "\uD83D\uDC91";
  if (lower.includes("social")) return "\uD83D\uDCAC";
  if (lower.includes("goal")) return "\uD83C\uDFAF";
  return "\u2B50";
}
