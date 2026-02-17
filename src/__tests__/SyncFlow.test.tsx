import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncFlow } from "@/components/SyncFlow";

// ---------------------------------------------------------------------------
// Mock PeerConnection
// ---------------------------------------------------------------------------

const mockCreateOffer = jest.fn();
const mockAcceptOffer = jest.fn();
const mockCompleteConnection = jest.fn();
const mockClose = jest.fn();

jest.mock("@/lib/peer-connection", () => ({
  PeerConnection: jest.fn().mockImplementation(() => ({
    createOffer: mockCreateOffer,
    acceptOffer: mockAcceptOffer,
    completeConnection: mockCompleteConnection,
    close: mockClose,
    state: "closed",
  })),
}));

// ---------------------------------------------------------------------------
// Mock sync
// ---------------------------------------------------------------------------

const mockPerformSync = jest.fn();

jest.mock("@/lib/sync", () => ({
  performSync: (...args: any[]) => mockPerformSync(...args),
}));

// ---------------------------------------------------------------------------
// Mock QR components
// ---------------------------------------------------------------------------

jest.mock("@/components/QRDisplay", () => ({
  QRDisplay: ({ data, label }: { data: string; label?: string }) => (
    <div data-testid="qr-display" data-value={data}>
      {label && <span>{label}</span>}
    </div>
  ),
}));

jest.mock("@/components/QRScanner", () => ({
  QRScanner: ({
    onScan,
    onCancel,
  }: {
    onScan: (data: string) => void;
    onCancel?: () => void;
  }) => (
    <div data-testid="qr-scanner">
      <button onClick={() => onScan("mock-scanned-data")}>Simulate Scan</button>
      {onCancel && <button onClick={onCancel}>Cancel Scan</button>}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCreateOffer.mockClear();
  mockAcceptOffer.mockClear();
  mockCompleteConnection.mockClear();
  mockClose.mockClear();
  mockPerformSync.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SyncFlow", () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe("Initial state", () => {
    it("renders the choose-role screen with Start and Join options", () => {
      render(<SyncFlow onClose={mockOnClose} />);

      expect(screen.getByText("Sync with Partner")).toBeInTheDocument();
      expect(screen.getByText("Start Sync")).toBeInTheDocument();
      expect(screen.getByText("Join Sync")).toBeInTheDocument();
    });

    it("explains the Wi-Fi requirement", () => {
      render(<SyncFlow onClose={mockOnClose} />);

      expect(
        screen.getByText(/Both devices need to be on the same Wi-Fi network/)
      ).toBeInTheDocument();
    });
  });

  describe("Initiator flow", () => {
    it("creates offer and shows QR code on Start Sync", async () => {
      const user = userEvent.setup();
      mockCreateOffer.mockResolvedValue("compressed-sdp-offer");

      render(<SyncFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Start Sync"));

      // Should show loading first
      await waitFor(() => {
        expect(screen.getByTestId("qr-display")).toBeInTheDocument();
      });

      // QR display should contain the offer data
      expect(screen.getByTestId("qr-display")).toHaveAttribute(
        "data-value",
        "compressed-sdp-offer"
      );

      // Should show "Waiting for partner" message
      expect(screen.getByText(/Waiting for partner to scan/)).toBeInTheDocument();
    });

    it("shows error state when offer creation fails", async () => {
      const user = userEvent.setup();
      mockCreateOffer.mockRejectedValue(new Error("WebRTC not supported"));

      render(<SyncFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Start Sync"));

      await waitFor(() => {
        expect(screen.getByText("Sync Failed")).toBeInTheDocument();
      });

      expect(screen.getByText("WebRTC not supported")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  describe("Joiner flow", () => {
    it("opens scanner when Join Sync is clicked", async () => {
      const user = userEvent.setup();

      render(<SyncFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Join Sync"));

      await waitFor(() => {
        expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
      });

      // Should show step indicator
      expect(screen.getByText(/Scan the code on your partner/)).toBeInTheDocument();
    });
  });

  describe("Complete state", () => {
    it("shows sync complete with summary when sync succeeds", async () => {
      const user = userEvent.setup();
      mockCreateOffer.mockResolvedValue("offer-data");
      mockCompleteConnection.mockResolvedValue(undefined);
      mockPerformSync.mockResolvedValue({
        totalSent: 10,
        totalReceived: 5,
        totalRemoteWins: 2,
        totalLocalWins: 1,
        totalUpserted: 8,
      });

      render(<SyncFlow onClose={mockOnClose} />);

      // Start the initiator flow
      await user.click(screen.getByText("Start Sync"));

      await waitFor(() => {
        expect(screen.getByTestId("qr-display")).toBeInTheDocument();
      });

      // Click to proceed to scanning the answer
      await user.click(
        screen.getByText("Partner has scanned — scan their code now")
      );

      // Simulate scanning the answer
      await waitFor(() => {
        expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Simulate Scan"));

      // Wait for sync to complete
      await waitFor(() => {
        expect(screen.getByText("Sync Complete")).toBeInTheDocument();
      });

      // Summary should show — verify labels and values
      expect(screen.getByText("Records sent")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("Records received")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("Conflicts resolved")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument(); // 2 + 1
      expect(screen.getByText("Records updated")).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });
  });

  describe("Error state", () => {
    it("shows retry button on error and allows retrying", async () => {
      const user = userEvent.setup();
      mockCreateOffer.mockRejectedValue(new Error("Connection failed"));

      render(<SyncFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Start Sync"));

      await waitFor(() => {
        expect(screen.getByText("Sync Failed")).toBeInTheDocument();
      });

      // Should have retry and cancel options
      expect(screen.getByText("Retry")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();

      // Click retry to go back to choose-role
      mockCreateOffer.mockResolvedValue("new-offer");
      await user.click(screen.getByText("Retry"));

      await waitFor(() => {
        expect(screen.getByText("Start Sync")).toBeInTheDocument();
        expect(screen.getByText("Join Sync")).toBeInTheDocument();
      });
    });
  });

  describe("Close", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();

      render(<SyncFlow onClose={mockOnClose} />);

      await user.click(screen.getByLabelText("Close sync"));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
