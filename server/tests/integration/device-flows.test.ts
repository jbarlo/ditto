/**
 * Integration tests for device signup and display flows.
 * These test the actual route handlers with real database behavior.
 */
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

// Mock storage for display responses
vi.mock("@/lib/storage", () => ({
  imageStorage: {
    upload: vi.fn(async () => "uploaded-url"),
    get: vi.fn(async () => null),
    getUrl: vi.fn((id: string) => `/uploads/${id}.png`),
    delete: vi.fn(async () => {}),
  },
  canvasImageUrl: (id: string, v: string | null) => v ? `/uploads/${id}.png?v=${encodeURIComponent(v)}` : `/uploads/${id}.png`,
}));

import { handleSetup, SETUP_RATE_LIMIT } from "@/app/trmnl/api/setup/route";
import { handleDisplay, DISPLAY_RATE_LIMIT } from "@/app/trmnl/api/display/route";
import { handleClaim, CLAIM_RATE_LIMIT } from "@/app/api/claim/route";

let dal: Dal;

// Helper to create setup request
function setupRequest(mac?: string): NextRequest {
  const headers = new Headers();
  if (mac) headers.set("id", mac);
  return new NextRequest("http://localhost:3000/api/setup", {
    method: "GET",
    headers,
  });
}

// Helper to create display request
function displayRequest(opts: {
  mac?: string;
  apiKey?: string;
  action?: string;
  battery?: number;
  firmware?: string;
  rssi?: number;
}): NextRequest {
  const headers = new Headers();
  if (opts.mac) headers.set("id", opts.mac);
  if (opts.apiKey) headers.set("access-token", opts.apiKey);
  if (opts.battery) headers.set("battery-voltage", opts.battery.toString());
  if (opts.firmware) headers.set("fw-version", opts.firmware);
  if (opts.rssi) headers.set("rssi", opts.rssi.toString());

  const url = opts.action
    ? `http://localhost:3000/api/display?action=${opts.action}`
    : "http://localhost:3000/api/display";

  return new NextRequest(url, { method: "GET", headers });
}

// Helper to create claim request
function claimRequest(body: {
  id?: string;
  code?: string;
  name?: string;
}): NextRequest {
  return new NextRequest("http://localhost:3000/api/claim", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("Device Setup Flow (via route handler)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("new device gets api_key and friendly_id with claim code", async () => {
    const res = await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.api_key).toMatch(/^ditto_/);
    expect(data.friendly_id).toMatch(/^[A-Z0-9]{5}$/);
    expect(data.image_url).toContain("/api/claim-image?id=");
    expect(data.image_url).toContain("&code=");
    expect(data.filename).toBe("claim.bmp");
  });

  it("same device returns same api_key and friendly_id on subsequent calls", async () => {
    const res1 = await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const res2 = await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const data1 = await res1.json();
    const data2 = await res2.json();

    expect(data1.api_key).toBe(data2.api_key);
    expect(data1.friendly_id).toBe(data2.friendly_id);
    // Claim code in image_url may differ between calls (time-based)
  });

  it("different devices get different api_keys and friendly_ids", async () => {
    const res1 = await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const res2 = await handleSetup(setupRequest("11:22:33:44:55:66"), dal);
    const data1 = await res1.json();
    const data2 = await res2.json();

    expect(data1.api_key).not.toBe(data2.api_key);
    expect(data1.friendly_id).not.toBe(data2.friendly_id);
  });

  it("returns 400 when MAC is missing", async () => {
    const res = await handleSetup(setupRequest(), dal);
    expect(res.status).toBe(400);
  });
});

