"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { QRDisplay } from "@/components/QRDisplay";
import { QRScanner } from "@/components/QRScanner";
import { PeerConnection } from "@/lib/peer-connection";
import {
  buildBackup,
  validateBackupFile,
  importReplaceAll,
  importMerge,
  type BackupFile,
  type ImportResult,
} from "@/lib/backup";
import {
  buildRemotePeerConfig,
  buildLocalPeerConfig,
  getRemoteConnectionErrorMessage,
} from "@/lib/remote-peer-config";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sender flow states:
 *   choose-role → creating-offer → show-offer → scan-answer → connecting → transferring → complete
 *
 * Receiver flow states:
 *   choose-role → choose-import-mode → scan-offer → creating-answer → show-answer → connecting → transferring → complete
 */
type TransferStep =
  | "choose-role"
  | "choose-import-mode"
  | "creating-offer"
  | "show-offer"
  | "scan-answer"
  | "scan-offer"
  | "creating-answer"
  | "show-answer"
  | "connecting"
  | "transferring"
  | "complete"
  | "error";

type TransferRole = "sender" | "receiver";
type ImportMode = "replace" | "merge";
type NetworkMode = "local" | "remote";

/** Protocol messages exchanged over the data channel. */
interface TransferBackupMessage {
  type: "transfer-backup";
  backup: BackupFile;
}

interface TransferCompleteMessage {
  type: "transfer-complete";
  recordsImported: number;
}

type TransferMessage = TransferBackupMessage | TransferCompleteMessage;

