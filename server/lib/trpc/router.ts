import { router } from "./init";
import { strokesRouter } from "./routers/strokes";
import { albumRouter } from "./routers/album";
import { frameRouter } from "./routers/frame";
import { canvasRouter } from "./routers/canvas";

export const appRouter = router({
  strokes: strokesRouter,
  album: albumRouter,
  frame: frameRouter,
  canvas: canvasRouter,
});

export type AppRouter = typeof appRouter;
