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
import type { Context } from "@/lib/trpc/init";

let dal: Dal;
let db: Database;

const ownerSession: Session = { userId: "owner-user", email: "owner@test.com" };
const editorSession: Session = { userId: "editor-user", email: "editor@test.com" };
const viewerSession: Session = { userId: "viewer-user", email: "viewer@test.com" };
const noAccessSession: Session = { userId: "no-access-user", email: "noaccess@test.com" };
const acceptorSession: Session = { userId: "acceptor-user", email: "acceptor@test.com" };

function caller(ctx: Context) {
  return canvasRouter.createCaller(ctx);
}

async function setupUsers() {
  await dal.ensurePerson("owner-user");
  await dal.ensurePerson("editor-user");
  await dal.ensurePerson("viewer-user");
  await dal.ensurePerson("no-access-user");
  await dal.ensurePerson("acceptor-user");
}

async function createCanvasWithRoles() {
  const result = await dal.createCanvasWithOwner("img-invite", "owner-user");
  assert(result.ok);
  const canvasId = result.data.id;
  await dal.addCanvasUser(canvasId, "editor-user", "editor");
  await dal.addCanvasUser(canvasId, "viewer-user", "viewer");
  return canvasId;
}

describe("Canvas Invites", () => {
  beforeEach(async () => {
    db = await createTestDb();
    dal = createDal(db);
    vi.clearAllMocks();
    await setupUsers();
  });

  describe("createInvite", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const c = caller({ session: null, dal });
      await expect(
        c.createInvite({ canvasId: "any", role: "editor" })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("owner can create invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: ownerSession, dal });
      const result = await c.createInvite({ canvasId, role: "editor" });

      expect(result.token).toBeTruthy();
      expect(result.url).toContain(result.token);
      expect(result.expiresAt).toBeTruthy();
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("editor cannot create invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: editorSession, dal });
      await expect(
        c.createInvite({ canvasId, role: "editor" })
      ).rejects.toThrow("Canvas not found");
    });

    it("viewer cannot create invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: viewerSession, dal });
      await expect(
        c.createInvite({ canvasId, role: "viewer" })
      ).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot create invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: noAccessSession, dal });
      await expect(
        c.createInvite({ canvasId, role: "viewer" })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("listInvites", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const c = caller({ session: null, dal });
      await expect(c.listInvites({ canvasId: "any" })).rejects.toThrow("UNAUTHORIZED");
    });

    it("returns empty array when no invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: ownerSession, dal });
      const invites = await c.listInvites({ canvasId });
      expect(invites).toEqual([]);
    });

    it("returns created invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: ownerSession, dal });
      await c.createInvite({ canvasId, role: "editor" });
      await c.createInvite({ canvasId, role: "viewer" });

      const invites = await c.listInvites({ canvasId });
      expect(invites).toHaveLength(2);
      const roles = invites.map((i) => i.role);
      expect(roles).toContain("editor");
      expect(roles).toContain("viewer");
    });

    it("editor cannot list invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: editorSession, dal });
      await expect(c.listInvites({ canvasId })).rejects.toThrow("Canvas not found");
    });

    it("viewer cannot list invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: viewerSession, dal });
      await expect(c.listInvites({ canvasId })).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot list invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: noAccessSession, dal });
      await expect(c.listInvites({ canvasId })).rejects.toThrow("Canvas not found");
    });
  });

  describe("deleteInvite", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const c = caller({ session: null, dal });
      await expect(
        c.deleteInvite({ canvasId: "any", token: "any" })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("deletes an existing invite", async () => {
      const canvasId = await createCanvasWithRoles();
      const c = caller({ session: ownerSession, dal });
      const { token } = await c.createInvite({ canvasId, role: "editor" });

      const result = await c.deleteInvite({ canvasId, token });
      expect(result.success).toBe(true);

      const invites = await c.listInvites({ canvasId });
      expect(invites).toHaveLength(0);
    });

    it("editor cannot delete invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "editor" });

      const c = caller({ session: editorSession, dal });
      await expect(
        c.deleteInvite({ canvasId, token })
      ).rejects.toThrow("Canvas not found");
    });

    it("viewer cannot delete invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "editor" });

      const c = caller({ session: viewerSession, dal });
      await expect(
        c.deleteInvite({ canvasId, token })
      ).rejects.toThrow("Canvas not found");
    });

    it("no-access user cannot delete invites", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "editor" });

      const c = caller({ session: noAccessSession, dal });
      await expect(
        c.deleteInvite({ canvasId, token })
      ).rejects.toThrow("Canvas not found");
    });
  });

  describe("acceptInvite", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const c = caller({ session: null, dal });
      await expect(
        c.acceptInvite({ token: "any" })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND for invalid token", async () => {
      const c = caller({ session: acceptorSession, dal });
      await expect(
        c.acceptInvite({ token: "nonexistent-token" })
      ).rejects.toThrow("Invite not found");
    });

    it("viewer invite grants viewer role", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "viewer" });

      const c = caller({ session: acceptorSession, dal });
      await c.acceptInvite({ token });

      const role = await dal.getUserCanvasRole(canvasId, "acceptor-user");
      assert(role.ok);
      expect(role.data).toBe("viewer");
    });

    it("editor invite grants editor role", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "editor" });

      const c = caller({ session: acceptorSession, dal });
      await c.acceptInvite({ token });

      const role = await dal.getUserCanvasRole(canvasId, "acceptor-user");
      assert(role.ok);
      expect(role.data).toBe("editor");
    });

    it("owner invite grants owner role", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "owner" });

      const c = caller({ session: acceptorSession, dal });
      await c.acceptInvite({ token });

      const role = await dal.getUserCanvasRole(canvasId, "acceptor-user");
      assert(role.ok);
      expect(role.data).toBe("owner");
    });

    it("grants access only to the accepting user", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "editor" });

      const c = caller({ session: acceptorSession, dal });
      await c.acceptInvite({ token });

      const noAccessRole = await dal.getUserCanvasRole(canvasId, "no-access-user");
      expect(noAccessRole.ok).toBe(false);
    });

    it("invite is single-use — second accept fails", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "editor" });

      const c = caller({ session: acceptorSession, dal });
      await c.acceptInvite({ token });

      // Another user tries the same token
      await dal.ensurePerson("second-user");
      const c2 = caller({ session: { userId: "second-user", email: "second@test.com" }, dal });
      await expect(c2.acceptInvite({ token })).rejects.toThrow("Invite not found");
    });

    it("revoked invite cannot be accepted", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "editor" });
      await ownerCaller.deleteInvite({ canvasId, token });

      const c = caller({ session: acceptorSession, dal });
      await expect(c.acceptInvite({ token })).rejects.toThrow("Invite not found");
    });

    it("user who already has access keeps original role", async () => {
      const canvasId = await createCanvasWithRoles();
      const ownerCaller = caller({ session: ownerSession, dal });
      const { token } = await ownerCaller.createInvite({ canvasId, role: "viewer" });

      // editor-user already has "editor" role, accepts a "viewer" invite
      const c = caller({ session: editorSession, dal });
      const result = await c.acceptInvite({ token });
      expect(result.canvasId).toBe(canvasId);

      const roleResult = await dal.getUserCanvasRole(canvasId, "editor-user");
      assert(roleResult.ok);
      expect(roleResult.data).toBe("editor");
    });

    it("expired invite throws NOT_FOUND with expired message", async () => {
      const canvasId = await createCanvasWithRoles();

      // Create an invite directly via DAL with past expiry
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const inviteResult = await dal.createCanvasInvite(
        canvasId,
        "editor",
        "owner-user",
        pastDate
      );
      assert(inviteResult.ok);

      const c = caller({ session: acceptorSession, dal });
      await expect(
        c.acceptInvite({ token: inviteResult.data.token })
      ).rejects.toThrow("This invite has expired");
    });
  });
});
