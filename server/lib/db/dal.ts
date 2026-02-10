import { eq, and, sql, desc, asc, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Database } from "./client";
import {
  person,
  frame,
  album,
  canvas,
  canvasUser,
  canvasInvite,
  albumCanvas,
  stroke,
  type Frame,
  type Album,
  type Canvas,
  type Person,
  type Stroke,
} from "./schema";
import { canvasRoleSchema, type CanvasRole } from "@/lib/canvas/roles";

export type DalResult<T, E extends string = never> =
  | { ok: true; data: T }
  | { ok: false; error: E | "UNEXPECTED" };

const ok = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });
const err = <E extends string>(error: E): { ok: false; error: E } => ({
  ok: false,
  error,
});

// Parse SQLite constraint errors from Drizzle's error cause chain
function parseDbError(e: unknown): "FK_VIOLATION" | "UNIQUE_VIOLATION" | "UNEXPECTED" {
  const cause = (e as { cause?: { message?: string } })?.cause;
  const message = cause?.message ?? "";

  if (message.includes("SQLITE_CONSTRAINT_FOREIGNKEY")) {
    return "FK_VIOLATION";
  }
  if (message.includes("SQLITE_CONSTRAINT_UNIQUE") || message.includes("SQLITE_CONSTRAINT_PRIMARYKEY")) {
    return "UNIQUE_VIOLATION";
  }
  return "UNEXPECTED";
}

