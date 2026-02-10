import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createDal, type Dal, type Frame } from "@/lib/db/dal";
import { getDb } from "@/lib/db/client";
import { getDisplayResponse } from "@/lib/api/display";
import { normalizeMac } from "@/lib/api/mac";
import { generateClaimCode } from "@/lib/claim-code";

const telemetrySchema = z.object({
  batteryVoltage: z.coerce.number().min(0).max(10).optional(),
  firmwareVersion: z.string().max(32).regex(/^[\w.\-]+$/).optional(),
  rssi: z.coerce.number().int().min(-150).max(0).optional(),
});

function parseTelemetry(headers: Headers) {
  const result = telemetrySchema.safeParse({
    batteryVoltage: headers.get("battery-voltage") || undefined,
    firmwareVersion: headers.get("fw-version") || undefined,
    rssi: headers.get("rssi") || undefined,
  });
  return result.success ? result.data : {};
}

export const DISPLAY_RATE_LIMIT = 20;
export const DISPLAY_RATE_WINDOW = 60;

export async function handleDisplay(request: NextRequest, dal: Dal) {
  const rawMac = request.headers.get("id");
  const apiKey = request.headers.get("access-token");
  const action = request.nextUrl.searchParams.get("action");

  const mac = rawMac ? normalizeMac(rawMac) : null;

  const deviceKey = mac ?? apiKey?.slice(0, 16) ?? "unknown";
  const rateLimitResult = await dal.checkRateLimit(
    `device:${deviceKey}:display`,
    DISPLAY_RATE_LIMIT,
    DISPLAY_RATE_WINDOW
  );

  if (!rateLimitResult.ok || !rateLimitResult.data.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(DISPLAY_RATE_WINDOW) },
      }
    );
  }

  let frame: Frame | null = null;
  if (apiKey) {
    const result = await dal.getFrameByApiKey(apiKey);
    if (result.ok) frame = result.data;
  }
  if (!frame && mac) {
    const result = await dal.getFrameByMac(mac);
    if (result.ok) frame = result.data;
  }

  if (!frame) {
	// TRMNL-compatibility:
    // Return status 500 in body to trigger firmware credential reset.
    // Device will call /api/setup on next boot.
    return NextResponse.json({ status: 500 });
  }

  await dal.updateFrameTelemetry(frame.id, parseTelemetry(request.headers));

  if (action === "next") {
    await dal.advanceFrameIndex(frame.id, 1);
    frame.currentIndex = (frame.currentIndex ?? 0) + 1;
  } else if (action === "prev") {
    await dal.advanceFrameIndex(frame.id, -1);
    frame.currentIndex = (frame.currentIndex ?? 0) - 1;
  }

  const claimCode = !frame.ownerId ? generateClaimCode(frame.friendlyId) : undefined;
  const displayResponse = await getDisplayResponse(frame, dal, claimCode);

  return NextResponse.json(displayResponse);
}

export async function GET(request: NextRequest) {
  return handleDisplay(request, createDal(await getDb()));
}
