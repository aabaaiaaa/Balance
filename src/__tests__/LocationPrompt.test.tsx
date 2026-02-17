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
// Geolocation mock helper
// ---------------------------------------------------------------------------

function setupGeolocation(lat: number, lng: number) {
  const mockGetCurrentPosition = jest.fn(
    (success: (pos: any) => void, _error: (err: any) => void) => {
      success({
        coords: { latitude: lat, longitude: lng },
      });
    }
  );

  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition: mockGetCurrentPosition },
    writable: true,
    configurable: true,
  });

  return mockGetCurrentPosition;
}

function setupGeolocationDenied() {
  Object.defineProperty(navigator, "geolocation", {
    value: {
      getCurrentPosition: jest.fn((_success, error) => {
        error({ code: 1, PERMISSION_DENIED: 1 });
      }),
    },
    writable: true,
    configurable: true,
  });
}

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocationPrompt } from "@/components/LocationPrompt";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await resetTestDb();
  await seedPrefs();

  // Clear any localStorage dismiss state
  localStorage.clear();
});

afterEach(async () => {
  await cleanupTestDb();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocationPrompt", () => {
  const mockOnLogCheckIn = jest.fn();
  const mockOnLogActivity = jest.fn();
  const mockOnNewPlace = jest.fn();

  beforeEach(() => {
    mockOnLogCheckIn.mockClear();
    mockOnLogActivity.mockClear();
    mockOnNewPlace.mockClear();
  });

  describe("Single nearby place", () => {
    it('shows "You\'re near X" when GPS is inside a saved place radius', async () => {
      // Saved place at (51.5, -0.1) with 500m radius
      await currentTestDb.savedPlaces.add({
        label: "Mum's house",
        lat: 51.5,
        lng: -0.1,
        radius: 500,
        linkedContactIds: ["1"],
        linkedLifeAreaIds: [],
        lastVisited: null,
        visitCount: 0,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      // Add a matching contact
      await currentTestDb.contacts.add({
        id: 1,
        name: "Mum",
        tier: "close-family",
        checkInFrequencyDays: 7,
        lastCheckIn: null,
        phoneNumber: "",
        notes: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      // Mock geolocation to return position inside the saved place
      setupGeolocation(51.5, -0.1);

      render(
        <LocationPrompt
          onLogCheckIn={mockOnLogCheckIn}
          onLogActivity={mockOnLogActivity}
          onNewPlace={mockOnNewPlace}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/You're near Mum's place/)).toBeInTheDocument();
      });

      // Should show log visit button
      expect(screen.getByText("Log visit")).toBeInTheDocument();
    });

    it('calls onLogCheckIn when "Log visit" is tapped for a contact-linked place', async () => {
      const user = userEvent.setup();

      await currentTestDb.savedPlaces.add({
        label: "Dad's house",
        lat: 51.5,
        lng: -0.1,
        radius: 500,
        linkedContactIds: ["1"],
        linkedLifeAreaIds: [],
        lastVisited: null,
        visitCount: 0,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      await currentTestDb.contacts.add({
        id: 1,
        name: "Dad",
        tier: "close-family",
        checkInFrequencyDays: 7,
        lastCheckIn: null,
        phoneNumber: "",
        notes: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      setupGeolocation(51.5, -0.1);

      render(
        <LocationPrompt
          onLogCheckIn={mockOnLogCheckIn}
          onLogActivity={mockOnLogActivity}
          onNewPlace={mockOnNewPlace}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Log visit")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Log visit"));

      expect(mockOnLogCheckIn).toHaveBeenCalledWith(1, "Dad's house");
    });
  });

  describe("Multiple overlapping places", () => {
    it("shows all matching places when near multiple saved places", async () => {
      // Two places at the same coordinates
      await currentTestDb.savedPlaces.add({
        label: "The Gym",
        lat: 51.5,
        lng: -0.1,
        radius: 500,
        linkedContactIds: [],
        linkedLifeAreaIds: ["1"],
        lastVisited: null,
        visitCount: 0,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      await currentTestDb.savedPlaces.add({
        label: "Costa Coffee",
        lat: 51.5001,
        lng: -0.1001,
        radius: 500,
        linkedContactIds: [],
        linkedLifeAreaIds: ["2"],
        lastVisited: null,
        visitCount: 0,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      await currentTestDb.lifeAreas.add({
        id: 1,
        name: "Self-care",
        icon: "heart",
        targetHoursPerWeek: 5,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      await currentTestDb.lifeAreas.add({
        id: 2,
        name: "Social",
        icon: "message-circle",
        targetHoursPerWeek: 3,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      setupGeolocation(51.5, -0.1);

      render(
        <LocationPrompt
          onLogCheckIn={mockOnLogCheckIn}
          onLogActivity={mockOnLogActivity}
          onNewPlace={mockOnNewPlace}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Where are you?")).toBeInTheDocument();
      });

      // Both places should be shown as options
      expect(screen.getByText("The Gym")).toBeInTheDocument();
      expect(screen.getByText("Costa Coffee")).toBeInTheDocument();
      expect(screen.getByText("Just browsing")).toBeInTheDocument();
    });
  });

  describe("Not near any place", () => {
    it('shows "New place? Save it" when not near any saved place', async () => {
      // Add a saved place far from our mock position
      await currentTestDb.savedPlaces.add({
        label: "Home",
        lat: 52.0,
        lng: 0.0,
        radius: 200,
        linkedContactIds: [],
        linkedLifeAreaIds: [],
        lastVisited: null,
        visitCount: 0,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      // Mock position far from saved place
      setupGeolocation(51.5, -0.1);

      render(
        <LocationPrompt
          onLogCheckIn={mockOnLogCheckIn}
          onLogActivity={mockOnLogActivity}
          onNewPlace={mockOnNewPlace}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("New place? Save it")).toBeInTheDocument();
      });
    });
  });

  describe("Dismiss behavior", () => {
    it('hides the prompt when "Not now" is clicked', async () => {
      const user = userEvent.setup();

      await currentTestDb.savedPlaces.add({
        label: "Office",
        lat: 51.5,
        lng: -0.1,
        radius: 500,
        linkedContactIds: [],
        linkedLifeAreaIds: ["1"],
        lastVisited: null,
        visitCount: 0,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      await currentTestDb.lifeAreas.add({
        id: 1,
        name: "Personal Goals",
        icon: "target",
        targetHoursPerWeek: 5,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      setupGeolocation(51.5, -0.1);

      const { container } = render(
        <LocationPrompt
          onLogCheckIn={mockOnLogCheckIn}
          onLogActivity={mockOnLogActivity}
          onNewPlace={mockOnNewPlace}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Not now")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Not now"));

      // Prompt should be hidden (component renders null)
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe("Permission denied", () => {
    it("renders nothing when geolocation permission is denied", async () => {
      // Add some saved places
      await currentTestDb.savedPlaces.add({
        label: "Somewhere",
        lat: 51.5,
        lng: -0.1,
        radius: 500,
        linkedContactIds: [],
        linkedLifeAreaIds: [],
        lastVisited: null,
        visitCount: 0,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      setupGeolocationDenied();

      const { container } = render(
        <LocationPrompt
          onLogCheckIn={mockOnLogCheckIn}
          onLogActivity={mockOnLogActivity}
          onNewPlace={mockOnNewPlace}
        />
      );

      // Wait for the location check to complete
      await waitFor(() => {
        // Should render nothing (null)
        expect(container.firstChild).toBeNull();
      });
    });
  });
});
