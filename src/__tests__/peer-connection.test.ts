import {
  compressSdp,
  decompressSdp,
  chunkPayload,
  parseChunkMessage,
  reassembleChunkedPayload,
  PeerConnection,
} from "@/lib/peer-connection";

// ---------------------------------------------------------------------------
// SDP compression / decompression
// ---------------------------------------------------------------------------

describe("compressSdp / decompressSdp", () => {
  const sampleSdp = [
    "v=0",
    "o=- 1234567890 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    "a=ice-ufrag:abcd",
    "a=ice-pwd:efghijklmnopqrstuvwx",
    "a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    "a=setup:actpass",
    "a=mid:0",
    "a=sctp-port:5000",
  ].join("\r\n");

  it("round-trips a typical SDP string", () => {
    const compressed = compressSdp(sampleSdp);
    const decompressed = decompressSdp(compressed);
    expect(decompressed).toBe(sampleSdp);
  });

  it("produces a non-empty compressed output", () => {
    const compressed = compressSdp(sampleSdp);
    expect(compressed.length).toBeGreaterThan(0);
    // lz-string compressToBase64 may add overhead for short inputs,
    // but should compress well for real-world SDP (typically 500+ bytes)
    expect(typeof compressed).toBe("string");
  });

  it("handles an empty string", () => {
    const compressed = compressSdp("");
    const decompressed = decompressSdp(compressed);
    expect(decompressed).toBe("");
  });

  it("handles very long SDP strings", () => {
    // Simulate a large SDP with many ICE candidates
    const longSdp = sampleSdp + "\r\n" + Array(100)
      .fill(0)
      .map((_, i) => `a=candidate:${i} 1 udp 2113937151 192.168.1.${i % 256} ${50000 + i} typ host`)
      .join("\r\n");

    const compressed = compressSdp(longSdp);
    const decompressed = decompressSdp(compressed);
    expect(decompressed).toBe(longSdp);
  });

  it("throws on invalid compressed input", () => {
    expect(() => decompressSdp("")).toThrow("Failed to decompress SDP");
  });

  it("handles unicode and special characters in SDP values", () => {
    const sdpWithSpecial = "v=0\r\na=note:test=value+special/chars";
    const compressed = compressSdp(sdpWithSpecial);
    expect(decompressSdp(compressed)).toBe(sdpWithSpecial);
  });
});

// ---------------------------------------------------------------------------
// Data chunking
// ---------------------------------------------------------------------------

describe("chunkPayload", () => {
  it("wraps a small payload in a single chunk", () => {
    const data = "hello world";
    const chunks = chunkPayload(data);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("CHUNK:1:1:hello world");
  });

  it("produces a single chunk for payloads exactly at the limit", () => {
    const data = "x".repeat(15_000);
    const chunks = chunkPayload(data);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(`CHUNK:1:1:${data}`);
  });

  it("splits payloads exceeding the limit into multiple chunks", () => {
    const data = "a".repeat(30_001);
    const chunks = chunkPayload(data);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatch(/^CHUNK:1:3:/);
    expect(chunks[1]).toMatch(/^CHUNK:2:3:/);
    expect(chunks[2]).toMatch(/^CHUNK:3:3:/);
  });

  it("reassembles to the original data", () => {
    const data = "b".repeat(45_000);
    const chunks = chunkPayload(data);

    // Parse and reassemble
    const parsed = new Map<number, string>();
    let total = 0;
    for (const chunk of chunks) {
      const info = parseChunkMessage(chunk);
      expect(info).not.toBeNull();
      if (info) {
        parsed.set(info.index, info.payload);
        total = info.total;
      }
    }

    const reassembled = reassembleChunkedPayload(parsed, total);
    expect(reassembled).toBe(data);
  });

  it("handles a payload just over the limit correctly", () => {
    const data = "c".repeat(15_001);
    const chunks = chunkPayload(data);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatch(/^CHUNK:1:2:/);
    expect(chunks[1]).toMatch(/^CHUNK:2:2:/);
  });
});

