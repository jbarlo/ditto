import { describe, it, expect, beforeEach, vi } from "vitest";
import assert from "assert";
import { createTestDb } from "@/lib/db/client";
import { createDal, type Dal } from "@/lib/db/dal";
import type { Session } from "@/lib/auth/types";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

import { frameRouter } from "@/lib/trpc/routers/frame";
import type { Context } from "@/lib/trpc/init";

let dal: Dal;
const session: Session = { userId: "user-123", email: "test@example.com" };

function createCaller(ctx: Context) {
  return frameRouter.createCaller(ctx);
}

async function createClaimedFrame(ownerId: string, name: string, mac: string) {
  await dal.ensurePerson(ownerId);
  const frameResult = await dal.createFrame(mac);
  assert(frameResult.ok);
  await dal.claimFrame(frameResult.data.id, ownerId, name);
  const result = await dal.getFrame(frameResult.data.id);
  assert(result.ok);
  return result.data;
}

describe("frame.release", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    const caller = createCaller({ session: null, dal });
    await expect(caller.release({ frameId: "f1" })).rejects.toThrow("UNAUTHORIZED");
  });

  it("throws NOT_FOUND for non-owner", async () => {
    await dal.ensurePerson("other-user");
    const frame = await createClaimedFrame("other-user", "theirframe", "AA:BB:CC:DD:EE:01");

    const caller = createCaller({ session, dal });
    await expect(caller.release({ frameId: frame.id })).rejects.toThrow("Frame not found");
  });

  it("owner can release their frame", async () => {
    const frame = await createClaimedFrame("user-123", "myframe", "AA:BB:CC:DD:EE:02");
    const caller = createCaller({ session, dal });

    const result = await caller.release({ frameId: frame.id });
    expect(result.success).toBe(true);
  });

  it("released frame has null owner/name/claimedAt", async () => {
    const frame = await createClaimedFrame("user-123", "myframe", "AA:BB:CC:DD:EE:03");
    const caller = createCaller({ session, dal });
    await caller.release({ frameId: frame.id });

    const released = await dal.getFrame(frame.id);
    assert(released.ok);
    expect(released.data.ownerId).toBeNull();
    expect(released.data.name).toBeNull();
    expect(released.data.claimedAt).toBeNull();
    expect(released.data.currentAlbumId).toBeNull();
  });

  it("released frame keeps macAddress/friendlyId/apiKey", async () => {
    const frame = await createClaimedFrame("user-123", "myframe", "AA:BB:CC:DD:EE:04");
    const caller = createCaller({ session, dal });
    await caller.release({ frameId: frame.id });

    const released = await dal.getFrame(frame.id);
    assert(released.ok);
    expect(released.data.macAddress).toBe(frame.macAddress);
    expect(released.data.friendlyId).toBe(frame.friendlyId);
    expect(released.data.apiKey).toBe(frame.apiKey);
  });

  it("released frame can be re-claimed", async () => {
    const frame = await createClaimedFrame("user-123", "myframe", "AA:BB:CC:DD:EE:05");
    const caller = createCaller({ session, dal });
    await caller.release({ frameId: frame.id });

    const claimResult = await dal.claimFrame(frame.id, "user-123", "reclaimed");
    assert(claimResult.ok);

    const reclaimed = await dal.getFrame(frame.id);
    assert(reclaimed.ok);
    expect(reclaimed.data.ownerId).toBe("user-123");
    expect(reclaimed.data.name).toBe("reclaimed");
  });
});

describe("frame.delete", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    const caller = createCaller({ session: null, dal });
    await expect(caller.delete({ frameId: "f1" })).rejects.toThrow("UNAUTHORIZED");
  });

  it("throws NOT_FOUND for non-owner", async () => {
    await dal.ensurePerson("other-user");
    const frame = await createClaimedFrame("other-user", "theirframe", "AA:BB:CC:DD:EE:06");

    const caller = createCaller({ session, dal });
    await expect(caller.delete({ frameId: frame.id })).rejects.toThrow("Frame not found");
  });

  it("owner can delete their frame", async () => {
    const frame = await createClaimedFrame("user-123", "myframe", "AA:BB:CC:DD:EE:07");
    const caller = createCaller({ session, dal });

    const result = await caller.delete({ frameId: frame.id });
    expect(result.success).toBe(true);
  });

  it("deleted frame is gone", async () => {
    const frame = await createClaimedFrame("user-123", "myframe", "AA:BB:CC:DD:EE:08");
    const caller = createCaller({ session, dal });
    await caller.delete({ frameId: frame.id });

    const result = await dal.getFrame(frame.id);
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error).toBe("NOT_FOUND");
  });
});
