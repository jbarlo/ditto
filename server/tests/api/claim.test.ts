import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import assert from "assert";
import { createTestDb } from "@/lib/db/client";
import { createDal, type Dal } from "@/lib/db/dal";
import type { Session } from "@/lib/auth/types";
import { generateClaimCode } from "@/lib/claim-code";

// Mock auth to avoid WorkOS import issues
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { handleClaim } from "@/app/api/claim/route";

const mockSession: Session = { userId: "test-user-id", email: "test@example.com" };

function createRequest(body: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/claim", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/claim", () => {
  let dal: Dal;

  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("returns 401 when not authenticated", async () => {
    const req = createRequest({ id: "ABCDE", code: "FGHIJ", name: "my-frame" });
    const res = await handleClaim(req, dal, null);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when device ID is missing", async () => {
    const req = createRequest({ code: "ABCDE", name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Device ID is required");
  });

  it("returns 400 when code is missing", async () => {
    const req = createRequest({ id: "ABCDE", name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Code is required");
  });

  it("returns 400 when name is missing", async () => {
    const req = createRequest({ id: "ABCDE", code: "FGHIJ" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Name is required");
  });

  it("returns 400 when name has invalid characters", async () => {
    const req = createRequest({ id: "ABCDE", code: "FGHIJ", name: "my frame!" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("letters, numbers, and hyphens");
  });

  it("returns 400 when name is already taken by same user", async () => {
    // Create a frame and claim it with a name (same user as mockSession)
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    await dal.ensurePerson(mockSession.userId, mockSession.email);
    await dal.claimFrame(frame.id, mockSession.userId, "my-frame");

    // Create another unclaimed frame
    const frame2Result = await dal.createFrame("11:22:33:44:55:66");
    assert(frame2Result.ok);
    const frame2 = frame2Result.data;
    const claimCode = generateClaimCode(frame2.friendlyId);

    // Same user tries to claim with same name
    const req = createRequest({ id: frame2.friendlyId, code: claimCode, name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("You already have a frame with that name");
  });

  it("returns 400 when device not found", async () => {
    const req = createRequest({ id: "XXXXX", code: "YYYYY", name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid device ID or code");
  });

  it("returns 400 when device already claimed", async () => {
    // Create and claim a frame
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimCode = generateClaimCode(frame.friendlyId);
    await dal.ensurePerson("other-user", "other@test.com");
    await dal.claimFrame(frame.id, "other-user", "other-frame");

    const req = createRequest({ id: frame.friendlyId, code: claimCode, name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid device ID or code");
  });

  it("creates Default album for user with no albums", async () => {
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimCode = generateClaimCode(frame.friendlyId);
    await dal.ensurePerson(mockSession.userId, mockSession.email);

    const req = createRequest({ id: frame.friendlyId, code: claimCode, name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);
    expect(res.status).toBe(200);

    const albums = await dal.getAlbumsForUser(mockSession.userId);
    assert(albums.ok);
    expect(albums.data).toHaveLength(1);
    const created = albums.data[0];
    assert(created);
    expect(created.name).toBe("Default");

    const updatedFrame = await dal.getFrame(frame.id);
    assert(updatedFrame.ok);
    expect(updatedFrame.data.currentAlbumId).toBe(created.id);
  });

  it("reuses existing album instead of creating a new one", async () => {
    await dal.ensurePerson(mockSession.userId, mockSession.email);
    const existingAlbum = await dal.createAlbum("My Album", mockSession.userId);
    assert(existingAlbum.ok);

    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimCode = generateClaimCode(frame.friendlyId);

    const req = createRequest({ id: frame.friendlyId, code: claimCode, name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);
    expect(res.status).toBe(200);

    const albums = await dal.getAlbumsForUser(mockSession.userId);
    assert(albums.ok);
    expect(albums.data).toHaveLength(1);
    const reused = albums.data[0];
    assert(reused);
    expect(reused.name).toBe("My Album");

    const updatedFrame = await dal.getFrame(frame.id);
    assert(updatedFrame.ok);
    expect(updatedFrame.data.currentAlbumId).toBe(existingAlbum.data.id);
  });

  it("returns 400 when claim code is invalid", async () => {
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;

    // Use an invalid claim code (not matching HMAC)
    const req = createRequest({ id: frame.friendlyId, code: "XXXXX", name: "my-frame" });
    const res = await handleClaim(req, dal, mockSession);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid device ID or code");
  });
});
