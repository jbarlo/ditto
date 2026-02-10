/**
 * Integration tests for frame tRPC router.
 */
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

async function createClaimedFrame(name: string, mac = "AA:BB:CC:DD:EE:FF") {
  await dal.ensurePerson("user-123");
  const frameResult = await dal.createFrame(mac);
  assert(frameResult.ok);

  const albumResult = await dal.createAlbum(`${name}'s Album`, "user-123");
  assert(albumResult.ok);

  await dal.claimFrame(frameResult.data.id, "user-123", name);
  await dal.setFrameAlbum(frameResult.data.id, albumResult.data.id);

  const updatedFrame = await dal.getFrameByNameForUser(name, "user-123");
  assert(updatedFrame.ok);
  assert(updatedFrame.data.currentAlbumId);
  return { ...updatedFrame.data, currentAlbumId: updatedFrame.data.currentAlbumId };
}

describe("Frame tRPC Router", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  describe("frame.setAlbum", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });
      await expect(
        caller.setAlbum({ frameId: "frame-1", albumId: "album-1" })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND when frame not found", async () => {
      const caller = createCaller({ session, dal });
      await expect(
        caller.setAlbum({ frameId: "nonexistent", albumId: "album-1" })
      ).rejects.toThrow("Frame not found");
    });

    it("throws NOT_FOUND when frame belongs to different user", async () => {
      await dal.ensurePerson("user-123");
      await dal.ensurePerson("other-user");
      const frameResult = await dal.createFrame("11:22:33:44:55:66");
      assert(frameResult.ok);
      await dal.claimFrame(frameResult.data.id, "other-user", "theirframe");

      const caller = createCaller({ session, dal });
      await expect(
        caller.setAlbum({ frameId: frameResult.data.id, albumId: "album-1" })
      ).rejects.toThrow("Frame not found");
    });

    it("throws NOT_FOUND when album not found", async () => {
      const frame = await createClaimedFrame("myframe");
      const caller = createCaller({ session, dal });

      await expect(
        caller.setAlbum({ frameId: frame.id, albumId: "nonexistent" })
      ).rejects.toThrow("Album not found");
    });

    it("throws NOT_FOUND when album belongs to different user", async () => {
      const frame = await createClaimedFrame("myframe");
      await dal.ensurePerson("other-user");
      const albumResult = await dal.createAlbum("Their Album", "other-user");
      assert(albumResult.ok);

      const caller = createCaller({ session, dal });
      await expect(
        caller.setAlbum({ frameId: frame.id, albumId: albumResult.data.id })
      ).rejects.toThrow("Album not found");
    });

    it("assigns album to frame", async () => {
      await dal.ensurePerson("user-123");
      const frameResult = await dal.createFrame("AA:BB:CC:DD:EE:00");
      assert(frameResult.ok);
      await dal.claimFrame(frameResult.data.id, "user-123", "newframe");

      const albumResult = await dal.createAlbum("Target Album", "user-123");
      assert(albumResult.ok);

      const caller = createCaller({ session, dal });
      const result = await caller.setAlbum({
        frameId: frameResult.data.id,
        albumId: albumResult.data.id,
      });
      expect(result.success).toBe(true);

      const updated = await dal.getFrame(frameResult.data.id);
      assert(updated.ok);
      expect(updated.data.currentAlbumId).toBe(albumResult.data.id);
      expect(updated.data.currentIndex).toBe(0);
    });

    it("clears album when albumId is null", async () => {
      const frame = await createClaimedFrame("myframe");
      assert(frame.currentAlbumId);

      const caller = createCaller({ session, dal });
      const result = await caller.setAlbum({
        frameId: frame.id,
        albumId: null,
      });
      expect(result.success).toBe(true);

      const updated = await dal.getFrame(frame.id);
      assert(updated.ok);
      expect(updated.data.currentAlbumId).toBeNull();
      expect(updated.data.currentIndex).toBe(0);
    });

    it("resets index when switching albums", async () => {
      const frame = await createClaimedFrame("myframe");

      // Advance index
      const canvas1 = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvas1.ok);
      const canvas2 = await dal.createCanvasWithOwner("img-2", "user-123");
      assert(canvas2.ok);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas1.data.id);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas2.data.id);
      await dal.setFrameIndex(frame.id, 1);

      // Create a new album and switch to it
      const newAlbum = await dal.createAlbum("New Album", "user-123");
      assert(newAlbum.ok);

      const caller = createCaller({ session, dal });
      await caller.setAlbum({ frameId: frame.id, albumId: newAlbum.data.id });

      const updated = await dal.getFrame(frame.id);
      assert(updated.ok);
      expect(updated.data.currentAlbumId).toBe(newAlbum.data.id);
      expect(updated.data.currentIndex).toBe(0);
    });
  });

  describe("frame.setCurrentIndex", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(
        caller.setCurrentIndex({ frameId: "frame-1", index: 0 })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND when frame not found", async () => {
      const caller = createCaller({ session, dal });

      await expect(
        caller.setCurrentIndex({ frameId: "nonexistent", index: 0 })
      ).rejects.toThrow("Frame not found");
    });

    it("throws NOT_FOUND when frame belongs to different user", async () => {
      await dal.ensurePerson("other-user");
      const frameResult = await dal.createFrame("11:22:33:44:55:66");
      assert(frameResult.ok);
      const albumResult = await dal.createAlbum("Their Album", "other-user");
      assert(albumResult.ok);
      await dal.claimFrame(frameResult.data.id, "other-user", "theirframe");
      await dal.setFrameAlbum(frameResult.data.id, albumResult.data.id);

      // Prove the frame exists — the NOT_FOUND is an ownership rejection
      const frameExists = await dal.getFrame(frameResult.data.id);
      assert(frameExists.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.setCurrentIndex({ frameId: frameResult.data.id, index: 0 })
      ).rejects.toThrow("Frame not found");
    });

    it("sets current index to specified value", async () => {
      const frame = await createClaimedFrame("myframe");

      // Add some canvases
      const canvas1 = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvas1.ok);
      const canvas2 = await dal.createCanvasWithOwner("img-2", "user-123");
      assert(canvas2.ok);
      const canvas3 = await dal.createCanvasWithOwner("img-3", "user-123");
      assert(canvas3.ok);

      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas1.data.id);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas2.data.id);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas3.data.id);

      const caller = createCaller({ session, dal });

      // Set to index 2
      const result = await caller.setCurrentIndex({ frameId: frame.id, index: 2 });
      expect(result.success).toBe(true);

      const updatedFrame = await dal.getFrame(frame.id);
      assert(updatedFrame.ok);
      expect(updatedFrame.data.currentIndex).toBe(2);
    });

    it("clamps index to valid range (0 to size-1)", async () => {
      const frame = await createClaimedFrame("myframe");

      // Add 2 canvases
      const canvas1 = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvas1.ok);
      const canvas2 = await dal.createCanvasWithOwner("img-2", "user-123");
      assert(canvas2.ok);

      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas1.data.id);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas2.data.id);

      const caller = createCaller({ session, dal });

      // Try to set index to 10 (should clamp to 1)
      const result = await caller.setCurrentIndex({ frameId: frame.id, index: 10 });
      expect(result.success).toBe(true);

      const updatedFrame = await dal.getFrame(frame.id);
      assert(updatedFrame.ok);
      expect(updatedFrame.data.currentIndex).toBe(1);
    });

    it("throws INTERNAL_SERVER_ERROR when setFrameIndex fails", async () => {
      const frame = await createClaimedFrame("myframe");

      const mockDal = {
        ...dal,
        setFrameIndex: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.setCurrentIndex({ frameId: frame.id, index: 0 })
      ).rejects.toThrow("Failed to set index");
    });
  });
});