describe("Claim Flow (via route handler)", () => {
  const session: Session = { userId: "user-123", email: "user@example.com" };

  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("full claim flow: setup → claim → verify ownership", async () => {
    // 1. Device calls /api/setup
    const setupRes = await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const setupData = await setupRes.json();
    expect(setupData.friendly_id).toBeTruthy();

    // 2. Generate HMAC claim code
    const claimCode = generateClaimCode(setupData.friendly_id);

    // 3. User claims the device
    const claimRes = await handleClaim(
      claimRequest({
        id: setupData.friendly_id,
        code: claimCode,
        name: "kitchen-frame",
      }),
      dal,
      session
    );
    expect(claimRes.status).toBe(200);
    const claimData = await claimRes.json();
    expect(claimData.success).toBe(true);
    expect(claimData.name).toBe("kitchen-frame");

    // 4. Subsequent setup shows device is claimed (with empty album)
    const setupRes2 = await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const setupData2 = await setupRes2.json();
    // After claim, should show empty-album fallback (claim creates a default album)
    expect(setupData2.filename).toBe("empty-album.png");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await handleClaim(
      claimRequest({ id: "XXXXX", code: "YYYYY", name: "my-frame" }),
      dal,
      null
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid device ID or code", async () => {
    const res = await handleClaim(
      claimRequest({ id: "XXXXX", code: "YYYYY", name: "my-frame" }),
      dal,
      session
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is already taken by same user", async () => {
    // Create and claim first device
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frame1Result = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frame1Result.ok);
    const frame1 = frame1Result.data;
    const claimCode1 = generateClaimCode(frame1.friendlyId);
    await handleClaim(
      claimRequest({
        id: frame1.friendlyId,
        code: claimCode1,
        name: "my-frame",
      }),
      dal,
      session
    );

    // Same user tries to claim second device with same name
    await handleSetup(setupRequest("11:22:33:44:55:66"), dal);
    const frame2Result = await dal.getFrameByMac("11:22:33:44:55:66");
    assert(frame2Result.ok);
    const frame2 = frame2Result.data;
    const claimCode2 = generateClaimCode(frame2.friendlyId);
    const res = await handleClaim(
      claimRequest({
        id: frame2.friendlyId,
        code: claimCode2,
        name: "my-frame",
      }),
      dal,
      session // same user
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("already have a frame");
  });

  it("allows different users to use the same frame name", async () => {
    // Create and claim first device
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frame1Result = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frame1Result.ok);
    const frame1 = frame1Result.data;
    const claimCode1 = generateClaimCode(frame1.friendlyId);
    await handleClaim(
      claimRequest({
        id: frame1.friendlyId,
        code: claimCode1,
        name: "my-frame",
      }),
      dal,
      session
    );

    // Different user can use same name
    await handleSetup(setupRequest("11:22:33:44:55:66"), dal);
    const frame2Result = await dal.getFrameByMac("11:22:33:44:55:66");
    assert(frame2Result.ok);
    const frame2 = frame2Result.data;
    const claimCode2 = generateClaimCode(frame2.friendlyId);
    const res = await handleClaim(
      claimRequest({
        id: frame2.friendlyId,
        code: claimCode2,
        name: "my-frame",
      }),
      dal,
      { userId: "user-456", email: "other@example.com" }
    );
    expect(res.status).toBe(200);
  });
});

describe("Display Flow (via route handler)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("unclaimed device shows claim screen", async () => {
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;

    const res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey }),
      dal
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.image_url).toContain("/api/claim-image");
    expect(data.filename).toBe("claim.bmp");
  });

  it("claimed device with empty album shows empty-album fallback", async () => {
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimCode = generateClaimCode(frame.friendlyId);

    const session: Session = { userId: "user-123" };
    await handleClaim(
      claimRequest({ id: frame.friendlyId, code: claimCode, name: "my-frame" }),
      dal,
      session
    );

    const res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey }),
      dal
    );
    const data = await res.json();

    // Claim creates a default album, so we get empty-album (not no-album)
    expect(data.filename).toBe("empty-album.png");
  });

  it("claimed device with content shows image", async () => {
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimCode = generateClaimCode(frame.friendlyId);

    const session: Session = { userId: "user-123" };
    await handleClaim(
      claimRequest({ id: frame.friendlyId, code: claimCode, name: "my-frame" }),
      dal,
      session
    );

    // Add content to album
    const updatedFrameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(updatedFrameResult.ok);
    const updatedFrame = updatedFrameResult.data;
    const canvasResult = await dal.createCanvasWithOwner(
      "sunset-image",
      "user-123"
    );
    assert(canvasResult.ok);
    const canvas = canvasResult.data;
    assert(updatedFrame.currentAlbumId);
    await dal.addCanvasToAlbum(updatedFrame.currentAlbumId, canvas.id);

    const res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey }),
      dal
    );
    const data = await res.json();

    expect(data.image_url).toContain("/uploads/sunset-image.png");
    expect(data.filename).toBe("sunset-image.png");
  });

  it("next/prev actions advance through album", async () => {
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimCode = generateClaimCode(frame.friendlyId);

    const session: Session = { userId: "user-123" };
    await handleClaim(
      claimRequest({ id: frame.friendlyId, code: claimCode, name: "my-frame" }),
      dal,
      session
    );

    // Add multiple canvases
    const updatedFrameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(updatedFrameResult.ok);
    const updatedFrame = updatedFrameResult.data;
    const canvas1Result = await dal.createCanvasWithOwner(
      "image-001",
      "user-123"
    );
    assert(canvas1Result.ok);
    const canvas1 = canvas1Result.data;
    const canvas2Result = await dal.createCanvasWithOwner(
      "image-002",
      "user-123"
    );
    assert(canvas2Result.ok);
    const canvas2 = canvas2Result.data;
    const canvas3Result = await dal.createCanvasWithOwner(
      "image-003",
      "user-123"
    );
    assert(canvas3Result.ok);
    const canvas3 = canvas3Result.data;
    assert(updatedFrame.currentAlbumId);
    await dal.addCanvasToAlbum(updatedFrame.currentAlbumId, canvas1.id);
    await dal.addCanvasToAlbum(updatedFrame.currentAlbumId, canvas2.id);
    await dal.addCanvasToAlbum(updatedFrame.currentAlbumId, canvas3.id);

    // Initial display - index 0
    let res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey }),
      dal
    );
    let data = await res.json();
    expect(data.filename).toBe("image-001.png");

    // Press next - index 1
    res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey, action: "next" }),
      dal
    );
    data = await res.json();
    expect(data.filename).toBe("image-002.png");

    // Press next - index 2
    res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey, action: "next" }),
      dal
    );
    data = await res.json();
    expect(data.filename).toBe("image-003.png");

    // Press next - wraps to index 0
    res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey, action: "next" }),
      dal
    );
    data = await res.json();
    expect(data.filename).toBe("image-001.png");

    // Press prev - wraps to index 2
    res = await handleDisplay(
      displayRequest({ apiKey: frame.apiKey, action: "prev" }),
      dal
    );
    data = await res.json();
    expect(data.filename).toBe("image-003.png");
  });

  it("returns status 500 in body for unknown device to trigger credential reset", async () => {
    const res = await handleDisplay(
      displayRequest({ apiKey: "ditto_nonexistent" }),
      dal
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe(500);
  });
});

