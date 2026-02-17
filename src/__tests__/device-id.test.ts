import { generateDeviceId } from "@/lib/device-id";

describe("generateDeviceId", () => {
  it("returns a string", () => {
    const id = generateDeviceId();
    expect(typeof id).toBe("string");
  });

  it("returns a UUID-formatted string", () => {
    const id = generateDeviceId();
    // UUID v4 format: 8-4-4-4-12 hex characters
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDeviceId()));
    expect(ids.size).toBe(100);
  });
});