interface DeviceTransferFlowProps {
  /** Called when the user wants to exit the transfer flow. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeviceTransferFlow({ onClose }: DeviceTransferFlowProps) {
  const [step, setStep] = useState<TransferStep>("choose-role");
  const [role, setRole] = useState<TransferRole | null>(null);
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [networkMode, setNetworkMode] = useState<NetworkMode>("local");
  const [offerData, setOfferData] = useState<string | null>(null);
  const [answerData, setAnswerData] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<ImportResult | null>(null);
  const [recordsSent, setRecordsSent] = useState<number>(0);

  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const peerRef = useRef<PeerConnection | null>(null);
  const waitTimersRef = useRef<{ interval?: ReturnType<typeof setInterval>; timeout?: ReturnType<typeof setTimeout> }>({});

  // Clean up peer connection and timers on unmount
  useEffect(() => {
    const timers = waitTimersRef.current;
    return () => {
      peerRef.current?.close();
      clearInterval(timers.interval);
      clearTimeout(timers.timeout);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Error handler
  // -----------------------------------------------------------------------

  const handleError = useCallback((message: string, isRemote?: boolean) => {
    peerRef.current?.close();
    peerRef.current = null;
    setErrorMessage(
      isRemote ? getRemoteConnectionErrorMessage(message) : message,
    );
    setStep("error");
  }, []);

  // -----------------------------------------------------------------------
  // Sender: build backup and send over data channel
  // -----------------------------------------------------------------------

  const runSenderTransfer = useCallback(
    async (peer: PeerConnection) => {
      setStep("transferring");
      try {
        const backup = await buildBackup();
        const message: TransferBackupMessage = {
          type: "transfer-backup",
          backup,
        };
        peer.send(JSON.stringify(message));
        setRecordsSent(backup.totalRecords);

        // Wait for the receiver's acknowledgement
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Transfer timed out waiting for confirmation."));
          }, 120_000);

          peer.onMessage((data) => {
            clearTimeout(timeout);
            try {
              const reply = JSON.parse(data) as TransferMessage;
              if (reply.type === "transfer-complete") {
                resolve();
              } else {
                reject(new Error("Unexpected response from receiver."));
              }
            } catch {
              reject(new Error("Invalid response from receiver."));
            }
          });
        });

        setStep("complete");
      } catch (err) {
        handleError(
          err instanceof Error ? err.message : "Transfer failed unexpectedly.",
        );
      } finally {
        peer.close();
        peerRef.current = null;
      }
    },
    [handleError],
  );

  // -----------------------------------------------------------------------
  // Receiver: receive backup and import
  // -----------------------------------------------------------------------

  const runReceiverTransfer = useCallback(
    async (peer: PeerConnection, mode: ImportMode) => {
      setStep("transferring");
      try {
        const result = await new Promise<ImportResult>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Transfer timed out waiting for data."));
          }, 120_000);

          peer.onMessage(async (data) => {
            clearTimeout(timeout);
            try {
              const msg = JSON.parse(data) as TransferMessage;
              if (msg.type !== "transfer-backup") {
                reject(new Error("Unexpected message from sender."));
                return;
              }

              const backup = validateBackupFile(msg.backup);
              const importResult =
                mode === "replace"
                  ? await importReplaceAll(backup)
                  : await importMerge(backup);

              // Send acknowledgement
              const reply: TransferCompleteMessage = {
                type: "transfer-complete",
                recordsImported: importResult.totalImported,
              };
              peer.send(JSON.stringify(reply));

              resolve(importResult);
            } catch (err) {
              reject(
                err instanceof Error
                  ? err
                  : new Error("Failed to process transfer data."),
              );
            }
          });
        });

        setTransferResult(result);
        setStep("complete");
      } catch (err) {
        handleError(
          err instanceof Error ? err.message : "Transfer failed unexpectedly.",
        );
      } finally {
        peer.close();
        peerRef.current = null;
      }
    },
    [handleError],
  );

  // -----------------------------------------------------------------------
  // Sender flow: create offer, show QR, scan answer, connect, transfer
  // -----------------------------------------------------------------------

  const handleStartSender = useCallback(async () => {
    setRole("sender");
    setStep("creating-offer");
    try {
      const config =
        networkMode === "remote"
          ? buildRemotePeerConfig(prefs?.remoteSyncConfig)
          : buildLocalPeerConfig();
      const peer = new PeerConnection(config);
      peerRef.current = peer;

      const offer = await peer.createOffer();
      setOfferData(offer);
      setStep("show-offer");
    } catch (err) {
      handleError(
        err instanceof Error
          ? err.message
          : "Failed to create connection offer.",
        networkMode === "remote",
      );
    }
  }, [handleError, networkMode, prefs?.remoteSyncConfig]);

  const handleAnswerScanned = useCallback(
    async (scannedAnswer: string) => {
      setStep("connecting");
      try {
        const peer = peerRef.current;
        if (!peer) {
          handleError("Connection lost. Please try again.");
          return;
        }

        await peer.completeConnection(scannedAnswer);
        await runSenderTransfer(peer);
      } catch (err) {
        handleError(
          err instanceof Error
            ? err.message
            : "Failed to establish connection.",
          networkMode === "remote",
        );
      }
    },
    [handleError, runSenderTransfer, networkMode],
  );

  // -----------------------------------------------------------------------
  // Receiver flow: choose import mode, scan offer, create answer, wait
  // -----------------------------------------------------------------------

  const handleStartReceiver = useCallback(() => {
    setRole("receiver");
    setStep("choose-import-mode");
  }, []);

  const handleImportModeChosen = useCallback((mode: ImportMode) => {
    setImportMode(mode);
    setStep("scan-offer");
  }, []);

  const handleOfferScanned = useCallback(
    async (scannedOffer: string) => {
      setStep("creating-answer");
      try {
        const config =
          networkMode === "remote"
            ? buildRemotePeerConfig(prefs?.remoteSyncConfig)
            : buildLocalPeerConfig();
        const peer = new PeerConnection(config);
        peerRef.current = peer;

        const answer = await peer.acceptOffer(scannedOffer);
        setAnswerData(answer);
        setStep("show-answer");

        // Wait for the data channel to open, then run receiver transfer
        const waitForOpen = () =>
          new Promise<void>((resolve, reject) => {
            const interval = setInterval(() => {
              if (peer.state === "open") {
                clearInterval(interval);
                resolve();
              } else if (
                peer.state === "failed" ||
                peer.state === "closed"
              ) {
                clearInterval(interval);
                reject(new Error("Connection failed while waiting for sender."));
              }
            }, 200);
            waitTimersRef.current.interval = interval;

            const timeout = setTimeout(() => {
              clearInterval(interval);
              if (peer.state !== "open") {
                reject(
                  new Error(
                    "Connection timed out. Make sure the sender scans your QR code.",
                  ),
                );
              }
            }, 60_000);
            waitTimersRef.current.timeout = timeout;
          });

        waitForOpen()
          .then(() => runReceiverTransfer(peer, importMode!))
          .catch((err) =>
            handleError(
              err instanceof Error
                ? err.message
                : "Connection failed while waiting for sender.",
              networkMode === "remote",
            ),
          );
      } catch (err) {
        handleError(
          err instanceof Error
            ? err.message
            : "Failed to process sender's QR code.",
          networkMode === "remote",
        );
      }
    },
    [handleError, runReceiverTransfer, importMode, networkMode, prefs?.remoteSyncConfig],
  );

  // -----------------------------------------------------------------------
  // Retry: reset everything and start over
  // -----------------------------------------------------------------------

  const handleRetry = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    setRole(null);
    setImportMode(null);
    setOfferData(null);
    setAnswerData(null);
    setErrorMessage(null);
    setTransferResult(null);
    setRecordsSent(0);
    setNetworkMode("local");
    setStep("choose-role");
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
          Device Transfer
        </h2>
        {step !== "transferring" && step !== "connecting" && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 dark:text-slate-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-300"
            aria-label="Close transfer"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Step: Choose Role */}
      {step === "choose-role" && (
        <div className="space-y-4">
          {/* Network mode toggle */}
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-3">
            <p className="mb-2 text-xs font-medium text-gray-500 dark:text-slate-400">
              Connection mode
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNetworkMode("local")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  networkMode === "local"
                    ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                    : "border-gray-200 dark:border-slate-700 bg-white dark:bg-card text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                Local network
              </button>
              <button
                type="button"
                onClick={() => setNetworkMode("remote")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  networkMode === "remote"
                    ? "border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                    : "border-gray-200 dark:border-slate-700 bg-white dark:bg-card text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Remote network
              </button>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-slate-300">
            Transfer all your data from this device to another. This is a one-way
            transfer — choose your role below.
          </p>

          {networkMode === "remote" && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Remote transfer requires internet access and may not work behind
                all network configurations. If it fails, try local network
                mode or use File Export/Import from Settings.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleStartSender}
            className="flex w-full items-center gap-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-600 dark:text-indigo-400"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-100">Send Data</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Transfer your data to another device
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleStartReceiver}
            className="flex w-full items-center gap-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-green-600 dark:text-green-400"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-100">Receive Data</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Receive data from another device
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Step: Choose Import Mode (Receiver only) */}
      {step === "choose-import-mode" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            How should the incoming data be handled?
          </p>

          <button
            type="button"
            onClick={() => handleImportModeChosen("replace")}
            className="flex w-full items-center gap-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-amber-600 dark:text-amber-400"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-100">Replace All</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Clear existing data and replace with incoming data. Best for
                setting up a new device.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleImportModeChosen("merge")}
            className="flex w-full items-center gap-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-blue-600 dark:text-blue-400"
              >
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-100">Merge</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Combine incoming data with existing data using last-write-wins.
                Keeps the most recent version of each record.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStep("choose-role")}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
          >
            Back
          </button>
        </div>
      )}

      {/* Step: Creating Offer (loading) */}
      {step === "creating-offer" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400" />
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Preparing connection...
          </p>
        </div>
      )}

      {/* Step: Show Offer QR (Sender) */}
      {step === "show-offer" && offerData && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 p-3">
            <p className="text-center text-sm font-medium text-indigo-800 dark:text-indigo-300">
              Step 1 of 3: Show this code to the receiving device
            </p>
          </div>

          <QRDisplay
            data={offerData}
            label="Open 'Receive Data' on the other device and scan this code"
          />

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Waiting for receiver to scan...
          </div>

          <button
            type="button"
            onClick={() => setStep("scan-answer")}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
          >
            Receiver has scanned — scan their code now
          </button>
        </div>
      )}

      {/* Step: Scan Answer QR (Sender) */}
      {step === "scan-answer" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 p-3">
            <p className="text-center text-sm font-medium text-indigo-800 dark:text-indigo-300">
              Step 2 of 3: Scan the response code from the receiving device
            </p>
          </div>

          <QRScanner
            onScan={handleAnswerScanned}
            onCancel={() => setStep("show-offer")}
          />
        </div>
      )}

      {/* Step: Scan Offer QR (Receiver) */}
      {step === "scan-offer" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
            <p className="text-center text-sm font-medium text-green-800 dark:text-green-300">
              Step 1 of 3: Scan the code on the sending device
            </p>
          </div>

          <QRScanner
            onScan={handleOfferScanned}
            onCancel={() => setStep("choose-import-mode")}
          />
        </div>
      )}

      {/* Step: Creating Answer (loading) */}
      {step === "creating-answer" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 dark:border-green-800 border-t-green-600 dark:border-t-green-400" />
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Processing sender&apos;s connection...
          </p>
        </div>
      )}

      {/* Step: Show Answer QR (Receiver) */}
      {step === "show-answer" && answerData && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
            <p className="text-center text-sm font-medium text-green-800 dark:text-green-300">
              Step 2 of 3: Show this code to the sending device
            </p>
          </div>

          <QRDisplay
            data={answerData}
            label="Ask the sender to scan this code"
          />

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Waiting for sender to scan...
          </div>
        </div>
      )}

      {/* Step: Connecting */}
      {step === "connecting" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400" />
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Establishing connection...
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            {networkMode === "remote"
              ? "Connecting across networks — this may take a moment"
              : "Both devices must be on the same Wi-Fi network"}
          </p>
        </div>
      )}

      {/* Step: Transferring */}
      {step === "transferring" && (
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {role === "sender" ? "Sending data..." : "Receiving data..."}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              {role === "sender"
                ? "Transferring your full dataset to the other device. Keep this screen open."
                : `Waiting for data from sender (${importMode === "replace" ? "Replace All" : "Merge"} mode). Keep this screen open.`}
            </p>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {step === "complete" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              Transfer Complete
            </h3>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
            {role === "sender" && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-slate-300">Records sent</span>
                <span className="font-medium text-gray-900 dark:text-slate-100">
                  {recordsSent}
                </span>
              </div>
            )}
            {role === "receiver" && transferResult && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-slate-300">Import mode</span>
                  <span className="font-medium capitalize text-gray-900 dark:text-slate-100">
                    {transferResult.mode}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-slate-300">Records imported</span>
                  <span className="font-medium text-gray-900 dark:text-slate-100">
                    {transferResult.totalImported}
                  </span>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
          >
            Done
          </button>
        </div>
      )}

      {/* Step: Error */}
      {step === "error" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
              Transfer Failed
            </h3>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
              <p className="whitespace-pre-line text-sm text-red-800 dark:text-red-300">{errorMessage}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleRetry}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