describe("Telemetry Updates (via route handler)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("updates device telemetry on display call", async () => {
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;

    await handleDisplay(
      displayRequest({
        apiKey: frame.apiKey,
        battery: 3.7,
        firmware: "1.2.3",
        rssi: -65,
      }),
      dal
    );

    const updatedResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(updatedResult.ok);
    const updated = updatedResult.data;
    expect(updated.batteryVoltage).toBe(3.7);
    expect(updated.firmwareVersion).toBe("1.2.3");
    expect(updated.rssi).toBe(-65);
    expect(updated.lastSeenAt).toBeTruthy();
  });

  it("partial telemetry update preserves existing values", async () => {
    await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;

    // First update
    await handleDisplay(
      displayRequest({ apiKey: frame.apiKey, battery: 3.7, firmware: "1.2.3" }),
      dal
    );

    // Second update with only rssi
    await handleDisplay(
      displayRequest({ apiKey: frame.apiKey, rssi: -70 }),
      dal
    );

    const updatedResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(updatedResult.ok);
    const updated = updatedResult.data;
    expect(updated.batteryVoltage).toBe(3.7); // Preserved
    expect(updated.firmwareVersion).toBe("1.2.3"); // Preserved
    expect(updated.rssi).toBe(-70); // Updated
  });
});

