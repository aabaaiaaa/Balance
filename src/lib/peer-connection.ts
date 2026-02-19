/**
 * WebRTC peer connection service for local network device-to-device sync.
 *
 * Wraps the WebRTC API to establish a data channel between two devices
 * on the same local network. Uses host ICE candidates only (no STUN/TURN)
 * so the connection works entirely offline.
 *
 * SDP offers and answers are compressed with lz-string for QR code encoding.
 * Large data payloads are chunked to stay within WebRTC's ~16KB message limit.
 */

import { compressToBase64, decompressFromBase64 } from "lz-string";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionState = "new" | "connecting" | "open" | "closed" | "failed";

export interface PeerConnectionConfig {
  /** ICE servers to use. Defaults to [] for local-network-only mode. */
  iceServers?: RTCIceServer[];
  /** Timeout in ms before a pending connection is marked as failed. Default 30 000. */
  connectionTimeoutMs?: number;
}

export type MessageCallback = (data: string) => void;
export type ChunkProgressCallback = (received: number, total: number) => void;
export type SendProgressCallback = (sent: number, total: number) => void;

// ---------------------------------------------------------------------------
// SDP compression helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Compress an SDP string to a Base64-encoded lz-string.
 * The result is safe for embedding in a QR code payload.
 */
export function compressSdp(sdp: string): string {
  const compressed = compressToBase64(sdp);
  if (!compressed) {
    throw new Error("Failed to compress SDP");
  }
  return compressed;
}

/**
 * Decompress a Base64-encoded lz-string back to the original SDP.
 */
export function decompressSdp(compressed: string): string {
  const sdp = decompressFromBase64(compressed);
  if (sdp === null) {
    throw new Error("Failed to decompress SDP");
  }
  return sdp;
}

// ---------------------------------------------------------------------------
// Data chunking helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Maximum bytes per data channel message.
 * WebRTC data channels have a ~16 KB limit per message. We use 15 000 bytes
 * to leave headroom for the chunk header and encoding overhead.
 */
const MAX_CHUNK_PAYLOAD = 15_000;

/** Header format: "CHUNK:<index>:<total>:" (e.g. "CHUNK:1:3:") */
const CHUNK_PREFIX = "CHUNK:";

/**
 * Split a large string payload into WebRTC-safe chunks.
 * Each chunk is prefixed with `CHUNK:<1-based index>:<total>:`.
 */
export function chunkPayload(data: string): string[] {
  if (data.length <= MAX_CHUNK_PAYLOAD) {
    return [`${CHUNK_PREFIX}1:1:${data}`];
  }

  const chunks: string[] = [];
  let offset = 0;

  while (offset < data.length) {
    chunks.push(data.slice(offset, offset + MAX_CHUNK_PAYLOAD));
    offset += MAX_CHUNK_PAYLOAD;
  }

  return chunks.map(
    (chunk, i) => `${CHUNK_PREFIX}${i + 1}:${chunks.length}:${chunk}`
  );
}

/** Parsed chunk metadata. */
export interface ChunkInfo {
  index: number;
  total: number;
  payload: string;
}

/**
 * Parse a chunk header and extract the metadata + payload.
 * Returns `null` if the message is not a valid chunk.
 */
export function parseChunkMessage(message: string): ChunkInfo | null {
  if (!message.startsWith(CHUNK_PREFIX)) return null;

  const afterPrefix = message.slice(CHUNK_PREFIX.length);
  const firstColon = afterPrefix.indexOf(":");
  if (firstColon === -1) return null;

  const secondColon = afterPrefix.indexOf(":", firstColon + 1);
  if (secondColon === -1) return null;

  const index = parseInt(afterPrefix.slice(0, firstColon), 10);
  const total = parseInt(afterPrefix.slice(firstColon + 1, secondColon), 10);

  if (isNaN(index) || isNaN(total) || index < 1 || total < 1 || index > total) {
    return null;
  }

  return {
    index,
    total,
    payload: afterPrefix.slice(secondColon + 1),
  };
}

/**
 * Reassemble an ordered set of chunk payloads into the original string.
 * Returns `null` if any chunks are missing.
 */
export function reassembleChunkedPayload(
  chunks: Map<number, string>,
  total: number
): string | null {
  if (chunks.size !== total) return null;

  const parts: string[] = [];
  for (let i = 1; i <= total; i++) {
    const payload = chunks.get(i);
    if (payload === undefined) return null;
    parts.push(payload);
  }

  return parts.join("");
}

// ---------------------------------------------------------------------------
// PeerConnection class
// ---------------------------------------------------------------------------

