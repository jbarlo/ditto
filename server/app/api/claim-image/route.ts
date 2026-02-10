import { NextRequest, NextResponse } from "next/server";
import { generateClaimImage } from "@/lib/image";
import { createDal, type Dal } from "@/lib/db/dal";
import { getDb } from "@/lib/db/client";
import { getClientIp } from "@/lib/api/ip";
import { validateClaimCode } from "@/lib/claim-code";

export const CLAIM_IMAGE_RATE_LIMIT = 10;
export const CLAIM_IMAGE_RATE_WINDOW = 60;

export async function handleClaimImage(request: NextRequest, dal: Dal) {
  const ip = getClientIp(request);
  const rateLimitResult = await dal.checkRateLimit(
    `ip:${ip}:claim-image`,
    CLAIM_IMAGE_RATE_LIMIT,
    CLAIM_IMAGE_RATE_WINDOW
  );

  if (!rateLimitResult.ok || !rateLimitResult.data.allowed) {
    return new NextResponse("Too many requests. Try again later.", {
      status: 429,
      headers: { "Retry-After": String(CLAIM_IMAGE_RATE_WINDOW) },
    });
  }

  const friendlyId = request.nextUrl.searchParams.get("id");
  const claimCode = request.nextUrl.searchParams.get("code");

  if (!friendlyId || !claimCode) {
    return new NextResponse("Missing id or code", { status: 400 });
  }

  // Validate frame exists and code is valid (generic error to prevent enumeration)
  const frameResult = await dal.getFrameByFriendlyId(friendlyId);
  if (!frameResult.ok || !validateClaimCode(friendlyId, claimCode)) {
    return new NextResponse("Invalid device ID or code", { status: 400 });
  }

  const host = request.headers.get("host") || "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${proto}://${host}`;

  const image = await generateClaimImage(friendlyId, claimCode, baseUrl);

  // Short cache since codes expire
  return new NextResponse(Uint8Array.from(image), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}

export async function GET(request: NextRequest) {
  return handleClaimImage(request, createDal(await getDb()));
}