describe("DAL-level Tests (DB constraints)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("claimFrame fails without person due to FK constraint", async () => {
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimResult = await dal.claimFrame(frame.id, "user-123", "my-frame");
    assert(!claimResult.ok);
    expect(claimResult.error).toBe("FK_VIOLATION");
  });

  it("claimFrame succeeds when ensurePerson is called first", async () => {
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    await dal.ensurePerson("user-123", "test@example.com");
    await dal.claimFrame(frame.id, "user-123", "my-frame");

    const updatedResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(updatedResult.ok);
    const updated = updatedResult.data;
    expect(updated.ownerId).toBe("user-123");
    expect(updated.name).toBe("my-frame");
  });

  it("ensurePerson is idempotent", async () => {
    await dal.ensurePerson("user-123", "first@example.com");
    await dal.ensurePerson("user-123", "second@example.com");

    const personResult = await dal.getPerson("user-123");
    assert(personResult.ok);
    const person = personResult.data;
    // First insert wins, second is ignored (DO NOTHING)
    expect(person.name).toBe("first@example.com");
  });

  it("name uniqueness constraint is case-insensitive per user", async () => {
    const frame1Result = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frame1Result.ok);
    const frame1 = frame1Result.data;
    const frame2Result = await dal.createFrame("11:22:33:44:55:66");
    assert(frame2Result.ok);
    const frame2 = frame2Result.data;

    await dal.ensurePerson("user-1");

    await dal.claimFrame(frame1.id, "user-1", "Kitchen");

    // Same user: "kitchen" should conflict with "Kitchen"
    const claimResult = await dal.claimFrame(frame2.id, "user-1", "kitchen");
    assert(!claimResult.ok);
    expect(claimResult.error).toBe("DUPLICATE_NAME");
  });

  it("different users can have same frame name", async () => {
    const frame1Result = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frame1Result.ok);
    const frame1 = frame1Result.data;
    const frame2Result = await dal.createFrame("11:22:33:44:55:66");
    assert(frame2Result.ok);
    const frame2 = frame2Result.data;

    await dal.ensurePerson("user-1");
    await dal.ensurePerson("user-2");

    await dal.claimFrame(frame1.id, "user-1", "kitchen");

    // Different users can use same name
    await dal.claimFrame(frame2.id, "user-2", "kitchen");

    const f1Result = await dal.getFrameByNameForUser("kitchen", "user-1");
    assert(f1Result.ok);
    const f1 = f1Result.data;
    const f2Result = await dal.getFrameByNameForUser("kitchen", "user-2");
    assert(f2Result.ok);
    const f2 = f2Result.data;
    expect(f1.id).toBe(frame1.id);
    expect(f2.id).toBe(frame2.id);
  });

  it("advance on empty album is no-op", async () => {
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    await dal.ensurePerson("user-123");
    await dal.claimFrame(frame.id, "user-123", "my-frame");

    const albumResult = await dal.createAlbum("Empty", "user-123");
    assert(albumResult.ok);
    const album = albumResult.data;
    await dal.setFrameAlbum(frame.id, album.id);

    await dal.advanceFrameIndex(frame.id, 1);

    const afterResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(afterResult.ok);
    const after = afterResult.data;
    expect(after.currentIndex).toBe(0);
  });

  it("getCanvasAtIndex wraps negative indices", async () => {
    await dal.ensurePerson("user-123");
    const albumResult = await dal.createAlbum("Test", "user-123");
    assert(albumResult.ok);
    const album = albumResult.data;
    const canvas1Result = await dal.createCanvasWithOwner(
      "image-001",
      "user-123"
    );
    assert(canvas1Result.ok);
    const canvas1 = canvas1Result.data;
    const canvas2Result = await dal.createCanvasWithOwner(
      "image-002",
      "user-123"
    );
    assert(canvas2Result.ok);
    const canvas2 = canvas2Result.data;
    await dal.addCanvasToAlbum(album.id, canvas1.id);
    await dal.addCanvasToAlbum(album.id, canvas2.id);

    const index1Result = await dal.getCanvasAtIndex(album.id, -1);
    assert(index1Result.ok);
    expect(index1Result.data.imageId).toBe("image-002");
    const index2Result = await dal.getCanvasAtIndex(album.id, -2);
    assert(index2Result.ok);
    expect(index2Result.data.imageId).toBe("image-001");
  });
});

