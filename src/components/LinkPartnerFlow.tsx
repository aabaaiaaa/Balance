"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { QRDisplay } from "@/components/QRDisplay";
import { QRScanner } from "@/components/QRScanner";
import { PeerConnection } from "@/lib/peer-connection";
import { performSync, type SyncProgress, type MergeSummary } from "@/lib/sync";
import { db } from "@/lib/db";
import { generateDeviceId } from "@/lib/device-id";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The link flow is a state machine extending the sync QR signalling flow
 * with an additional link-request/acceptance handshake.
 *
 * Initiator (Device A): choose-role → creating-offer → show-offer → scan-answer
 *   → connecting → sending-link-request → waiting-acceptance → syncing → complete
 *
 * Joiner (Device B): choose-role → scan-offer → creating-answer → show-answer
 *   → connecting → waiting-link-request → confirm-link → syncing → complete
 */
type LinkStep =
  | "choose-role"
  | "creating-offer"
  | "show-offer"
  | "scan-answer"
  | "scan-offer"
  | "creating-answer"
  | "show-answer"
  | "connecting"
  | "sending-link-request"
  | "waiting-acceptance"
  | "waiting-link-request"
  | "confirm-link"
  | "syncing"
  | "complete"
  | "error";

/** Messages exchanged over the data channel during the link handshake. */
interface LinkRequestMessage {
  type: "link-request";
  deviceId: string;
  householdId: string;
}

interface LinkAcceptMessage {
  type: "link-accept";
  deviceId: string;
}

interface LinkRejectMessage {
  type: "link-reject";
}

type LinkMessage = LinkRequestMessage | LinkAcceptMessage | LinkRejectMessage;

interface LinkPartnerFlowProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkPartnerFlow({ onClose }: LinkPartnerFlowProps) {
  const [step, setStep] = useState<LinkStep>("choose-role");
  const [offerData, setOfferData] = useState<string | null>(null);
  const [answerData, setAnswerData] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [mergeSummary, setMergeSummary] = useState<MergeSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [partnerDeviceId, setPartnerDeviceId] = useState<string | null>(null);
  const [linkRequest, setLinkRequest] = useState<LinkRequestMessage | null>(null);

  const peerRef = useRef<PeerConnection | null>(null);
  const roleRef = useRef<"initiator" | "joiner" | null>(null);

  // Clean up peer connection on unmount
  useEffect(() => {
    return () => {
      peerRef.current?.close();
    };
  }, []);

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const handleProgress = useCallback((progress: SyncProgress) => {
    setSyncProgress(progress);
  }, []);

  const handleError = useCallback((message: string) => {
    peerRef.current?.close();
    peerRef.current = null;
    setErrorMessage(message);
    setStep("error");
  }, []);

  // -----------------------------------------------------------------------
  // Run the full data sync after linking is complete
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
  // Save link data to preferences
  // -----------------------------------------------------------------------

