import "fake-indexeddb/auto";
import {
  currentTestDb,
  resetTestDb,
  cleanupTestDb,
  seedPrefs,
} from "./helpers/mock-db";

// ---------------------------------------------------------------------------
// Mock @/lib/db
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => {
  const helpers = require("./helpers/mock-db");
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      return (helpers.currentTestDb as any)[prop];
    },
  };
  const dbProxy = new Proxy({}, handler);
  return {
    __esModule: true,
    db: dbProxy,
    BalanceDatabase: helpers.TestBalanceDatabase,
    openDatabase: jest.fn(),
    closeDatabase: jest.fn(),
    deleteDatabase: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// matchMedia mock helper
// ---------------------------------------------------------------------------

let mediaQueryListeners: Array<() => void> = [];
let systemDarkMode = false;

function setupMatchMedia(isDark: boolean) {
  systemDarkMode = isDark;
  mediaQueryListeners = [];

  Object.defineProperty(window, "matchMedia", {
    value: jest.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? systemDarkMode : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn((_event: string, handler: () => void) => {
        mediaQueryListeners.push(handler);
      }),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
    writable: true,
    configurable: true,
  });
}

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "@/components/ThemeProvider";

// ---------------------------------------------------------------------------
// Test component that uses the theme hook
// ---------------------------------------------------------------------------

function ThemeConsumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button onClick={() => setTheme("light")}>Set Light</button>
      <button onClick={() => setTheme("dark")}>Set Dark</button>
      <button onClick={() => setTheme("system")}>Set System</button>
    </div>
  );
}

function renderWithThemeProvider() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await resetTestDb();
  await seedPrefs();

  localStorage.clear();
  document.documentElement.classList.remove("dark");
  setupMatchMedia(false);
});

afterEach(async () => {
  await cleanupTestDb();
  document.documentElement.classList.remove("dark");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ThemeProvider", () => {
  describe("Theme toggle rendering", () => {
    it("renders with the default system theme", async () => {
      renderWithThemeProvider();

      await waitFor(() => {
        expect(screen.getByTestId("theme")).toHaveTextContent("system");
      });
    });

    it("renders three theme options (Light/Dark/System)", () => {
      renderWithThemeProvider();

      expect(screen.getByText("Set Light")).toBeInTheDocument();
      expect(screen.getByText("Set Dark")).toBeInTheDocument();
      expect(screen.getByText("Set System")).toBeInTheDocument();
    });
  });

  describe("Setting dark theme", () => {
    it('adds the "dark" class to <html> when dark is selected', async () => {
      const user = userEvent.setup();

      renderWithThemeProvider();

      await user.click(screen.getByText("Set Dark"));

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true);
        expect(screen.getByTestId("theme")).toHaveTextContent("dark");
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
      });
    });
  });

  describe("Setting light theme", () => {
    it('removes the "dark" class from <html> when light is selected', async () => {
      const user = userEvent.setup();

      // Start with dark class
      document.documentElement.classList.add("dark");

      renderWithThemeProvider();

      await user.click(screen.getByText("Set Light"));

      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false);
      });

      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    });
  });

  describe("System theme mode", () => {
    it("reads from matchMedia when system mode is selected and OS is dark", async () => {
      setupMatchMedia(true);
      localStorage.setItem("balance-theme", "system");

      renderWithThemeProvider();

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
      });

      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("resolves to light when system mode is selected and OS is light", async () => {
      setupMatchMedia(false);
      localStorage.setItem("balance-theme", "system");

      renderWithThemeProvider();

      await waitFor(() => {
        expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
      });

      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });

  describe("Persistence", () => {
    it("persists theme preference to Dexie", async () => {
      const user = userEvent.setup();

      renderWithThemeProvider();

      await user.click(screen.getByText("Set Dark"));

      await waitFor(async () => {
        const prefs = await currentTestDb.userPreferences.get("prefs");
        expect(prefs?.theme).toBe("dark");
      });
    });

    it("caches theme preference in localStorage", async () => {
      const user = userEvent.setup();

      renderWithThemeProvider();

      await user.click(screen.getByText("Set Dark"));

      await waitFor(() => {
        expect(localStorage.getItem("balance-theme")).toBe("dark");
      });
    });

    it("reads initial theme from localStorage for fast restore", () => {
      localStorage.setItem("balance-theme", "dark");

      renderWithThemeProvider();

      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    });
  });

  describe("Switching themes", () => {
    it("switches from dark to light correctly", async () => {
      const user = userEvent.setup();

      renderWithThemeProvider();

      // Set dark
      await user.click(screen.getByText("Set Dark"));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true);
      });

      // Switch to light
      await user.click(screen.getByText("Set Light"));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false);
      });
    });

    it("switches from dark to system (OS is light)", async () => {
      const user = userEvent.setup();
      setupMatchMedia(false);

      renderWithThemeProvider();

      await user.click(screen.getByText("Set Dark"));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(true);
      });

      await user.click(screen.getByText("Set System"));
      await waitFor(() => {
        expect(document.documentElement.classList.contains("dark")).toBe(false);
      });
    });
  });
});