describe("End-to-End: Device Lifecycle (via route handlers)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("complete lifecycle: unboxing → claim → display content → button navigation", async () => {
    // === Phase 1: Unboxing ===
    // Device powers on and calls /api/setup
    const setupRes = await handleSetup(setupRequest("AA:BB:CC:DD:EE:FF"), dal);
    const setupData = await setupRes.json();
    expect(setupData.api_key).toMatch(/^ditto_/);
    expect(setupData.friendly_id).toMatch(/^[A-Z0-9]{5}$/);
    expect(setupData.filename).toBe("claim.bmp");

    // Device polls /api/display - should show claim screen
    let displayRes = await handleDisplay(
      displayRequest({ apiKey: setupData.api_key }),
      dal
    );
    let displayData = await displayRes.json();
    expect(displayData.filename).toBe("claim.bmp");

    // === Phase 2: User Claims Device ===
    const session: Session = {
      userId: "user_workos_123",
      email: "alice@example.com",
    };

    // Generate claim code
    const claimCode = generateClaimCode(setupData.friendly_id);
    const claimRes = await handleClaim(
      claimRequest({
        id: setupData.friendly_id,
        code: claimCode,
        name: "kitchen",
      }),
      dal,
      session
    );
    expect(claimRes.status).toBe(200);
    const claimData = await claimRes.json();
    expect(claimData.success).toBe(true);
    expect(claimData.name).toBe("kitchen");

    // === Phase 3: Empty Album State ===
    displayRes = await handleDisplay(
      displayRequest({ apiKey: setupData.api_key }),
      dal
    );
    displayData = await displayRes.json();
    expect(displayData.filename).toBe("empty-album.png");

    // === Phase 4: User Adds Content ===
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const canvas1Result = await dal.createCanvasWithOwner(
      "sunset-beach",
      "user_workos_123"
    );
    assert(canvas1Result.ok);
    const canvas1 = canvas1Result.data;
    const canvas2Result = await dal.createCanvasWithOwner(
      "mountain-view",
      "user_workos_123"
    );
    assert(canvas2Result.ok);
    const canvas2 = canvas2Result.data;
    const canvas3Result = await dal.createCanvasWithOwner(
      "city-lights",
      "user_workos_123"
    );
    assert(canvas3Result.ok);
    const canvas3 = canvas3Result.data;
    assert(frame.currentAlbumId);
    await dal.addCanvasToAlbum(frame.currentAlbumId, canvas1.id);
    await dal.addCanvasToAlbum(frame.currentAlbumId, canvas2.id);
    await dal.addCanvasToAlbum(frame.currentAlbumId, canvas3.id);

    // Device polls /api/display - now has content
    displayRes = await handleDisplay(
      displayRequest({ apiKey: setupData.api_key }),
      dal
    );
    displayData = await displayRes.json();
    expect(displayData.filename).toBe("sunset-beach.png");

    // === Phase 5: Button Navigation ===
    // User presses "next" button on device
    displayRes = await handleDisplay(
      displayRequest({ apiKey: setupData.api_key, action: "next" }),
      dal
    );
    displayData = await displayRes.json();
    expect(displayData.filename).toBe("mountain-view.png");

    // User presses "next" again
    displayRes = await handleDisplay(
      displayRequest({ apiKey: setupData.api_key, action: "next" }),
      dal
    );
    displayData = await displayRes.json();
    expect(displayData.filename).toBe("city-lights.png");

    // User presses "prev" button
    displayRes = await handleDisplay(
      displayRequest({ apiKey: setupData.api_key, action: "prev" }),
      dal
    );
    displayData = await displayRes.json();
    expect(displayData.filename).toBe("mountain-view.png");

    // === Phase 6: Telemetry ===
    await handleDisplay(
      displayRequest({
        apiKey: setupData.api_key,
        battery: 3.85,
        firmware: "2.0.1",
        rssi: -55,
      }),
      dal
    );

    const finalResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(finalResult.ok);
    const final = finalResult.data;
    expect(final.batteryVoltage).toBe(3.85);
    expect(final.lastSeenAt).toBeTruthy();
  });
});

