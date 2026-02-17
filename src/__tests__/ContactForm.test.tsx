import "fake-indexeddb/auto";
import {
  currentTestDb,
  resetTestDb,
  cleanupTestDb,
  seedPrefs,
} from "./helpers/mock-db";

// ---------------------------------------------------------------------------
// Mock @/lib/db — proxy every property access to currentTestDb
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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactForm } from "@/components/ContactForm";

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

describe("ContactForm", () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    mockOnComplete.mockClear();
    mockOnCancel.mockClear();
  });

  describe("Adding a new contact", () => {
    it("renders the add contact form with default values", () => {
      render(
        <ContactForm onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      expect(screen.getByRole("heading", { name: "Add Contact" })).toBeInTheDocument();
      expect(screen.getByLabelText(/Name/)).toHaveValue("");
      expect(screen.getByLabelText(/Relationship Tier/)).toHaveValue("close-friends");
      expect(screen.getByLabelText(/Check-in every/)).toHaveValue(14);
    });

    it("saves a new contact with all fields to the database", async () => {
      const user = userEvent.setup();

      render(
        <ContactForm onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      await user.type(screen.getByLabelText(/Name/), "Mum");
      await user.selectOptions(screen.getByLabelText(/Relationship Tier/), "close-family");

      await waitFor(() => {
        expect(screen.getByLabelText(/Check-in every/)).toHaveValue(7);
      });

      await user.type(screen.getByPlaceholderText(/07700/), "07700 900000");
      await user.type(screen.getByPlaceholderText(/Anything to remember/), "Loves tea");

      await user.click(screen.getByRole("button", { name: "Add Contact" }));

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });

      const contacts = await currentTestDb.contacts.toArray();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe("Mum");
      expect(contacts[0].tier).toBe("close-family");
      expect(contacts[0].checkInFrequencyDays).toBe(7);
      expect(contacts[0].phoneNumber).toBe("07700 900000");
      expect(contacts[0].notes).toBe("Loves tea");
      expect(contacts[0].deletedAt).toBeNull();
      expect(contacts[0].deviceId).toBe("test-device-1");
    });
  });

  describe("Editing an existing contact", () => {
    it("populates the form with existing contact data", async () => {
      const contactId = await currentTestDb.contacts.add({
        name: "Dave",
        tier: "wider-friends",
        checkInFrequencyDays: 30,
        lastCheckIn: null,
        phoneNumber: "07700 111111",
        notes: "College friend",
        location: null,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      render(
        <ContactForm
          contactId={contactId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/Name/)).toHaveValue("Dave");
      });

      expect(screen.getByText("Edit Contact")).toBeInTheDocument();
      expect(screen.getByLabelText(/Relationship Tier/)).toHaveValue("wider-friends");
      expect(screen.getByLabelText(/Check-in every/)).toHaveValue(30);
    });

    it("updates the contact in the database on save", async () => {
      const user = userEvent.setup();

      const contactId = await currentTestDb.contacts.add({
        name: "Dave",
        tier: "wider-friends",
        checkInFrequencyDays: 30,
        lastCheckIn: null,
        phoneNumber: "",
        notes: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      render(
        <ContactForm
          contactId={contactId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      // Wait for the form to be populated with existing data
      await waitFor(() => {
        expect(screen.getByLabelText(/Name/)).toHaveValue("Dave");
      });

      const nameInput = screen.getByLabelText(/Name/);
      await user.clear(nameInput);
      await user.type(nameInput, "David");
      await user.click(screen.getByText("Save Changes"));

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });

      const updated = await currentTestDb.contacts.get(contactId);
      expect(updated?.name).toBe("David");
    });
  });

  describe("Validation", () => {
    it("shows an error when name is empty", async () => {
      const user = userEvent.setup();

      render(
        <ContactForm onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      await user.click(screen.getByRole("button", { name: "Add Contact" }));

      await waitFor(() => {
        expect(screen.getByText("Name is required.")).toBeInTheDocument();
      });
      expect(mockOnComplete).not.toHaveBeenCalled();
    });

    it("shows an error when check-in frequency is 0", async () => {
      const user = userEvent.setup();

      render(
        <ContactForm onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      await user.type(screen.getByLabelText(/Name/), "Test");

      const freqInput = screen.getByLabelText(/Check-in every/);
      await user.clear(freqInput);
      await user.type(freqInput, "0");

      await user.click(screen.getByRole("button", { name: "Add Contact" }));

      await waitFor(() => {
        expect(
          screen.getByText("Check-in frequency must be at least 1 day.")
        ).toBeInTheDocument();
      });
      expect(mockOnComplete).not.toHaveBeenCalled();
    });
  });

  describe("Tier change auto-populates frequency", () => {
    it("auto-updates frequency when tier changes for new contacts", async () => {
      const user = userEvent.setup();

      render(
        <ContactForm onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      expect(screen.getByLabelText(/Check-in every/)).toHaveValue(14);

      await user.selectOptions(screen.getByLabelText(/Relationship Tier/), "partner");

      await waitFor(() => {
        expect(screen.getByLabelText(/Check-in every/)).toHaveValue(1);
      });
    });
  });

  describe("Cancel action", () => {
    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <ContactForm onComplete={mockOnComplete} onCancel={mockOnCancel} />
      );

      await user.click(screen.getByText("Cancel"));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe("Delete contact", () => {
    it("soft-deletes the contact with confirmation", async () => {
      const user = userEvent.setup();

      const contactId = await currentTestDb.contacts.add({
        name: "To Delete",
        tier: "wider-friends",
        checkInFrequencyDays: 30,
        lastCheckIn: null,
        phoneNumber: "",
        notes: "",
        location: null,
        updatedAt: Date.now(),
        deviceId: "test-device-1",
        deletedAt: null,
      });

      render(
        <ContactForm
          contactId={contactId}
          onComplete={mockOnComplete}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Edit Contact")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Delete Contact"));
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

      await user.click(screen.getByText("Yes, Delete"));

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalled();
      });

      const contact = await currentTestDb.contacts.get(contactId);
      expect(contact?.deletedAt).not.toBeNull();
    });
  });
});
