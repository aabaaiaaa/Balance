import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceTransferFlow } from "@/components/DeviceTransferFlow";

// ---------------------------------------------------------------------------
// Mock PeerConnection
// ---------------------------------------------------------------------------

const mockCreateOffer = jest.fn();
const mockAcceptOffer = jest.fn();
const mockCompleteConnection = jest.fn();
const mockClose = jest.fn();
const mockSend = jest.fn();
const mockSendWithProgress = jest.fn();
const mockOnMessage = jest.fn();
const mockOnChunkProgress = jest.fn();

jest.mock("@/lib/peer-connection", () => ({
  PeerConnection: jest.fn().mockImplementation(() => ({
    createOffer: mockCreateOffer,
    acceptOffer: mockAcceptOffer,
    completeConnection: mockCompleteConnection,
    close: mockClose,
    send: mockSend,
    sendWithProgress: mockSendWithProgress,
    onMessage: mockOnMessage,
    onChunkProgress: mockOnChunkProgress,
    state: "open",
  })),
}));

// ---------------------------------------------------------------------------
// Mock backup functions
// ---------------------------------------------------------------------------

const mockBuildBackup = jest.fn();
const mockValidateBackupFile = jest.fn();
const mockImportReplaceAll = jest.fn();
const mockImportMerge = jest.fn();

jest.mock("@/lib/backup", () => ({
  buildBackup: (...args: any[]) => mockBuildBackup(...args),
  validateBackupFile: (...args: any[]) => mockValidateBackupFile(...args),
  importReplaceAll: (...args: any[]) => mockImportReplaceAll(...args),
  importMerge: (...args: any[]) => mockImportMerge(...args),
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
  mockSend.mockClear();
  mockSendWithProgress.mockClear();
  mockOnMessage.mockClear();
  mockOnChunkProgress.mockClear();
  mockBuildBackup.mockClear();
  mockValidateBackupFile.mockClear();
  mockImportReplaceAll.mockClear();
  mockImportMerge.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeviceTransferFlow", () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe("Initial state", () => {
    it("renders the choose-role screen with Send and Receive options", () => {
      render(<DeviceTransferFlow onClose={mockOnClose} />);

      expect(screen.getByText("Device Transfer")).toBeInTheDocument();
      expect(screen.getByText("Send Data")).toBeInTheDocument();
      expect(screen.getByText("Receive Data")).toBeInTheDocument();
    });

    it("explains the transfer is one-way", () => {
      render(<DeviceTransferFlow onClose={mockOnClose} />);

      expect(
        screen.getByText(/Transfer all your data from this device to another/)
      ).toBeInTheDocument();
    });
  });

  describe("Sender flow", () => {
    it("creates offer and shows QR code on Send Data", async () => {
      const user = userEvent.setup();
      mockCreateOffer.mockResolvedValue("compressed-sdp-offer");

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Send Data"));

      await waitFor(() => {
        expect(screen.getByTestId("qr-display")).toBeInTheDocument();
      });

      expect(screen.getByTestId("qr-display")).toHaveAttribute(
        "data-value",
        "compressed-sdp-offer"
      );

      expect(screen.getByText(/Waiting for receiver to scan/)).toBeInTheDocument();
    });

    it("shows error state when offer creation fails", async () => {
      const user = userEvent.setup();
      mockCreateOffer.mockRejectedValue(new Error("WebRTC not supported"));

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Send Data"));

      await waitFor(() => {
        expect(screen.getByText("Transfer Failed")).toBeInTheDocument();
      });

      expect(screen.getByText("WebRTC not supported")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    it("builds backup and sends it after connection is established", async () => {
      const user = userEvent.setup();
      const mockBackup = {
        format: "balance-backup",
        version: 1,
        exportedAt: Date.now(),
        entities: [],
        totalRecords: 42,
      };
      mockCreateOffer.mockResolvedValue("offer-data");
      mockCompleteConnection.mockResolvedValue(undefined);
      mockBuildBackup.mockResolvedValue(mockBackup);
      mockSendWithProgress.mockResolvedValue(undefined);

      // Simulate the receiver sending a "transfer-complete" reply
      mockOnMessage.mockImplementation((callback: (data: string) => void) => {
        // Reply after send is called
        setTimeout(() => {
          callback(JSON.stringify({ type: "transfer-complete", recordsImported: 42 }));
        }, 10);
      });

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      // Start sender flow
      await user.click(screen.getByText("Send Data"));

      await waitFor(() => {
        expect(screen.getByTestId("qr-display")).toBeInTheDocument();
      });

      // Proceed to scan answer
      await user.click(screen.getByText("Receiver has scanned — scan their code now"));

      await waitFor(() => {
        expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
      });

      // Simulate scanning the answer
      await user.click(screen.getByText("Simulate Scan"));

      // Wait for transfer to complete
      await waitFor(() => {
        expect(screen.getByText("Transfer Complete")).toBeInTheDocument();
      });

      // Verify backup was built and sent via sendWithProgress
      expect(mockBuildBackup).toHaveBeenCalled();
      expect(mockSendWithProgress).toHaveBeenCalledWith(
        expect.stringContaining('"type":"transfer-backup"'),
        expect.any(Function),
      );

      // Verify summary
      expect(screen.getByText("Records sent")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  describe("Receiver flow", () => {
    it("shows import mode choice when Receive Data is clicked", async () => {
      const user = userEvent.setup();

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Receive Data"));

      await waitFor(() => {
        expect(screen.getByText("Replace All")).toBeInTheDocument();
        expect(screen.getByText("Merge")).toBeInTheDocument();
      });

      expect(
        screen.getByText(/How should the incoming data be handled/)
      ).toBeInTheDocument();
    });

    it("opens scanner after choosing Replace All import mode", async () => {
      const user = userEvent.setup();

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Receive Data"));

      await waitFor(() => {
        expect(screen.getByText("Replace All")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Replace All"));

      await waitFor(() => {
        expect(screen.getByTestId("qr-scanner")).toBeInTheDocument();
      });

      expect(screen.getByText(/Scan the code on the sending device/)).toBeInTheDocument();
    });

    it("can go back from import mode choice to role selection", async () => {
      const user = userEvent.setup();

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Receive Data"));

      await waitFor(() => {
        expect(screen.getByText("Replace All")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Back"));

      await waitFor(() => {
        expect(screen.getByText("Send Data")).toBeInTheDocument();
        expect(screen.getByText("Receive Data")).toBeInTheDocument();
      });
    });
  });

  describe("Error and retry", () => {
    it("shows retry button on error and allows retrying", async () => {
      const user = userEvent.setup();
      mockCreateOffer.mockRejectedValue(new Error("Connection failed"));

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      await user.click(screen.getByText("Send Data"));

      await waitFor(() => {
        expect(screen.getByText("Transfer Failed")).toBeInTheDocument();
      });

      expect(screen.getByText("Retry")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();

      // Click retry to go back to choose-role
      mockCreateOffer.mockResolvedValue("new-offer");
      await user.click(screen.getByText("Retry"));

      await waitFor(() => {
        expect(screen.getByText("Send Data")).toBeInTheDocument();
        expect(screen.getByText("Receive Data")).toBeInTheDocument();
      });
    });
  });

  describe("Close", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();

      render(<DeviceTransferFlow onClose={mockOnClose} />);

      await user.click(screen.getByLabelText("Close transfer"));
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
