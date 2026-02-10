/**
 * Integration tests for album tRPC router.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import assert from "assert";
import { createTestDb } from "@/lib/db/client";
import { createDal, type Dal } from "@/lib/db/dal";
import type { Session } from "@/lib/auth/types";

// Mock auth to avoid WorkOS import issues
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

// Mock image generation and storage
vi.mock("@/lib/image", () => ({
  generateBlankCanvas: vi.fn(async () => Buffer.from("blank")),
}));

import { imageStorage } from "@/lib/storage";

vi.mock("@/lib/storage", () => ({
  imageStorage: {
    upload: vi.fn(async () => "uploaded-url"),
    get: vi.fn(async () => null),
    getUrl: vi.fn((id: string) => `https://example.com/${id}.png`),
    delete: vi.fn(async () => {}),
  },
  canvasImageUrl: (id: string, v: string | null) => v ? `https://example.com/${id}.png?v=${encodeURIComponent(v)}` : `https://example.com/${id}.png`,
}));

import { albumRouter } from "@/lib/trpc/routers/album";
import type { Context } from "@/lib/trpc/init";

let dal: Dal;
const session: Session = { userId: "user-123", email: "test@example.com" };

function createCaller(ctx: Context) {
  return albumRouter.createCaller(ctx);
}

// Helper to create a claimed frame with album
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

describe("Album tRPC Router", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
  });

  describe("album.list", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });
      await expect(caller.list()).rejects.toThrow("UNAUTHORIZED");
    });

    it("returns empty array when no albums", async () => {
      await dal.ensurePerson("user-123");
      const caller = createCaller({ session, dal });
      const result = await caller.list();
      expect(result).toHaveLength(0);
    });

    it("returns user's albums", async () => {
      await dal.ensurePerson("user-123");
      await dal.createAlbum("Album A", "user-123");
      await dal.createAlbum("Album B", "user-123");

      const caller = createCaller({ session, dal });
      const result = await caller.list();

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.name)).toContain("Album A");
      expect(result.map((a) => a.name)).toContain("Album B");
    });

    it("does not return other users' albums", async () => {
      await dal.ensurePerson("user-123");
      await dal.ensurePerson("other-user");
      await dal.createAlbum("My Album", "user-123");
      await dal.createAlbum("Their Album", "other-user");

      const caller = createCaller({ session, dal });
      const result = await caller.list();

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].name).toBe("My Album");
    });
  });

  describe("album.listWithCanvases", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });
      await expect(caller.listWithCanvases()).rejects.toThrow("UNAUTHORIZED");
    });

    it("returns empty array when no albums", async () => {
      await dal.ensurePerson("user-123");
      const caller = createCaller({ session, dal });
      const result = await caller.listWithCanvases();
      expect(result).toHaveLength(0);
    });

    it("returns albums with their canvases", async () => {
      await dal.ensurePerson("user-123");
      const albumResult = await dal.createAlbum("My Album", "user-123");
      assert(albumResult.ok);
      const canvas = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvas.ok);
      await dal.addCanvasToAlbum(albumResult.data.id, canvas.data.id);

      const caller = createCaller({ session, dal });
      const result = await caller.listWithCanvases();

      expect(result).toHaveLength(1);
      const albumItem = result[0];
      assert(albumItem);
      expect(albumItem.name).toBe("My Album");
      expect(albumItem.canvases).toHaveLength(1);
      const canvasItem = albumItem.canvases[0];
      assert(canvasItem);
      expect(canvasItem.id).toBe(canvas.data.id);
      expect(canvasItem.imageUrl).toBe("https://example.com/img-1.png");
    });

    it("returns empty canvases array for album with no canvases", async () => {
      await dal.ensurePerson("user-123");
      await dal.createAlbum("Empty Album", "user-123");

      const caller = createCaller({ session, dal });
      const result = await caller.listWithCanvases();

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].canvases).toHaveLength(0);
    });

    it("does not return other users' albums", async () => {
      await dal.ensurePerson("user-123");
      await dal.ensurePerson("other-user");
      await dal.createAlbum("My Album", "user-123");
      await dal.createAlbum("Their Album", "other-user");

      const caller = createCaller({ session, dal });
      const result = await caller.listWithCanvases();

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].name).toBe("My Album");
    });

    it("returns canvases in position order", async () => {
      await dal.ensurePerson("user-123");
      const albumResult = await dal.createAlbum("Ordered Album", "user-123");
      assert(albumResult.ok);

      const c1 = await dal.createCanvasWithOwner("img-first", "user-123");
      assert(c1.ok);
      const c2 = await dal.createCanvasWithOwner("img-second", "user-123");
      assert(c2.ok);

      await dal.addCanvasToAlbum(albumResult.data.id, c1.data.id);
      await dal.addCanvasToAlbum(albumResult.data.id, c2.data.id);

      const caller = createCaller({ session, dal });
      const result = await caller.listWithCanvases();

      const albumItem = result[0];
      assert(albumItem);
      const [first, second] = albumItem.canvases;
      assert(first);
      assert(second);
      expect(first.id).toBe(c1.data.id);
      expect(second.id).toBe(c2.data.id);
    });
  });

  describe("album.create", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });
      await expect(caller.create({ name: "New Album" })).rejects.toThrow("UNAUTHORIZED");
    });

    it("creates album and returns it", async () => {
      await dal.ensurePerson("user-123");
      const caller = createCaller({ session, dal });
      const result = await caller.create({ name: "New Album" });

      expect(result.name).toBe("New Album");
      expect(result.ownerId).toBe("user-123");
      expect(result.id).toBeTruthy();
    });

    it("rejects empty name", async () => {
      await dal.ensurePerson("user-123");
      const caller = createCaller({ session, dal });
      await expect(caller.create({ name: "" })).rejects.toThrow();
    });

    it("created album appears in list", async () => {
      await dal.ensurePerson("user-123");
      const caller = createCaller({ session, dal });

      await caller.create({ name: "Fresh Album" });
      const albums = await caller.list();

      expect(albums).toHaveLength(1);
      assert(albums[0]);
      expect(albums[0].name).toBe("Fresh Album");
    });
  });

  describe("album.removeCanvas", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(
        caller.removeCanvas({
          albumId: "album-1",
          canvasId: "canvas-1",
        })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND when album not found", async () => {
      const caller = createCaller({ session, dal });

      await expect(
        caller.removeCanvas({
          albumId: "nonexistent",
          canvasId: "canvas-1",
        })
      ).rejects.toThrow("Album not found");
    });

    it("throws NOT_FOUND when album belongs to different user", async () => {
      await dal.ensurePerson("other-user");
      const albumResult = await dal.createAlbum("Their Album", "other-user");
      assert(albumResult.ok);

      // Prove the album exists — the NOT_FOUND is an ownership rejection
      const albumExists = await dal.getAlbum(albumResult.data.id);
      assert(albumExists.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.removeCanvas({
          albumId: albumResult.data.id,
          canvasId: "canvas-1",
        })
      ).rejects.toThrow("Album not found");
    });

    it("throws INTERNAL_SERVER_ERROR when removeCanvasFromAlbum fails", async () => {
      const frame = await createClaimedFrame("myframe");

      const mockDal = {
        ...dal,
        removeCanvasFromAlbum: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.removeCanvas({
          albumId: frame.currentAlbumId,
          canvasId: "canvas-1",
        })
      ).rejects.toThrow("Failed to remove canvas from album");
    });

    it("removes canvas from album", async () => {
      const frame = await createClaimedFrame("myframe");
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvasResult.data.id);

      // Verify canvas is in album
      let canvases = await dal.getCanvasesInAlbum(frame.currentAlbumId);
      assert(canvases.ok);
      expect(canvases.data).toHaveLength(1);

      const caller = createCaller({ session, dal });
      const result = await caller.removeCanvas({
        albumId: frame.currentAlbumId,
        canvasId: canvasResult.data.id,
      });

      expect(result.success).toBe(true);

      // Verify canvas is removed
      canvases = await dal.getCanvasesInAlbum(frame.currentAlbumId);
      assert(canvases.ok);
      expect(canvases.data).toHaveLength(0);
    });
  });

  describe("album.moveCanvas", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(
        caller.moveCanvas({
          albumId: "album-1",
          canvasId: "canvas-1",
          direction: "up",
        })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND when album not found", async () => {
      const caller = createCaller({ session, dal });

      await expect(
        caller.moveCanvas({
          albumId: "nonexistent",
          canvasId: "canvas-1",
          direction: "up",
        })
      ).rejects.toThrow("Album not found");
    });

    it("throws NOT_FOUND when album belongs to different user", async () => {
      await dal.ensurePerson("other-user");
      const albumResult = await dal.createAlbum("Their Album", "other-user");
      assert(albumResult.ok);

      // Prove the album exists — the NOT_FOUND is an ownership rejection
      const albumExists = await dal.getAlbum(albumResult.data.id);
      assert(albumExists.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.moveCanvas({
          albumId: albumResult.data.id,
          canvasId: "canvas-1",
          direction: "up",
        })
      ).rejects.toThrow("Album not found");
    });

    it("throws INTERNAL_SERVER_ERROR when moveCanvasInAlbum fails", async () => {
      const frame = await createClaimedFrame("myframe");

      const mockDal = {
        ...dal,
        moveCanvasInAlbum: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.moveCanvas({
          albumId: frame.currentAlbumId,
          canvasId: "canvas-1",
          direction: "up",
        })
      ).rejects.toThrow("Failed to move canvas");
    });

    it("moves canvas up in album", async () => {
      const frame = await createClaimedFrame("myframe");

      const canvas1Result = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvas1Result.ok);
      const canvas2Result = await dal.createCanvasWithOwner("img-2", "user-123");
      assert(canvas2Result.ok);

      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas1Result.data.id);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas2Result.data.id);

      const caller = createCaller({ session, dal });
      const result = await caller.moveCanvas({
        albumId: frame.currentAlbumId,
        canvasId: canvas2Result.data.id,
        direction: "up",
      });

      expect(result.success).toBe(true);

      // Verify order changed
      const canvases = await dal.getCanvasesInAlbum(frame.currentAlbumId);
      assert(canvases.ok);
      const [first, second] = canvases.data;
      assert(first);
      assert(second);
      expect(first.imageId).toBe("img-2");
      expect(second.imageId).toBe("img-1");
    });

    it("moves canvas down in album", async () => {
      const frame = await createClaimedFrame("myframe");

      const canvas1Result = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvas1Result.ok);
      const canvas2Result = await dal.createCanvasWithOwner("img-2", "user-123");
      assert(canvas2Result.ok);

      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas1Result.data.id);
      await dal.addCanvasToAlbum(frame.currentAlbumId, canvas2Result.data.id);

      const caller = createCaller({ session, dal });
      const result = await caller.moveCanvas({
        albumId: frame.currentAlbumId,
        canvasId: canvas1Result.data.id,
        direction: "down",
      });

      expect(result.success).toBe(true);

      // Verify order changed
      const canvases = await dal.getCanvasesInAlbum(frame.currentAlbumId);
      assert(canvases.ok);
      const [first, second] = canvases.data;
      assert(first);
      assert(second);
      expect(first.imageId).toBe("img-2");
      expect(second.imageId).toBe("img-1");
    });
  });

  describe("album.delete", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });
      await expect(caller.delete({ albumId: "album-1" })).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND when album not found", async () => {
      const caller = createCaller({ session, dal });
      await expect(caller.delete({ albumId: "nonexistent" })).rejects.toThrow("Album not found");
    });

    it("throws NOT_FOUND when album belongs to different user", async () => {
      await dal.ensurePerson("other-user");
      const albumResult = await dal.createAlbum("Their Album", "other-user");
      assert(albumResult.ok);

      const caller = createCaller({ session, dal });
      await expect(caller.delete({ albumId: albumResult.data.id })).rejects.toThrow("Album not found");
    });

    it("deletes album owned by user", async () => {
      await dal.ensurePerson("user-123");
      const albumResult = await dal.createAlbum("Doomed Album", "user-123");
      assert(albumResult.ok);

      const caller = createCaller({ session, dal });
      const result = await caller.delete({ albumId: albumResult.data.id });
      expect(result.success).toBe(true);

      const check = await dal.getAlbum(albumResult.data.id);
      expect(check.ok).toBe(false);
    });

    it("preserves canvases that were in the deleted album", async () => {
      await dal.ensurePerson("user-123");
      const albumResult = await dal.createAlbum("Doomed Album", "user-123");
      assert(albumResult.ok);
      const canvasResult = await dal.createCanvasWithOwner("img-survive", "user-123");
      assert(canvasResult.ok);
      await dal.addCanvasToAlbum(albumResult.data.id, canvasResult.data.id);

      const caller = createCaller({ session, dal });
      await caller.delete({ albumId: albumResult.data.id });

      const canvasCheck = await dal.getCanvas(canvasResult.data.id);
      expect(canvasCheck.ok).toBe(true);
    });

    it("nulls currentAlbumId when no other albums exist", async () => {
      const f = await createClaimedFrame("myframe");

      const caller = createCaller({ session, dal });
      await caller.delete({ albumId: f.currentAlbumId });

      const frameCheck = await dal.getFrame(f.id);
      assert(frameCheck.ok);
      expect(frameCheck.data.currentAlbumId).toBeNull();
    });

    it("reassigns frame to oldest remaining album", async () => {
      const f = await createClaimedFrame("myframe");

      // Create a second album
      const otherAlbum = await dal.createAlbum("Survivor", "user-123");
      assert(otherAlbum.ok);

      const caller = createCaller({ session, dal });
      await caller.delete({ albumId: f.currentAlbumId });

      const frameCheck = await dal.getFrame(f.id);
      assert(frameCheck.ok);
      expect(frameCheck.data.currentAlbumId).toBe(otherAlbum.data.id);
    });
  });

  describe("album.createBlankCanvas", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(
        caller.createBlankCanvas({ albumId: "album-1" })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND when album not found", async () => {
      const caller = createCaller({ session, dal });

      await expect(
        caller.createBlankCanvas({ albumId: "nonexistent" })
      ).rejects.toThrow("Album not found");
    });

    it("throws NOT_FOUND when album belongs to different user", async () => {
      await dal.ensurePerson("other-user");
      const albumResult = await dal.createAlbum("Their Album", "other-user");
      assert(albumResult.ok);

      // Prove the album exists — the NOT_FOUND is an ownership rejection
      const albumExists = await dal.getAlbum(albumResult.data.id);
      assert(albumExists.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.createBlankCanvas({ albumId: albumResult.data.id })
      ).rejects.toThrow("Album not found");
    });

    it("throws INTERNAL_SERVER_ERROR when uploadImage fails", async () => {
      const frame = await createClaimedFrame("myframe");

      vi.mocked(imageStorage.upload).mockRejectedValueOnce(new Error("S3 error"));

      const caller = createCaller({ session, dal });

      await expect(
        caller.createBlankCanvas({ albumId: frame.currentAlbumId })
      ).rejects.toThrow("Failed to upload image");
    });

    it("throws INTERNAL_SERVER_ERROR when createCanvasWithOwner fails", async () => {
      const frame = await createClaimedFrame("myframe");

      const mockDal = {
        ...dal,
        createCanvasWithOwner: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.createBlankCanvas({ albumId: frame.currentAlbumId })
      ).rejects.toThrow("Failed to create canvas");
    });

    it("throws INTERNAL_SERVER_ERROR when addCanvasToAlbum fails", async () => {
      const frame = await createClaimedFrame("myframe");

      // Create a mock DAL that fails on addCanvasToAlbum
      const mockDal = {
        ...dal,
        addCanvasToAlbum: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.createBlankCanvas({ albumId: frame.currentAlbumId })
      ).rejects.toThrow("Failed to add canvas to album");
    });

    it("creates blank canvas and adds to album", async () => {
      const frame = await createClaimedFrame("myframe");

      const caller = createCaller({ session, dal });
      const result = await caller.createBlankCanvas({ albumId: frame.currentAlbumId });

      expect(result.canvasId).toBeTruthy();

      // Verify canvas was added to album
      const canvases = await dal.getCanvasesInAlbum(frame.currentAlbumId);
      assert(canvases.ok);
      expect(canvases.data).toHaveLength(1);
    });
  });
});