/** Buffered amount threshold for backpressure (64 KB). */
const BUFFER_HIGH_WATER = 64 * 1024;

export class PeerConnection {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private messageCallbacks: MessageCallback[] = [];
  private chunkProgressCallbacks: ChunkProgressCallback[] = [];
  private incomingChunks = new Map<number, string>();
  private expectedChunkTotal = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly config: Required<PeerConnectionConfig>;

  private _state: ConnectionState = "new";

  constructor(config: PeerConnectionConfig = {}) {
    this.config = {
      iceServers: config.iceServers ?? [],
      connectionTimeoutMs: config.connectionTimeoutMs ?? 300_000,
    };
  }

  /** Current connection state. */
  get state(): ConnectionState {
    return this._state;
  }

  // -----------------------------------------------------------------------
  // 1. Create an offer (Device A — initiator)
  // -----------------------------------------------------------------------

  /**
   * Create a WebRTC offer with a "sync" data channel.
   * Returns the compressed SDP offer string for QR encoding.
   */
  async createOffer(): Promise<string> {
    this.pc = new RTCPeerConnection({ iceServers: this.config.iceServers });
    this.setState("connecting");
    this.startTimeout();
    this.setupConnectionStateHandlers();

    // Create the data channel on the initiator side
    this.dataChannel = this.pc.createDataChannel("sync");
    this.setupDataChannelHandlers(this.dataChannel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete so the SDP contains all candidates
    await this.waitForIceGathering();

    const sdp = this.pc.localDescription?.sdp;
    if (!sdp) {
      throw new Error("Failed to generate SDP offer");
    }

    return compressSdp(sdp);
  }

  // -----------------------------------------------------------------------
  // 2. Accept an offer (Device B — joiner)
  // -----------------------------------------------------------------------

  /**
   * Accept a compressed SDP offer, generate an answer.
   * Returns the compressed SDP answer string for QR encoding.
   */
  async acceptOffer(compressedOffer: string): Promise<string> {
    const offerSdp = decompressSdp(compressedOffer);

    this.pc = new RTCPeerConnection({ iceServers: this.config.iceServers });
    this.setState("connecting");
    this.startTimeout();
    this.setupConnectionStateHandlers();

    // Listen for the data channel created by the initiator
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannelHandlers(this.dataChannel);
    };

    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: offerSdp })
    );

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering();

    const sdp = this.pc.localDescription?.sdp;
    if (!sdp) {
      throw new Error("Failed to generate SDP answer");
    }

    return compressSdp(sdp);
  }

  // -----------------------------------------------------------------------
  // 3. Complete connection (Device A receives the answer)
  // -----------------------------------------------------------------------

  /**
   * Set the remote answer SDP and wait for the data channel to open.
   */
  async completeConnection(compressedAnswer: string): Promise<void> {
    if (!this.pc) {
      throw new Error("No peer connection — call createOffer() first");
    }

    const answerSdp = decompressSdp(compressedAnswer);

    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "answer", sdp: answerSdp })
    );

    // Wait for the data channel to open
    await this.waitForDataChannelOpen();
  }

  // -----------------------------------------------------------------------
  // 4. Send / receive data
  // -----------------------------------------------------------------------

  /**
   * Send a string payload over the data channel.
   * Automatically chunks messages that exceed the ~16KB limit.
   */
  send(data: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Data channel is not open");
    }

    const chunks = chunkPayload(data);
    for (const chunk of chunks) {
      this.dataChannel.send(chunk);
    }
  }

  /**
   * Send a large string payload with backpressure and progress reporting.
   * Waits for the data channel buffer to drain between chunks so large
   * payloads don't overwhelm the channel.
   */
  async sendWithProgress(data: string, onProgress?: SendProgressCallback): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      throw new Error("Data channel is not open");
    }

    const dc = this.dataChannel;
    const chunks = chunkPayload(data);
    const total = chunks.length;

    for (let i = 0; i < chunks.length; i++) {
      // Backpressure: wait for buffer to drain if above threshold
      while (dc.bufferedAmount > BUFFER_HIGH_WATER) {
        await new Promise<void>((resolve) => {
          // Use bufferedamountlow event if supported, otherwise poll
          dc.bufferedAmountLowThreshold = BUFFER_HIGH_WATER;
          const handler = () => {
            dc.removeEventListener("bufferedamountlow", handler);
            resolve();
          };
          dc.addEventListener("bufferedamountlow", handler);
          // Safety fallback: poll in case the event doesn't fire
          setTimeout(() => {
            dc.removeEventListener("bufferedamountlow", handler);
            resolve();
          }, 100);
        });
      }

      dc.send(chunks[i]);
      onProgress?.(i + 1, total);
    }
  }

  /**
   * Register a callback for incoming messages.
   * Chunked messages are automatically reassembled before delivery.
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * Register a callback for incoming chunk progress.
   * Called each time a chunk arrives, before reassembly completes.
   */
  onChunkProgress(callback: ChunkProgressCallback): void {
    this.chunkProgressCallbacks.push(callback);
  }

  // -----------------------------------------------------------------------
  // 5. Connection lifecycle
  // -----------------------------------------------------------------------

  /** Close the connection and clean up resources. */
  close(): void {
    this.clearTimeout();

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.setState("closed");
    this.incomingChunks.clear();
    this.expectedChunkTotal = 0;
    this.chunkProgressCallbacks = [];
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private setState(state: ConnectionState): void {
    this._state = state;
  }

  private startTimeout(): void {
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      if (this._state === "connecting") {
        this.setState("failed");
        this.close();
      }
    }, this.config.connectionTimeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /** Wait for ICE gathering to reach the "complete" state. */
  private waitForIceGathering(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.pc) {
        resolve();
        return;
      }

      if (this.pc.iceGatheringState === "complete") {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("ICE gathering timed out after 10 seconds"));
      }, 10_000);

      this.pc.onicegatheringstatechange = () => {
        if (this.pc?.iceGatheringState === "complete") {
          clearTimeout(timeout);
          resolve();
        }
      };
    });
  }

  /** Wait for the data channel to reach the "open" state. */
  private waitForDataChannelOpen(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.dataChannel) {
        // The data channel might arrive via ondatachannel later; wait a bit
        const pollTimeout = setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error("Data channel did not open within 30 seconds"));
        }, 30_000);
        const checkInterval = setInterval(() => {
          if (this.dataChannel?.readyState === "open") {
            clearInterval(checkInterval);
            clearTimeout(pollTimeout);
            resolve();
          }
          if (this._state === "failed" || this._state === "closed") {
            clearInterval(checkInterval);
            clearTimeout(pollTimeout);
            reject(new Error("Connection failed or closed while waiting"));
          }
        }, 100);
        return;
      }

      const dc = this.dataChannel;

      if (dc.readyState === "open") {
        resolve();
        return;
      }

      const originalOnOpen = dc.onopen;
      dc.onopen = (event) => {
        if (typeof originalOnOpen === "function") {
          originalOnOpen.call(dc, event);
        }
        resolve();
      };

      const originalOnError = dc.onerror;
      dc.onerror = (event) => {
        if (typeof originalOnError === "function") {
          originalOnError.call(dc, event);
        }
        reject(new Error("Data channel error while waiting to open"));
      };
    });
  }

  /** Set up connection state change handlers on the RTCPeerConnection. */
  private setupConnectionStateHandlers(): void {
    if (!this.pc) return;

    this.pc.onconnectionstatechange = () => {
      switch (this.pc?.connectionState) {
        case "connected":
          // State moves to "open" when the data channel opens, not here
          break;
        case "disconnected":
        case "failed":
          this.setState("failed");
          this.clearTimeout();
          break;
        case "closed":
          this.setState("closed");
          this.clearTimeout();
          break;
      }
    };
  }

  /** Set up data channel event handlers. */
  private setupDataChannelHandlers(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.setState("open");
      this.clearTimeout();
    };

    channel.onclose = () => {
      if (this._state !== "failed") {
        this.setState("closed");
      }
    };

    channel.onerror = () => {
      this.setState("failed");
    };

    channel.onmessage = (event) => {
      this.handleIncomingMessage(event.data as string);
    };
  }

  /** Handle an incoming data channel message, reassembling chunks. */
  private handleIncomingMessage(raw: string): void {
    const chunk = parseChunkMessage(raw);

    if (!chunk) {
      // Not a chunked message — deliver as-is
      this.deliverMessage(raw);
      return;
    }

    this.expectedChunkTotal = chunk.total;
    this.incomingChunks.set(chunk.index, chunk.payload);

    // Notify chunk progress listeners
    for (const cb of this.chunkProgressCallbacks) {
      cb(this.incomingChunks.size, chunk.total);
    }

    if (this.incomingChunks.size === chunk.total) {
      const assembled = reassembleChunkedPayload(
        this.incomingChunks,
        chunk.total
      );
      this.incomingChunks.clear();
      this.expectedChunkTotal = 0;

      if (assembled !== null) {
        this.deliverMessage(assembled);
      }
    }
  }

  /** Deliver a fully reassembled message to all registered callbacks. */
  private deliverMessage(data: string): void {
    for (const cb of this.messageCallbacks) {
      cb(data);
    }
  }
}
