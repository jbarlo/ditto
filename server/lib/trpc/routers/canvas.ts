import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { router, protectedProcedure, canvasProcedure } from "../init";
import { imageStorage, canvasImageUrl } from "@/lib/storage";
import { canvasRoleSchema } from "@/lib/canvas/roles";
import { INVITE_EXPIRY } from "@/lib/config";
import { env } from "@/lib/env";
import { route } from "@/lib/routes";
import { generateBlankCanvas } from "@/lib/image";

export const canvasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.dal.getCanvasesForUser(ctx.session.userId);
    if (!result.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch canvases",
      });
    }
    return result.data.map((c) => ({
      ...c,
      imageUrl: canvasImageUrl(c.imageId, c.compositedAt),
    }));
  }),

  createBlank: protectedProcedure.mutation(async ({ ctx }) => {
    const blankImage = await generateBlankCanvas();
    const imageId = nanoid();
    try {
      await imageStorage.upload(imageId, blankImage);
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to upload image",
      });
    }

    const canvasResult = await ctx.dal.createCanvasWithOwner(
      imageId,
      ctx.session.userId
    );
    if (!canvasResult.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create canvas",
      });
    }
    return { canvasId: canvasResult.data.id };
  }),

  listOrphans: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.dal.getOrphanedCanvasesForUser(ctx.session.userId);
    if (!result.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch orphaned canvases",
      });
    }
    return result.data.map((c) => ({
      id: c.id,
      imageId: c.imageId,
      imageUrl: canvasImageUrl(c.imageId, c.compositedAt),
      createdAt: c.createdAt,
      role: c.role,
    }));
  }),

  delete: canvasProcedure("owner").mutation(async ({ ctx, input }) => {
    const deleteResult = await ctx.dal.deleteCanvas(input.canvasId);
    if (!deleteResult.ok) {
      if (deleteResult.error === "NOT_FOUND") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Canvas not found",
        });
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete canvas",
      });
    }

    try {
      await imageStorage.delete(deleteResult.data.imageId);
    } catch {
      // Image deletion failure is non-fatal; DB record already removed
    }

    return { success: true };
  }),

  addToAlbum: canvasProcedure("viewer")
    .input(z.object({ albumId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const albumResult = await ctx.dal.getAlbum(input.albumId);
      if (!albumResult.ok || albumResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }

      const addResult = await ctx.dal.addCanvasToAlbum(
        input.albumId,
        input.canvasId
      );
      if (!addResult.ok) {
        if (addResult.error === "DUPLICATE") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Canvas already in album",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add canvas to album",
        });
      }

      return { success: true };
    }),

  share: canvasProcedure("owner")
    .input(z.object({ userId: z.string(), role: canvasRoleSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.dal.addCanvasUser(
        input.canvasId,
        input.userId,
        input.role
      );
      if (!result.ok) {
        if (result.error === "DUPLICATE") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "User already has access to this canvas",
          });
        }
        if (result.error === "FK_VIOLATION") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return { success: true };
    }),

  unshare: canvasProcedure("owner")
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.dal.removeCanvasUser(
        input.canvasId,
        input.userId
      );
      if (!result.ok) {
        if (result.error === "LAST_OWNER") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the last owner of a canvas",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return { success: true };
    }),

  listUsers: canvasProcedure("viewer").query(async ({ ctx, input }) => {
    const result = await ctx.dal.getCanvasUsers(input.canvasId);
    if (!result.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
    return result.data;
  }),

  updateRole: canvasProcedure("owner")
    .input(z.object({ userId: z.string(), role: canvasRoleSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.dal.updateCanvasUserRole(
        input.canvasId,
        input.userId,
        input.role
      );
      if (!result.ok) {
        if (result.error === "LAST_OWNER") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot demote the last owner of a canvas",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return { success: true };
    }),

  createInvite: canvasProcedure("owner")
    .input(z.object({ role: canvasRoleSchema }))
    .mutation(async ({ ctx, input }) => {
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY).toISOString();
      const result = await ctx.dal.createCanvasInvite(
        input.canvasId,
        input.role,
        ctx.session.userId,
        expiresAt
      );
      if (!result.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return {
        token: result.data.token,
        url: `${env.BASE_URL}${route("/invite/:token", { token: result.data.token })}`,
        expiresAt,
      };
    }),

  deleteInvite: canvasProcedure("owner")
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.dal.deleteCanvasInvite(input.token);
      if (!result.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      return { success: true };
    }),

  listInvites: canvasProcedure("owner").query(async ({ ctx, input }) => {
    const result = await ctx.dal.listCanvasInvites(input.canvasId);
    if (!result.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }
    return result.data;
  }),

  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const inviteResult = await ctx.dal.getCanvasInvite(input.token);
      if (!inviteResult.ok) {
        const message =
          inviteResult.error === "EXPIRED"
            ? "This invite has expired"
            : "Invite not found";
        throw new TRPCError({ code: "NOT_FOUND", message });
      }

      const invite = inviteResult.data;
      const addResult = await ctx.dal.addCanvasUser(
        invite.canvasId,
        ctx.session.userId,
        invite.role
      );
      if (!addResult.ok && addResult.error !== "DUPLICATE") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      await ctx.dal.deleteCanvasInvite(input.token);

      return { canvasId: invite.canvasId };
    }),
});
