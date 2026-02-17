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

// Mock sub-components
jest.mock("@/components/HouseholdTaskList", () => ({
  HouseholdTaskList: ({ lifeAreaId }: { lifeAreaId: number }) => (
    <div data-testid="household-task-list">Household Tasks for {lifeAreaId}</div>
  ),
}));
jest.mock("@/components/GoalList", () => ({
  GoalList: ({ lifeAreaId }: { lifeAreaId: number }) => (
    <div data-testid="goal-list">Goals for {lifeAreaId}</div>
  ),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LifeAreaDetail } from "@/components/LifeAreaDetail";

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

describe("LifeAreaDetail", () => {
  const mockOnBack = jest.fn();
  const mockOnEdit = jest.fn();

  beforeEach(() => {
    mockOnBack.mockClear();
    mockOnEdit.mockClear();
  });

  it("displays the life area name and target", async () => {
    const areaId = await currentTestDb.lifeAreas.add({
      name: "Self-care",
      icon: "heart",
      targetHoursPerWeek: 5,
      updatedAt: Date.now(),
      deviceId: "test-device-1",
      deletedAt: null,
    });

    render(
      <LifeAreaDetail lifeAreaId={areaId} onBack={mockOnBack} onEdit={mockOnEdit} />
    );

    await waitFor(() => {
      expect(screen.getByText("Self-care")).toBeInTheDocument();
    });
    expect(screen.getByText(/Target: 5h per week/)).toBeInTheDocument();
  });

  it("shows the activity list with logged activities", async () => {
    const now = Date.now();

    const areaId = await currentTestDb.lifeAreas.add({
      name: "Social",
      icon: "message-circle",
      targetHoursPerWeek: 3,
      updatedAt: now,
      deviceId: "test-device-1",
      deletedAt: null,
    });

    await currentTestDb.activities.add({
      lifeAreaId: areaId,
      description: "Coffee with Jane",
      durationMinutes: 45,
      date: now - 2 * 60 * 60 * 1000,
      notes: "Great chat",
      location: null,
      updatedAt: now,
      deviceId: "test-device-1",
      deletedAt: null,
    });

    render(
      <LifeAreaDetail lifeAreaId={areaId} onBack={mockOnBack} onEdit={mockOnEdit} />
    );

    await waitFor(() => {
      expect(screen.getByText("Coffee with Jane")).toBeInTheDocument();
    });
    // "45m" appears in both the weekly summary and the activity card
    const durationLabels = screen.getAllByText("45m");
    expect(durationLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Great chat")).toBeInTheDocument();
  });

  it("shows empty state when no activities exist", async () => {
    const areaId = await currentTestDb.lifeAreas.add({
      name: "Personal Goals",
      icon: "target",
      targetHoursPerWeek: 5,
      updatedAt: Date.now(),
      deviceId: "test-device-1",
      deletedAt: null,
    });

    render(
      <LifeAreaDetail lifeAreaId={areaId} onBack={mockOnBack} onEdit={mockOnEdit} />
    );

    await waitFor(() => {
      expect(screen.getByText(/No activities yet/)).toBeInTheDocument();
    });
  });

  it("shows the Log Activity button and opens the form", async () => {
    const user = userEvent.setup();

    const areaId = await currentTestDb.lifeAreas.add({
      name: "Self-care",
      icon: "heart",
      targetHoursPerWeek: 5,
      updatedAt: Date.now(),
      deviceId: "test-device-1",
      deletedAt: null,
    });

    render(
      <LifeAreaDetail lifeAreaId={areaId} onBack={mockOnBack} onEdit={mockOnEdit} />
    );

    await waitFor(() => {
      expect(screen.getByText("Log Activity")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Log Activity"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("What did you do?")).toBeInTheDocument();
    });
  });

  it("shows loading state for invalid area ID", async () => {
    render(
      <LifeAreaDetail lifeAreaId={99999} onBack={mockOnBack} onEdit={mockOnEdit} />
    );

    await waitFor(() => {
      expect(screen.getByText("Loading life area...")).toBeInTheDocument();
    });
  });

  it("calls onBack when back button is clicked", async () => {
    const user = userEvent.setup();

    const areaId = await currentTestDb.lifeAreas.add({
      name: "Social",
      icon: "message-circle",
      targetHoursPerWeek: 3,
      updatedAt: Date.now(),
      deviceId: "test-device-1",
      deletedAt: null,
    });

    render(
      <LifeAreaDetail lifeAreaId={areaId} onBack={mockOnBack} onEdit={mockOnEdit} />
    );

    await waitFor(() => {
      expect(screen.getByText("Social")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Back to life areas"));
    expect(mockOnBack).toHaveBeenCalled();
  });

  it("shows the weekly summary with progress bar", async () => {
    const now = Date.now();

    const areaId = await currentTestDb.lifeAreas.add({
      name: "Self-care",
      icon: "heart",
      targetHoursPerWeek: 5,
      updatedAt: now,
      deviceId: "test-device-1",
      deletedAt: null,
    });

    await currentTestDb.activities.add({
      lifeAreaId: areaId,
      description: "Yoga",
      durationMinutes: 60,
      date: now,
      notes: "",
      location: null,
      updatedAt: now,
      deviceId: "test-device-1",
      deletedAt: null,
    });

    render(
      <LifeAreaDetail lifeAreaId={areaId} onBack={mockOnBack} onEdit={mockOnEdit} />
    );

    await waitFor(() => {
      expect(screen.getByText("This Week")).toBeInTheDocument();
    });
    expect(screen.getByText(/of 5h target/)).toBeInTheDocument();
  });
});