describe("parseChunkMessage", () => {
  it("parses a valid single chunk", () => {
    const result = parseChunkMessage("CHUNK:1:1:hello");
    expect(result).toEqual({ index: 1, total: 1, payload: "hello" });
  });

  it("parses a multi-chunk message", () => {
    const result = parseChunkMessage("CHUNK:3:5:payload data here");
    expect(result).toEqual({
      index: 3,
      total: 5,
      payload: "payload data here",
    });
  });

  it("returns null for non-chunk messages", () => {
    expect(parseChunkMessage("hello world")).toBeNull();
    expect(parseChunkMessage("")).toBeNull();
    expect(parseChunkMessage("CHUNK:")).toBeNull();
  });

  it("returns null for malformed headers", () => {
    expect(parseChunkMessage("CHUNK:abc:def:data")).toBeNull();
    expect(parseChunkMessage("CHUNK:0:3:data")).toBeNull(); // index < 1
    expect(parseChunkMessage("CHUNK:4:3:data")).toBeNull(); // index > total
    expect(parseChunkMessage("CHUNK:1:0:data")).toBeNull(); // total < 1
  });

  it("handles payload containing colons", () => {
    const result = parseChunkMessage("CHUNK:1:1:data:with:colons");
    expect(result).toEqual({ index: 1, total: 1, payload: "data:with:colons" });
  });

  it("handles empty payload", () => {
    const result = parseChunkMessage("CHUNK:1:1:");
    expect(result).toEqual({ index: 1, total: 1, payload: "" });
  });
});

describe("reassembleChunkedPayload", () => {
  it("reassembles a single-chunk payload", () => {
    const chunks = new Map([[1, "hello"]]);
    expect(reassembleChunkedPayload(chunks, 1)).toBe("hello");
  });

  it("reassembles multiple chunks in order", () => {
    const chunks = new Map([
      [1, "aaa"],
      [2, "bbb"],
      [3, "ccc"],
    ]);
    expect(reassembleChunkedPayload(chunks, 3)).toBe("aaabbbccc");
  });

  it("returns null if a chunk is missing", () => {
    const chunks = new Map([
      [1, "aaa"],
      [3, "ccc"],
    ]);
    expect(reassembleChunkedPayload(chunks, 3)).toBeNull();
  });

  it("returns null if total does not match chunk count", () => {
    const chunks = new Map([
      [1, "aaa"],
      [2, "bbb"],
    ]);
    expect(reassembleChunkedPayload(chunks, 3)).toBeNull();
  });

  it("handles chunks added out of order", () => {
    const chunks = new Map<number, string>();
    chunks.set(3, "ccc");
    chunks.set(1, "aaa");
    chunks.set(2, "bbb");
    expect(reassembleChunkedPayload(chunks, 3)).toBe("aaabbbccc");
  });
});

// ---------------------------------------------------------------------------
// PeerConnection class — construction and state
// ---------------------------------------------------------------------------

describe("PeerConnection", () => {
  it("starts in 'new' state", () => {
    const pc = new PeerConnection();
    expect(pc.state).toBe("new");
  });

  it("accepts custom iceServers config", () => {
    // Verify it doesn't throw
    const pc = new PeerConnection({
      iceServers: [{ urls: "stun:stun.example.com:19302" }],
    });
    expect(pc.state).toBe("new");
  });

  it("accepts a custom timeout", () => {
    const pc = new PeerConnection({ connectionTimeoutMs: 5000 });
    expect(pc.state).toBe("new");
  });

  it("close() transitions state to closed", () => {
    const pc = new PeerConnection();
    pc.close();
    expect(pc.state).toBe("closed");
  });

  it("close() can be called multiple times safely", () => {
    const pc = new PeerConnection();
    pc.close();
    pc.close();
    expect(pc.state).toBe("closed");
  });

  it("send() throws if data channel is not open", () => {
    const pc = new PeerConnection();
    expect(() => pc.send("hello")).toThrow("Data channel is not open");
  });
});

// ---------------------------------------------------------------------------
// PeerConnection — mocked RTCPeerConnection tests
// ---------------------------------------------------------------------------

