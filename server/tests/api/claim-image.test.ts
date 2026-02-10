import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import assert from "assert";
import { createTestDb } from "@/lib/db/client";
import { createDal, type Dal } from "@/lib/db/dal";
import { handleClaimImage } from "@/app/api/claim-image/route";
import { generateClaimCode } from "@/lib/claim-code";

function createRequest(id?: string, code?: string): NextRequest {
  const params = new URLSearchParams();
  if (id) params.set("id", id);
  if (code) params.set("code", code);
  const url = `http://localhost:3000/api/claim-image?${params.toString()}`;
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/claim-image", () => {
  let dal: Dal;

  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("returns 400 when id or code is missing", async () => {
    const req = createRequest();
    const res = await handleClaimImage(req, dal);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing id or code");
  });

  it("returns 400 when only id is provided", async () => {
    const req = createRequest("XXXXX");
    const res = await handleClaimImage(req, dal);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing id or code");
  });

  it("returns 400 for invalid device ID or code", async () => {
    const req = createRequest("XXXXX", "YYYYY");
    const res = await handleClaimImage(req, dal);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid device ID or code");
  });

  it("returns 400 when claim code is invalid", async () => {
    await dal.createFrame("AA:BB:CC:DD:EE:FF");
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;

    // Use a bogus claim code
    const req = createRequest(frame.friendlyId, "XXXXX");
    const res = await handleClaimImage(req, dal);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid device ID or code");
  });

  it("generates image for valid claim code", async () => {
    await dal.createFrame("AA:BB:CC:DD:EE:FF");
    const frameResult = await dal.getFrameByMac("AA:BB:CC:DD:EE:FF");
    assert(frameResult.ok);
    const frame = frameResult.data;
    const claimCode = generateClaimCode(frame.friendlyId);

    const req = createRequest(frame.friendlyId, claimCode);
    const res = await handleClaimImage(req, dal);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });
});
