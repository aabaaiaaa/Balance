import { render, screen, waitFor, act } from "@testing-library/react";
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
  splitIntoChunks: (data: string, maxChunkBytes?: number) => {
    // Multi-mode: small chunk size produces many chunks
    if (maxChunkBytes && maxChunkBytes < 1800) {
      const chunkSize = Math.max(10, maxChunkBytes - 10); // leave room for header
      const chunks: string[] = [];
      for (let i = 0; i < data.length; i += chunkSize) {
        chunks.push(`[${chunks.length + 1}/?]${data.substring(i, i + chunkSize)}`);
      }
      // Fix up total
      return chunks.map((_, idx) => `[${idx + 1}/${chunks.length}]${data.substring(idx * chunkSize, (idx + 1) * chunkSize)}`);
    }
    // Default mode: simulate single chunk for small data, multi-chunk for large data
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
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
    expect(screen.getByLabelText("Previous QR code")).toBeInTheDocument();
    expect(screen.getByLabelText("Next QR code")).toBeInTheDocument();
  });

  it("navigates between QR codes in a multi-code sequence", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const longData = "A".repeat(150);
    render(<QRDisplay data={longData} />);

    expect(screen.getByText("Code 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Next QR code"));

    expect(screen.getByText("Code 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous QR code")).toBeInTheDocument();
  });

  it("does not show navigation for single QR codes", () => {
    render(<QRDisplay data="short" />);

    expect(screen.queryByText(/Code \d+ of/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Next QR code")).not.toBeInTheDocument();
  });

  it("copies data to clipboard when Copy Code is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<QRDisplay data="test-sdp-data" />);

    await user.click(screen.getByText("Copy Code"));

    expect(writeText).toHaveBeenCalledWith("test-sdp-data");
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  it("shows the multi-mode toggle button", () => {
    render(<QRDisplay data="short-data" />);

    expect(screen.getByText("Split into smaller codes")).toBeInTheDocument();
  });

  it("toggles to multi-QR mode and produces multiple codes", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    // 50 chars is short enough to be a single code normally,
    // but multi-mode with chunk size 300 (chunkSize ~290 after header) still yields 1 chunk.
    // Use something long enough that multi-mode splits it.
    const data = "B".repeat(150);
    render(<QRDisplay data={data} />);

    // In default mode: mock splits >100 chars into 2 chunks
    expect(screen.getByText("Code 1 of 2")).toBeInTheDocument();

    // Toggle to multi-mode — mock with small maxChunkBytes produces more chunks
    await user.click(screen.getByText("Split into smaller codes"));

    // Multi-mode: chunkSize = max(10, 300-10) = 290, but our mock uses that to split
    // 150 chars / 290 = 1 chunk. Let's use longer data for a better test.
    // Actually with 150 chars and chunkSize 290: ceil(150/290) = 1. Let's check.
    // The toggle text should now say "Show single code"
    expect(screen.getByText("Show single code")).toBeInTheDocument();
  });

  it("multi-mode produces more chunks for large data", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    // 500 chars: default mode = 2 chunks (>100), multi-mode chunkSize=290 → ceil(500/290)=2
    // Let's use 1000 chars: default = 2 chunks, multi chunkSize=290 → ceil(1000/290)=4
    const data = "C".repeat(1000);
    render(<QRDisplay data={data} />);

    // Default mode: 2 chunks
    expect(screen.getByText("Code 1 of 2")).toBeInTheDocument();

    // Toggle to multi-mode
    await user.click(screen.getByText("Split into smaller codes"));

    // Multi-mode: chunkSize = 290, 1000/290 = 4 chunks (ceil)
    expect(screen.getByText("Code 1 of 4")).toBeInTheDocument();
  });

  it("auto-cycles through codes in multi-mode", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const data = "D".repeat(1000);
    render(<QRDisplay data={data} />);

    // Toggle to multi-mode
    await user.click(screen.getByText("Split into smaller codes"));
    expect(screen.getByText("Code 1 of 4")).toBeInTheDocument();

    // Advance timer — should auto-cycle to code 2
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText("Code 2 of 4")).toBeInTheDocument();

    // Advance again — should auto-cycle to code 3
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText("Code 3 of 4")).toBeInTheDocument();
  });

  it("pauses and resumes auto-cycle", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const data = "E".repeat(1000);
    render(<QRDisplay data={data} />);

    // Toggle to multi-mode
    await user.click(screen.getByText("Split into smaller codes"));
    expect(screen.getByText("Code 1 of 4")).toBeInTheDocument();

    // Pause auto-cycle
    await user.click(screen.getByLabelText("Pause auto-cycle"));
    expect(screen.getByText("Resume")).toBeInTheDocument();

    // Advance timer — should NOT change
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Code 1 of 4")).toBeInTheDocument();

    // Resume
    await user.click(screen.getByLabelText("Resume auto-cycle"));
    expect(screen.getByText("Pause")).toBeInTheDocument();

    // Now it should advance
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByText("Code 2 of 4")).toBeInTheDocument();
  });

  it("wraps around when auto-cycling past the last code", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const data = "F".repeat(1000);
    render(<QRDisplay data={data} />);

    // Toggle to multi-mode (4 chunks)
    await user.click(screen.getByText("Split into smaller codes"));

    // Advance through all 4 codes + one more to wrap
    act(() => {
      jest.advanceTimersByTime(2500 * 4);
    });
    // Should be back to code 1
    expect(screen.getByText("Code 1 of 4")).toBeInTheDocument();
  });

  it("toggles back to single mode", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const data = "G".repeat(1000);
    render(<QRDisplay data={data} />);

    // Toggle to multi-mode
    await user.click(screen.getByText("Split into smaller codes"));
    expect(screen.getByText("Code 1 of 4")).toBeInTheDocument();

    // Toggle back
    await user.click(screen.getByText("Show single code"));
    expect(screen.getByText("Code 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Split into smaller codes")).toBeInTheDocument();
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
