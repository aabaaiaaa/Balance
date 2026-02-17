/**
 * Utilities for splitting and reassembling data payloads across multiple QR codes.
 *
 * A single QR code (error-correction level L) can carry ~2,953 bytes of binary data.
 * To leave headroom for the framing header and to stay safely within limits even
 * at higher error-correction levels, we default to a 1,800-byte payload per code.
 *
 * Each chunk is encoded as: `<index>/<total>|<payload>`
 * For example: `1/3|<base64-data-chunk>`
 */

/** Maximum raw bytes per QR code payload (conservative). */
const MAX_CHUNK_BYTES = 1800;

/** Header overhead: "99/99|" = 6 chars max. */
const HEADER_MAX_LENGTH = 6;

const PAYLOAD_MAX_LENGTH = MAX_CHUNK_BYTES - HEADER_MAX_LENGTH;

/**
 * Split a data string into QR-code-sized chunks with sequence headers.
 * Returns an array of strings, each safe to encode in a single QR code.
 */
export function splitIntoChunks(data: string): string[] {
  if (data.length <= PAYLOAD_MAX_LENGTH) {
    return [`1/1|${data}`];
  }

  const chunks: string[] = [];
  let offset = 0;

  while (offset < data.length) {
    chunks.push(data.slice(offset, offset + PAYLOAD_MAX_LENGTH));
    offset += PAYLOAD_MAX_LENGTH;
  }

  return chunks.map((chunk, i) => `${i + 1}/${chunks.length}|${chunk}`);
}

/** Parsed result from a scanned chunk. */
export interface ParsedChunk {
  index: number;
  total: number;
  payload: string;
}

/**
 * Parse a scanned QR code string into its chunk metadata and payload.
 * Returns `null` if the string is not in the expected multi-code format.
 */
export function parseChunk(raw: string): ParsedChunk | null {
  const pipeIdx = raw.indexOf("|");
  if (pipeIdx === -1) return null;

  const header = raw.slice(0, pipeIdx);
  const slashIdx = header.indexOf("/");
  if (slashIdx === -1) return null;

  const index = parseInt(header.slice(0, slashIdx), 10);
  const total = parseInt(header.slice(slashIdx + 1), 10);

  if (isNaN(index) || isNaN(total) || index < 1 || total < 1 || index > total) {
    return null;
  }

  return { index, total, payload: raw.slice(pipeIdx + 1) };
}

/**
 * Reassemble a complete set of chunks into the original data string.
 * `chunks` should be a Map from 1-based index to payload string.
 * Returns `null` if any chunks are missing.
 */
export function reassembleChunks(chunks: Map<number, string>, total: number): string | null {
  if (chunks.size !== total) return null;

  const parts: string[] = [];
  for (let i = 1; i <= total; i++) {
    const payload = chunks.get(i);
    if (payload === undefined) return null;
    parts.push(payload);
  }

  return parts.join("");
}
