"use client";

import { useCallback, useEffect, useState } from "react";
import { db, type BalanceDatabase } from "@/lib/db";

export { useLiveQuery } from "dexie-react-hooks";

export interface UseDbResult {
  /** The singleton Dexie database instance. */
  db: BalanceDatabase;
  /** Whether the database is ready (open). */
  isReady: boolean;
  /** Error encountered while opening the database, if any. */
  error: Error | null;
}

/**
 * Hook that provides access to the local database.
 *
 * On mount it ensures the database connection is open and reports
 * readiness / errors via the returned state.
 *
 * Usage:
 * ```tsx
 * const { db, isReady, error } = useDb();
 * ```
 *
 * For reactive queries that re-render when data changes, pair with
 * `useLiveQuery` from this same module:
 *
 * ```tsx
 * import { useDb, useLiveQuery } from "@/hooks/useDb";
 *
 * function ContactsList() {
 *   const { db, isReady } = useDb();
 *   const contacts = useLiveQuery(
 *     () => db.contacts.where("deletedAt").equals("").toArray(),
 *     []
 *   );
 *   // ...
 * }
 * ```
 */
export function useDb(): UseDbResult {
  const [isReady, setIsReady] = useState(db.isOpen());
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (db.isOpen()) {
      setIsReady(true);
      return;
    }

    let cancelled = false;

    db.open()
      .then(() => {
        if (!cancelled) setIsReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const dbError =
            err instanceof Error ? err : new Error(String(err));
          setError(dbError);
          console.error("Failed to open database:", dbError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { db, isReady, error };
}

/**
 * Helper to run a database transaction with error handling.
 * Returns a `execute` function that wraps the work in a try/catch.
 *
 * Usage:
 * ```tsx
 * const { execute, error } = useDbTransaction();
 *
 * async function save() {
 *   await execute(async () => {
 *     await db.contacts.add({ name: "Alice", ... });
 *   });
 * }
 * ```
 */
export function useDbTransaction() {
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    setError(null);
    try {
      return await work();
    } catch (err: unknown) {
      const txError = err instanceof Error ? err : new Error(String(err));
      setError(txError);
      console.error("Database operation failed:", txError);
      return undefined;
    }
  }, []);

  return { execute, error };
}
