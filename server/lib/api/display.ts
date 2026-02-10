import { type Frame, type Dal } from "@/lib/db/dal";
import { imageStorage, canvasImageUrl } from "@/lib/storage";
import { compositeStrokes, generateBlankCanvas } from "@/lib/image";
import { env } from "@/lib/env";
import { DEFAULT_REFRESH_RATE, STROKE_RETENTION } from "@/lib/config";

export interface DisplayResponse {
  status: number;
  image_url: string;
  filename: string;
  refresh_rate: number;
  update_firmware: boolean;
  reset_firmware: boolean;
}

export async function getDisplayResponse(
  frame: Frame,
  dal: Dal,
  claimCode?: string
): Promise<DisplayResponse> {
  const base = {
	// TRMNL-compatibility
    status: 0, // TRMNL firmware: 0 = normal, 202 = not registered, 500 = reset
    refresh_rate: DEFAULT_REFRESH_RATE,
    update_firmware: false,
    reset_firmware: false,
  };

  if (!frame.ownerId && claimCode) {
    return {
      ...base,
      image_url: getClaimImageUrl(frame.friendlyId, claimCode),
      filename: "claim.bmp",
    };
  }

  if (!frame.currentAlbumId) {
    return {
      ...base,
      image_url: getFallbackUrl("no-album"),
      filename: "no-album.png",
    };
  }

  const canvasResult = await dal.getCanvasAtIndex(
    frame.currentAlbumId,
    frame.currentIndex ?? 0
  );

  if (!canvasResult.ok) {
    return {
      ...base,
      image_url: getFallbackUrl("empty-album"),
      filename: "empty-album.png",
    };
  }

  const canvas = canvasResult.data;

  const image = await getCanvasImageUrl(canvas, dal);

  return {
    ...base,
    image_url: image.url.startsWith("/") ? getFullUrl(image.url) : image.url,
    filename: image.filename,
  };
}

/**
 * Composite strokes newer than compositedAt onto canvas image.
 * Called on device poll to bake in drawing changes.
 * Returns the new compositedAt timestamp if compositing happened, null otherwise.
 */
export async function compositeNewStrokes(
  canvas: { id: string; imageId: string; compositedAt: string | null },
  dal: Dal
): Promise<string | null> {
  const strokesResult = canvas.compositedAt
    ? await dal.getStrokesSince(canvas.id, canvas.compositedAt)
    : await dal.getStrokesForCanvas(canvas.id);

  if (!strokesResult.ok) return null;

  const strokes = strokesResult.data;
  if (strokes.length === 0) return null;

  let baseImage = await imageStorage.get(canvas.imageId);
  if (!baseImage) {
    baseImage = await generateBlankCanvas();
  }

  const composited = await compositeStrokes(baseImage, strokes);

  await imageStorage.upload(canvas.imageId, composited);

  let newCompositedAt: string | null = null;
  const newestStroke = strokes[strokes.length - 1];
  if (newestStroke?.createdAt) {
    const updateResult = await dal.updateCanvasCompositedAt(canvas.id, newestStroke.createdAt);
    if (!updateResult.ok) {
      console.error("Failed to update compositedAt:", updateResult.error);
    }
    newCompositedAt = newestStroke.createdAt;
  }

  const oneHourAgo = new Date(Date.now() - STROKE_RETENTION).toISOString();
  const deleteResult = await dal.deleteStrokesOlderThan(canvas.id, oneHourAgo);
  if (!deleteResult.ok) {
    console.error("Failed to delete old strokes:", deleteResult.error);
  }

  return newCompositedAt;
}

/**
 * Composite pending strokes and return a cache-busted image URL and filename.
 * This is the standard way to get a canvas image URL — ensures
 * the image is up-to-date and the URL busts caches when content changes.
 * Always returns a valid URL, even if compositing fails.
 *
 * The filename changes when the image content changes, which is required
 * by TRMNL firmware to trigger a re-download (it deduplicates by filename).
 */
export async function getCanvasImageUrl(
  canvas: { id: string; imageId: string; compositedAt: string | null },
  dal: Dal
): Promise<{ url: string; filename: string }> {
  let compositedAt = canvas.compositedAt;
  try {
    const newCompositedAt = await compositeNewStrokes(canvas, dal);
    if (newCompositedAt) compositedAt = newCompositedAt;
  } catch {
    // Fall back to existing compositedAt for cache-busting
  }
  const url = canvasImageUrl(canvas.imageId, compositedAt);
  const filename = compositedAt
    ? `${canvas.imageId}-${compositedAt}.png`
    : `${canvas.imageId}.png`;
  return { url, filename };
}

function getFullUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${env.BASE_URL}${path}`;
}

function getClaimImageUrl(friendlyId: string, claimCode: string): string {
  return `${env.BASE_URL}/api/claim-image?id=${friendlyId}&code=${claimCode}`;
}

function getFallbackUrl(type: "no-album" | "empty-album"): string {
  return `${env.BASE_URL}/fallback/${type}.png`;
}
