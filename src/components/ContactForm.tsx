"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import {
  DEFAULT_CHECK_IN_FREQUENCIES,
  TIER_LABELS,
  TIER_ORDER,
} from "@/lib/constants";
import { useLocation } from "@/hooks/useLocation";
import type { Contact, ContactTier, LocationWithLabel, SavedPlace } from "@/types/models";

interface ContactFormProps {
  /** Contact ID to edit. When undefined, the form creates a new contact. */
  contactId?: number;
  /** Called after a successful save or delete. */
  onComplete: () => void;
  /** Called when the user cancels the form. */
  onCancel: () => void;
}

export function ContactForm({ contactId, onComplete, onCancel }: ContactFormProps) {
  const isEditing = contactId != null;

  const existingContact = useLiveQuery(
    () => (contactId != null ? db.contacts.get(contactId) : undefined),
    [contactId]
  );

  const savedPlaces = useLiveQuery(
    () => db.savedPlaces.filter((p) => p.deletedAt === null).toArray(),
    []
  );

  const [name, setName] = useState("");
  const [contactLocation, setContactLocation] = useState<LocationWithLabel | null>(null);
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [tier, setTier] = useState<ContactTier>("close-friends");
  const [checkInFrequencyDays, setCheckInFrequencyDays] = useState(
    DEFAULT_CHECK_IN_FREQUENCIES["close-friends"]
  );
  const [phoneNumber, setPhoneNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [frequencyManuallySet, setFrequencyManuallySet] = useState(false);
  const { loading: locationLoading, error: locationError, permission: locationPermission, requestPosition } = useLocation();

  // Populate form when editing an existing contact
  useEffect(() => {
    if (existingContact) {
      setName(existingContact.name);
      setTier(existingContact.tier);
      setCheckInFrequencyDays(existingContact.checkInFrequencyDays);
      setPhoneNumber(existingContact.phoneNumber);
      setNotes(existingContact.notes);
      setContactLocation(existingContact.location);
      setFrequencyManuallySet(true); // Don't auto-change frequency on edit
    }
  }, [existingContact]);

  const handleTierChange = useCallback(
    (newTier: ContactTier) => {
      setTier(newTier);
      // Auto-populate frequency from tier defaults unless user already adjusted it
      if (!frequencyManuallySet) {
        setCheckInFrequencyDays(DEFAULT_CHECK_IN_FREQUENCIES[newTier]);
      }
    },
    [frequencyManuallySet]
  );

  const handleFrequencyChange = useCallback((value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setCheckInFrequencyDays(num);
      setFrequencyManuallySet(true);
    } else if (value === "") {
      // Allow clearing the field while typing
      setCheckInFrequencyDays(0);
      setFrequencyManuallySet(true);
    }
  }, []);

  const handleResetFrequency = useCallback(() => {
    setCheckInFrequencyDays(DEFAULT_CHECK_IN_FREQUENCIES[tier]);
    setFrequencyManuallySet(false);
  }, [tier]);

  const handleSetCurrentLocation = useCallback(async () => {
    const pos = await requestPosition();
    if (pos) {
      setContactLocation({ lat: pos.lat, lng: pos.lng, label: "" });
    }
  }, [requestPosition]);

  const handlePickSavedPlace = useCallback((place: SavedPlace) => {
    setContactLocation({ lat: place.lat, lng: place.lng, label: place.label });
    setShowPlacePicker(false);
  }, []);

  const handleClearLocation = useCallback(() => {
    setContactLocation(null);
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (checkInFrequencyDays < 1) {
      setError("Check-in frequency must be at least 1 day.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      if (isEditing && contactId != null) {
        await db.contacts.update(contactId, {
          name: trimmedName,
          tier,
          checkInFrequencyDays,
          phoneNumber: phoneNumber.trim(),
          notes: notes.trim(),
          location: contactLocation,
          updatedAt: now,
          deviceId,
        });
      } else {
        const newContact: Contact = {
          name: trimmedName,
          tier,
          checkInFrequencyDays,
          lastCheckIn: null,
          phoneNumber: phoneNumber.trim(),
          notes: notes.trim(),
          location: contactLocation,
          updatedAt: now,
          deviceId,
          deletedAt: null,
        };
        await db.contacts.add(newContact);
      }

      onComplete();
    } catch (err) {
      console.error("Failed to save contact:", err);
      setError("Failed to save contact. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    tier,
    checkInFrequencyDays,
    phoneNumber,
    notes,
    contactLocation,
    isEditing,
    contactId,
    onComplete,
  ]);

  const handleDelete = useCallback(async () => {
    if (contactId == null) return;

    setSaving(true);
    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      // Soft delete: set deletedAt timestamp
      await db.contacts.update(contactId, {
        deletedAt: now,
        updatedAt: now,
        deviceId,
      });

      onComplete();
    } catch (err) {
      console.error("Failed to delete contact:", err);
      setError("Failed to delete contact. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }, [contactId, onComplete]);

  // Show loading state while fetching existing contact for edit
  if (isEditing && existingContact === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500 dark:text-slate-400">Loading contact...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          {isEditing ? "Edit Contact" : "Add Contact"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mum, Dave, Sarah"
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            autoFocus
          />
        </div>

        {/* Tier */}
        <div>
          <label htmlFor="contact-tier" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Relationship Tier
          </label>
          <select
            id="contact-tier"
            value={tier}
            onChange={(e) => handleTierChange(e.target.value as ContactTier)}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-card px-3 py-2 text-gray-900 dark:text-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Check-in frequency */}
        <div>
          <label htmlFor="contact-frequency" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Check-in every
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="contact-frequency"
              type="number"
              min={1}
              value={checkInFrequencyDays || ""}
              onChange={(e) => handleFrequencyChange(e.target.value)}
              className="block w-20 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-sm text-gray-600 dark:text-slate-300">days</span>
            {frequencyManuallySet &&
              checkInFrequencyDays !== DEFAULT_CHECK_IN_FREQUENCIES[tier] && (
                <button
                  type="button"
                  onClick={handleResetFrequency}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
                >
                  Reset to default ({DEFAULT_CHECK_IN_FREQUENCIES[tier]}d)
                </button>
              )}
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            Default for {TIER_LABELS[tier]}: every{" "}
            {DEFAULT_CHECK_IN_FREQUENCIES[tier]} day
            {DEFAULT_CHECK_IN_FREQUENCIES[tier] !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Phone number */}
        <div>
          <label htmlFor="contact-phone" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Phone number <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g. 07700 900000"
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="contact-notes" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Notes <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
          </label>
          <textarea
            id="contact-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to remember..."
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
          />
        </div>

        {/* Their place */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Their place <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
          </label>
          {contactLocation ? (
            <div className="mt-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-3 py-2">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400 flex-shrink-0">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="text-sm text-green-800 dark:text-green-300">
                  {contactLocation.label || `${contactLocation.lat.toFixed(4)}, ${contactLocation.lng.toFixed(4)}`}
                </span>
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="ml-auto text-xs text-green-600 dark:text-green-400 hover:text-green-800"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSetCurrentLocation}
                disabled={locationLoading || locationPermission === "unavailable"}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600 disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {locationLoading ? "Getting..." : "Set to current location"}
              </button>
              {savedPlaces && savedPlaces.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPlacePicker(!showPlacePicker)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Pick from saved places
                </button>
              )}
            </div>
          )}
          {locationError && (
            <p className="mt-1 text-xs text-amber-600">{locationError}</p>
          )}
          {showPlacePicker && savedPlaces && savedPlaces.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card">
              {savedPlaces.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => handlePickSavedPlace(place)}
                  className="flex w-full items-center gap-2 border-b border-gray-100 dark:border-slate-700 px-3 py-2 text-left text-sm text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 last:border-b-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500 flex-shrink-0">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {place.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Contact"}
        </button>

        {isEditing && !showDeleteConfirm && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-lg border border-red-200 dark:border-red-800 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950 active:bg-red-100"
          >
            Delete Contact
          </button>
        )}

        {isEditing && showDeleteConfirm && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">
              Are you sure you want to delete this contact? This can be undone via sync.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
