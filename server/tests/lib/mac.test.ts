import { describe, it, expect } from "vitest";
import { normalizeMac } from "@/lib/api/mac";

describe("normalizeMac", () => {
  it("normalizes colon-separated MAC", () => {
    expect(normalizeMac("aa:bb:cc:dd:ee:ff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("AA:BB:CC:DD:EE:FF")).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("normalizes dash-separated MAC", () => {
    expect(normalizeMac("aa-bb-cc-dd-ee-ff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("AA-BB-CC-DD-EE-FF")).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("normalizes unseparated MAC", () => {
    expect(normalizeMac("aabbccddeeff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("AABBCCDDEEFF")).toBe("AA:BB:CC:DD:EE:FF");
  });

  it("returns null for invalid MAC", () => {
    expect(normalizeMac("")).toBeNull();
    expect(normalizeMac("invalid")).toBeNull();
    expect(normalizeMac("AA:BB:CC:DD:EE")).toBeNull(); // too short
    expect(normalizeMac("AA:BB:CC:DD:EE:FF:00")).toBeNull(); // too long
    expect(normalizeMac("GG:HH:II:JJ:KK:LL")).toBeNull(); // invalid hex
    expect(normalizeMac("AA:BB:CC:DD:EE:GG")).toBeNull(); // partial invalid
  });
});
