"use client";

import { useState, useMemo, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { DateNightForm } from "@/components/DateNightForm";

/**
 * Date night section shown within the Partner Time life area detail page.
 *
 * Features:
 * - Log date nights (date + optional notes)
 * - Show how long since the last one
 * - Ideas bank: add/remove date ideas
 * - "Surprise me" button picks a random idea
 */
export function DateNightSection() {
  const [showForm, setShowForm] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [showAllDateNights, setShowAllDateNights] = useState(false);
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [surpriseIdea, setSurpriseIdea] = useState<string | null>(null);

  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"), []);
  const frequencyDays = prefs?.dateNightFrequencyDays ?? 14;

  const dateNights = useLiveQuery(
    () =>
      db.dateNights
        .filter((dn) => dn.deletedAt === null)
        .toArray()
        .then((results) => results.sort((a, b) => b.date - a.date)),
    [],
  );

  const ideas = useLiveQuery(
    () => db.dateNightIdeas.filter((i) => i.deletedAt === null).toArray(),
    [],
  );

  // Calculate days since last date night
  const daysSinceLast = useMemo(() => {
    if (!dateNights || dateNights.length === 0) return null;
    const lastDate = dateNights[0].date;
    return Math.floor((Date.now() - lastDate) / (1000 * 60 * 60 * 24));
  }, [dateNights]);

  const isOverdue = daysSinceLast !== null && daysSinceLast > frequencyDays;
  const isDueSoon = daysSinceLast !== null && daysSinceLast >= frequencyDays * 0.7 && !isOverdue;

  const handleAddIdea = useCallback(async () => {
    const title = newIdeaTitle.trim();
    if (!title) return;

    const p = await db.userPreferences.get("prefs");
    const deviceId = p?.deviceId ?? "unknown";
    const now = Date.now();

    await db.dateNightIdeas.add({
      title,
      updatedAt: now,
      deviceId,
      deletedAt: null,
    });

    setNewIdeaTitle("");
  }, [newIdeaTitle]);

  const handleDeleteIdea = useCallback(async (ideaId: number) => {
    const p = await db.userPreferences.get("prefs");
    const deviceId = p?.deviceId ?? "unknown";
    const now = Date.now();

    await db.dateNightIdeas.update(ideaId, {
      deletedAt: now,
      updatedAt: now,
      deviceId,
    });
  }, []);

  const handleSurpriseMe = useCallback(() => {
    if (!ideas || ideas.length === 0) return;
    const randomIndex = Math.floor(Math.random() * ideas.length);
    setSurpriseIdea(ideas[randomIndex].title);
  }, [ideas]);

  const handleDeleteDateNight = useCallback(async (dateNightId: number) => {
    const p = await db.userPreferences.get("prefs");
    const deviceId = p?.deviceId ?? "unknown";
    const now = Date.now();

    await db.dateNights.update(dateNightId, {
      deletedAt: now,
      updatedAt: now,
      deviceId,
    });
  }, []);

  if (showForm) {
    return (
      <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
        <DateNightForm
          onComplete={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      </section>
    );
  }

  return (
    <>
      {/* Date Night Status & Log */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Date Nights
          </h3>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            + Log date night
          </button>
        </div>

        {/* Status card */}
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                isOverdue
                  ? "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400"
                  : isDueSoon
                    ? "bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400"
                    : "bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              {daysSinceLast === null ? (
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  No date nights logged yet. Time to plan one!
                </p>
              ) : daysSinceLast === 0 ? (
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  You had a date night today!
                </p>
              ) : (
                <>
                  <p className={`text-sm font-medium ${
                    isOverdue
                      ? "text-red-700 dark:text-red-400"
                      : isDueSoon
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-gray-900 dark:text-slate-100"
                  }`}>
                    {daysSinceLast} day{daysSinceLast !== 1 ? "s" : ""} since last date night
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                    Target: every {frequencyDays} days
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Surprise me result */}
        {surpriseIdea && (
          <div className="mt-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-purple-600 dark:text-purple-400">Tonight&apos;s idea:</p>
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">{surpriseIdea}</p>
              </div>
              <button
                type="button"
                onClick={() => setSurpriseIdea(null)}
                className="text-xs text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Surprise me button */}
        {ideas && ideas.length > 0 && (
          <button
            type="button"
            onClick={handleSurpriseMe}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 px-4 py-2.5 text-sm font-medium text-purple-700 dark:text-purple-300 transition-colors hover:bg-purple-100 dark:hover:bg-purple-900 active:bg-purple-150 dark:active:bg-purple-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Surprise me!
          </button>
        )}

        {/* Recent date nights */}
        {dateNights && dateNights.length > 0 && (
          <div className="mt-3 space-y-2">
            {(showAllDateNights ? dateNights : dateNights.slice(0, 10)).map((dn) => (
              <div
                key={dn.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {dn.ideaUsed ?? "Date night"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">
                      {formatDateNightDate(dn.date)}
                    </span>
                    <button
                      type="button"
                      onClick={() => dn.id !== undefined && handleDeleteDateNight(dn.id)}
                      className="rounded p-0.5 text-gray-300 dark:text-slate-600 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-400"
                      aria-label="Delete date night"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
                {dn.notes && (
                  <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">{dn.notes}</p>
                )}
              </div>
            ))}
            {!showAllDateNights && dateNights.length > 10 && (
              <button
                type="button"
                onClick={() => setShowAllDateNights(true)}
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 py-2 text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Show {dateNights.length - 10} more
              </button>
            )}
          </div>
        )}
      </section>

      {/* Ideas Bank */}
      <section>
        <button
          type="button"
          onClick={() => setShowIdeas(!showIdeas)}
          className="mb-3 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${showIdeas ? "rotate-90" : ""}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Date Night Ideas
          {ideas && ideas.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-slate-500">
              ({ideas.length})
            </span>
          )}
        </button>

        {showIdeas && (
          <div className="space-y-2">
            {/* Add new idea form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newIdeaTitle}
                onChange={(e) => setNewIdeaTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddIdea();
                }}
                placeholder="Add a date idea..."
                className="block flex-1 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 bg-white dark:bg-card focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddIdea}
                disabled={!newIdeaTitle.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>

            {/* Ideas list */}
            {!ideas || ideas.length === 0 ? (
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
                <p className="text-sm text-gray-400 dark:text-slate-500">
                  No ideas yet. Add some for your next date night!
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {ideas.map((idea) => (
                  <div
                    key={idea.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-card px-3 py-2"
                  >
                    <span className="text-sm text-gray-900 dark:text-slate-100">{idea.title}</span>
                    <button
                      type="button"
                      onClick={() => idea.id !== undefined && handleDeleteIdea(idea.id)}
                      className="shrink-0 rounded p-1 text-gray-300 dark:text-slate-600 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-400"
                      aria-label={`Remove "${idea.title}"`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

/** Format a date night date for display in the history list. */
function formatDateNightDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: diffDays > 365 ? "numeric" : undefined,
  });
}
