import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql, relations } from "drizzle-orm";

// camelCase TS properties, snake_case DB columns

export const person = sqliteTable("person", {
  id: text("id").primaryKey(),
  name: text("name"),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const frame = sqliteTable(
  "frame",
  {
    id: text("id").primaryKey(),
    friendlyId: text("friendly_id").notNull().unique(),
    macAddress: text("mac_address").notNull().unique(),
    apiKey: text("api_key").notNull().unique(),
    name: text("name"),
    ownerId: text("owner_id").references(() => person.id),
    currentAlbumId: text("current_album_id").references(() => album.id),
    currentIndex: integer("current_index").default(0),
    claimedAt: text("claimed_at"),
    lastSeenAt: text("last_seen_at"),
    batteryVoltage: real("battery_voltage"),
    firmwareVersion: text("firmware_version"),
    rssi: integer("rssi"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_frame_mac").on(table.macAddress),
    index("idx_frame_api_key").on(table.apiKey),
    index("idx_frame_friendly_id").on(table.friendlyId),
    index("idx_frame_owner_name").on(table.ownerId, table.name),
    uniqueIndex("frame_owner_name_unique").on(table.ownerId, table.name),
  ]
);

export const album = sqliteTable("album", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => person.id),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const canvas = sqliteTable("canvas", {
  id: text("id").primaryKey(),
  imageId: text("image_id").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  compositedAt: text("composited_at"), // last time strokes were baked into image
});

export const canvasUser = sqliteTable(
  "canvas_user",
  {
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvas.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    role: text("role").default("owner"),
    addedAt: text("added_at").default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.canvasId, table.userId] })]
);

export const canvasInvite = sqliteTable(
  "canvas_invite",
  {
    token: text("token").primaryKey(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvas.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => person.id),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("idx_canvas_invite_canvas").on(table.canvasId)]
);

export const albumCanvas = sqliteTable(
  "album_canvas",
  {
    albumId: text("album_id")
      .notNull()
      .references(() => album.id, { onDelete: "cascade" }),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvas.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    addedAt: text("added_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.albumId, table.canvasId] }),
    index("idx_album_canvas_position").on(table.albumId, table.position),
  ]
);

export const rateLimit = sqliteTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: integer("window_start").notNull(),
});

export const stroke = sqliteTable(
  "stroke",
  {
    id: text("id").primaryKey(),
    canvasId: text("canvas_id")
      .notNull()
      .references(() => canvas.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => person.id),
    data: text("data").notNull(), // JSON: {points, color, size, tool}
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_stroke_canvas_created").on(table.canvasId, table.createdAt),
  ]
);

export const personRelations = relations(person, ({ many }) => ({
  frames: many(frame),
  albums: many(album),
  canvasUsers: many(canvasUser),
}));

export const frameRelations = relations(frame, ({ one }) => ({
  owner: one(person, {
    fields: [frame.ownerId],
    references: [person.id],
  }),
  currentAlbum: one(album, {
    fields: [frame.currentAlbumId],
    references: [album.id],
  }),
}));

export const albumRelations = relations(album, ({ one, many }) => ({
  owner: one(person, {
    fields: [album.ownerId],
    references: [person.id],
  }),
  albumCanvases: many(albumCanvas),
}));

export const canvasRelations = relations(canvas, ({ many }) => ({
  canvasUsers: many(canvasUser),
  canvasInvites: many(canvasInvite),
  albumCanvases: many(albumCanvas),
  strokes: many(stroke),
}));

export const canvasInviteRelations = relations(canvasInvite, ({ one }) => ({
  canvas: one(canvas, {
    fields: [canvasInvite.canvasId],
    references: [canvas.id],
  }),
  creator: one(person, {
    fields: [canvasInvite.createdBy],
    references: [person.id],
  }),
}));

export const canvasUserRelations = relations(canvasUser, ({ one }) => ({
  canvas: one(canvas, {
    fields: [canvasUser.canvasId],
    references: [canvas.id],
  }),
  user: one(person, {
    fields: [canvasUser.userId],
    references: [person.id],
  }),
}));

export const albumCanvasRelations = relations(albumCanvas, ({ one }) => ({
  album: one(album, {
    fields: [albumCanvas.albumId],
    references: [album.id],
  }),
  canvas: one(canvas, {
    fields: [albumCanvas.canvasId],
    references: [canvas.id],
  }),
}));

export const strokeRelations = relations(stroke, ({ one }) => ({
  canvas: one(canvas, {
    fields: [stroke.canvasId],
    references: [canvas.id],
  }),
  user: one(person, {
    fields: [stroke.userId],
    references: [person.id],
  }),
}));

export type Person = typeof person.$inferSelect;
export type NewPerson = typeof person.$inferInsert;

export type Frame = typeof frame.$inferSelect;
export type NewFrame = typeof frame.$inferInsert;

export type Album = typeof album.$inferSelect;
export type NewAlbum = typeof album.$inferInsert;

export type Canvas = typeof canvas.$inferSelect;
export type NewCanvas = typeof canvas.$inferInsert;

export type CanvasUser = typeof canvasUser.$inferSelect;
export type NewCanvasUser = typeof canvasUser.$inferInsert;

export type AlbumCanvas = typeof albumCanvas.$inferSelect;
export type NewAlbumCanvas = typeof albumCanvas.$inferInsert;

export type CanvasInvite = typeof canvasInvite.$inferSelect;
export type NewCanvasInvite = typeof canvasInvite.$inferInsert;

export type RateLimit = typeof rateLimit.$inferSelect;
export type NewRateLimit = typeof rateLimit.$inferInsert;

export type Stroke = typeof stroke.$inferSelect;
export type NewStroke = typeof stroke.$inferInsert;