describe("PeerConnection with mocked RTCPeerConnection", () => {
  let mockPc: Record<string, unknown>;
  let mockDataChannel: Record<string, unknown>;
  const originalRTCPeerConnection = globalThis.RTCPeerConnection;
  const originalRTCSessionDescription = globalThis.RTCSessionDescription;

  beforeEach(() => {
    // Create a mock data channel
    mockDataChannel = {
      readyState: "connecting",
      onopen: null as ((ev: unknown) => void) | null,
      onclose: null as ((ev: unknown) => void) | null,
      onerror: null as ((ev: unknown) => void) | null,
      onmessage: null as ((ev: unknown) => void) | null,
      send: jest.fn(),
      close: jest.fn(),
    };

    // Create a mock RTCPeerConnection
    mockPc = {
      iceGatheringState: "complete",
      connectionState: "new",
      localDescription: { sdp: "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0" },
      createDataChannel: jest.fn(() => mockDataChannel),
      createOffer: jest.fn(async () => ({ type: "offer", sdp: "mock-sdp" })),
      createAnswer: jest.fn(async () => ({ type: "answer", sdp: "mock-answer" })),
      setLocalDescription: jest.fn(async () => {}),
      setRemoteDescription: jest.fn(async () => {}),
      onconnectionstatechange: null as ((ev: unknown) => void) | null,
      onicegatheringstatechange: null as ((ev: unknown) => void) | null,
      ondatachannel: null as ((ev: unknown) => void) | null,
      close: jest.fn(),
    };

    // Install mocks globally
    globalThis.RTCPeerConnection = jest.fn(() => mockPc) as unknown as typeof RTCPeerConnection;
    globalThis.RTCSessionDescription = jest.fn((init: { type: string; sdp: string }) => init) as unknown as typeof RTCSessionDescription;
  });

  afterEach(() => {
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
    globalThis.RTCSessionDescription = originalRTCSessionDescription;
  });

  it("createOffer creates a peer connection with configured iceServers", async () => {
    const pc = new PeerConnection({ iceServers: [{ urls: "stun:stun.example.com" }] });
    await pc.createOffer();

    expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith({
      iceServers: [{ urls: "stun:stun.example.com" }],
    });
    pc.close();
  });

  it("createOffer uses empty iceServers by default (local network mode)", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith({
      iceServers: [],
    });
    pc.close();
  });

  it("createOffer creates a data channel named 'sync'", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    expect(mockPc.createDataChannel).toHaveBeenCalledWith("sync");
    pc.close();
  });

  it("createOffer transitions to connecting state", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    // State is "connecting" until data channel opens
    expect(pc.state).toBe("connecting");
    pc.close();
  });

  it("createOffer returns a compressed SDP string", async () => {
    const pc = new PeerConnection();
    const offer = await pc.createOffer();

    expect(typeof offer).toBe("string");
    expect(offer.length).toBeGreaterThan(0);
    // It should be decompressible back
    const decompressed = decompressSdp(offer);
    expect(decompressed).toBe("v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0");
    pc.close();
  });

  it("acceptOffer decompresses the offer and sets remote description", async () => {
    const pc = new PeerConnection();
    const fakeOffer = compressSdp("v=0\r\nfake-offer-sdp");
    await pc.acceptOffer(fakeOffer);

    expect(mockPc.setRemoteDescription).toHaveBeenCalled();
    const call = (mockPc.setRemoteDescription as jest.Mock).mock.calls[0][0];
    expect(call.type).toBe("offer");
    expect(call.sdp).toBe("v=0\r\nfake-offer-sdp");
    pc.close();
  });

  it("acceptOffer returns a compressed SDP answer", async () => {
    const pc = new PeerConnection();
    const fakeOffer = compressSdp("v=0\r\nfake-offer");
    const answer = await pc.acceptOffer(fakeOffer);

    expect(typeof answer).toBe("string");
    expect(answer.length).toBeGreaterThan(0);
    pc.close();
  });

  it("acceptOffer listens for ondatachannel events", async () => {
    const pc = new PeerConnection();
    const fakeOffer = compressSdp("v=0\r\nfake-offer");
    await pc.acceptOffer(fakeOffer);

    expect(mockPc.ondatachannel).not.toBeNull();
    pc.close();
  });

  it("data channel onopen transitions state to 'open'", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    // Simulate data channel opening
    if (typeof mockDataChannel.onopen === "function") {
      mockDataChannel.onopen({});
    }

    expect(pc.state).toBe("open");
    pc.close();
  });

  it("data channel onclose transitions state to 'closed'", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    // Open first, then close
    if (typeof mockDataChannel.onopen === "function") {
      mockDataChannel.onopen({});
    }
    if (typeof mockDataChannel.onclose === "function") {
      mockDataChannel.onclose({});
    }

    expect(pc.state).toBe("closed");
    pc.close();
  });

  it("data channel onerror transitions state to 'failed'", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    if (typeof mockDataChannel.onerror === "function") {
      mockDataChannel.onerror({});
    }

    expect(pc.state).toBe("failed");
    pc.close();
  });

  it("connection state 'failed' transitions to failed", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    // Simulate connection failure
    mockPc.connectionState = "failed";
    if (typeof mockPc.onconnectionstatechange === "function") {
      mockPc.onconnectionstatechange({});
    }

    expect(pc.state).toBe("failed");
    pc.close();
  });

  it("connection timeout fires after configured delay", async () => {
    jest.useFakeTimers();

    const pc = new PeerConnection({ connectionTimeoutMs: 5000 });
    await pc.createOffer();

    expect(pc.state).toBe("connecting");

    // Advance time past timeout
    jest.advanceTimersByTime(5000);

    expect(pc.state).toBe("closed"); // close() is called after timeout sets state to failed

    jest.useRealTimers();
  });

  it("timeout does not fire if data channel opens in time", async () => {
    jest.useFakeTimers();

    const pc = new PeerConnection({ connectionTimeoutMs: 5000 });
    await pc.createOffer();

    // Open the data channel before timeout
    if (typeof mockDataChannel.onopen === "function") {
      mockDataChannel.onopen({});
    }

    expect(pc.state).toBe("open");

    // Advance time past timeout — should NOT change state
    jest.advanceTimersByTime(10000);

    expect(pc.state).toBe("open");

    jest.useRealTimers();
    pc.close();
  });

  it("send with open data channel calls channel.send with chunks", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    // Open the data channel
    mockDataChannel.readyState = "open";
    if (typeof mockDataChannel.onopen === "function") {
      mockDataChannel.onopen({});
    }

    pc.send("hello world");

    expect(mockDataChannel.send).toHaveBeenCalledTimes(1);
    expect((mockDataChannel.send as jest.Mock).mock.calls[0][0]).toBe("CHUNK:1:1:hello world");
    pc.close();
  });

  it("onMessage receives and reassembles chunked messages", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    const received: string[] = [];
    pc.onMessage((data) => received.push(data));

    // Simulate receiving a single-chunk message
    if (typeof mockDataChannel.onmessage === "function") {
      mockDataChannel.onmessage({ data: "CHUNK:1:1:test message" });
    }

    expect(received).toEqual(["test message"]);
    pc.close();
  });

  it("onMessage reassembles multi-chunk messages", async () => {
    const pc = new PeerConnection();
    await pc.createOffer();

    const received: string[] = [];
    pc.onMessage((data) => received.push(data));

    // Simulate receiving a 2-chunk message
    if (typeof mockDataChannel.onmessage === "function") {
      mockDataChannel.onmessage({ data: "CHUNK:1:2:hello " });
      mockDataChannel.onmessage({ data: "CHUNK:2:2:world" });
    }

    expect(received).toEqual(["hello world"]);
    pc.close();
  });
});

