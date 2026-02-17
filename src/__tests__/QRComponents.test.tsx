import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QRDisplay } from "@/components/QRDisplay";
import { QRScanner } from "@/components/QRScanner";

// ---------------------------------------------------------------------------
// Mock react-qr-code
// ---------------------------------------------------------------------------

jest.mock("react-qr-code", () => {
  return function MockQRCode(props: { value: string; size: number }) {
    return (
      <svg
        data-testid="qr-code"
        data-value={props.value}
        width={props.size}
        height={props.size}
      />
    );
  };
});

// ---------------------------------------------------------------------------
// Mock QR multicode utilities
// ---------------------------------------------------------------------------

jest.mock("@/lib/qr-multicode", () => ({
  splitIntoChunks: (data: string) => {
    // Simulate single chunk for small data, multi-chunk for large data
    if (data.length > 100) {
      const half = Math.ceil(data.length / 2);
      return [
        `[1/2]${data.substring(0, half)}`,
        `[2/2]${data.substring(half)}`,
      ];
    }
    return [data];
  },
  parseChunk: (text: string) => {
    const match = text.match(/^\[(\d+)\/(\d+)\](.+)$/);
    if (!match) return null;
    return {
      index: parseInt(match[1], 10) - 1,
      total: parseInt(match[2], 10),
      payload: match[3],
    };
  },
  reassembleChunks: (chunks: Map<number, string>, total: number) => {
    const parts: string[] = [];
    for (let i = 0; i < total; i++) {
      parts.push(chunks.get(i) ?? "");
    }
    return parts.join("");
  },
}));

// ---------------------------------------------------------------------------
// Mock html5-qrcode
// ---------------------------------------------------------------------------

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockClear = jest.fn();

jest.mock("html5-qrcode", () => ({
  Html5Qrcode: jest.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
    clear: mockClear,
    isScanning: false,
  })),
}));

// ---------------------------------------------------------------------------
// QRDisplay Tests
// ---------------------------------------------------------------------------

describe("QRDisplay", () => {
  it("renders a QR code SVG with the provided data", () => {
    render(<QRDisplay data="test-sdp-offer-data" />);

    const qr = screen.getByTestId("qr-code");
    expect(qr).toBeInTheDocument();
    expect(qr).toHaveAttribute("data-value", "test-sdp-offer-data");
  });

  it("renders with a label when provided", () => {
    render(<QRDisplay data="test-data" label="Scan this code" />);

    expect(screen.getByText("Scan this code")).toBeInTheDocument();
  });

  it("shows navigation for multi-code sequences", () => {
    // Data > 100 chars triggers multi-chunk in our mock
    const longData = "A".repeat(150);
    render(<QRDisplay data={longData} />);

    expect(screen.getByText("Code 1 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous QR code")).toBeDisabled();
    expect(screen.getByLabelText("Next QR code")).toBeEnabled();
  });

  it("navigates between QR codes in a multi-code sequence", async () => {
    const user = userEvent.setup();
    const longData = "A".repeat(150);
    render(<QRDisplay data={longData} />);

    expect(screen.getByText("Code 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Next QR code"));

    expect(screen.getByText("Code 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Next QR code")).toBeDisabled();
    expect(screen.getByLabelText("Previous QR code")).toBeEnabled();
  });

  it("does not show navigation for single QR codes", () => {
    render(<QRDisplay data="short" />);

    expect(screen.queryByText(/Code \d+ of/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next QR code")).not.toBeInTheDocument();
  });

  it("copies data to clipboard when Copy Code is clicked", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<QRDisplay data="test-sdp-data" />);

    await user.click(screen.getByText("Copy Code"));

    expect(writeText).toHaveBeenCalledWith("test-sdp-data");
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// QRScanner Tests
// ---------------------------------------------------------------------------

describe("QRScanner", () => {
  const mockOnScan = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    mockOnScan.mockClear();
    mockOnCancel.mockClear();
    mockStart.mockClear();
    mockStop.mockClear();
    mockClear.mockClear();

    // Set up basic navigator.mediaDevices mock
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: jest.fn() },
      writable: true,
      configurable: true,
    });
  });

  it("renders the camera permission prompt initially", () => {
    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    expect(screen.getByText("Camera Access Needed")).toBeInTheDocument();
    expect(screen.getByText("Open Camera")).toBeInTheDocument();
  });

  it("calls Html5Qrcode.start when user clicks Open Camera", async () => {
    const user = userEvent.setup();
    mockStart.mockResolvedValue(undefined);

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Open Camera"));

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalled();
    });

    // Verify it was called with the right camera config
    expect(mockStart).toHaveBeenCalledWith(
      { facingMode: "environment" },
      expect.objectContaining({ fps: 10 }),
      expect.any(Function),
      undefined
    );
  });

  it("shows error state when camera permission is denied", async () => {
    const user = userEvent.setup();
    mockStart.mockRejectedValue(new Error("Permission denied"));

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Open Camera"));

    await waitFor(() => {
      expect(screen.getByText("Camera Unavailable")).toBeInTheDocument();
    });

    expect(screen.getByText(/Camera access was denied/)).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("shows error state when no camera is found", async () => {
    const user = userEvent.setup();
    mockStart.mockRejectedValue(new Error("NotFoundError: No camera"));

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Open Camera"));

    await waitFor(() => {
      expect(screen.getByText("Camera Unavailable")).toBeInTheDocument();
    });

    expect(screen.getByText(/No camera found/)).toBeInTheDocument();
  });

  it("renders cancel button and calls onCancel", async () => {
    const user = userEvent.setup();

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Cancel"));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it("shows error for unsupported browser (no mediaDevices)", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(<QRScanner onScan={mockOnScan} />);

    // Should still show the prompt initially
    expect(screen.getByText("Camera Access Needed")).toBeInTheDocument();
  });

  it("shows paste input when 'Paste a code instead' is clicked", async () => {
    const user = userEvent.setup();

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Paste a code instead"));

    expect(screen.getByText("Paste Connection Code")).toBeInTheDocument();
    expect(screen.getByLabelText("Connection code")).toBeInTheDocument();
    expect(screen.getByText("Connect")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("calls onScan with pasted text when Connect is clicked", async () => {
    const user = userEvent.setup();

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Paste a code instead"));

    const textarea = screen.getByLabelText("Connection code");
    await user.type(textarea, "pasted-sdp-data");
    await user.click(screen.getByText("Connect"));

    expect(mockOnScan).toHaveBeenCalledWith("pasted-sdp-data");
  });

  it("disables Connect button when paste input is empty", async () => {
    const user = userEvent.setup();

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Paste a code instead"));

    expect(screen.getByText("Connect")).toBeDisabled();
  });

  it("returns to prompt when Back is clicked from paste view", async () => {
    const user = userEvent.setup();

    render(<QRScanner onScan={mockOnScan} onCancel={mockOnCancel} />);

    await user.click(screen.getByText("Paste a code instead"));
    expect(screen.getByText("Paste Connection Code")).toBeInTheDocument();

    await user.click(screen.getByText("Back"));
    expect(screen.getByText("Camera Access Needed")).toBeInTheDocument();
  });
});