describe("Ownership & Authorization (DAL-level)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("getFrameByNameForUser returns NOT_FOUND for non-owner", async () => {
    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    await dal.ensurePerson("user-1");
    await dal.ensurePerson("user-2");
    await dal.claimFrame(frame.id, "user-1", "my-frame");

    // Owner can access
    const ownedResult = await dal.getFrameByNameForUser("my-frame", "user-1");
    assert(ownedResult.ok);
    expect(ownedResult.data.id).toBe(frame.id);

    // Non-owner cannot access
    const notOwnedResult = await dal.getFrameByNameForUser(
      "my-frame",
      "user-2"
    );
    assert(!notOwnedResult.ok);
    expect(notOwnedResult.error).toBe("NOT_FOUND");
  });

  it("getFramesForUser only returns frames owned by that user", async () => {
    await dal.ensurePerson("user-1");
    await dal.ensurePerson("user-2");

    const frame1Result = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frame1Result.ok);
    const frame1 = frame1Result.data;
    const frame2Result = await dal.createFrame("11:22:33:44:55:66");
    assert(frame2Result.ok);
    const frame2 = frame2Result.data;
    const frame3Result = await dal.createFrame("22:33:44:55:66:77");
    assert(frame3Result.ok);
    const frame3 = frame3Result.data;

    await dal.claimFrame(frame1.id, "user-1", "kitchen");
    await dal.claimFrame(frame2.id, "user-1", "bedroom");
    await dal.claimFrame(frame3.id, "user-2", "office");

    const user1FramesResult = await dal.getFramesForUser("user-1");
    assert(user1FramesResult.ok);
    const user1Frames = user1FramesResult.data;
    const user2FramesResult = await dal.getFramesForUser("user-2");
    assert(user2FramesResult.ok);
    const user2Frames = user2FramesResult.data;

    expect(user1Frames).toHaveLength(2);
    expect(user1Frames.map((f) => f.name).sort()).toEqual([
      "bedroom",
      "kitchen",
    ]);

    expect(user2Frames).toHaveLength(1);
    expect(user2Frames[0]?.name).toBe("office");
  });

  it("getCanvasesInAlbum returns canvases in order", async () => {
    await dal.ensurePerson("user-1");
    const albumResult = await dal.createAlbum("Test Album", "user-1");
    assert(albumResult.ok);
    const album = albumResult.data;

    const canvas1Result = await dal.createCanvasWithOwner("img-1", "user-1");
    assert(canvas1Result.ok);
    const canvas1 = canvas1Result.data;
    const canvas2Result = await dal.createCanvasWithOwner("img-2", "user-1");
    assert(canvas2Result.ok);
    const canvas2 = canvas2Result.data;
    const canvas3Result = await dal.createCanvasWithOwner("img-3", "user-1");
    assert(canvas3Result.ok);
    const canvas3 = canvas3Result.data;

    await dal.addCanvasToAlbum(album.id, canvas1.id);
    await dal.addCanvasToAlbum(album.id, canvas2.id);
    await dal.addCanvasToAlbum(album.id, canvas3.id);

    const canvasesResult = await dal.getCanvasesInAlbum(album.id);
    assert(canvasesResult.ok);
    const canvases = canvasesResult.data;
    expect(canvases).toHaveLength(3);
    expect(canvases.map((c) => c.imageId)).toEqual(["img-1", "img-2", "img-3"]);
  });

  it("getCanvasesInAlbum returns empty array for empty album", async () => {
    await dal.ensurePerson("user-1");
    const albumResult = await dal.createAlbum("Empty Album", "user-1");
    assert(albumResult.ok);
    const album = albumResult.data;

    const canvasesResult = await dal.getCanvasesInAlbum(album.id);
    assert(canvasesResult.ok);
    expect(canvasesResult.data).toEqual([]);
  });

  it("upsertPerson creates new person", async () => {
    await dal.upsertPerson("new-user", "new@example.com");

    const personResult = await dal.getPerson("new-user");
    assert(personResult.ok);
    expect(personResult.data.name).toBe("new@example.com");
  });

  it("upsertPerson updates existing person name", async () => {
    await dal.ensurePerson("user-1", "old@example.com");

    // Verify initial state
    let personResult = await dal.getPerson("user-1");
    assert(personResult.ok);
    expect(personResult.data.name).toBe("old@example.com");

    // Upsert with new name
    await dal.upsertPerson("user-1", "new@example.com");

    // Verify name was updated
    personResult = await dal.getPerson("user-1");
    assert(personResult.ok);
    expect(personResult.data.name).toBe("new@example.com");
  });

  it("isNameTaken is scoped to user", async () => {
    await dal.ensurePerson("user-1");
    await dal.ensurePerson("user-2");

    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    await dal.claimFrame(frame.id, "user-1", "kitchen");

    // Name is taken for user-1
    const takenResult1 = await dal.isNameTaken("kitchen", "user-1");
    assert(takenResult1.ok);
    expect(takenResult1.data).toBe(true);

    // Name is NOT taken for user-2
    const takenResult2 = await dal.isNameTaken("kitchen", "user-2");
    assert(takenResult2.ok);
    expect(takenResult2.data).toBe(false);
  });

  it("isNameTaken is case-insensitive", async () => {
    await dal.ensurePerson("user-1");

    const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    await dal.claimFrame(frame.id, "user-1", "kitchen");

    const result1 = await dal.isNameTaken("KITCHEN", "user-1");
    assert(result1.ok);
    expect(result1.data).toBe(true);
    const result2 = await dal.isNameTaken("Kitchen", "user-1");
    assert(result2.ok);
    expect(result2.data).toBe(true);
    const result3 = await dal.isNameTaken("kitchen", "user-1");
    assert(result3.ok);
    expect(result3.data).toBe(true);
  });
});

