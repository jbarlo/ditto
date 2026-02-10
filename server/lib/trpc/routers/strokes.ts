import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, canvasProcedure } from "../init";

const strokeDataSchema = z.object({
  points: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .min(1, "Stroke must have at least one point"),
  color: z.string(),
  size: z.number(),
  tool: z.string().optional().default("brush"),
});

export const strokesRouter = router({
  list: canvasProcedure("viewer")
    .input(z.object({ since: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const result = input.since
        ? await ctx.dal.getStrokesSince(input.canvasId, input.since)
        : await ctx.dal.getStrokesForCanvas(input.canvasId);

      if (!result.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      return result.data;
    }),

  create: canvasProcedure("editor")
    .input(z.object({ data: strokeDataSchema }))
    .mutation(async ({ ctx, input }) => {
      const rateLimitResult = await ctx.dal.checkRateLimit(
        `user:${ctx.session.userId}:strokes`,
        200,
        60
      );
      if (!rateLimitResult.ok || !rateLimitResult.data.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded",
        });
      }

      const result = await ctx.dal.createStroke(
        input.canvasId,
        ctx.session.userId,
        JSON.stringify(input.data)
      );

      if (!result.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      return {
        id: result.data.id,
        createdAt: result.data.createdAt,
      };
    }),

  clear: canvasProcedure("editor").mutation(async ({ ctx, input }) => {
    // Create a special "clear" stroke that fills white when composited
    const clearStrokeData = JSON.stringify({
      tool: "clear",
      points: [],
      color: "#ffffff",
      size: 0,
    });

    const result = await ctx.dal.createStroke(
      input.canvasId,
      ctx.session.userId,
      clearStrokeData
    );

    if (!result.ok) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    }

    return { success: true };
  }),
});
