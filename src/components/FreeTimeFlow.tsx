"use client";

import { useState, useCallback } from "react";
import type { EnergyLevel } from "@/types/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { EnergyLevel };

export interface FreeTimeInputs {
  availableMinutes: number;
  energy: EnergyLevel;
}

interface FreeTimeFlowProps {
  onComplete: (inputs: FreeTimeInputs) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Preset time options
// ---------------------------------------------------------------------------

const TIME_PRESETS = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2+ hours", minutes: 120 },
] as const;

const ENERGY_OPTIONS: { value: EnergyLevel; label: string; description: string }[] = [
  { value: "energetic", label: "Energetic", description: "Ready to tackle anything" },
  { value: "normal", label: "Normal", description: "Feeling okay" },
  { value: "low", label: "Low energy", description: "Keep it easy" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreeTimeFlow({ onComplete, onCancel }: FreeTimeFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [customMinutes, setCustomMinutes] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const resolvedMinutes = showCustom
    ? parseInt(customMinutes, 10) || null
    : selectedMinutes;

  const handleTimeSelect = useCallback((minutes: number) => {
    setSelectedMinutes(minutes);
    setShowCustom(false);
    setStep(2);
  }, []);

  const handleCustomConfirm = useCallback(() => {
    const parsed = parseInt(customMinutes, 10);
    if (parsed > 0) {
      setSelectedMinutes(parsed);
      setStep(2);
    }
  }, [customMinutes]);

  const handleEnergySelect = useCallback(
    (energy: EnergyLevel) => {
      if (resolvedMinutes && resolvedMinutes > 0) {
        onComplete({ availableMinutes: resolvedMinutes, energy });
      }
    },
    [resolvedMinutes, onComplete],
  );

  const handleSkipEnergy = useCallback(() => {
    if (resolvedMinutes && resolvedMinutes > 0) {
      onComplete({ availableMinutes: resolvedMinutes, energy: "normal" });
    }
  }, [resolvedMinutes, onComplete]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
          {step === 1 ? "How much time do you have?" : "How are you feeling?"}
        </h3>
        <button
          type="button"
          onClick={step === 1 ? onCancel : () => setStep(1)}
          className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          aria-label={step === 1 ? "Cancel" : "Back"}
        >
          {step === 1 ? "Cancel" : "Back"}
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        <div
          className={`h-1 flex-1 rounded-full ${
            step >= 1 ? "bg-indigo-600" : "bg-gray-200 dark:bg-slate-700"
          }`}
        />
        <div
          className={`h-1 flex-1 rounded-full ${
            step >= 2 ? "bg-indigo-600" : "bg-gray-200 dark:bg-slate-700"
          }`}
        />
      </div>

      {step === 1 ? (
        /* ---- Step 1: Time selection ---- */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {TIME_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                onClick={() => handleTimeSelect(preset.minutes)}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card px-4 py-4 text-center font-medium text-gray-900 dark:text-slate-100 transition-colors hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950 active:bg-indigo-100 dark:active:bg-indigo-900"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom time input */}
          {!showCustom ? (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="w-full text-center text-sm text-indigo-600 hover:text-indigo-700"
            >
              Custom time...
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="480"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                placeholder="Minutes"
                autoFocus
                className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomConfirm();
                }}
              />
              <span className="text-sm text-gray-500 dark:text-slate-400">min</span>
              <button
                type="button"
                onClick={handleCustomConfirm}
                disabled={!customMinutes || parseInt(customMinutes, 10) <= 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ---- Step 2: Energy level ---- */
        <div className="space-y-3">
          {ENERGY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleEnergySelect(option.value)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card px-4 py-4 text-left transition-colors hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950 active:bg-indigo-100 dark:active:bg-indigo-900"
            >
              <span className="text-xl" aria-hidden>
                {option.value === "energetic"
                  ? "\u26A1"
                  : option.value === "normal"
                    ? "\uD83D\uDE0A"
                    : "\uD83D\uDE34"}
              </span>
              <div>
                <p className="font-medium text-gray-900 dark:text-slate-100">{option.label}</p>
                <p className="text-sm text-gray-500 dark:text-slate-400">{option.description}</p>
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={handleSkipEnergy}
            className="w-full text-center text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          >
            Skip this step
          </button>
        </div>
      )}
    </div>
  );
}
