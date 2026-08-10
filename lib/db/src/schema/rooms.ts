import {
  boolean,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const roomsTable = pgTable("mafia_rooms", {
  id: varchar("id", { length: 80 }).primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  mode: integer("mode").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("LOBBY"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roomPlayersTable = pgTable("mafia_room_players", {
  id: varchar("id", { length: 100 }).primaryKey(),
  roomId: varchar("room_id", { length: 80 })
    .notNull()
    .references(() => roomsTable.id, { onDelete: "cascade" }),
  playerId: varchar("player_id", { length: 80 }).notNull(),
  nickname: varchar("nickname", { length: 24 }).notNull(),
  avatar: varchar("avatar", { length: 120 }),
  isHost: boolean("is_host").notNull().default(false),
  isReady: boolean("is_ready").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRoomSchema = createInsertSchema(roomsTable);
export const insertRoomPlayerSchema = createInsertSchema(roomPlayersTable);

export type Room = typeof roomsTable.$inferSelect;
export type RoomPlayer = typeof roomPlayersTable.$inferSelect;