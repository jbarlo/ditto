import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createDal } from "@/lib/db/dal";
import { getDb } from "@/lib/db/client";
import { getCanvasImageUrl } from "@/lib/api/display";
import { hasMinRole } from "@/lib/canvas/roles";
import { route } from "@/lib/routes";
import DrawingCanvas from "./DrawingCanvas";
import SharePanel from "./SharePanel";

interface PageProps {
  params: Promise<{ canvasId: string }>;
}

export default async function CanvasPage({ params }: PageProps) {
  const session = await requireAuth();
  const { canvasId } = await params;
  const dal = createDal(await getDb());

  const roleResult = await dal.getUserCanvasRole(canvasId, session.userId);
  if (!roleResult.ok) {
    redirect(route("/home"));
  }

  const canvasResult = await dal.getCanvas(canvasId);
  if (!canvasResult.ok) {
    redirect(route("/home"));
  }

  const canvas = canvasResult.data;
  const { url: imageUrl } = await getCanvasImageUrl(canvas, dal);
  const canEdit = hasMinRole(roleResult.data, "editor");
  const isOwner = roleResult.data === "owner";

  return (
    <main style={{ fontFamily: "monospace", maxWidth: "900px", margin: "0 auto" }}>
      <DrawingCanvas
        canvasId={canvasId}
        initialImageUrl={imageUrl}
        readOnly={!canEdit}
      />
      {isOwner && <SharePanel canvasId={canvasId} />}
    </main>
  );
}
