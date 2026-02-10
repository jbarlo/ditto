import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import assert from "assert";
import { createTestDb } from "@/lib/db/client";
import { createDal, type Dal } from "@/lib/db/dal";
import { handleSetup } from "@/app/trmnl/api/setup/route";
import { DEFAULT_REFRESH_RATE } from "@/lib/config";

vi.mock("@/lib/storage", () => ({
  imageStorage: {
    upload: vi.fn(async () => "uploaded-url"),
    get: vi.fn(async () => null),
    getUrl: vi.fn((id: string) => `/uploads/${id}.png`),
    delete: vi.fn(async () => {}),
  },
  canvasImageUrl: (id: string, v: string | null) => v ? `/uploads/${id}.png?v=${encodeURIComponent(v)}` : `/uploads/${id}.png`,
}));

function createRequest(mac?: string): NextRequest {
  const headers = new Headers();
  if (mac) headers.set("id", mac);

  return new NextRequest("http://localhost:3000/api/setup", {
    method: "GET",
    headers,
  });
}

describe("GET /api/setup", () => {
  let dal: Dal;

  beforeEach(async () => {
    vi.clearAllMocks();
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("returns 400 when MAC address is missing", async () => {
    const req = createRequest();
    const res = await handleSetup(req, dal);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing ID header");
  });

  it("returns 400 when MAC address is invalid", async () => {
    const req = createRequest("not-a-valid-mac");
    const res = await handleSetup(req, dal);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid MAC address");
  });

  it("returns existing frame data with claim image for unclaimed", async () => {
    // Create a frame first
    const createResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    expect(createResult.ok).toBe(true);

    const req = createRequest("AA:BB:CC:DD:EE:FF");
    const res = await handleSetup(req, dal);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.api_key).toMatch(/^ditto_/);
    expect(data.friendly_id).toMatch(/^[A-Z0-9]{5}$/);
    expect(data.image_url).toContain("/api/claim-image?id=");
    expect(data.image_url).toContain("&code=");
    expect(data.filename).toBe("claim.bmp");
    expect(data.refresh_rate).toBe(DEFAULT_REFRESH_RATE);
  });

  it("returns fallback url for claimed frame with no album", async () => {
    // Create and claim a frame
    const createResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(createResult.ok);
    const frame = createResult.data;
    await dal.ensurePerson("user-123", "user@test.com");
    await dal.claimFrame(frame.id, "user-123", "my-frame");

    const req = createRequest("AA:BB:CC:DD:EE:FF");
    const res = await handleSetup(req, dal);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.image_url).toContain("/fallback/no-album.png");
    expect(data.filename).toBe("no-album.png");
  });

  it("returns canvas image for claimed frame with album", async () => {
    // Create and claim a frame
    const createResult = await dal.createFrame("AA:BB:CC:DD:EE:FF");
    assert(createResult.ok);
    const frame = createResult.data;
    await dal.ensurePerson("user-123", "user@test.com");
    await dal.claimFrame(frame.id, "user-123", "my-frame");

    // Create album and canvas
    const albumResult = await dal.createAlbum("Test Album", "user-123");
    assert(albumResult.ok);
    const album = albumResult.data;
    const canvasResult = await dal.createCanvasWithOwner("img-abc", "user-123");
    assert(canvasResult.ok);
    const canvas = canvasResult.data;
    await dal.addCanvasToAlbum(album.id, canvas.id);
    await dal.setFrameAlbum(frame.id, album.id);

    const req = createRequest("AA:BB:CC:DD:EE:FF");
    const res = await handleSetup(req, dal);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.image_url).toContain("/uploads/img-abc.png");
    expect(data.filename).toBe("img-abc.png");
  });
});
