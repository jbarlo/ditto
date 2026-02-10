import { NextRequest, NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/auth";
import { createDal, type Dal } from "@/lib/db/dal";
import { getDb } from "@/lib/db/client";
import { getClientIp } from "@/lib/api/ip";
import { validateClaimCode } from "@/lib/claim-code";

export const CLAIM_RATE_LIMIT = 5;
export const CLAIM_RATE_WINDOW = 60;

export async function handleClaim(
  request: NextRequest,
  dal: Dal,
  session: Session | null
) {
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimitResult = await dal.checkRateLimit(
    `ip:${ip}:claim`,
    CLAIM_RATE_LIMIT,
    CLAIM_RATE_WINDOW
  );

  if (!rateLimitResult.ok || !rateLimitResult.data.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(CLAIM_RATE_WINDOW) },
      }
    );
  }

  const body = await request.json();
  const deviceId = body.id?.trim().toUpperCase();
  const code = body.code?.trim().toUpperCase();
  const name = body.name?.trim().toLowerCase();

  if (!deviceId) {
    return NextResponse.json({ error: "Device ID is required" }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    return NextResponse.json(
      { error: "Name can only contain letters, numbers, and hyphens" },
      { status: 400 }
    );
  }

  const nameTakenResult = await dal.isNameTaken(name, session.userId);
  if (!nameTakenResult.ok) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  if (nameTakenResult.data) {
    return NextResponse.json({ error: "You already have a frame with that name" }, { status: 400 });
  }

  const frameResult = await dal.getFrameByFriendlyId(deviceId);

  // Use generic error to prevent device enumeration
  const invalidError = { error: "Invalid device ID or code" };

  if (!frameResult.ok) {
    return NextResponse.json(invalidError, { status: 400 });
  }

  const frame = frameResult.data;

  if (frame.ownerId) {
    return NextResponse.json(invalidError, { status: 400 });
  }

  if (!validateClaimCode(deviceId, code)) {
    return NextResponse.json(invalidError, { status: 400 });
  }

  const ensureResult = await dal.ensurePerson(session.userId, session.email);
  if (!ensureResult.ok) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const claimResult = await dal.claimFrame(frame.id, session.userId, name);
  if (!claimResult.ok) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const existingAlbums = await dal.getAlbumsForUser(session.userId);
  if (!existingAlbums.ok) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  let albumId: string;
  if (existingAlbums.data.length > 0) {
    const oldest = existingAlbums.data.reduce((a, b) =>
      (a.createdAt ?? "") <= (b.createdAt ?? "") ? a : b
    );
    albumId = oldest.id;
  } else {
    const albumResult = await dal.createAlbum("Default", session.userId);
    if (!albumResult.ok) {
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    albumId = albumResult.data.id;
  }

  const setAlbumResult = await dal.setFrameAlbum(frame.id, albumId);
  if (!setAlbumResult.ok) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true, name });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  return handleClaim(request, createDal(await getDb()), session);
}
