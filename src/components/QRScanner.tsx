"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { parseChunk, reassembleChunks } from "@/lib/qr-multicode";

type ScannerState =
  | "prompt" // asking the user to grant camera permission
  | "scanning" // camera active, scanning for QR codes
  | "complete" // all chunks received (multi-code) or single code scanned
  | "error"; // unrecoverable error (denied permission, unsupported browser, etc.)

interface QRScannerProps {
  /** Called with the fully reassembled data once all QR code parts have been scanned. */
  onScan: (data: string) => void;
  /** Optional callback when the user cancels / closes the scanner. */
  onCancel?: () => void;
}

const SCANNER_ELEMENT_ID = "qr-scanner-region";

/**
 * Opens the device camera, scans QR codes, and returns decoded data.
 * Supports multi-code sequences: tracks which parts have been received and
 * signals via `onScan` when all chunks are captured.
 */
export function QRScanner({ onScan, onCancel }: QRScannerProps) {
  const [state, setState] = useState<ScannerState>("prompt");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Multi-code tracking
  const [expectedTotal, setExpectedTotal] = useState<number | null>(null);
  const receivedRef = useRef<Map<number, string>>(new Map());
  const [receivedCount, setReceivedCount] = useState(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);

  // Clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch {
        // Ignore errors during cleanup
      }
      scannerRef.current = null;
    }
  }, []);

  const handleDecodedText = useCallback(
    (decodedText: string) => {
      const parsed = parseChunk(decodedText);

      if (!parsed) {
        // Not in multi-code format — treat as a single complete payload
        stopScanner();
        if (mountedRef.current) {
          setState("complete");
          onScan(decodedText);
        }
        return;
      }

      const { index, total, payload } = parsed;

      // First chunk establishes the expected total
      if (expectedTotal === null) {
        setExpectedTotal(total);
      }

      // Store the chunk if not already received
      if (!receivedRef.current.has(index)) {
        receivedRef.current.set(index, payload);
        const newCount = receivedRef.current.size;
        setReceivedCount(newCount);

        // Check if all chunks are in
        if (newCount === total) {
          const assembled = reassembleChunks(receivedRef.current, total);
          stopScanner();
          if (mountedRef.current && assembled !== null) {
            setState("complete");
            onScan(assembled);
          }
        }
      }
    },
    [expectedTotal, onScan, stopScanner],
  );

  const startScanning = useCallback(async () => {
    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState("error");
      setErrorMessage(
        "Your browser doesn't support camera access. Please use a modern browser like Chrome, Safari, or Firefox.",
      );
      return;
    }

    setState("scanning");

    try {
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, {
        verbose: false,
        formatsToSupport: [0], // QR_CODE format
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleDecodedText(decodedText),
        undefined,
      );
    } catch (err) {
      if (!mountedRef.current) return;

      const message =
        err instanceof Error ? err.message.toLowerCase() : String(err);

      if (
        message.includes("permission") ||
        message.includes("denied") ||
        message.includes("notallowederror")
      ) {
        setState("error");
        setErrorMessage(
          "Camera access was denied. To scan QR codes, please allow camera access in your browser settings and try again.",
        );
      } else if (
        message.includes("notfounderror") ||
        message.includes("no camera")
      ) {
        setState("error");
        setErrorMessage(
          "No camera found on this device. You need a camera to scan QR codes.",
        );
      } else {
        setState("error");
        setErrorMessage(
          "Could not start the camera. Please check your browser settings and try again.",
        );
      }
    }
  }, [handleDecodedText]);

  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    receivedRef.current = new Map();
    setReceivedCount(0);
    setExpectedTotal(null);
    setState("prompt");
  }, []);

  // Prompt state — explain why camera is needed and offer to start
  if (state === "prompt") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 text-center">
        {/* Camera icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-indigo-600 dark:text-indigo-400"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Camera Access Needed
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Balance needs your camera to scan the QR code shown on the other
            device. Your camera is only used for scanning — no images are stored
            or sent anywhere.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={startScanning}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
          >
            Open Camera
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // Scanning state — camera is active
  if (state === "scanning") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full max-w-sm overflow-hidden rounded-xl"
        />

        {/* Multi-code progress */}
        {expectedTotal !== null && expectedTotal > 1 && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
              Scanned {receivedCount} of {expectedTotal} codes
            </p>
            {/* Progress bar */}
            <div className="h-2 w-48 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{
                  width: `${(receivedCount / expectedTotal) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Point your camera at each QR code in sequence
            </p>
          </div>
        )}

        {expectedTotal === null && (
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Point your camera at the QR code
          </p>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={() => {
              stopScanner();
              onCancel();
            }}
            className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 px-4 text-center">
        {/* Error icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-600 dark:text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Camera Unavailable
          </h3>
          {errorMessage && (
            <p className="text-sm text-gray-600 dark:text-slate-300">{errorMessage}</p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
          >
            Try Again
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // Complete state — brief confirmation (parent typically navigates away)
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-green-600 dark:text-green-400"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Scan complete</p>
    </div>
  );
}