describe("Rate Limiting (DAL-level)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("allows requests under the limit", async () => {
    const result1 = await dal.checkRateLimit("test:key", 3, 60);
    assert(result1.ok);
    expect(result1.data.allowed).toBe(true);
    expect(result1.data.remaining).toBe(2);

    const result2 = await dal.checkRateLimit("test:key", 3, 60);
    assert(result2.ok);
    expect(result2.data.allowed).toBe(true);
    expect(result2.data.remaining).toBe(1);

    const result3 = await dal.checkRateLimit("test:key", 3, 60);
    assert(result3.ok);
    expect(result3.data.allowed).toBe(true);
    expect(result3.data.remaining).toBe(0);
  });

  it("rejects requests at the limit", async () => {
    // Use up the limit
    await dal.checkRateLimit("test:key", 2, 60);
    await dal.checkRateLimit("test:key", 2, 60);

    // Should be rejected
    const result = await dal.checkRateLimit("test:key", 2, 60);
    assert(result.ok);
    expect(result.data.allowed).toBe(false);
    expect(result.data.remaining).toBe(0);
  });

  it("always increments count even on rejection", async () => {
    // Use up the limit
    const r1 = await dal.checkRateLimit("test:key", 2, 60);
    assert(r1.ok);
    expect(r1.data.allowed).toBe(true);
    expect(r1.data.remaining).toBe(1);

    const r2 = await dal.checkRateLimit("test:key", 2, 60);
    assert(r2.ok);
    expect(r2.data.allowed).toBe(true);
    expect(r2.data.remaining).toBe(0);

    // These should be rejected
    const r3 = await dal.checkRateLimit("test:key", 2, 60);
    assert(r3.ok);
    expect(r3.data.allowed).toBe(false);

    const r4 = await dal.checkRateLimit("test:key", 2, 60);
    assert(r4.ok);
    expect(r4.data.allowed).toBe(false);
  });

  it("tracks different keys independently", async () => {
    await dal.checkRateLimit("key:a", 1, 60);
    await dal.checkRateLimit("key:b", 1, 60);

    // key:a should be at limit
    const ra = await dal.checkRateLimit("key:a", 1, 60);
    assert(ra.ok);
    expect(ra.data.allowed).toBe(false);

    // key:b should also be at limit (independent)
    const rb = await dal.checkRateLimit("key:b", 1, 60);
    assert(rb.ok);
    expect(rb.data.allowed).toBe(false);

    // key:c should be fresh
    const rc = await dal.checkRateLimit("key:c", 1, 60);
    assert(rc.ok);
    expect(rc.data.allowed).toBe(true);
  });
});

