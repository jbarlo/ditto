import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { getSession, type Session } from "@/lib/auth";
import { createDal, type Dal } from "@/lib/db/dal";
import { getDb } from "@/lib/db/client";
import { hasMinRole, type CanvasRole } from "@/lib/canvas/roles";

export interface Context {
  session: Session | null;
  dal: Dal;
}

export async function createContext(): Promise<Context> {
  const session = await getSession();
  const dal = createDal(await getDb());
  return { session, dal };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);

export function canvasProcedure(minRole: CanvasRole) {
  return protectedProcedure
    .input(z.object({ canvasId: z.string() }))
    .use(async ({ ctx, input, next }) => {
      const roleResult = await ctx.dal.getUserCanvasRole(
        input.canvasId,
        ctx.session.userId
      );
      if (!roleResult.ok || !hasMinRole(roleResult.data, minRole)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Canvas not found" });
      }
      return next({
        ctx: { ...ctx, canvasRole: roleResult.data },
      });
    });
}