  const saveLinkData = useCallback(
    async (householdId: string, partnerDevice: string) => {
      await db.userPreferences.update("prefs", {
        householdId,
        partnerDeviceId: partnerDevice,
      });
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Initiator flow: Device A starts the link
  // -----------------------------------------------------------------------

  const handleStartLink = useCallback(async () => {
    roleRef.current = "initiator";
    setStep("creating-offer");
    try {
      const peer = new PeerConnection();
      peerRef.current = peer;

      const offer = await peer.createOffer();
      setOfferData(offer);
      setStep("show-offer");
    } catch (err) {
      handleError(
        err instanceof Error
          ? err.message
          : "Failed to create connection offer.",
      );
    }
  }, [handleError]);

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

        // Connection is open — send link request
        setStep("sending-link-request");

        const prefs = await db.userPreferences.get("prefs");
        if (!prefs) {
          handleError("User preferences not initialised.");
          return;
        }

        const householdId = generateDeviceId(); // reuse UUID generator
        const request: LinkRequestMessage = {
          type: "link-request",
          deviceId: prefs.deviceId,
          householdId,
        };

        // Listen for acceptance/rejection
        peer.onMessage(async (data: string) => {
          try {
            const msg = JSON.parse(data) as LinkMessage;
            if (msg.type === "link-accept") {
              // Partner accepted — save link data
              setPartnerDeviceId(msg.deviceId);
              await saveLinkData(householdId, msg.deviceId);
              // Run full initial sync
              await runSync(peer);
            } else if (msg.type === "link-reject") {
              handleError("Your partner declined the link request.");
            }
          } catch {
            // Ignore non-JSON or unrelated messages
          }
        });

        peer.send(JSON.stringify(request));
        setStep("waiting-acceptance");
      } catch (err) {
        handleError(
          err instanceof Error
            ? err.message
            : "Failed to establish connection.",
        );
      }
    },
    [handleError, runSync, saveLinkData],
  );

  // -----------------------------------------------------------------------
  // Joiner flow: Device B joins the link
  // -----------------------------------------------------------------------

  const handleOfferScanned = useCallback(
    async (scannedOffer: string) => {
      roleRef.current = "joiner";
      setStep("creating-answer");
      try {
        const peer = new PeerConnection();
        peerRef.current = peer;

        const answer = await peer.acceptOffer(scannedOffer);
        setAnswerData(answer);
        setStep("show-answer");

        // Wait for channel to open, then listen for link request
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
                reject(
                  new Error("Connection failed while waiting for partner."),
                );
              }
            }, 200);

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
          .then(() => {
            setStep("waiting-link-request");

            // Listen for the link request message
            peer.onMessage((data: string) => {
              try {
                const msg = JSON.parse(data) as LinkMessage;
                if (msg.type === "link-request") {
                  setLinkRequest(msg);
                  setPartnerDeviceId(msg.deviceId);
                  setStep("confirm-link");
                }
              } catch {
                // Ignore
              }
            });
          })
          .catch((err) =>
            handleError(
              err instanceof Error
                ? err.message
                : "Connection failed while waiting for partner.",
            ),
          );
      } catch (err) {
        handleError(
          err instanceof Error
            ? err.message
            : "Failed to process partner's QR code.",
        );
      }
    },
    [handleError],
  );

  // -----------------------------------------------------------------------
  // Joiner: Accept or reject the link
  // -----------------------------------------------------------------------

  const handleAcceptLink = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || !linkRequest) {
      handleError("Connection lost. Please try again.");
      return;
    }

    try {
      const prefs = await db.userPreferences.get("prefs");
      if (!prefs) {
        handleError("User preferences not initialised.");
        return;
      }

      // Save link data locally
      await saveLinkData(linkRequest.householdId, linkRequest.deviceId);

      // Send acceptance with our deviceId
      const accept: LinkAcceptMessage = {
        type: "link-accept",
        deviceId: prefs.deviceId,
      };

      // Re-register message handler for sync messages (replaces link handler)
      peer.onMessage(() => {
        // The sync protocol will handle incoming sync messages
      });

      peer.send(JSON.stringify(accept));

      // Run full initial sync
      await runSync(peer);
    } catch (err) {
      handleError(
        err instanceof Error ? err.message : "Failed to accept link.",
      );
    }
  }, [linkRequest, handleError, runSync, saveLinkData]);

  const handleRejectLink = useCallback(() => {
    const peer = peerRef.current;
    if (peer) {
      const reject: LinkRejectMessage = { type: "link-reject" };
      peer.send(JSON.stringify(reject));
      peer.close();
      peerRef.current = null;
    }
    onClose();
  }, [onClose]);

  // -----------------------------------------------------------------------
  // Retry
  // -----------------------------------------------------------------------

  const handleRetry = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    roleRef.current = null;
    setOfferData(null);
    setAnswerData(null);
    setSyncProgress(null);
    setMergeSummary(null);
    setErrorMessage(null);
    setPartnerDeviceId(null);
    setLinkRequest(null);
    setStep("choose-role");
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Link Partner</h2>
        {step !== "syncing" && step !== "connecting" && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
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
          <p className="text-sm text-gray-600">
            Link your partner&apos;s device so you can share data and sync.
            Both devices need to be on the same Wi-Fi network.
          </p>

          <button
            type="button"
            onClick={handleStartLink}
            className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-600"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Start Link</p>
              <p className="text-sm text-gray-500">
                Show a QR code for your partner to scan
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStep("scan-offer")}
            className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-green-600"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">Join Link</p>
              <p className="text-sm text-gray-500">
                Scan the QR code on your partner&apos;s device
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Step: Creating Offer */}
      {step === "creating-offer" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm text-gray-600">Preparing connection...</p>
        </div>
      )}

      {/* Step: Show Offer QR (Initiator) */}
      {step === "show-offer" && offerData && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-center text-sm font-medium text-indigo-800">
              Step 1 of 3: Show this code to your partner
            </p>
          </div>

          <QRDisplay
            data={offerData}
            label="Ask your partner to tap 'Join Link' and scan this code"
          />

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
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
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-center text-sm font-medium text-indigo-800">
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
          <div className="rounded-xl border border-green-100 bg-green-50 p-3">
            <p className="text-center text-sm font-medium text-green-800">
              Step 1 of 3: Scan the code on your partner&apos;s device
            </p>
          </div>

          <QRScanner
            onScan={handleOfferScanned}
            onCancel={() => setStep("choose-role")}
          />
        </div>
      )}

      {/* Step: Creating Answer */}
      {step === "creating-answer" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
          <p className="text-sm text-gray-600">
            Processing partner&apos;s connection...
          </p>
        </div>
      )}

      {/* Step: Show Answer QR (Joiner) */}
      {step === "show-answer" && answerData && (
        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 bg-green-50 p-3">
            <p className="text-center text-sm font-medium text-green-800">
              Step 2 of 3: Show this code to your partner
            </p>
          </div>

          <QRDisplay
            data={answerData}
            label="Ask your partner to scan this code"
          />

          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Waiting for partner to scan...
          </div>
        </div>
      )}

      {/* Step: Connecting */}
      {step === "connecting" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm font-medium text-gray-700">
            Establishing connection...
          </p>
          <p className="text-xs text-gray-500">
            Both devices must be on the same Wi-Fi network
          </p>
        </div>
      )}

      {/* Step: Sending Link Request (Initiator) */}
      {step === "sending-link-request" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-sm font-medium text-gray-700">
            Sending link request...
          </p>
        </div>
      )}

      {/* Step: Waiting for Acceptance (Initiator) */}
      {step === "waiting-acceptance" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-indigo-600"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">
            Waiting for your partner to accept...
          </p>
          <p className="text-xs text-gray-500">
            Your partner should see a confirmation on their device
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Pending
          </div>
        </div>
      )}

      {/* Step: Waiting for Link Request (Joiner) */}
      {step === "waiting-link-request" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
          <p className="text-sm font-medium text-gray-700">
            Connected! Waiting for link request...
          </p>
        </div>
      )}

      {/* Step: Confirm Link (Joiner) */}
      {step === "confirm-link" && linkRequest && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-indigo-600"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Partner Link Request
            </h3>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="text-sm text-indigo-800">
              Your partner wants to link with you. Linking will allow you to
              share contacts, check-ins, activities, and other data between
              your devices.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAcceptLink}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
            >
              Accept & Sync
            </button>
            <button
              type="button"
              onClick={handleRejectLink}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Step: Syncing */}
      {step === "syncing" && (
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm font-medium text-gray-700">
              Linking & syncing data...
            </p>
          </div>

          {syncProgress && (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Status</span>
                <span className="font-medium capitalize text-gray-900">
                  {syncProgress.phase}
                </span>
              </div>

              {syncProgress.recordsSent > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Sending</span>
                  <span className="font-medium text-gray-900">
                    {syncProgress.recordsSent} records
                  </span>
                </div>
              )}

              {syncProgress.recordsReceived > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Receiving</span>
                  <span className="font-medium text-gray-900">
                    {syncProgress.recordsReceived} records
                  </span>
                </div>
              )}

              <p className="text-xs text-gray-500">{syncProgress.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Step: Complete */}
      {step === "complete" && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-green-600"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Partner Linked!
            </h3>
            <p className="text-center text-sm text-gray-500">
              Your devices are now linked. You can sync data anytime from
              Settings.
            </p>
          </div>

          {mergeSummary && (
            <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Records sent</span>
                <span className="font-medium text-gray-900">
                  {mergeSummary.totalSent}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Records received</span>
                <span className="font-medium text-gray-900">
                  {mergeSummary.totalReceived}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Records updated</span>
                <span className="font-medium text-gray-900">
                  {mergeSummary.totalUpserted}
                </span>
              </div>
            </div>
          )}

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
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-red-600"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Link Failed
            </h3>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm text-red-800">{errorMessage}</p>
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
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
