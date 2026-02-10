import { env } from "../env";
import { R2ImageStorage } from "./r2";
import { LocalImageStorage } from "./local";
import type { ImageStorage } from "./types";

export type { ImageStorage } from "./types";

export function createImageStorage(): ImageStorage {
  return env.isR2Configured ? new R2ImageStorage() : new LocalImageStorage();
}

export const imageStorage = createImageStorage();

/** Append ?v={compositedAt} cache-buster to an image URL. */
export function cacheBustedUrl(url: string, compositedAt: string | null): string {
  if (!compositedAt) return url;
  return `${url}?v=${encodeURIComponent(compositedAt)}`;
}

/** Cache-busted image URL for a canvas. Use this instead of bare imageStorage.getUrl(). */
export function canvasImageUrl(imageId: string, compositedAt: string | null): string {
  return cacheBustedUrl(imageStorage.getUrl(imageId), compositedAt);
}
