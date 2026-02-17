"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { QRDisplay } from "@/components/QRDisplay";
import { QRScanner } from "@/components/QRScanner";
import { PeerConnection } from "@/lib/peer-connection";
import { performSync, type SyncProgress, type MergeSummary } from "@/lib/sync";
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
 * The sync flow is a state machine with the following states:
 *
 * - choose-role:   User picks "Start Sync" (initiator) or "Join Sync" (joiner)
 * - creating-offer: Initiator is generating the WebRTC offer
 * - show-offer:    Initiator displays offer QR, waiting for partner to scan
 * - scan-answer:   Initiator scans partner's answer QR
 * - scan-offer:    Joiner scans initiator's offer QR
 * - creating-answer: Joiner is generating the WebRTC answer
 * - show-answer:   Joiner displays answer QR, waiting for initiator to scan
 * - connecting:    WebRTC connection is being established
 * - syncing:       Data exchange in progress
 * - complete:      Sync finished successfully
 * - error:         Something went wrong
 */
type SyncStep =
  | "choose-role"
  | "creating-offer"
  | "show-offer"
  | "scan-answer"
  | "creating-answer"
  | "show-answer"
  | "scan-offer"
  | "connecting"
  | "syncing"
  | "complete"
  | "error";

type NetworkMode = "local" | "remote";

