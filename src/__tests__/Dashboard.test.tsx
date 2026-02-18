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
    <a href={href} {...props}>
      {children}
    </a>
  );
});

// Mock useLocation hook
jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: null,
    loading: false,
    error: null,
    permission: "prompt" as const,
    requestPosition: jest.fn().mockResolvedValue(null),
  }),
}));

// Mock useReminders hook
jest.mock("@/hooks/useReminders", () => ({
  useReminders: () => ({
    welcomeBack: null,
    checked: true,
  }),
}));

// Mock components that aren't under test
jest.mock("@/components/InstallPrompt", () => ({
  InstallPrompt: () => null,
}));
jest.mock("@/components/LocationPrompt", () => ({
  LocationPrompt: () => null,
}));
jest.mock("@/components/PlaceQuickCreate", () => ({
  PlaceQuickCreate: () => null,
}));
jest.mock("@/components/PartnerActivityFeed", () => ({
  PartnerActivityFeed: () => null,
}));
jest.mock("@/components/WelcomeBackBanner", () => ({
  WelcomeBackBanner: () => null,
}));
jest.mock("@/components/BalanceChart", () => ({
  BalanceChart: () => <div data-testid="balance-chart">Balance Chart</div>,
}));
jest.mock("@/components/FreeTimeSuggestions", () => ({
  FreeTimeSuggestions: () => null,
}));

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import DashboardPage from "@/app/page";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await resetTestDb();
  await seedPrefs();
});

afterEach(async () => {
  await cleanupTestDb();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Dashboard", () => {
  describe("Empty state", () => {
    it("renders a greeting and empty-state message when no data exists", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const heading = screen.getByRole("heading", { level: 2 });
        expect(heading.textContent).toMatch(/Good (morning|afternoon|evening)/);
      });

      await waitFor(() => {
        const matches = screen.getAllByText(
          /Add some contacts and life areas to get started/
        );
        expect(matches.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows "No priorities right now" when there are no items', async () => {
      // Disable date night scorer so it doesn't generate a priority in an empty DB
      await currentTestDb.userPreferences.update("prefs", {
        dateNightFrequencyDays: 0,
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/No priorities right now/)
        ).toBeInTheDocument();
      });
    });
  });

  describe("With data", () => {
    it("renders prioritised contacts on the dashboard", async () => {
      const now = Date.now();

      await currentTestDb.lifeAreas.add({
        name: "Self-care",
        icon: "heart",
        targetHoursPerWeek: 5,
        updatedAt: now,
        deviceId: "test-device-1",
        deletedAt: null,
      });

      await currentTestDb.contacts.add({
        name: "Mum",
        tier: "close-family",
        checkInFrequencyDays: 7,
        lastCheckIn: now - 14 * 24 * 60 * 60 * 1000,
        phoneNumber: "",
        notes: "",
        location: null,
        updatedAt: now,
        deviceId: "test-device-1",
        deletedAt: null,
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Check in with Mum/)).toBeInTheDocument();
      });

      expect(screen.getByText("Top Priorities")).toBeInTheDocument();
    });

    it("shows overdue indicators in the summary", async () => {
      const now = Date.now();

      await currentTestDb.contacts.add({
        name: "Dad",
        tier: "close-family",
        checkInFrequencyDays: 7,
        lastCheckIn: now - 30 * 24 * 60 * 60 * 1000,
        phoneNumber: "",
        notes: "",
        location: null,
        updatedAt: now,
        deviceId: "test-device-1",
        deletedAt: null,
      });

      await currentTestDb.lifeAreas.add({
        name: "Self-care",
        icon: "heart",
        targetHoursPerWeek: 5,
        updatedAt: now,
        deviceId: "test-device-1",
        deletedAt: null,
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/1 contact overdue/)).toBeInTheDocument();
      });
    });
  });

  describe("Show more priorities", () => {
    it("shows first 7 priority cards and a show-more button when there are 15+ items", async () => {
      const now = Date.now();
      const DAY = 24 * 60 * 60 * 1000;

      // Seed a life area so life-area scorer also generates items
      await currentTestDb.lifeAreas.add({
        name: "Self-care",
        icon: "heart",
        targetHoursPerWeek: 5,
        updatedAt: now,
        deviceId: "test-device-1",
        deletedAt: null,
      });

      // Seed 15 overdue contacts to generate 15+ priority items
      const names = [
        "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace",
        "Hank", "Iris", "Jack", "Kate", "Leo", "Mia", "Nick", "Olivia",
      ];
      for (const name of names) {
        await currentTestDb.contacts.add({
          name,
          tier: "close-friends",
          checkInFrequencyDays: 7,
          lastCheckIn: now - 30 * DAY, // very overdue
          phoneNumber: "",
          notes: "",
          location: null,
          updatedAt: now,
          deviceId: "test-device-1",
          deletedAt: null,
        });
      }

      render(<DashboardPage />);

      // Wait for priorities to load
      await waitFor(() => {
        expect(screen.getByText("Top Priorities")).toBeInTheDocument();
      });

      // Should show exactly 7 priority cards initially
      await waitFor(() => {
        const logButtons = screen.getAllByRole("button", { name: /^Log / });
        expect(logButtons.length).toBe(7);
      });

      // Should show a "Show N more" button
      const showMoreBtn = await waitFor(() => {
        return screen.getByRole("button", { name: /Show \d+ more/ });
      });
      expect(showMoreBtn).toBeInTheDocument();

      // Click it — all items should now render
      fireEvent.click(showMoreBtn);

      await waitFor(() => {
        const logButtons = screen.getAllByRole("button", { name: /^Log / });
        expect(logButtons.length).toBeGreaterThan(7);
      });

      // Show more button should be gone
      expect(
        screen.queryByRole("button", { name: /Show \d+ more/ })
      ).not.toBeInTheDocument();
    });
  });

  describe("I have free time button", () => {
    it("renders the free time button", async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText("I have free time")).toBeInTheDocument();
      });
    });
  });
});
