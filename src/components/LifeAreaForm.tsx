"use client";

import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { DEFAULT_LIFE_AREAS } from "@/lib/constants";
import { LifeAreaIcon } from "@/components/LifeAreaIcon";
import type { LifeArea } from "@/types/models";

const AVAILABLE_ICONS = [
  { value: "heart", label: "Heart" },
  { value: "wrench", label: "Wrench" },
  { value: "users", label: "People" },
  { value: "message-circle", label: "Chat" },
  { value: "target", label: "Target" },
] as const;

/** Names of default life areas that cannot be deleted. */
const DEFAULT_AREA_NAMES = new Set<string>(DEFAULT_LIFE_AREAS.map((a) => a.name));

interface LifeAreaFormProps {
  /** Life area ID to edit. When undefined, the form creates a new area. */
  lifeAreaId?: number;
  /** Called after a successful save or delete. */
  onComplete: () => void;
  /** Called when the user cancels the form. */
  onCancel: () => void;
}

export function LifeAreaForm({ lifeAreaId, onComplete, onCancel }: LifeAreaFormProps) {
  const isEditing = lifeAreaId != null;

  const existingArea = useLiveQuery(
    () => (lifeAreaId != null ? db.lifeAreas.get(lifeAreaId) : undefined),
    [lifeAreaId]
  );

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("heart");
  const [targetHoursPerWeek, setTargetHoursPerWeek] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isDefaultArea = isEditing && existingArea ? DEFAULT_AREA_NAMES.has(existingArea.name) : false;

  // Populate form when editing
  useEffect(() => {
    if (existingArea) {
      setName(existingArea.name);
      setIcon(existingArea.icon);
      setTargetHoursPerWeek(existingArea.targetHoursPerWeek);
    }
  }, [existingArea]);

  const handleTargetChange = useCallback((value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      setTargetHoursPerWeek(num);
    } else if (value === "") {
      setTargetHoursPerWeek(0);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (targetHoursPerWeek < 0) {
      setError("Target hours must be 0 or more.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      if (isEditing && lifeAreaId != null) {
        const updateData: Partial<LifeArea> = {
          targetHoursPerWeek,
          updatedAt: now,
          deviceId,
        };
        // Only allow name/icon changes for non-default areas
        if (!isDefaultArea) {
          updateData.name = trimmedName;
          updateData.icon = icon;
        }
        await db.lifeAreas.update(lifeAreaId, updateData);
      } else {
        const newArea: LifeArea = {
          name: trimmedName,
          icon,
          targetHoursPerWeek,
          updatedAt: now,
          deviceId,
          deletedAt: null,
        };
        await db.lifeAreas.add(newArea);
      }

      onComplete();
    } catch (err) {
      console.error("Failed to save life area:", err);
      setError("Failed to save life area. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [name, icon, targetHoursPerWeek, isEditing, isDefaultArea, lifeAreaId, onComplete]);

  const handleDelete = useCallback(async () => {
    if (lifeAreaId == null) return;

    setSaving(true);
    try {
      const prefs = await db.userPreferences.get("prefs");
      const deviceId = prefs?.deviceId ?? "unknown";
      const now = Date.now();

      await db.lifeAreas.update(lifeAreaId, {
        deletedAt: now,
        updatedAt: now,
        deviceId,
      });

      onComplete();
    } catch (err) {
      console.error("Failed to delete life area:", err);
      setError("Failed to delete life area. Please try again.");
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }, [lifeAreaId, onComplete]);

  // Loading state while fetching existing area for edit
  if (isEditing && existingArea === undefined) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-gray-500 dark:text-slate-400">Loading life area...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          {isEditing ? "Edit Life Area" : "Add Life Area"}
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
        <div className="rounded-lg bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="area-name" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Name <span className="text-red-500 dark:text-red-400">*</span>
          </label>
          {isDefaultArea ? (
            <div className="mt-1">
              <p className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-surface px-3 py-2 text-gray-700 dark:text-slate-300">
                {name}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                Default area names cannot be changed.
              </p>
            </div>
          ) : (
            <input
              id="area-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fitness, Reading, Hobbies"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              autoFocus
            />
          )}
        </div>

        {/* Icon */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Icon
          </label>
          {isDefaultArea ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">
                <LifeAreaIcon icon={icon} size={20} />
              </div>
              <span className="text-xs text-gray-400 dark:text-slate-500">Default area icons cannot be changed.</span>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {AVAILABLE_ICONS.map((ic) => (
                <button
                  key={ic.value}
                  type="button"
                  onClick={() => setIcon(ic.value)}
                  className={`flex h-12 w-12 items-center justify-center rounded-lg border-2 transition-colors ${
                    icon === ic.value
                      ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400"
                      : "border-gray-200 dark:border-slate-700 bg-white dark:bg-card text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600"
                  }`}
                  aria-label={ic.label}
                  title={ic.label}
                >
                  <LifeAreaIcon icon={ic.value} size={20} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Target hours per week */}
        <div>
          <label htmlFor="area-target" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
            Target hours per week
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="area-target"
              type="number"
              min={0}
              step={0.5}
              value={targetHoursPerWeek || ""}
              onChange={(e) => handleTargetChange(e.target.value)}
              className="block w-24 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 bg-white dark:bg-card focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-sm text-gray-600 dark:text-slate-300">hours</span>
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            How many hours per week you want to spend on this area.
          </p>
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
          {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Life Area"}
        </button>

        {isEditing && !isDefaultArea && !showDeleteConfirm && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded-lg border border-red-200 dark:border-red-800 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950 active:bg-red-100 dark:active:bg-red-900"
          >
            Delete Life Area
          </button>
        )}

        {isEditing && !isDefaultArea && showDeleteConfirm && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
            <p className="text-sm text-red-700 dark:text-red-300">
              Are you sure you want to delete this life area? Any logged activities will remain but won&apos;t be associated with an area.
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
