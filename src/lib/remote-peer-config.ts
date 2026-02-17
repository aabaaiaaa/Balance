/**
 * Remote network peer connection configuration factory.
 *
 * This module provides ICE server configurations for WebRTC connections
 * across different networks (when devices aren't on the same Wi-Fi).
 * It is a **separate code path** from local network mode — local mode
 * never imports or depends on this module.
 *
 * Uses STUN servers to gather server-reflexive ICE candidates for NAT
 * traversal, and optionally supports user-configured TURN servers for
 * symmetric NAT scenarios where STUN alone fails.
 */

import type { PeerConnectionConfig } from "./peer-connection";
import type { RemoteSyncConfig } from "@/types/models";

/** Default public STUN server used when no custom server is configured. */
const DEFAULT_STUN_SERVER = "stun:stun.l.google.com:19302";

/** Connection timeout for remote mode (longer than local to allow NAT traversal). */
const REMOTE_CONNECTION_TIMEOUT_MS = 45_000;

/**
 * Build a PeerConnectionConfig for remote network mode.
 *
 * @param customConfig - Optional user-configured STUN/TURN server settings
 *   from UserPreferences. When null/undefined, the default public STUN server
 *   is used.
 * @returns A PeerConnectionConfig with appropriate iceServers for remote
 *   connectivity.
 */
export function buildRemotePeerConfig(
  customConfig?: RemoteSyncConfig | null,
): PeerConnectionConfig {
  const iceServers: RTCIceServer[] = [];

  // STUN server
  const stunUrl =
    customConfig?.stunServer?.trim() || DEFAULT_STUN_SERVER;
  iceServers.push({ urls: stunUrl });

  // Optional TURN server
  if (customConfig?.turnServer?.trim()) {
    const turnServer: RTCIceServer = {
      urls: customConfig.turnServer.trim(),
    };
    if (customConfig.turnUsername?.trim()) {
      turnServer.username = customConfig.turnUsername.trim();
    }
    if (customConfig.turnCredential?.trim()) {
      turnServer.credential = customConfig.turnCredential.trim();
    }
    iceServers.push(turnServer);
  }

  return {
    iceServers,
    connectionTimeoutMs: REMOTE_CONNECTION_TIMEOUT_MS,
  };
}

/**
 * Build a PeerConnectionConfig for local network mode.
 * This is a convenience function that returns the default (empty iceServers)
 * config, keeping the sync flow UI decoupled from PeerConnection internals.
 */
export function buildLocalPeerConfig(): PeerConnectionConfig {
  return {
    iceServers: [],
    connectionTimeoutMs: 30_000,
  };
}

/**
 * Categorise a remote connection failure into a user-friendly message
 * with suggested alternatives.
 */
export function getRemoteConnectionErrorMessage(error: Error | string): string {
  const msg = typeof error === "string" ? error : error.message;
  const lower = msg.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return (
      "Remote connection timed out. This can happen when:\n" +
      "\u2022 The STUN server is unreachable (check your internet connection)\n" +
      "\u2022 Your network's firewall is blocking WebRTC traffic\n" +
      "\u2022 Both devices are behind symmetric NATs (a TURN server is needed)\n\n" +
      "Try: Use \"Local network\" mode if you're on the same Wi-Fi, " +
      "or use File Export/Import to transfer data manually."
    );
  }

  if (lower.includes("failed") || lower.includes("disconnected")) {
    return (
      "Remote connection failed. NAT traversal was unsuccessful.\n\n" +
      "This often happens behind strict or symmetric NATs where STUN alone " +
      "cannot establish a direct connection. A TURN relay server is needed " +
      "for these network types.\n\n" +
      "Try: Configure a TURN server in Settings > Remote Sync, " +
      "use \"Local network\" mode on the same Wi-Fi, " +
      "or use File Export/Import to transfer data manually."
    );
  }

  return (
    `Remote connection error: ${msg}\n\n` +
    "Try: Use \"Local network\" mode if you're on the same Wi-Fi, " +
    "or use File Export/Import to transfer data manually."
  );
}