interface SyncFlowProps {
  /** Called when the user wants to exit the sync flow. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncFlow({ onClose }: SyncFlowProps) {
  const [step, setStep] = useState<SyncStep>("choose-role");
  const [networkMode, setNetworkMode] = useState<NetworkMode>("local");
  const [offerData, setOfferData] = useState<string | null>(null);
  const [answerData, setAnswerData] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [mergeSummary, setMergeSummary] = useState<MergeSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const prefs = useLiveQuery(() => db.userPreferences.get("prefs"));
  const peerRef = useRef<PeerConnection | null>(null);

  // Clean up peer connection on unmount
  useEffect(() => {
    return () => {
      peerRef.current?.close();
    };
  }, []);

  // -----------------------------------------------------------------------
  // Progress callback for the sync protocol
  // -----------------------------------------------------------------------

  const handleProgress = useCallback((progress: SyncProgress) => {
    setSyncProgress(progress);
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
  // Run the sync once a connection is open
  // -----------------------------------------------------------------------

  const runSync = useCallback(
    async (peer: PeerConnection) => {
      setStep("syncing");
      try {
        const summary = await performSync(peer, handleProgress);
        setMergeSummary(summary);
        setStep("complete");
      } catch (err) {
        handleError(
          err instanceof Error ? err.message : "Sync failed unexpectedly.",
        );
      } finally {
        peer.close();
        peerRef.current = null;
      }
    },
    [handleProgress, handleError],
  );

  // -----------------------------------------------------------------------
  // Initiator flow: Start Sync
  // -----------------------------------------------------------------------

  const handleStartSync = useCallback(async () => {
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
        await runSync(peer);
      } catch (err) {
        handleError(
          err instanceof Error
            ? err.message
            : "Failed to establish connection.",
          networkMode === "remote",
        );
      }
    },
    [handleError, runSync, networkMode],
  );

  // -----------------------------------------------------------------------
  // Joiner flow: Join Sync
  // -----------------------------------------------------------------------

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

        // The joiner's data channel opens when the initiator completes the
        // connection. We wait for the channel to be ready, then run sync.
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
                reject(new Error("Connection failed while waiting for partner."));
              }
            }, 200);

            // Timeout after 60 seconds
            setTimeout(() => {
              clearInterval(interval);
              if (peer.state !== "open") {
                reject(
                  new Error(
                    "Connection timed out. Make sure your partner scans the QR code.",
                  ),
                );
              }
            }, 60_000);
          });

        waitForOpen()
          .then(() => runSync(peer))
          .catch((err) =>
            handleError(
              err instanceof Error
                ? err.message
                : "Connection failed while waiting for partner.",
              networkMode === "remote",
            ),
          );
      } catch (err) {
        handleError(
          err instanceof Error
            ? err.message
            : "Failed to process partner's QR code.",
          networkMode === "remote",
        );
      }
    },
    [handleError, runSync, networkMode, prefs?.remoteSyncConfig],
  );

  // -----------------------------------------------------------------------
  // Retry: reset everything and start over
  // -----------------------------------------------------------------------

  const handleRetry = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    setOfferData(null);
    setAnswerData(null);
    setSyncProgress(null);
    setMergeSummary(null);
    setErrorMessage(null);
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
          Sync with Partner
        </h2>
        {step !== "syncing" && step !== "connecting" && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 dark:text-slate-500 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-300"
            aria-label="Close sync"
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
            {networkMode === "local"
              ? "Both devices need to be on the same Wi-Fi network. One device starts the sync, the other joins."
              : "Connect across different networks using the internet. Both devices need an internet connection. Make sure both devices select \"Remote network\" mode."}
          </p>

          {networkMode === "remote" && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Remote sync requires internet access and may not work behind
                all network configurations. If it fails, try local network
                mode or use File Export/Import from Settings.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleStartSync}
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
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-100">Start Sync</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Show a QR code for your partner to scan
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStep("scan-offer")}
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
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-slate-100">Join Sync</p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Scan the QR code on your partner&apos;s device
              </p>
            </div>
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

      {/* Step: Show Offer QR (Initiator) */}
      {step === "show-offer" && offerData && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 p-3">
            <p className="text-center text-sm font-medium text-indigo-800 dark:text-indigo-300">
              Step 1 of 3: Show this code to your partner
            </p>
          </div>

          <QRDisplay
            data={offerData}
            label="Ask your partner to tap 'Join Sync' and scan this code"
          />

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Waiting for partner to scan...
          </div>

          <button
            type="button"
            onClick={() => setStep("scan-answer")}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
          >
            Partner has scanned — scan their code now
          </button>
        </div>
      )}

      {/* Step: Scan Answer QR (Initiator) */}
      {step === "scan-answer" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 p-3">
            <p className="text-center text-sm font-medium text-indigo-800 dark:text-indigo-300">
              Step 2 of 3: Scan your partner&apos;s response code
            </p>
          </div>

          <QRScanner
            onScan={handleAnswerScanned}
            onCancel={() => setStep("show-offer")}
          />
        </div>
      )}

      {/* Step: Scan Offer QR (Joiner) */}
      {step === "scan-offer" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
            <p className="text-center text-sm font-medium text-green-800 dark:text-green-300">
              Step 1 of 3: Scan the code on your partner&apos;s device
            </p>
          </div>

          <QRScanner
            onScan={handleOfferScanned}
            onCancel={() => setStep("choose-role")}
          />
        </div>
      )}

      {/* Step: Creating Answer (loading) */}
      {step === "creating-answer" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 dark:border-green-800 border-t-green-600 dark:border-t-green-400" />
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Processing partner&apos;s connection...
          </p>
        </div>
      )}

      {/* Step: Show Answer QR (Joiner) */}
      {step === "show-answer" && answerData && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 dark:border-green-800 bg-green-50 dark:bg-green-950 p-3">
            <p className="text-center text-sm font-medium text-green-800 dark:text-green-300">
              Step 2 of 3: Show this code to your partner
            </p>
          </div>

          <QRDisplay
            data={answerData}
            label="Ask your partner to scan this code"
          />

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Waiting for partner to scan...
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

      {/* Step: Syncing (data exchange in progress) */}
      {step === "syncing" && (
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
              Syncing data...
            </p>
          </div>

          {syncProgress && (
            <div className="space-y-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-slate-300">Status</span>
                <span className="font-medium capitalize text-gray-900 dark:text-slate-100">
                  {syncProgress.phase}
                </span>
              </div>

              {syncProgress.recordsSent > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-slate-300">Sending</span>
                  <span className="font-medium text-gray-900 dark:text-slate-100">
                    {syncProgress.recordsSent} records
                  </span>
                </div>
              )}

              {syncProgress.recordsReceived > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-slate-300">Receiving</span>
                  <span className="font-medium text-gray-900 dark:text-slate-100">
                    {syncProgress.recordsReceived} records
                  </span>
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-slate-400">{syncProgress.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Step: Complete */}
      {step === "complete" && mergeSummary && (
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
              Sync Complete
            </h3>
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-300">Records sent</span>
              <span className="font-medium text-gray-900 dark:text-slate-100">
                {mergeSummary.totalSent}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-300">Records received</span>
              <span className="font-medium text-gray-900 dark:text-slate-100">
                {mergeSummary.totalReceived}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-300">Conflicts resolved</span>
              <span className="font-medium text-gray-900 dark:text-slate-100">
                {mergeSummary.totalRemoteWins + mergeSummary.totalLocalWins}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-slate-300">Records updated</span>
              <span className="font-medium text-gray-900 dark:text-slate-100">
                {mergeSummary.totalUpserted}
              </span>
            </div>
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
              Sync Failed
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
