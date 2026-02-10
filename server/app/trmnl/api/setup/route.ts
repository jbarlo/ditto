import { NextRequest, NextResponse } from "next/server";
import { createDal, type Dal } from "@/lib/db/dal";
import { getDb } from "@/lib/db/client";
import { getDisplayResponse } from "@/lib/api/display";
import { getClientIp } from "@/lib/api/ip";
import { normalizeMac } from "@/lib/api/mac";
import { generateClaimCode } from "@/lib/claim-code";

export const SETUP_RATE_LIMIT = 10;
export const SETUP_RATE_WINDOW = 60;

export async function handleSetup(request: NextRequest, dal: Dal) {
  const ip = getClientIp(request);
  const rateLimitResult = await dal.checkRateLimit(
    `ip:${ip}:setup`,
    SETUP_RATE_LIMIT,
    SETUP_RATE_WINDOW
  );

  if (!rateLimitResult.ok || !rateLimitResult.data.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(SETUP_RATE_WINDOW) },
      }
    );
  }

  const rawMac = request.headers.get("id");

  if (!rawMac) {
    return NextResponse.json(
      { status: 400, error: "Missing ID header" },
      { status: 400 }
    );
  }

  const mac = normalizeMac(rawMac);
  if (!mac) {
    return NextResponse.json(
      { status: 400, error: "Invalid MAC address format" },
      { status: 400 }
    );
  }

  const existingResult = await dal.getFrameByMac(mac);
  let frame = existingResult.ok ? existingResult.data : null;

  if (!frame) {
    const createResult = await dal.createFrame(mac);
    if (!createResult.ok) {
      return NextResponse.json(
        { status: 500, error: "Failed to create device" },
        { status: 500 }
      );
    }
    frame = createResult.data;
  }

  const claimCode = generateClaimCode(frame.friendlyId);
  const displayResponse = await getDisplayResponse(frame, dal, claimCode);

  return NextResponse.json({
    ...displayResponse,
    api_key: frame.apiKey,
    friendly_id: frame.friendlyId,
    message: "ditto",
  });
}

export async function GET(request: NextRequest) {
  return handleSetup(request, createDal(await getDb()));
}