describe("Rate Limiting (via route handlers)", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("setup endpoint returns 429 when rate limited", async () => {
    // Exhaust the rate limit
    for (let i = 0; i < SETUP_RATE_LIMIT; i++) {
      await handleSetup(
        new NextRequest("http://localhost/api/setup", {
          headers: { id: `AA:BB:CC:DD:EE:${i.toString(16).padStart(2, "0")}` },
        }),
        dal
      );
    }

    // Next request should be rate limited
    const res = await handleSetup(
      new NextRequest("http://localhost/api/setup", {
        headers: { id: "AA:BB:CC:DD:EE:FF" },
      }),
      dal
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("claim endpoint returns 429 when rate limited", async () => {
    const session = { userId: "user-123", email: "test@example.com" };

    // Exhaust the rate limit
    for (let i = 0; i < CLAIM_RATE_LIMIT; i++) {
      await handleClaim(
        claimRequest({ code: "XXXX", name: "test" }),
        dal,
        session
      );
    }

    // Next request should be rate limited
    const res = await handleClaim(
      claimRequest({ code: "YYYY", name: "test" }),
      dal,
      session
    );

    expect(res.status).toBe(429);
  });

  it("display endpoint returns 429 when rate limited per device", async () => {
    // Setup a device first
    await handleSetup(
      new NextRequest("http://localhost/api/setup", {
        headers: { id: "AA:BB:CC:DD:EE:FF" },
      }),
      dal
    );

    // Exhaust the rate limit for this device
    for (let i = 0; i < DISPLAY_RATE_LIMIT; i++) {
      await handleDisplay(displayRequest({ mac: "AA:BB:CC:DD:EE:FF" }), dal);
    }

    // Next request should be rate limited
    const res = await handleDisplay(
      displayRequest({ mac: "AA:BB:CC:DD:EE:FF" }),
      dal
    );

    expect(res.status).toBe(429);
  });

  it("display rate limit is per-device, not global", async () => {
    // Setup two devices
    await handleSetup(
      new NextRequest("http://localhost/api/setup", {
        headers: { id: "AA:BB:CC:DD:EE:FF" },
      }),
      dal
    );
    await handleSetup(
      new NextRequest("http://localhost/api/setup", {
        headers: { id: "11:22:33:44:55:66" },
      }),
      dal
    );

    // Exhaust rate limit for device 1
    for (let i = 0; i < DISPLAY_RATE_LIMIT; i++) {
      await handleDisplay(displayRequest({ mac: "AA:BB:CC:DD:EE:FF" }), dal);
    }

    // Device 1 should be limited
    expect(
      (await handleDisplay(displayRequest({ mac: "AA:BB:CC:DD:EE:FF" }), dal))
        .status
    ).toBe(429);

    // Device 2 should still work
    expect(
      (await handleDisplay(displayRequest({ mac: "11:22:33:44:55:66" }), dal))
        .status
    ).toBe(200);
  });
});
