import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/api/ip";

function createRequest(headers: Record<string, string> = {}): NextRequest {
  const h = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    h.set(key, value);
  }
  return new NextRequest("http://localhost/test", { headers: h });
}

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP", () => {
    const request = createRequest({
      "cf-connecting-ip": "1.2.3.4",
      "x-real-ip": "5.6.7.8",
      "x-forwarded-for": "9.10.11.12",
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP", () => {
    const request = createRequest({
      "x-real-ip": "5.6.7.8",
      "x-forwarded-for": "9.10.11.12",
    });
    expect(getClientIp(request)).toBe("5.6.7.8");
  });

  it("falls back to X-Forwarded-For first IP", () => {
    const request = createRequest({
      "x-forwarded-for": "9.10.11.12, 13.14.15.16, 17.18.19.20",
    });
    expect(getClientIp(request)).toBe("9.10.11.12");
  });

  it("handles single X-Forwarded-For IP", () => {
    const request = createRequest({
      "x-forwarded-for": "9.10.11.12",
    });
    expect(getClientIp(request)).toBe("9.10.11.12");
  });

  it("returns unknown when no headers present", () => {
    const request = createRequest({});
    expect(getClientIp(request)).toBe("unknown");
  });

  it("trims whitespace from IPs", () => {
    const request = createRequest({
      "cf-connecting-ip": "  1.2.3.4  ",
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });
});
