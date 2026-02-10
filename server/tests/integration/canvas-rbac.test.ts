/**
 * Integration tests for canvas RBAC (role-based access control).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import assert from "assert";
import { createTestDb } from "@/lib/db/client";
import { createDal, type Dal } from "@/lib/db/dal";
import type { Session } from "@/lib/auth/types";
import type { Database } from "@/lib/db/client";

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  imageStorage: {
    upload: vi.fn(async () => "uploaded-url"),
    get: vi.fn(async () => null),
    getUrl: vi.fn((id: string) => `https://example.com/${id}.png`),
    delete: vi.fn(async () => {}),
  },
  canvasImageUrl: (id: string, v: string | null) => v ? `https://example.com/${id}.png?v=${encodeURIComponent(v)}` : `https://example.com/${id}.png`,
}));

import { canvasRouter } from "@/lib/trpc/routers/canvas";
import { strokesRouter } from "@/lib/trpc/routers/strokes";
import type { Context } from "@/lib/trpc/init";

let dal: Dal;
let db: Database;

const ownerSession: Session = { userId: "owner-user", email: "owner@test.com" };
const editorSession: Session = { userId: "editor-user", email: "editor@test.com" };
const viewerSession: Session = { userId: "viewer-user", email: "viewer@test.com" };
const noAccessSession: Session = { userId: "no-access-user", email: "noaccess@test.com" };

function canvasCaller(ctx: Context) {
  return canvasRouter.createCaller(ctx);
}

function strokesCaller(ctx: Context) {
  return strokesRouter.createCaller(ctx);
}

async function setupUsers() {
  await dal.ensurePerson("owner-user");
  await dal.ensurePerson("editor-user");
  await dal.ensurePerson("viewer-user");
  await dal.ensurePerson("no-access-user");
}

async function createCanvasWithRoles() {
  const result = await dal.createCanvasWithOwner("img-rbac", "owner-user");
  assert(result.ok);
  const canvasId = result.data.id;

  await dal.addCanvasUser(canvasId, "editor-user", "editor");
  await dal.addCanvasUser(canvasId, "viewer-user", "viewer");

  return canvasId;
}

describe("Canvas RBAC", () => {
  beforeEach(async () => {
    db = await createTestDb();
    dal = createDal(db);
    vi.clearAllMocks();
    await setupUsers();
  });

  describe("role enforcement - strokes.list (min: viewer)", () => {
    it("owner can list strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: ownerSession, dal });
      const result = await caller.list({ canvasId });
      expect(result).toEqual([]);
    });

    it("editor can list strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: editorSession, dal });
      const result = await caller.list({ canvasId });
      expect(result).toEqual([]);
    });

    it("viewer can list strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: viewerSession, dal });
      const result = await caller.list({ canvasId });
      expect(result).toEqual([]);
    });

    it("no-access user cannot list strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: noAccessSession, dal });
      await expect(caller.list({ canvasId })).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - strokes.create (min: editor)", () => {
    it("owner can create strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: ownerSession, dal });
      const result = await caller.create({
        canvasId,
        data: { points: [{ x: 0, y: 0 }], color: "#000", size: 2 },
      });
      expect(result.id).toBeTruthy();
    });

    it("editor can create strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: editorSession, dal });
      const result = await caller.create({
        canvasId,
        data: { points: [{ x: 0, y: 0 }], color: "#000", size: 2 },
      });
      expect(result.id).toBeTruthy();
    });

    it("viewer cannot create strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: viewerSession, dal });
      await expect(
        caller.create({
          canvasId,
          data: { points: [{ x: 0, y: 0 }], color: "#000", size: 2 },
        })
      ).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot create strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: noAccessSession, dal });
      await expect(
        caller.create({
          canvasId,
          data: { points: [{ x: 0, y: 0 }], color: "#000", size: 2 },
        })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - strokes.clear (min: editor)", () => {
    it("owner can clear strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: ownerSession, dal });
      const result = await caller.clear({ canvasId });
      expect(result.success).toBe(true);
    });

    it("editor can clear strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: editorSession, dal });
      const result = await caller.clear({ canvasId });
      expect(result.success).toBe(true);
    });

    it("viewer cannot clear strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: viewerSession, dal });
      await expect(caller.clear({ canvasId })).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot clear strokes", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = strokesCaller({ session: noAccessSession, dal });
      await expect(caller.clear({ canvasId })).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - canvas.delete (min: owner)", () => {
    it("owner can delete canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.delete({ canvasId });
      expect(result.success).toBe(true);
    });

    it("editor cannot delete canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: editorSession, dal });
      await expect(caller.delete({ canvasId })).rejects.toThrow("Canvas not found");
    });

    it("viewer cannot delete canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: viewerSession, dal });
      await expect(caller.delete({ canvasId })).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot delete canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: noAccessSession, dal });
      await expect(caller.delete({ canvasId })).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - canvas.addToAlbum (min: viewer)", () => {
    it("owner can add canvas to album", async () => {
      const canvasId = await createCanvasWithRoles();
      const albumResult = await dal.createAlbum("test", "owner-user");
      assert(albumResult.ok);

      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.addToAlbum({
        canvasId,
        albumId: albumResult.data.id,
      });
      expect(result.success).toBe(true);
    });

    it("editor can add canvas to own album", async () => {
      const canvasId = await createCanvasWithRoles();
      const albumResult = await dal.createAlbum("test", "editor-user");
      assert(albumResult.ok);

      const caller = canvasCaller({ session: editorSession, dal });
      const result = await caller.addToAlbum({
        canvasId,
        albumId: albumResult.data.id,
      });
      expect(result.success).toBe(true);
    });

    it("editor cannot add canvas to another user's album", async () => {
      const canvasId = await createCanvasWithRoles();
      const albumResult = await dal.createAlbum("test", "owner-user");
      assert(albumResult.ok);

      const caller = canvasCaller({ session: editorSession, dal });
      await expect(
        caller.addToAlbum({ canvasId, albumId: albumResult.data.id })
      ).rejects.toThrow("Album not found");
    });

    it("viewer can add canvas to own album", async () => {
      const canvasId = await createCanvasWithRoles();
      const albumResult = await dal.createAlbum("test", "viewer-user");
      assert(albumResult.ok);

      const caller = canvasCaller({ session: viewerSession, dal });
      const result = await caller.addToAlbum({
        canvasId,
        albumId: albumResult.data.id,
      });
      expect(result.success).toBe(true);
    });

    it("no-access user cannot add canvas to album", async () => {
      const canvasId = await createCanvasWithRoles();
      const albumResult = await dal.createAlbum("test", "owner-user");
      assert(albumResult.ok);

      const caller = canvasCaller({ session: noAccessSession, dal });
      await expect(
        caller.addToAlbum({ canvasId, albumId: albumResult.data.id })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - canvas.share (min: owner)", () => {
    it("owner can share canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.share({
        canvasId,
        userId: "no-access-user",
        role: "editor",
      });
      expect(result.success).toBe(true);
    });

    it("editor cannot share canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: editorSession, dal });
      await expect(
        caller.share({ canvasId, userId: "no-access-user", role: "viewer" })
      ).rejects.toThrow("Canvas not found");
    });

    it("viewer cannot share canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: viewerSession, dal });
      await expect(
        caller.share({ canvasId, userId: "no-access-user", role: "viewer" })
      ).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot share canvas", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: noAccessSession, dal });
      await expect(
        caller.share({ canvasId, userId: "owner-user", role: "viewer" })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - canvas.unshare (min: owner)", () => {
    it("owner can unshare a user", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.unshare({ canvasId, userId: "editor-user" });
      expect(result.success).toBe(true);
    });

    it("editor cannot unshare users", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: editorSession, dal });
      await expect(
        caller.unshare({ canvasId, userId: "viewer-user" })
      ).rejects.toThrow("Canvas not found");
    });

    it("viewer cannot unshare users", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: viewerSession, dal });
      await expect(
        caller.unshare({ canvasId, userId: "editor-user" })
      ).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot unshare users", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: noAccessSession, dal });
      await expect(
        caller.unshare({ canvasId, userId: "editor-user" })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - canvas.listUsers (min: viewer)", () => {
    it("owner can list canvas users", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      const users = await caller.listUsers({ canvasId });

      expect(users).toHaveLength(3);
      const roles = new Map(users.map((u) => [u.userId, u.role]));
      expect(roles.get("owner-user")).toBe("owner");
      expect(roles.get("editor-user")).toBe("editor");
      expect(roles.get("viewer-user")).toBe("viewer");
    });

    it("editor can list canvas users", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: editorSession, dal });
      const users = await caller.listUsers({ canvasId });
      expect(users).toHaveLength(3);
    });

    it("viewer can list canvas users", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: viewerSession, dal });
      const users = await caller.listUsers({ canvasId });
      expect(users).toHaveLength(3);
    });

    it("no-access user cannot list canvas users", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: noAccessSession, dal });
      await expect(caller.listUsers({ canvasId })).rejects.toThrow("Canvas not found");
    });
  });

  describe("role enforcement - canvas.updateRole (min: owner)", () => {
    it("owner can change a user's role", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.updateRole({
        canvasId,
        userId: "viewer-user",
        role: "editor",
      });
      expect(result.success).toBe(true);

      const roleResult = await dal.getUserCanvasRole(canvasId, "viewer-user");
      assert(roleResult.ok);
      expect(roleResult.data).toBe("editor");
    });

    it("editor cannot update roles", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: editorSession, dal });
      await expect(
        caller.updateRole({ canvasId, userId: "viewer-user", role: "editor" })
      ).rejects.toThrow("Canvas not found");
    });

    it("viewer cannot update roles", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: viewerSession, dal });
      await expect(
        caller.updateRole({ canvasId, userId: "editor-user", role: "viewer" })
      ).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot update roles", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: noAccessSession, dal });
      await expect(
        caller.updateRole({ canvasId, userId: "editor-user", role: "viewer" })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("sharing - business rules", () => {
    it("owner can share canvas as co-owner", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.share({
        canvasId,
        userId: "no-access-user",
        role: "owner",
      });
      expect(result.success).toBe(true);

      const roleResult = await dal.getUserCanvasRole(canvasId, "no-access-user");
      assert(roleResult.ok);
      expect(roleResult.data).toBe("owner");
    });

    it("share rejects duplicate user", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      await expect(
        caller.share({ canvasId, userId: "editor-user", role: "viewer" })
      ).rejects.toThrow("User already has access");
    });

    it("share rejects non-existent user", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      await expect(
        caller.share({ canvasId, userId: "ghost", role: "viewer" })
      ).rejects.toThrow("User not found");
    });

    it("cannot remove the last owner", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      await expect(
        caller.unshare({ canvasId, userId: "owner-user" })
      ).rejects.toThrow("Cannot remove the last owner");
    });

    it("owner can remove themselves when another owner exists", async () => {
      const canvasId = await createCanvasWithRoles();
      await dal.addCanvasUser(canvasId, "no-access-user", "owner");

      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.unshare({ canvasId, userId: "owner-user" });
      expect(result.success).toBe(true);
    });

    it("owner can promote a user to co-owner", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.updateRole({
        canvasId,
        userId: "editor-user",
        role: "owner",
      });
      expect(result.success).toBe(true);

      const roleResult = await dal.getUserCanvasRole(canvasId, "editor-user");
      assert(roleResult.ok);
      expect(roleResult.data).toBe("owner");
    });

    it("cannot demote the last owner", async () => {
      const canvasId = await createCanvasWithRoles();
      const caller = canvasCaller({ session: ownerSession, dal });
      await expect(
        caller.updateRole({ canvasId, userId: "owner-user", role: "editor" })
      ).rejects.toThrow("Cannot demote the last owner");
    });

    it("owner can demote themselves when another owner exists", async () => {
      const canvasId = await createCanvasWithRoles();
      await dal.addCanvasUser(canvasId, "no-access-user", "owner");

      const caller = canvasCaller({ session: ownerSession, dal });
      const result = await caller.updateRole({
        canvasId,
        userId: "owner-user",
        role: "editor",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("access revocation", () => {
    it("unshared user loses access to strokes", async () => {
      const canvasId = await createCanvasWithRoles();

      // Editor can create strokes before unshare
      const editorCaller = strokesCaller({ session: editorSession, dal });
      const stroke = await editorCaller.create({
        canvasId,
        data: { points: [{ x: 0, y: 0 }], color: "#000", size: 2 },
      });
      expect(stroke.id).toBeTruthy();

      // Owner unshares editor
      const ownerCaller = canvasCaller({ session: ownerSession, dal });
      await ownerCaller.unshare({ canvasId, userId: "editor-user" });

      // Editor can no longer list or create strokes
      await expect(editorCaller.list({ canvasId })).rejects.toThrow("Canvas not found");
      await expect(
        editorCaller.create({
          canvasId,
          data: { points: [{ x: 1, y: 1 }], color: "#000", size: 2 },
        })
      ).rejects.toThrow("Canvas not found");
    });

    it("demoted user loses higher-tier access", async () => {
      const canvasId = await createCanvasWithRoles();

      // Editor can create strokes
      const editorCaller = strokesCaller({ session: editorSession, dal });
      const stroke = await editorCaller.create({
        canvasId,
        data: { points: [{ x: 0, y: 0 }], color: "#000", size: 2 },
      });
      expect(stroke.id).toBeTruthy();

      // Owner demotes editor to viewer
      const ownerCaller = canvasCaller({ session: ownerSession, dal });
      await ownerCaller.updateRole({
        canvasId,
        userId: "editor-user",
        role: "viewer",
      });

      // Former editor can still list but not create
      const strokes = await editorCaller.list({ canvasId });
      expect(strokes.length).toBeGreaterThan(0);

      await expect(
        editorCaller.create({
          canvasId,
          data: { points: [{ x: 1, y: 1 }], color: "#000", size: 2 },
        })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("invalid role in DB", () => {
    it("getUserCanvasRole returns UNEXPECTED for invalid role", async () => {
      const canvasId = await createCanvasWithRoles();

      // Corrupt the role directly in the DB
      const { canvasUser } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");
      await db
        .update(canvasUser)
        .set({ role: "superadmin" })
        .where(
          and(
            eq(canvasUser.canvasId, canvasId),
            eq(canvasUser.userId, "editor-user")
          )
        );

      const result = await dal.getUserCanvasRole(canvasId, "editor-user");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("UNEXPECTED");
      }
    });

    it("getCanvasUsers returns UNEXPECTED when a role is invalid", async () => {
      const canvasId = await createCanvasWithRoles();

      const { canvasUser } = await import("@/lib/db/schema");
      const { eq, and } = await import("drizzle-orm");
      await db
        .update(canvasUser)
        .set({ role: "bogus" })
        .where(
          and(
            eq(canvasUser.canvasId, canvasId),
            eq(canvasUser.userId, "viewer-user")
          )
        );

      const result = await dal.getCanvasUsers(canvasId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("UNEXPECTED");
      }
    });
  });

  describe("FK restrict - person deletion", () => {
    it("rejects deleting a person who has canvas access", async () => {
      await createCanvasWithRoles();

      const { person } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      // FK restrict should prevent deletion
      await expect(
        db.delete(person).where(eq(person.id, "editor-user"))
      ).rejects.toThrow();

      // Person still exists
      const result = await dal.getPerson("editor-user");
      assert(result.ok);
    });

    it("allows deleting a person with no canvas access", async () => {
      await createCanvasWithRoles();

      const { person } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");

      // no-access-user has no canvas_user rows
      await db.delete(person).where(eq(person.id, "no-access-user"));

      const result = await dal.getPerson("no-access-user");
      expect(result.ok).toBe(false);
    });
  });
});
