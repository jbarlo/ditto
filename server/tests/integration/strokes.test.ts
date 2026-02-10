/**
 * Integration tests for strokes tRPC router.
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

import { strokesRouter } from "@/lib/trpc/routers/strokes";
import type { Context } from "@/lib/trpc/init";

let dal: Dal;
const session: Session = { userId: "user-123", email: "test@example.com" };

// Create a caller for testing
function createCaller(ctx: Context) {
  return strokesRouter.createCaller(ctx);
}

const validStrokeData = {
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  color: "#000000",
  size: 4,
  tool: "brush",
};

describe("Strokes tRPC Router", () => {
  beforeEach(async () => {
    const db = await createTestDb();
    dal = createDal(db);
    await dal.ensurePerson("user-123");
    await dal.ensurePerson("other-user");
  });

  describe("strokes.list", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(caller.list({ canvasId: "canvas-1" })).rejects.toThrow(
        "UNAUTHORIZED"
      );
    });

    it("throws INTERNAL_SERVER_ERROR when getStrokesForCanvas fails", async () => {
      const mockDal = {
        ...dal,
        getUserCanvasRole: vi.fn(async () => ({ ok: true as const, data: "owner" as const })),
        getStrokesForCanvas: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(caller.list({ canvasId: "canvas-1" })).rejects.toThrow(
        "INTERNAL_SERVER_ERROR"
      );
    });

    it("throws INTERNAL_SERVER_ERROR when getStrokesSince fails", async () => {
      const mockDal = {
        ...dal,
        getUserCanvasRole: vi.fn(async () => ({ ok: true as const, data: "owner" as const })),
        getStrokesSince: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.list({ canvasId: "canvas-1", since: "2020-01-01" })
      ).rejects.toThrow("INTERNAL_SERVER_ERROR");
    });

    it("throws NOT_FOUND when user lacks canvas access", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "other-user");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.list({ canvasId: canvasResult.data.id })
      ).rejects.toThrow("Canvas not found");
    });

    it("returns empty array for canvas with no strokes", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });
      const strokes = await caller.list({ canvasId: canvasResult.data.id });

      expect(strokes).toEqual([]);
    });

    it("returns strokes for canvas", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);
      const canvasId = canvasResult.data.id;

      await dal.createStroke(
        canvasId,
        "user-123",
        JSON.stringify(validStrokeData)
      );

      const caller = createCaller({ session, dal });
      const strokes = await caller.list({ canvasId });

      expect(strokes).toHaveLength(1);
      assert(strokes[0]);
      expect(JSON.parse(strokes[0].data)).toEqual(validStrokeData);
    });

    it("filters strokes by since parameter", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);
      const canvasId = canvasResult.data.id;

      // Use a past time as "since" - all strokes created now should be after it
      const pastTime = "2020-01-01T00:00:00.000Z";

      // Create strokes
      await dal.createStroke(
        canvasId,
        "user-123",
        JSON.stringify(validStrokeData)
      );
      await dal.createStroke(
        canvasId,
        "user-123",
        JSON.stringify({ ...validStrokeData, color: "#ff0000" })
      );

      const caller = createCaller({ session, dal });

      // Get strokes since past time - should return all
      const strokes = await caller.list({ canvasId, since: pastTime });
      expect(strokes).toHaveLength(2);

      // Get strokes since future time - should return none
      const futureTime = "2099-01-01T00:00:00.000Z";
      const strokes2 = await caller.list({ canvasId, since: futureTime });
      expect(strokes2).toHaveLength(0);
    });
  });

  describe("strokes.create", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(
        caller.create({ canvasId: "canvas-1", data: validStrokeData })
      ).rejects.toThrow("UNAUTHORIZED");
    });

    it("throws NOT_FOUND for non-existent canvas", async () => {
      const caller = createCaller({ session, dal });

      await expect(
        caller.create({ canvasId: "nonexistent", data: validStrokeData })
      ).rejects.toThrow("Canvas not found");
    });

    it("throws NOT_FOUND when user lacks canvas access", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "other-user");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.create({ canvasId: canvasResult.data.id, data: validStrokeData })
      ).rejects.toThrow("Canvas not found");
    });

    it("throws TOO_MANY_REQUESTS when rate limited", async () => {
      const mockDal = {
        ...dal,
        getUserCanvasRole: vi.fn(async () => ({ ok: true as const, data: "editor" as const })),
        checkRateLimit: vi.fn(async () => ({ ok: true as const, data: { allowed: false, remaining: 0 } })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.create({ canvasId: "canvas-1", data: validStrokeData })
      ).rejects.toThrow("Rate limit exceeded");
    });

    it("throws INTERNAL_SERVER_ERROR when createStroke fails", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);

      const mockDal = {
        ...dal,
        checkRateLimit: dal.checkRateLimit.bind(dal),
        getUserCanvasRole: dal.getUserCanvasRole.bind(dal),
        createStroke: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.create({ canvasId: canvasResult.data.id, data: validStrokeData })
      ).rejects.toThrow("INTERNAL_SERVER_ERROR");
    });

    it("validates stroke data - missing points", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.create({
          canvasId: canvasResult.data.id,
          // @ts-expect-error - testing invalid input
          data: { color: "#000", size: 4 },
        })
      ).rejects.toThrow();
    });

    it("validates stroke data - empty points", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.create({
          canvasId: canvasResult.data.id,
          data: { points: [], color: "#000", size: 4 },
        })
      ).rejects.toThrow();
    });

    it("validates stroke data - missing color", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.create({
          canvasId: canvasResult.data.id,
          // @ts-expect-error - testing invalid input
          data: { points: [{ x: 0, y: 0 }], size: 4 },
        })
      ).rejects.toThrow();
    });

    it("validates stroke data - missing size", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.create({
          canvasId: canvasResult.data.id,
          // @ts-expect-error - testing invalid input
          data: { points: [{ x: 0, y: 0 }], color: "#000" },
        })
      ).rejects.toThrow();
    });

    it("creates stroke and returns id/createdAt", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);
      const canvasId = canvasResult.data.id;

      const caller = createCaller({ session, dal });
      const result = await caller.create({ canvasId, data: validStrokeData });

      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();

      // Verify stroke was saved
      const strokesResult = await dal.getStrokesForCanvas(canvasId);
      assert(strokesResult.ok);
      expect(strokesResult.data).toHaveLength(1);
      assert(strokesResult.data[0]);
      expect(strokesResult.data[0].id).toBe(result.id);
    });

    it("associates stroke with session user", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);
      const canvasId = canvasResult.data.id;

      const caller = createCaller({ session, dal });
      await caller.create({ canvasId, data: validStrokeData });

      const strokesResult = await dal.getStrokesForCanvas(canvasId);
      assert(strokesResult.ok);
      assert(strokesResult.data[0]);
      expect(strokesResult.data[0].userId).toBe("user-123");
    });
  });

  describe("strokes.clear", () => {
    it("throws UNAUTHORIZED when not authenticated", async () => {
      const caller = createCaller({ session: null, dal });

      await expect(caller.clear({ canvasId: "canvas-1" })).rejects.toThrow(
        "UNAUTHORIZED"
      );
    });

    it("throws NOT_FOUND for non-existent canvas", async () => {
      const caller = createCaller({ session, dal });

      await expect(
        caller.clear({ canvasId: "nonexistent" })
      ).rejects.toThrow("Canvas not found");
    });

    it("throws NOT_FOUND when user lacks canvas access", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "other-user");
      assert(canvasResult.ok);

      const caller = createCaller({ session, dal });

      await expect(
        caller.clear({ canvasId: canvasResult.data.id })
      ).rejects.toThrow("Canvas not found");
    });

    it("throws INTERNAL_SERVER_ERROR when createStroke fails", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);

      const mockDal = {
        ...dal,
        getUserCanvasRole: dal.getUserCanvasRole.bind(dal),
        createStroke: vi.fn(async () => ({ ok: false as const, error: "UNEXPECTED" as const })),
      };

      const caller = createCaller({ session, dal: mockDal });

      await expect(
        caller.clear({ canvasId: canvasResult.data.id })
      ).rejects.toThrow("INTERNAL_SERVER_ERROR");
    });

    it("creates a clear stroke and returns success", async () => {
      const canvasResult = await dal.createCanvasWithOwner("img-1", "user-123");
      assert(canvasResult.ok);
      const canvasId = canvasResult.data.id;

      const caller = createCaller({ session, dal });
      const result = await caller.clear({ canvasId });

      expect(result.success).toBe(true);

      // Verify the clear stroke was saved
      const strokesResult = await dal.getStrokesForCanvas(canvasId);
      assert(strokesResult.ok);
      expect(strokesResult.data).toHaveLength(1);
      assert(strokesResult.data[0]);
      const data = JSON.parse(strokesResult.data[0].data);
      expect(data.tool).toBe("clear");
    });
  });
});
