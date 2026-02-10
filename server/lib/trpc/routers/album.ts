import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { router, protectedProcedure } from "../init";
import { generateBlankCanvas } from "@/lib/image";
import { imageStorage, canvasImageUrl } from "@/lib/storage";

export const albumRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.dal.getAlbumsForUser(ctx.session.userId);
    if (!result.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch albums",
      });
    }
    return result.data;
  }),

  listWithCanvases: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.dal.getAlbumsWithCanvases(ctx.session.userId);
    if (!result.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch albums",
      });
    }
    return result.data.map((a) => ({
      id: a.id,
      name: a.name,
      canvases: a.canvases.map((c) => ({
        id: c.id,
        imageUrl: canvasImageUrl(c.imageId, c.compositedAt),
      })),
    }));
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.dal.createAlbum(input.name, ctx.session.userId);
      if (!result.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create album",
        });
      }
      return result.data;
    }),

  delete: protectedProcedure
    .input(z.object({ albumId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const albumResult = await ctx.dal.getAlbum(input.albumId);
      if (!albumResult.ok || albumResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }

      const deleteResult = await ctx.dal.deleteAlbum(input.albumId);
      if (!deleteResult.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete album",
        });
      }
      return { success: true };
    }),

  removeCanvas: protectedProcedure
    .input(
      z.object({
        albumId: z.string(),
        canvasId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const albumResult = await ctx.dal.getAlbum(input.albumId);
      if (!albumResult.ok || albumResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }

      const removeResult = await ctx.dal.removeCanvasFromAlbum(input.albumId, input.canvasId);
      if (!removeResult.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove canvas from album",
        });
      }
      return { success: true };
    }),

  moveCanvas: protectedProcedure
    .input(
      z.object({
        albumId: z.string(),
        canvasId: z.string(),
        direction: z.enum(["up", "down"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const albumResult = await ctx.dal.getAlbum(input.albumId);
      if (!albumResult.ok || albumResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }

      const moveResult = await ctx.dal.moveCanvasInAlbum(
        input.albumId,
        input.canvasId,
        input.direction
      );
      if (!moveResult.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to move canvas",
        });
      }
      return { success: true };
    }),

  createBlankCanvas: protectedProcedure
    .input(
      z.object({
        albumId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const albumResult = await ctx.dal.getAlbum(input.albumId);
      if (!albumResult.ok || albumResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }
      const albumId = input.albumId;

      const blankImage = await generateBlankCanvas();
      const id = nanoid();
      try {
        await imageStorage.upload(id, blankImage);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload image",
        });
      }

      const canvasResult = await ctx.dal.createCanvasWithOwner(
        id,
        ctx.session.userId
      );
      if (!canvasResult.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create canvas",
        });
      }

      const addResult = await ctx.dal.addCanvasToAlbum(
        albumId,
        canvasResult.data.id
      );
      if (!addResult.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add canvas to album",
        });
      }

      return { canvasId: canvasResult.data.id };
    }),
});
