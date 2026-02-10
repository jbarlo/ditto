import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";

export const frameRouter = router({
  setAlbum: protectedProcedure
    .input(
      z.object({
        frameId: z.string(),
        albumId: z.string().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const frameResult = await ctx.dal.getFrame(input.frameId);
      if (!frameResult.ok || frameResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Frame not found" });
      }

      if (input.albumId === null) {
        const clearResult = await ctx.dal.clearFrameAlbum(input.frameId);
        if (!clearResult.ok) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to clear album",
          });
        }
        return { success: true };
      }

      const albumResult = await ctx.dal.getAlbum(input.albumId);
      if (!albumResult.ok || albumResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
      }

      const result = await ctx.dal.setFrameAlbum(input.frameId, input.albumId);
      if (!result.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set album",
        });
      }
      return { success: true };
    }),

  release: protectedProcedure
    .input(z.object({ frameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const frameResult = await ctx.dal.getFrame(input.frameId);
      if (!frameResult.ok || frameResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Frame not found" });
      }

      const result = await ctx.dal.releaseFrame(input.frameId);
      if (!result.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to release frame",
        });
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ frameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const frameResult = await ctx.dal.getFrame(input.frameId);
      if (!frameResult.ok || frameResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Frame not found" });
      }

      const result = await ctx.dal.deleteFrame(input.frameId);
      if (!result.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete frame",
        });
      }
      return { success: true };
    }),

  setCurrentIndex: protectedProcedure
    .input(
      z.object({
        frameId: z.string(),
        index: z.number().int().min(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const frameResult = await ctx.dal.getFrame(input.frameId);
      if (!frameResult.ok || frameResult.data.ownerId !== ctx.session.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Frame not found" });
      }

      const setResult = await ctx.dal.setFrameIndex(
        input.frameId,
        input.index
      );
      if (!setResult.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to set index",
        });
      }
      return { success: true };
    }),
});
