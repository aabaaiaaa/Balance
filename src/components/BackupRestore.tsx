"use client";

import { useState, useCallback, useRef } from "react";
import {
  buildBackup,
  downloadBackup,
  validateBackupFile,
  parseBackupSummary,
  importReplaceAll,
  importMerge,
  type BackupFile,
  type BackupSummary,
  type ImportResult,
} from "@/lib/backup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step =
  | "idle"
  | "exporting"
  | "export-done"
  | "reading-file"
  | "show-summary"
  | "confirming-replace"
  | "confirming-merge"
  | "importing"
  | "import-done"
  | "error";

/** Human-readable labels for entity types. */
const ENTITY_LABELS: Record<string, string> = {
  contacts: "Contacts",
  checkIns: "Check-ins",
  lifeAreas: "Life areas",
  activities: "Activities",
  householdTasks: "Household tasks",
  goals: "Goals",
  dateNights: "Date nights",
  dateNightIdeas: "Date night ideas",
  savedPlaces: "Saved places",
  snoozedItems: "Snoozed items",
  userPreferences: "Preferences",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BackupRestore() {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportCount, setExportCount] = useState(0);

  const backupRef = useRef<BackupFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Export ----

  const handleExport = useCallback(async () => {
    setStep("exporting");
    setError(null);
    try {
      const backup = await buildBackup();
      downloadBackup(backup);
      setExportCount(backup.totalRecords);
      setStep("export-done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setStep("error");
    }
  }, []);

  // ---- Import: file selection ----

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setStep("reading-file");
      setError(null);

      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(
            "The selected file is not valid JSON. Please select a Balance backup file."
          );
        }

        const backup = validateBackupFile(parsed);
        backupRef.current = backup;
        setSummary(parseBackupSummary(backup));
        setStep("show-summary");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read file");
        setStep("error");
      }

      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    []
  );

  // ---- Import: replace all ----

  const handleReplaceAll = useCallback(async () => {
    if (!backupRef.current) return;
    setStep("importing");
    setError(null);
    try {
      const result = await importReplaceAll(backupRef.current);
      setImportResult(result);
      setStep("import-done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("error");
    }
  }, []);

  // ---- Import: merge ----

  const handleMerge = useCallback(async () => {
    if (!backupRef.current) return;
    setStep("importing");
    setError(null);
    try {
      const result = await importMerge(backupRef.current);
      setImportResult(result);
      setStep("import-done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("error");
    }
  }, []);

  // ---- Reset ----

  const handleReset = useCallback(() => {
    setStep("idle");
    setError(null);
    setSummary(null);
    setImportResult(null);
    backupRef.current = null;
  }, []);

  // ---- Render ----

  return (
    <div className="space-y-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Idle: show export/import buttons */}
      {step === "idle" && (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Backup
            </button>
            <button
              type="button"
              onClick={handleFileSelect}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-card px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Restore from Backup
            </button>
          </div>
        </>
      )}

      {/* Exporting spinner */}
      {step === "exporting" && (
        <p className="text-sm text-gray-500 dark:text-slate-400">Preparing backup...</p>
      )}

      {/* Export done */}
      {step === "export-done" && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            Backup downloaded successfully
          </p>
          <p className="mt-1 text-xs text-green-600 dark:text-green-400">
            {exportCount} records exported.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-2 text-sm font-medium text-green-700 dark:text-green-300 transition-colors hover:text-green-800 dark:hover:text-green-200"
          >
            Done
          </button>
        </div>
      )}

      {/* Reading file */}
      {step === "reading-file" && (
        <p className="text-sm text-gray-500 dark:text-slate-400">Reading backup file...</p>
      )}

      {/* Show summary — let user choose import mode */}
      {step === "show-summary" && summary && (
        <div className="space-y-3">
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 p-3">
            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
              Backup from{" "}
              {new Date(summary.exportedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <ul className="mt-2 space-y-0.5">
              {Object.entries(summary.entities)
                .filter(([, count]) => count > 0)
                .map(([entity, count]) => (
                  <li key={entity} className="text-xs text-indigo-700 dark:text-indigo-300">
                    {count} {ENTITY_LABELS[entity] ?? entity}
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-xs font-medium text-indigo-800 dark:text-indigo-200">
              {summary.totalRecords} total records
            </p>
          </div>

          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
            How would you like to restore?
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStep("confirming-replace")}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Replace all</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                Clear existing data and import everything. Best for moving to a
                new device.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setStep("confirming-merge")}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Merge</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                Combine with existing data. Newer records win conflicts. Best
                for restoring without losing recent changes.
              </p>
            </button>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-medium text-gray-500 dark:text-slate-400 transition-colors hover:text-gray-700 dark:hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Confirm replace all */}
      {step === "confirming-replace" && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Replace all data?
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            This will permanently delete all existing data on this device and
            replace it with the backup. This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleReplaceAll}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 active:bg-amber-800"
            >
              Replace All Data
            </button>
            <button
              type="button"
              onClick={() => setStep("show-summary")}
              className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Confirm merge */}
      {step === "confirming-merge" && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Merge backup with existing data?
          </p>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
            Records from the backup will be combined with your current data.
            When both have the same record, the newer version wins.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleMerge}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
            >
              Merge Data
            </button>
            <button
              type="button"
              onClick={() => setStep("show-summary")}
              className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === "importing" && (
        <p className="text-sm text-gray-500 dark:text-slate-400">Importing data...</p>
      )}

      {/* Import done */}
      {step === "import-done" && importResult && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
          <p className="text-sm font-medium text-green-800 dark:text-green-200">
            {importResult.mode === "replace"
              ? "Data replaced successfully"
              : "Data merged successfully"}
          </p>
          <p className="mt-1 text-xs text-green-600 dark:text-green-400">
            {importResult.totalImported} records{" "}
            {importResult.mode === "replace" ? "imported" : "added or updated"}.
          </p>
          {importResult.mode === "merge" &&
            Object.keys(importResult.perEntity).length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {Object.entries(importResult.perEntity).map(
                  ([entity, result]) => {
                    const parts: string[] = [];
                    if (result.newRecords > 0)
                      parts.push(`${result.newRecords} new`);
                    if (result.remoteWins > 0)
                      parts.push(`${result.remoteWins} updated`);
                    if (result.localWins > 0)
                      parts.push(`${result.localWins} kept local`);
                    if (parts.length === 0) return null;
                    return (
                      <li key={entity} className="text-xs text-green-700 dark:text-green-300">
                        {ENTITY_LABELS[entity] ?? entity}: {parts.join(", ")}
                      </li>
                    );
                  }
                )}
              </ul>
            )}
          <button
            type="button"
            onClick={handleReset}
            className="mt-2 text-sm font-medium text-green-700 dark:text-green-300 transition-colors hover:text-green-800 dark:hover:text-green-200"
          >
            Done
          </button>
        </div>
      )}

      {/* Error */}
      {step === "error" && error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">Error</p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-2 text-sm font-medium text-red-700 dark:text-red-300 transition-colors hover:text-red-800 dark:hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
