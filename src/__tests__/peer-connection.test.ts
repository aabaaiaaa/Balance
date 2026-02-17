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
