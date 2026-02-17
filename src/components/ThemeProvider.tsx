"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Theme } from "@/types/models";

const THEME_STORAGE_KEY = "balance-theme";

type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** The user's preference: "light", "dark", or "system" */
  theme: Theme;
  /** The currently active resolved theme: "light" or "dark" */
  resolvedTheme: ResolvedTheme;
  /** Update the theme preference (writes to Dexie + localStorage cache) */
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

/** Apply or remove the `dark` class on <html> */
function applyThemeClass(resolved: ResolvedTheme) {
  const html = document.documentElement;
  if (resolved === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
}

/** Subscribe to OS dark-mode changes via matchMedia */
function subscribeToSystemTheme(callback: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSystemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getSystemIsDarkServer() {
  return false;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Track the OS dark mode preference reactively
  const systemIsDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemIsDark,
    getSystemIsDarkServer
  );

  // Read theme preference from localStorage (sync) as initial value
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) || "system";
  });

  // Read the authoritative theme from Dexie (async)
  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));

  // Derive the effective theme from Dexie (authoritative) or local state
  const effectiveTheme = prefs?.theme ?? theme;

  // Derive resolvedTheme — pure computation, no state needed
  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (effectiveTheme === "dark") return "dark";
    if (effectiveTheme === "light") return "light";
    // "system"
    return systemIsDark ? "dark" : "light";
  }, [effectiveTheme, systemIsDark]);

  // Sync localStorage cache when Dexie value changes
  useEffect(() => {
    if (prefs?.theme) {
      localStorage.setItem(THEME_STORAGE_KEY, prefs.theme);
    }
  }, [prefs?.theme]);

  // External side-effect: apply/remove the dark class on <html>
  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    // Update local state + localStorage immediately for instant UI response
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);

    // Apply the class immediately (don't wait for the effect re-run)
    const resolved: ResolvedTheme =
      newTheme === "dark"
        ? "dark"
        : newTheme === "light"
          ? "light"
          : getSystemIsDark()
            ? "dark"
            : "light";
    applyThemeClass(resolved);

    // Persist to Dexie
    try {
      await db.userPreferences.update("prefs", { theme: newTheme });
    } catch {
      // DB may not be initialised yet — ignore
    }
  }, []);

  const value = useMemo(
    () => ({ theme: effectiveTheme, resolvedTheme, setTheme }),
    [effectiveTheme, resolvedTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Hook to access the current theme and change it.
 *
 * Returns:
 * - `theme` — the user's preference ("light" | "dark" | "system")
 * - `resolvedTheme` — the active theme after resolving "system" ("light" | "dark")
 * - `setTheme(t)` — update the preference (writes to Dexie + localStorage)
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