function generateFriendlyId(): string {
  // no O, 0, I, 1
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateApiKey(): string {
  return `ditto_${nanoid(32)}`;
}

export interface Dal {
  getFrame(id: string): Promise<DalResult<Frame, "NOT_FOUND">>;
  getFrameByMac(mac: string): Promise<DalResult<Frame, "NOT_FOUND">>;
  getFrameByApiKey(apiKey: string): Promise<DalResult<Frame, "NOT_FOUND">>;
  getFrameByFriendlyId(friendlyId: string): Promise<DalResult<Frame, "NOT_FOUND">>;
  getFrameByNameForUser(name: string, userId: string): Promise<DalResult<Frame, "NOT_FOUND">>;
  getFramesForUser(userId: string): Promise<DalResult<Frame[]>>;
  createFrame(mac: string): Promise<DalResult<Frame, "DUPLICATE_MAC">>;
  claimFrame(frameId: string, ownerId: string, name?: string): Promise<DalResult<void, "FK_VIOLATION" | "DUPLICATE_NAME">>;
  setFrameAlbum(frameId: string, albumId: string): Promise<DalResult<void, "FK_VIOLATION">>;
  clearFrameAlbum(frameId: string): Promise<DalResult<void>>;
  advanceFrameIndex(frameId: string, delta?: number): Promise<DalResult<void>>;
  setFrameIndex(frameId: string, index: number): Promise<DalResult<void>>;
  updateFrameTelemetry(
    frameId: string,
    data: { batteryVoltage?: number; firmwareVersion?: string; rssi?: number }
  ): Promise<DalResult<void>>;
  releaseFrame(frameId: string): Promise<DalResult<void, "NOT_FOUND">>;
  deleteFrame(frameId: string): Promise<DalResult<void, "NOT_FOUND">>;
  isNameTaken(name: string, userId: string): Promise<DalResult<boolean>>;

  createAlbum(name: string, ownerId: string): Promise<DalResult<Album, "FK_VIOLATION">>;
  getAlbum(id: string): Promise<DalResult<Album, "NOT_FOUND">>;
  deleteAlbum(albumId: string): Promise<DalResult<void, "NOT_FOUND">>;

  createCanvasWithOwner(imageId: string, ownerId: string): Promise<DalResult<Canvas, "FK_VIOLATION">>;
  getCanvasesForUser(userId: string): Promise<DalResult<(Canvas & { role: CanvasRole })[]>>;
  getOrphanedCanvasesForUser(userId: string): Promise<DalResult<(Canvas & { role: CanvasRole })[]>>;
  getAlbumsWithCanvases(userId: string): Promise<DalResult<(Album & { canvases: Canvas[] })[]>>;
  getAlbumsForUser(userId: string): Promise<DalResult<Album[]>>;
  deleteCanvas(canvasId: string): Promise<DalResult<{ imageId: string }, "NOT_FOUND">>;
  addCanvasToAlbum(albumId: string, canvasId: string): Promise<DalResult<void, "FK_VIOLATION" | "DUPLICATE">>;
  removeCanvasFromAlbum(albumId: string, canvasId: string): Promise<DalResult<void>>;
  moveCanvasInAlbum(albumId: string, canvasId: string, direction: "up" | "down"): Promise<DalResult<void>>;
  getCanvasAtIndex(albumId: string, index: number): Promise<DalResult<Canvas, "NOT_FOUND">>;
  getCanvasesInAlbum(albumId: string): Promise<DalResult<Canvas[]>>;

  getPerson(id: string): Promise<DalResult<Person, "NOT_FOUND">>;
  ensurePerson(id: string, name?: string | null): Promise<DalResult<void>>;
  upsertPerson(id: string, name: string): Promise<DalResult<void>>;

  checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<DalResult<{ allowed: boolean; remaining: number }>>;

  getStrokesForCanvas(canvasId: string): Promise<DalResult<Stroke[]>>;
  getStrokesSince(canvasId: string, since: string): Promise<DalResult<Stroke[]>>;
  createStroke(canvasId: string, userId: string | null, data: string): Promise<DalResult<Stroke>>;
  deleteStrokesOlderThan(canvasId: string, cutoff: string): Promise<DalResult<void>>;
  getCanvas(id: string): Promise<DalResult<Canvas, "NOT_FOUND">>;
  updateCanvasCompositedAt(canvasId: string, compositedAt: string): Promise<DalResult<void>>;
  getUserCanvasRole(canvasId: string, userId: string): Promise<DalResult<CanvasRole, "NO_USER">>;
  getCanvasUsers(canvasId: string): Promise<DalResult<{ userId: string; name: string | null; role: CanvasRole; addedAt: string | null }[]>>;
  addCanvasUser(canvasId: string, userId: string, role: CanvasRole): Promise<DalResult<void, "DUPLICATE" | "FK_VIOLATION">>;
  removeCanvasUser(canvasId: string, userId: string): Promise<DalResult<void, "LAST_OWNER">>;
  updateCanvasUserRole(canvasId: string, userId: string, role: CanvasRole): Promise<DalResult<void, "LAST_OWNER">>;

  createCanvasInvite(canvasId: string, role: CanvasRole, createdBy: string, expiresAt: string): Promise<DalResult<{ token: string }>>;
  getCanvasInvite(token: string): Promise<DalResult<{ token: string; canvasId: string; role: CanvasRole; createdBy: string; expiresAt: string }, "NOT_FOUND" | "EXPIRED">>;
  deleteCanvasInvite(token: string): Promise<DalResult<void>>;
  listCanvasInvites(canvasId: string): Promise<DalResult<{ token: string; role: CanvasRole; createdBy: string; createdAt: string | null; expiresAt: string }[]>>;
}

export type { Frame, Album, Canvas, Person, Stroke };

export function createDal(db: Database): Dal {
  const dal: Dal = {
    async getFrame(id) {
      try {
        const result = await db
          .select()
          .from(frame)
          .where(eq(frame.id, id))
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getFrameByMac(mac) {
      try {
        const result = await db
          .select()
          .from(frame)
          .where(eq(frame.macAddress, mac))
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getFrameByApiKey(apiKey) {
      try {
        const result = await db
          .select()
          .from(frame)
          .where(eq(frame.apiKey, apiKey))
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getFrameByFriendlyId(friendlyId) {
      try {
        const result = await db
          .select()
          .from(frame)
          .where(sql`${frame.friendlyId} = ${friendlyId} COLLATE NOCASE`)
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getFrameByNameForUser(name, userId) {
      try {
        const result = await db
          .select()
          .from(frame)
          .where(
            and(
              sql`${frame.name} = ${name} COLLATE NOCASE`,
              eq(frame.ownerId, userId)
            )
          )
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getFramesForUser(userId) {
      try {
        const result = await db
          .select()
          .from(frame)
          .where(eq(frame.ownerId, userId))
          .orderBy(desc(frame.claimedAt));
        return ok(result);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async createFrame(mac) {
      try {
        const id = nanoid();
        const friendlyId = generateFriendlyId();
        const apiKey = generateApiKey();

        await db.insert(frame).values({
          id,
          friendlyId,
          macAddress: mac,
          apiKey,
        });

        const created = await dal.getFrameByMac(mac);
        if (!created.ok) return err("UNEXPECTED");
        return ok(created.data);
      } catch (e) {
        const dbErr = parseDbError(e);
        if (dbErr === "UNIQUE_VIOLATION") return err("DUPLICATE_MAC");
        return err("UNEXPECTED");
      }
    },

    async claimFrame(frameId, ownerId, name) {
      try {
        await db
          .update(frame)
          .set({
            ownerId,
            name: name ?? null,
            claimedAt: sql`datetime('now')`,
          })
          .where(eq(frame.id, frameId));
        return ok(undefined);
      } catch (e) {
        const dbErr = parseDbError(e);
        if (dbErr === "FK_VIOLATION") return err("FK_VIOLATION");
        if (dbErr === "UNIQUE_VIOLATION") return err("DUPLICATE_NAME");
        return err("UNEXPECTED");
      }
    },

    async setFrameAlbum(frameId, albumId) {
      try {
        await db
          .update(frame)
          .set({
            currentAlbumId: albumId,
            currentIndex: 0,
          })
          .where(eq(frame.id, frameId));
        return ok(undefined);
      } catch (e) {
        const dbErr = parseDbError(e);
        if (dbErr === "FK_VIOLATION") return err("FK_VIOLATION");
        return err("UNEXPECTED");
      }
    },

    async clearFrameAlbum(frameId) {
      try {
        await db
          .update(frame)
          .set({
            currentAlbumId: null,
            currentIndex: 0,
          })
          .where(eq(frame.id, frameId));
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async advanceFrameIndex(frameId, delta = 1) {
      try {
        return await db.transaction(async (tx) => {
          const result = await tx
            .select({
              currentAlbumId: frame.currentAlbumId,
              currentIndex: frame.currentIndex,
              canvasCount: sql<number>`COUNT(${albumCanvas.canvasId})`,
            })
            .from(frame)
            .leftJoin(albumCanvas, eq(frame.currentAlbumId, albumCanvas.albumId))
            .where(eq(frame.id, frameId))
            .groupBy(frame.id)
            .limit(1);

          if (!result[0]) return ok(undefined);
          const { currentAlbumId, currentIndex, canvasCount } = result[0];
          if (!currentAlbumId) return ok(undefined);

          const size = canvasCount ?? 0;
          if (size === 0) return ok(undefined);

          const current = currentIndex ?? 0;
          const newIndex = (((current + delta) % size) + size) % size;

          await tx
            .update(frame)
            .set({ currentIndex: newIndex })
            .where(eq(frame.id, frameId));
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async setFrameIndex(frameId, index) {
      try {
        return await db.transaction(async (tx) => {
          const result = await tx
            .select({
              currentAlbumId: frame.currentAlbumId,
              canvasCount: sql<number>`COUNT(${albumCanvas.canvasId})`,
            })
            .from(frame)
            .leftJoin(albumCanvas, eq(frame.currentAlbumId, albumCanvas.albumId))
            .where(eq(frame.id, frameId))
            .groupBy(frame.id)
            .limit(1);

          if (!result[0]) return ok(undefined);
          const { currentAlbumId, canvasCount } = result[0];
          if (!currentAlbumId) return ok(undefined);

          const size = canvasCount ?? 0;
          if (size === 0) return ok(undefined);

          const newIndex = Math.max(0, Math.min(index, size - 1));

          await tx
            .update(frame)
            .set({ currentIndex: newIndex })
            .where(eq(frame.id, frameId));
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async updateFrameTelemetry(frameId, data) {
      try {
        await db
          .update(frame)
          .set({
            lastSeenAt: sql`datetime('now')`,
            batteryVoltage: sql`COALESCE(${data.batteryVoltage ?? null}, ${frame.batteryVoltage})`,
            firmwareVersion: sql`COALESCE(${data.firmwareVersion ?? null}, ${frame.firmwareVersion})`,
            rssi: sql`COALESCE(${data.rssi ?? null}, ${frame.rssi})`,
          })
          .where(eq(frame.id, frameId));
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async releaseFrame(frameId) {
      try {
        return await db.transaction(async (tx) => {
          const rows = await tx
            .select()
            .from(frame)
            .where(eq(frame.id, frameId))
            .limit(1);
          if (!rows[0]) return err("NOT_FOUND");
          const { id, macAddress, friendlyId, apiKey } = rows[0];

          // delete then reinsert to guarantee all metadata is cleared
          await tx.delete(frame).where(eq(frame.id, frameId));
          await tx.insert(frame).values({ id, macAddress, friendlyId, apiKey });
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async deleteFrame(frameId) {
      try {
        return await db.transaction(async (tx) => {
          const rows = await tx
            .select({ id: frame.id })
            .from(frame)
            .where(eq(frame.id, frameId))
            .limit(1);
          if (!rows[0]) return err("NOT_FOUND");

          await tx.delete(frame).where(eq(frame.id, frameId));
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async isNameTaken(name, userId) {
      const result = await dal.getFrameByNameForUser(name, userId);
      if (!result.ok && result.error === "UNEXPECTED") return err("UNEXPECTED");
      return ok(result.ok);
    },

    async createAlbum(name, ownerId) {
      try {
        const id = nanoid();
        await db.insert(album).values({ id, name, ownerId });

        const result = await db
          .select()
          .from(album)
          .where(eq(album.id, id))
          .limit(1);
        return result[0] ? ok(result[0]) : err("UNEXPECTED");
      } catch (e) {
        const dbErr = parseDbError(e);
        if (dbErr === "FK_VIOLATION") return err("FK_VIOLATION");
        return err("UNEXPECTED");
      }
    },

    async getAlbum(id) {
      try {
        const result = await db
          .select()
          .from(album)
          .where(eq(album.id, id))
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async deleteAlbum(albumId) {
      try {
        return await db.transaction(async (tx) => {
          const rows = await tx
            .select({ id: album.id, ownerId: album.ownerId })
            .from(album)
            .where(eq(album.id, albumId))
            .limit(1);
          if (!rows[0]) return err("NOT_FOUND");
          const { ownerId } = rows[0];

          const remaining = await tx
            .select({ id: album.id })
            .from(album)
            .where(and(eq(album.ownerId, ownerId), sql`${album.id} != ${albumId}`))
            .orderBy(asc(album.createdAt))
            .limit(1);
          const fallbackId = remaining[0]?.id ?? null;

          await tx
            .update(frame)
            .set({ currentAlbumId: fallbackId, currentIndex: 0 })
            .where(eq(frame.currentAlbumId, albumId));

          await tx.delete(album).where(eq(album.id, albumId));
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getAlbumsWithCanvases(userId) {
      try {
        const rows = await db
          .select({
            albumId: album.id,
            albumName: album.name,
            albumOwnerId: album.ownerId,
            albumCreatedAt: album.createdAt,
            canvasId: canvas.id,
            canvasImageId: canvas.imageId,
            canvasCreatedAt: canvas.createdAt,
            canvasCompositedAt: canvas.compositedAt,
            position: albumCanvas.position,
          })
          .from(album)
          .leftJoin(albumCanvas, eq(album.id, albumCanvas.albumId))
          .leftJoin(canvas, eq(albumCanvas.canvasId, canvas.id))
          .where(eq(album.ownerId, userId))
          .orderBy(desc(album.createdAt), asc(albumCanvas.position));

        const albumMap = new Map<string, Album & { canvases: Canvas[] }>();
        for (const row of rows) {
          let entry = albumMap.get(row.albumId);
          if (!entry) {
            entry = {
              id: row.albumId,
              name: row.albumName,
              ownerId: row.albumOwnerId,
              createdAt: row.albumCreatedAt,
              canvases: [],
            };
            albumMap.set(row.albumId, entry);
          }
          if (row.canvasId && row.canvasImageId) {
            entry.canvases.push({
              id: row.canvasId,
              imageId: row.canvasImageId,
              createdAt: row.canvasCreatedAt,
              compositedAt: row.canvasCompositedAt,
            });
          }
        }
        return ok([...albumMap.values()]);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getAlbumsForUser(userId) {
      try {
        const result = await db
          .select()
          .from(album)
          .where(eq(album.ownerId, userId))
          .orderBy(desc(album.createdAt));
        return ok(result);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async createCanvasWithOwner(imageId, ownerId) {
      try {
        return await db.transaction(async (tx) => {
          const id = nanoid();

          await tx.insert(canvas).values({ id, imageId });
          await tx.insert(canvasUser).values({
            canvasId: id,
            userId: ownerId,
            role: "owner",
          });

          const result = await tx
            .select()
            .from(canvas)
            .where(eq(canvas.id, id))
            .limit(1);
          return result[0] ? ok(result[0]) : err("UNEXPECTED");
        });
      } catch (e) {
        const dbErr = parseDbError(e);
        if (dbErr === "FK_VIOLATION") return err("FK_VIOLATION");
        return err("UNEXPECTED");
      }
    },

    async getCanvasesForUser(userId) {
      try {
        const result = await db
          .select({
            id: canvas.id,
            imageId: canvas.imageId,
            createdAt: canvas.createdAt,
            compositedAt: canvas.compositedAt,
            role: canvasUser.role,
          })
          .from(canvas)
          .innerJoin(canvasUser, eq(canvas.id, canvasUser.canvasId))
          .where(eq(canvasUser.userId, userId))
          .orderBy(desc(canvas.createdAt));
        return ok(result.map((r) => ({ ...r, role: canvasRoleSchema.parse(r.role) })));
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getOrphanedCanvasesForUser(userId) {
      try {
        const result = await db
          .select({
            id: canvas.id,
            imageId: canvas.imageId,
            createdAt: canvas.createdAt,
            compositedAt: canvas.compositedAt,
            role: canvasUser.role,
          })
          .from(canvas)
          .innerJoin(canvasUser, eq(canvas.id, canvasUser.canvasId))
          .where(
            and(
              eq(canvasUser.userId, userId),
              sql`${canvas.id} NOT IN (
                SELECT ${albumCanvas.canvasId} FROM ${albumCanvas}
                INNER JOIN ${album} ON ${albumCanvas.albumId} = ${album.id}
                WHERE ${album.ownerId} = ${userId}
              )`
            )
          )
          .orderBy(desc(canvas.createdAt));
        return ok(result.map((r) => ({ ...r, role: canvasRoleSchema.parse(r.role) })));
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async deleteCanvas(canvasId) {
      try {
        return await db.transaction(async (tx) => {
          const canvasResult = await tx
            .select({ imageId: canvas.imageId })
            .from(canvas)
            .where(eq(canvas.id, canvasId))
            .limit(1);

          if (!canvasResult[0]) return err("NOT_FOUND");
          const { imageId } = canvasResult[0];

          await tx.delete(canvas).where(eq(canvas.id, canvasId));

          return ok({ imageId });
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async addCanvasToAlbum(albumId, canvasId) {
      try {
        return await db.transaction(async (tx) => {
          const result = await tx
            .select({ nextPos: sql<number>`COALESCE(MAX(${albumCanvas.position}), -1) + 1` })
            .from(albumCanvas)
            .where(eq(albumCanvas.albumId, albumId));

          const nextPos = result[0]?.nextPos ?? 0;

          await tx.insert(albumCanvas).values({
            albumId,
            canvasId,
            position: nextPos,
          });
          return ok(undefined);
        });
      } catch (e) {
        const dbErr = parseDbError(e);
        if (dbErr === "FK_VIOLATION") return err("FK_VIOLATION");
        if (dbErr === "UNIQUE_VIOLATION") return err("DUPLICATE");
        return err("UNEXPECTED");
      }
    },

    async removeCanvasFromAlbum(albumId, canvasId) {
      try {
        await db
          .delete(albumCanvas)
          .where(
            and(
              eq(albumCanvas.albumId, albumId),
              eq(albumCanvas.canvasId, canvasId)
            )
          );
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async moveCanvasInAlbum(albumId, canvasId, direction) {
      try {
        return await db.transaction(async (tx) => {
          const current = await tx
            .select({ position: albumCanvas.position })
            .from(albumCanvas)
            .where(
              and(
                eq(albumCanvas.albumId, albumId),
                eq(albumCanvas.canvasId, canvasId)
              )
            )
            .limit(1);

          if (!current[0]) return ok(undefined);
          const currentPos = current[0].position;
          const targetPos = direction === "up" ? currentPos - 1 : currentPos + 1;

          const adjacent = await tx
            .select({ canvasId: albumCanvas.canvasId })
            .from(albumCanvas)
            .where(
              and(
                eq(albumCanvas.albumId, albumId),
                eq(albumCanvas.position, targetPos)
              )
            )
            .limit(1);

          if (!adjacent[0]) return ok(undefined);
          const adjacentId = adjacent[0].canvasId;

          await tx
            .update(albumCanvas)
            .set({ position: targetPos })
            .where(
              and(
                eq(albumCanvas.albumId, albumId),
                eq(albumCanvas.canvasId, canvasId)
              )
            );

          await tx
            .update(albumCanvas)
            .set({ position: currentPos })
            .where(
              and(
                eq(albumCanvas.albumId, albumId),
                eq(albumCanvas.canvasId, adjacentId)
              )
            );
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getCanvasAtIndex(albumId, index) {
      try {
        const countResult = await db
          .select({ cnt: count() })
          .from(albumCanvas)
          .where(eq(albumCanvas.albumId, albumId));

        const size = countResult[0]?.cnt ?? 0;
        if (size === 0) return err("NOT_FOUND");

        const wrappedIndex = ((index % size) + size) % size;

        const result = await db
          .select({
            id: canvas.id,
            imageId: canvas.imageId,
            createdAt: canvas.createdAt,
            compositedAt: canvas.compositedAt,
          })
          .from(canvas)
          .innerJoin(albumCanvas, eq(canvas.id, albumCanvas.canvasId))
          .where(eq(albumCanvas.albumId, albumId))
          .orderBy(asc(albumCanvas.position))
          .limit(1)
          .offset(wrappedIndex);

        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getCanvasesInAlbum(albumId) {
      try {
        const result = await db
          .select({
            id: canvas.id,
            imageId: canvas.imageId,
            createdAt: canvas.createdAt,
            compositedAt: canvas.compositedAt,
          })
          .from(canvas)
          .innerJoin(albumCanvas, eq(canvas.id, albumCanvas.canvasId))
          .where(eq(albumCanvas.albumId, albumId))
          .orderBy(asc(albumCanvas.position));
        return ok(result);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getPerson(id) {
      try {
        const result = await db
          .select()
          .from(person)
          .where(eq(person.id, id))
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async ensurePerson(id, name) {
      try {
        await db
          .insert(person)
          .values({ id, name: name ?? null })
          .onConflictDoNothing();
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async upsertPerson(id, name) {
      try {
        await db
          .insert(person)
          .values({ id, name })
          .onConflictDoUpdate({
            target: person.id,
            set: { name },
          });
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async checkRateLimit(key, limit, windowSeconds) {
      try {
        const result = await db.run(sql`
          INSERT INTO rate_limit (key, count, window_start)
          VALUES (${key}, 1, unixepoch())
          ON CONFLICT(key) DO UPDATE SET
            count = CASE
              WHEN window_start < unixepoch() - ${windowSeconds} THEN 1
              ELSE count + 1
            END,
            window_start = CASE
              WHEN window_start < unixepoch() - ${windowSeconds} THEN unixepoch()
              ELSE window_start
            END
          RETURNING count
        `);

        const countValue = (result.rows[0] as unknown as { count: number })?.count ?? 1;
        const allowed = countValue <= limit;
        return ok({ allowed, remaining: Math.max(0, limit - countValue) });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getStrokesForCanvas(canvasId) {
      try {
        const result = await db
          .select()
          .from(stroke)
          .where(eq(stroke.canvasId, canvasId))
          .orderBy(asc(stroke.createdAt));
        return ok(result);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getStrokesSince(canvasId, since) {
      try {
        const result = await db
          .select()
          .from(stroke)
          .where(
            and(
              eq(stroke.canvasId, canvasId),
              sql`${stroke.createdAt} > ${since}`
            )
          )
          .orderBy(asc(stroke.createdAt));
        return ok(result);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async createStroke(canvasId, userId, data) {
      try {
        const id = nanoid();
        await db.insert(stroke).values({
          id,
          canvasId,
          userId,
          data,
        });

        const result = await db
          .select()
          .from(stroke)
          .where(eq(stroke.id, id))
          .limit(1);
        return result[0] ? ok(result[0]) : err("UNEXPECTED");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async deleteStrokesOlderThan(canvasId, cutoff) {
      try {
        await db
          .delete(stroke)
          .where(
            and(
              eq(stroke.canvasId, canvasId),
              sql`${stroke.createdAt} < ${cutoff}`
            )
          );
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getCanvas(id) {
      try {
        const result = await db
          .select()
          .from(canvas)
          .where(eq(canvas.id, id))
          .limit(1);
        return result[0] ? ok(result[0]) : err("NOT_FOUND");
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async updateCanvasCompositedAt(canvasId, compositedAt) {
      try {
        await db
          .update(canvas)
          .set({ compositedAt })
          .where(eq(canvas.id, canvasId));
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getUserCanvasRole(canvasId, userId) {
      try {
        const result = await db
          .select({ role: canvasUser.role })
          .from(canvasUser)
          .where(
            and(eq(canvasUser.canvasId, canvasId), eq(canvasUser.userId, userId))
          )
          .limit(1);
        if (!result[0]) return err("NO_USER");
        return ok(canvasRoleSchema.parse(result[0].role));
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getCanvasUsers(canvasId) {
      try {
        const result = await db
          .select({
            userId: canvasUser.userId,
            name: person.name,
            role: canvasUser.role,
            addedAt: canvasUser.addedAt,
          })
          .from(canvasUser)
          .leftJoin(person, eq(canvasUser.userId, person.id))
          .where(eq(canvasUser.canvasId, canvasId));
        return ok(result.map((r) => ({ ...r, role: canvasRoleSchema.parse(r.role) })));
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async addCanvasUser(canvasId, userId, role) {
      try {
        await db.insert(canvasUser).values({ canvasId, userId, role });
        return ok(undefined);
      } catch (e) {
        const dbErr = parseDbError(e);
        if (dbErr === "UNIQUE_VIOLATION") return err("DUPLICATE");
        if (dbErr === "FK_VIOLATION") return err("FK_VIOLATION");
        return err("UNEXPECTED");
      }
    },

    async removeCanvasUser(canvasId, userId) {
      try {
        return await db.transaction(async (tx) => {
          const owners = await tx
            .select({ userId: canvasUser.userId })
            .from(canvasUser)
            .where(and(eq(canvasUser.canvasId, canvasId), eq(canvasUser.role, "owner")));

          if (owners.length === 1 && owners[0]?.userId === userId) {
            return err("LAST_OWNER");
          }

          await tx
            .delete(canvasUser)
            .where(
              and(eq(canvasUser.canvasId, canvasId), eq(canvasUser.userId, userId))
            );
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async updateCanvasUserRole(canvasId, userId, role) {
      try {
        return await db.transaction(async (tx) => {
          if (role !== "owner") {
            const owners = await tx
              .select({ userId: canvasUser.userId })
              .from(canvasUser)
              .where(and(eq(canvasUser.canvasId, canvasId), eq(canvasUser.role, "owner")));

            if (owners.length === 1 && owners[0]?.userId === userId) {
              return err("LAST_OWNER");
            }
          }

          await tx
            .update(canvasUser)
            .set({ role })
            .where(
              and(eq(canvasUser.canvasId, canvasId), eq(canvasUser.userId, userId))
            );
          return ok(undefined);
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async createCanvasInvite(canvasId, role, createdBy, expiresAt) {
      try {
        const token = nanoid();
        await db.insert(canvasInvite).values({
          token,
          canvasId,
          role,
          createdBy,
          expiresAt,
        });
        return ok({ token });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async getCanvasInvite(token) {
      try {
        const result = await db
          .select()
          .from(canvasInvite)
          .where(eq(canvasInvite.token, token))
          .limit(1);
        if (!result[0]) return err("NOT_FOUND");
        if (new Date(result[0].expiresAt) < new Date()) return err("EXPIRED");
        return ok({
          token: result[0].token,
          canvasId: result[0].canvasId,
          role: canvasRoleSchema.parse(result[0].role),
          createdBy: result[0].createdBy,
          expiresAt: result[0].expiresAt,
        });
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async deleteCanvasInvite(token) {
      try {
        await db.delete(canvasInvite).where(eq(canvasInvite.token, token));
        return ok(undefined);
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

    async listCanvasInvites(canvasId) {
      try {
        const result = await db
          .select({
            token: canvasInvite.token,
            role: canvasInvite.role,
            createdBy: canvasInvite.createdBy,
            createdAt: canvasInvite.createdAt,
            expiresAt: canvasInvite.expiresAt,
          })
          .from(canvasInvite)
          .where(eq(canvasInvite.canvasId, canvasId))
          .orderBy(desc(canvasInvite.createdAt));
        return ok(result.map((r) => ({ ...r, role: canvasRoleSchema.parse(r.role) })));
      } catch (e) {
        return err("UNEXPECTED");
      }
    },

  };

  return dal;
}