// ---------------------------------------------------------------------------
// Integration: compress → chunk → reassemble → decompress round-trip
// ---------------------------------------------------------------------------

describe("end-to-end compression + chunking round-trip", () => {
  it("round-trips a realistic SDP through compress → chunk → reassemble → decompress", () => {
    const originalSdp = [
      "v=0",
      "o=- 9876543210 2 IN IP4 192.168.1.100",
      "s=-",
      "t=0 0",
      "a=group:BUNDLE 0",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "c=IN IP4 0.0.0.0",
      "a=ice-ufrag:testufrag",
      "a=ice-pwd:testpasswordthatislongenough12",
      "a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
      "a=setup:actpass",
      "a=mid:0",
      "a=sctp-port:5000",
      "a=candidate:1 1 udp 2113937151 192.168.1.100 50000 typ host",
      "a=candidate:2 1 udp 2113937151 192.168.1.100 50001 typ host",
    ].join("\r\n");

    // Step 1: Compress SDP
    const compressed = compressSdp(originalSdp);

    // Step 2: Chunk the compressed SDP for data channel
    const chunks = chunkPayload(compressed);

    // Step 3: Simulate receiving and parsing chunks
    const receivedChunks = new Map<number, string>();
    let total = 0;
    for (const chunk of chunks) {
      const info = parseChunkMessage(chunk);
      expect(info).not.toBeNull();
      if (info) {
        receivedChunks.set(info.index, info.payload);
        total = info.total;
      }
    }

    // Step 4: Reassemble
    const reassembled = reassembleChunkedPayload(receivedChunks, total);
    expect(reassembled).not.toBeNull();

    // Step 5: Decompress back to original SDP
    const recoveredSdp = decompressSdp(reassembled!);
    expect(recoveredSdp).toBe(originalSdp);
  });
});
