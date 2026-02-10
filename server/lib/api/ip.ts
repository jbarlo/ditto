import { NextRequest } from "next/server";

/**
 * Extract client IP from request headers.
 *
 * Priority:
 * 1. CF-Connecting-IP (Cloudflare - reliable, can't be spoofed by client)
 * 2. X-Real-IP (common proxy header)
 * 3. X-Forwarded-For (first IP in chain - note: spoofable without trusted proxy)
 * 4. "unknown" fallback
 */
export function getClientIp(request: NextRequest): string {
  // Cloudflare always sets this from the actual TCP connection
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }

  // Common single-IP header set by reverse proxies
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // X-Forwarded-For: client, proxy1, proxy2, ...
  // Take first (original client) - only trustworthy if proxy sanitizes this
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return "unknown";
}
