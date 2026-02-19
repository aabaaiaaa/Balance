"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import QRCode from "react-qr-code";
import { splitIntoChunks } from "@/lib/qr-multicode";

/** Bytes per chunk in multi-QR mode — produces more, lower-density codes. */
const MULTI_MODE_CHUNK_BYTES = 300;

/** Auto-cycle interval in milliseconds. */
const AUTO_CYCLE_MS = 2500;

interface QRDisplayProps {
  /** The full data string to encode (will be split into multiple QR codes if needed). */
  data: string;
  /** Size of the QR code in pixels. Defaults to 256. */
  size?: number;
  /** Optional label shown above the QR code. */
  label?: string;
}

/**
 * Renders a data string as one or more QR codes.
 * If the payload exceeds a single QR code's capacity, it displays a sequence
 * with manual "Previous" / "Next" navigation and a progress indicator.
 *
 * Users can toggle "Split into smaller codes" to produce many lower-density
 * codes that auto-cycle for easier scanning.
 */
export function QRDisplay({ data, size = 256, label }: QRDisplayProps) {
  const [multiMode, setMultiMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [autoCycling, setAutoCycling] = useState(true);
  const autoCycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const defaultChunks = useMemo(() => splitIntoChunks(data), [data]);
  const multiChunks = useMemo(() => splitIntoChunks(data, MULTI_MODE_CHUNK_BYTES), [data]);

  const chunks = multiMode ? multiChunks : defaultChunks;
  const isMulti = chunks.length > 1;

  // Auto-cycle timer
  useEffect(() => {
    if (multiMode && isMulti && autoCycling) {
      autoCycleTimerRef.current = setInterval(() => {
        setCurrentIndex((i) => (i + 1) % chunks.length);
      }, AUTO_CYCLE_MS);
    }
    return () => {
      if (autoCycleTimerRef.current !== null) {
        clearInterval(autoCycleTimerRef.current);
        autoCycleTimerRef.current = null;
      }
    };
  }, [multiMode, isMulti, autoCycling, chunks.length]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [data]);

  const toggleMultiMode = useCallback(() => {
    setMultiMode((m) => {
      const entering = !m;
      if (entering) setAutoCycling(true);
      return entering;
    });
    setCurrentIndex(0);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      {label && <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{label}</p>}

      {/* White background ensures QR scannability regardless of app theme */}
      <div className="rounded-xl bg-white p-4">
        <QRCode
          value={chunks[currentIndex]}
          size={size}
          level={isMulti ? "L" : "M"}
          bgColor="#FFFFFF"
          fgColor="#000000"
        />
      </div>

      {isMulti && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Code {currentIndex + 1} of {chunks.length}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => (i - 1 + chunks.length) % chunks.length)}
              className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
              aria-label="Previous QR code"
            >
              Previous
            </button>
            {multiMode && (
              <button
                type="button"
                onClick={() => setAutoCycling((a) => !a)}
                className="rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
                aria-label={autoCycling ? "Pause auto-cycle" : "Resume auto-cycle"}
              >
                {autoCycling ? "Pause" : "Resume"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => (i + 1) % chunks.length)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
              aria-label="Next QR code"
            >
              Next
            </button>
          </div>

          {/* Dot indicators */}
          <div className="flex gap-1.5" aria-hidden="true">
            {chunks.map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentIndex ? "bg-indigo-600" : "bg-gray-300 dark:bg-slate-600"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Multi-mode toggle */}
      <button
        type="button"
        onClick={toggleMultiMode}
        className="text-sm font-medium text-indigo-600 dark:text-indigo-400 transition-colors hover:text-indigo-700 dark:hover:text-indigo-300"
      >
        {multiMode ? "Show single code" : "Split into smaller codes"}
      </button>

      <button
        type="button"
        onClick={handleCopy}
        className="text-sm font-medium text-indigo-600 dark:text-indigo-400 transition-colors hover:text-indigo-700 dark:hover:text-indigo-300"
      >
        {copied ? "Copied!" : "Copy Code"}
      </button>
    </div>
  );
}
