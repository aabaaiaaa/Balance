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

// Mock next/link
jest.mock("next/link", () => {
  return ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  );
});

// Mock ThemeProvider
const mockSetTheme = jest.fn();
jest.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "system" as const,
    resolvedTheme: "light" as const,
    setTheme: mockSetTheme,
  }),
}));

// Mock sub-components
jest.mock("@/components/LinkPartnerFlow", () => ({
  LinkPartnerFlow: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="link-partner-flow">
      <button onClick={onClose}>Close Link Flow</button>
    </div>
  ),
}));
jest.mock("@/components/BackupRestore", () => ({
  BackupRestore: () => (
    <div data-testid="backup-restore">
      <button>Download Backup</button>
      <button>Restore from Backup</button>
    </div>
  ),
}));
jest.mock("@/components/NotificationPreferences", () => ({
  NotificationPreferences: () => (
    <div data-testid="notification-preferences">Notification Settings</div>
  ),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "@/app/settings/page";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await resetTestDb();
  await seedPrefs({ syncHistory: [] });
  mockSetTheme.mockClear();
});

afterEach(async () => {
  await cleanupTestDb();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsPage", () => {
  it("renders the settings page with all sections", async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    expect(screen.getByText("Partner")).toBeInTheDocument();
    expect(screen.getByText("Sync")).toBeInTheDocument();
    expect(screen.getByText("Saved Places")).toBeInTheDocument();
    expect(screen.getByText("Data")).toBeInTheDocument();
    expect(screen.getByText("Preferences")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  describe("Partner section", () => {
    it("shows unlinked state by default", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Link Partner")).toBeInTheDocument();
      });
      expect(screen.getByText(/No partner linked/)).toBeInTheDocument();
    });

    it("shows linked state when partner is linked", async () => {
      await currentTestDb.userPreferences.update("prefs", {
        partnerDeviceId: "partner-device-1",
        lastSyncTimestamp: Date.now() - 3600000,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Partner linked")).toBeInTheDocument();
      });
      expect(screen.getByText("Unlink Partner")).toBeInTheDocument();
    });
  });

  describe("Preferences section", () => {
    it("renders theme toggle with three options", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Theme")).toBeInTheDocument();
      });
      expect(screen.getByText("Light")).toBeInTheDocument();
      expect(screen.getByText("Dark")).toBeInTheDocument();
      expect(screen.getByText("System")).toBeInTheDocument();
    });

    it("calls setTheme when a theme option is clicked", async () => {
      const user = userEvent.setup();

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Dark")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Dark"));
      expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("renders week start day options", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Week starts on")).toBeInTheDocument();
      });
      expect(screen.getByText("Monday")).toBeInTheDocument();
      expect(screen.getByText("Sunday")).toBeInTheDocument();
    });

    it("updates week start day in Dexie when toggled", async () => {
      const user = userEvent.setup();

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Sunday")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Sunday"));

      await waitFor(async () => {
        const prefs = await currentTestDb.userPreferences.get("prefs");
        expect(prefs?.weekStartDay).toBe("sunday");
      });
    });
  });

  describe("Data section", () => {
    it("renders backup/restore component", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("backup-restore")).toBeInTheDocument();
      });
    });

    it("shows clear data confirmation on click", async () => {
      const user = userEvent.setup();

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText("Clear all local data")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Clear all local data"));

      await waitFor(() => {
        expect(
          screen.getByText(/This will permanently delete all your data/)
        ).toBeInTheDocument();
      });
      expect(screen.getByText("Delete Everything")).toBeInTheDocument();
    });
  });

  describe("About section", () => {
    it("shows the app version", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Balance v/)).toBeInTheDocument();
      });
    });
  });
});
