/**
 * Integration tests for canvas tRPC router.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import assert from "assert";
import { createTestDb } from "@/lib/db/client";
import { createDal, type Dal } from "@/lib/db/dal";
import type { Session } from "@/lib/auth/types";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
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

vi.mock("@/lib/image", () => ({
  generateBlankCanvas: vi.fn(async () => Buffer.from("blank")),
}));

import { canvasRouter } from "@/lib/trpc/routers/canvas";
import type { Context } from "@/lib/trpc/init";

let dal: Dal;
const session: Session = { userId: "user-123", email: "test@example.com" };

function createCaller(ctx: Context) {
  return canvasRouter.createCaller(ctx);
}

async function setupUser() {
  await dal.ensurePerson("user-123");
}

async function createAlbum(name: string) {
  const result = await dal.createAlbum(name, "user-123");
  assert(result.ok);
  return result.data;
}

async function createCanvas(imageId: string) {
  const result = await dal.createCanvasWithOwner(imageId, "user-123");
  assert(result.ok);
  return result.data;
}

describe("Canvas tRPC Router", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
    vi.clearAllMocks();
  });

  describe("canvas.list", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });
      await expect(caller.list()).rejects.toThrow("UNAUTHORIZED");
    });

    it("returns empty array when no canvases", async () => {
      await setupUser();
      const caller = createCaller({ session, dal });
      const result = await caller.list();
      expect(result).toHaveLength(0);
    });

    it("returns user's canvases with imageUrl and role", async () => {
      await setupUser();
      await createCanvas("img-1");
      await createCanvas("img-2");

      const caller = createCaller({ session, dal });
      const result = await caller.list();

      expect(result).toHaveLength(2);
      const first = result[0];
      assert(first);
      expect(first.imageUrl).toMatch(/https:\/\/example\.com\/img-\d\.png/);
      expect(first.role).toBe("owner");
    });

    it("does not return other users' canvases", async () => {
      await setupUser();
      await dal.ensurePerson("other-user");
      await createCanvas("img-mine");
      await dal.createCanvasWithOwner("img-theirs", "other-user");

      const caller = createCaller({ session, dal });
      const result = await caller.list();

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].imageId).toBe("img-mine");
    });

    it("returns shared canvases with correct role", async () => {
      await setupUser();
      await dal.ensurePerson("other-user");
      const otherCanvas = await dal.createCanvasWithOwner("img-shared", "other-user");
      assert(otherCanvas.ok);
      await dal.addCanvasUser(otherCanvas.data.id, "user-123", "editor");

      const caller = createCaller({ session, dal });
      const result = await caller.list();

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].role).toBe("editor");
    });
  });

  describe("canvas.createBlank", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });
      await expect(caller.createBlank()).rejects.toThrow("UNAUTHORIZED");
    });

    it("creates a blank canvas and returns canvasId", async () => {
      await setupUser();
      const caller = createCaller({ session, dal });
      const result = await caller.createBlank();

      expect(result.canvasId).toBeTruthy();
      expect(imageStorage.upload).toHaveBeenCalled();
    });

    it("created canvas is owned by current user", async () => {
      await setupUser();
      const caller = createCaller({ session, dal });
      const result = await caller.createBlank();

      const role = await dal.getUserCanvasRole(result.canvasId, "user-123");
      assert(role.ok);
      expect(role.data).toBe("owner");
    });

    it("created canvas is not in any album", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const caller = createCaller({ session, dal });
      const result = await caller.createBlank();

      const canvases = await dal.getCanvasesInAlbum(album.id);
      assert(canvases.ok);
      expect(canvases.data.find((c) => c.id === result.canvasId)).toBeUndefined();
    });

    it("created canvas appears in list", async () => {
      await setupUser();
      const caller = createCaller({ session, dal });
      await caller.createBlank();

      const list = await caller.list();
      expect(list).toHaveLength(1);
    });

    it("throws INTERNAL_SERVER_ERROR when upload fails", async () => {
      await setupUser();
      vi.mocked(imageStorage.upload).mockRejectedValueOnce(new Error("S3 error"));

      const caller = createCaller({ session, dal });
      await expect(caller.createBlank()).rejects.toThrow("Failed to upload image");
    });
  });

  describe("canvas.listOrphans", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(caller.listOrphans()).rejects.toThrow("UNAUTHORIZED");
    });

    it("returns empty array when no orphaned canvases", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const canvas = await createCanvas("img-1");
      await dal.addCanvasToAlbum(album.id, canvas.id);

      const caller = createCaller({ session, dal });
      const result = await caller.listOrphans();

      expect(result).toHaveLength(0);
    });

    it("returns orphaned canvases", async () => {
      await setupUser();
      const canvas = await createCanvas("img-orphan");

      const caller = createCaller({ session, dal });
      const result = await caller.listOrphans();

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].id).toBe(canvas.id);
      expect(result[0].imageId).toBe("img-orphan");
      expect(result[0].imageUrl).toBe("https://example.com/img-orphan.png");
    });

    it("only returns canvases not in any album", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const inAlbum = await createCanvas("img-in-album");
      const orphan = await createCanvas("img-orphan");
      await dal.addCanvasToAlbum(album.id, inAlbum.id);

      const caller = createCaller({ session, dal });
      const result = await caller.listOrphans();

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].id).toBe(orphan.id);
    });

    it("does not return other users' orphaned canvases", async () => {
      await setupUser();
      await dal.ensurePerson("other-user");
      const otherCanvas = await dal.createCanvasWithOwner("img-other", "other-user");
      assert(otherCanvas.ok);

      const caller = createCaller({ session, dal });
      const result = await caller.listOrphans();

      expect(result).toHaveLength(0);
    });
  });

  describe("canvas.delete", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(caller.delete({ canvasId: "canvas-1" })).rejects.toThrow(
        "UNAUTHORIZED"
      );
    });

    it("throws NOT_FOUND when canvas does not exist", async () => {
      await setupUser();
      const caller = createCaller({ session, dal });

      await expect(
        caller.delete({ canvasId: "nonexistent" })
      ).rejects.toThrow("Canvas not found");
    });

    it("throws NOT_FOUND when user does not have access", async () => {
      await setupUser();
      await dal.ensurePerson("other-user");
      const otherCanvas = await dal.createCanvasWithOwner("img-other", "other-user");
      assert(otherCanvas.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.delete({ canvasId: otherCanvas.data.id })
      ).rejects.toThrow("Canvas not found");
    });

    it("deletes canvas and its image", async () => {
      await setupUser();
      const canvas = await createCanvas("img-to-delete");

      const caller = createCaller({ session, dal });
      const result = await caller.delete({ canvasId: canvas.id });

      expect(result.success).toBe(true);
      expect(imageStorage.delete).toHaveBeenCalledWith("img-to-delete");

      const canvasResult = await dal.getCanvas(canvas.id);
      expect(canvasResult.ok).toBe(false);
    });

    it("removes canvas from album before deleting", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const canvas = await createCanvas("img-in-album");
      await dal.addCanvasToAlbum(album.id, canvas.id);

      const caller = createCaller({ session, dal });
      const result = await caller.delete({ canvasId: canvas.id });

      expect(result.success).toBe(true);

      const canvases = await dal.getCanvasesInAlbum(album.id);
      assert(canvases.ok);
      expect(canvases.data).toHaveLength(0);
    });

    it("succeeds even if storage delete fails", async () => {
      await setupUser();
      const canvas = await createCanvas("img-delete-fail");
      vi.mocked(imageStorage.delete).mockRejectedValueOnce(new Error("S3 error"));

      const caller = createCaller({ session, dal });
      const result = await caller.delete({ canvasId: canvas.id });

      expect(result.success).toBe(true);
    });
  });

  describe("canvas.addToAlbum", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(
        caller.addToAlbum({ canvasId: "canvas-1", albumId: "album-1" })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND when canvas does not exist", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const caller = createCaller({ session, dal });

      await expect(
        caller.addToAlbum({ canvasId: "nonexistent", albumId: album.id })
      ).rejects.toThrow("Canvas not found");
    });

    it("throws NOT_FOUND when album does not exist", async () => {
      await setupUser();
      const canvas = await createCanvas("img-1");
      const caller = createCaller({ session, dal });

      await expect(
        caller.addToAlbum({ canvasId: canvas.id, albumId: "nonexistent" })
      ).rejects.toThrow("Album not found");
    });

    it("throws NOT_FOUND when album belongs to different user", async () => {
      await setupUser();
      await dal.ensurePerson("other-user");
      const albumResult = await dal.createAlbum("Their Album", "other-user");
      assert(albumResult.ok);

      // Prove the album exists — the NOT_FOUND is an ownership rejection
      const albumExists = await dal.getAlbum(albumResult.data.id);
      assert(albumExists.ok);

      const canvas = await createCanvas("img-1");
      const caller = createCaller({ session, dal });

      await expect(
        caller.addToAlbum({ canvasId: canvas.id, albumId: albumResult.data.id })
      ).rejects.toThrow("Album not found");
    });

    it("throws CONFLICT when canvas already in album", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const canvas = await createCanvas("img-1");
      await dal.addCanvasToAlbum(album.id, canvas.id);

      const caller = createCaller({ session, dal });

      await expect(
        caller.addToAlbum({ canvasId: canvas.id, albumId: album.id })
      ).rejects.toThrow("Canvas already in album");
    });

    it("adds canvas to album", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const canvas = await createCanvas("img-1");

      const caller = createCaller({ session, dal });
      const result = await caller.addToAlbum({
        canvasId: canvas.id,
        albumId: album.id,
      });

      expect(result.success).toBe(true);

      const canvases = await dal.getCanvasesInAlbum(album.id);
      assert(canvases.ok);
      expect(canvases.data).toHaveLength(1);
      assert(canvases.data[0]);
      expect(canvases.data[0].id).toBe(canvas.id);
    });

    it("canvas is no longer orphaned after adding to album", async () => {
      await setupUser();
      const album = await createAlbum("My Album");
      const canvas = await createCanvas("img-orphan");

      const caller = createCaller({ session, dal });

      let orphans = await caller.listOrphans();
      expect(orphans).toHaveLength(1);

      await caller.addToAlbum({ canvasId: canvas.id, albumId: album.id });

      orphans = await caller.listOrphans();
      expect(orphans).toHaveLength(0);
    });
  });
});
