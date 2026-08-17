import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { and, eq } from "@workspace/db";
import {
  CreateRoomBody,
  CreateRoomResponse,
  GetRoomParams,
  GetRoomResponse,
  JoinRoomBody,
  JoinRoomParams,
  JoinRoomResponse,
} from "@workspace/api-zod";
import {
  db,
  roomPlayersTable,
  roomsTable,
} from "@workspace/db";

const router: IRouter = Router();

const capacities = { 7: 7, 14: 14 } as const;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function makeRoomCode(): string {
  return Math.floor(1_000_000_000 + Math.random() * 9_000_000_000)
    .toString()
    .padStart(10, "0");
}

function makeSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeAvatarFields<T extends { avatar?: string | null }>(payload: T | undefined): T | undefined {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (payload.avatar === null) {
    const { avatar, ...rest } = payload;
    return rest as T;
  }

  return payload;
}

function normalizeCreateRoomInput(body: unknown) {
  if (!body || typeof body !== "object") {
    return body;
  }

  return {
    ...(body as Record<string, unknown>),
    host: normalizeAvatarFields((body as any).host),
  };
}

async function getRoomPayload(code: string) {
  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.code, code));

  if (!room) {
    return null;
  }

  const players = await db
    .select({
      playerId: roomPlayersTable.playerId,
      nickname: roomPlayersTable.nickname,
      avatar: roomPlayersTable.avatar,
      isHost: roomPlayersTable.isHost,
      isReady: roomPlayersTable.isReady,
    })
    .from(roomPlayersTable)
    .where(eq(roomPlayersTable.roomId, room.id))
    .orderBy(roomPlayersTable.joinedAt);

  return {
    code: room.code,
    mode: room.mode as 7 | 14,
    capacity: capacities[room.mode as 7 | 14],
    status: room.status as "LOBBY" | "STARTED",
    players,
    createdAt: room.createdAt,
  };
}

router.post("/rooms", async (req, res): Promise<void> => {
  const parsed = CreateRoomBody.safeParse(normalizeCreateRoomInput(req.body));
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid room creation body");
    res.status(400).json({ error: "Données de salon invalides" });
    return;
  }

  const { mode, host } = parsed.data;
  let created = false;
  let roomPayload: Awaited<ReturnType<typeof getRoomPayload>> = null;
  const hostToken = makeSessionToken();

  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const code = makeRoomCode();
    const roomId = makeId("room");
    try {
      await db.insert(roomsTable).values({
        id: roomId,
        code,
        mode,
        status: "LOBBY",
      });
      await db.insert(roomPlayersTable).values({
        id: makeId("player"),
        roomId,
        playerId: host.playerId,
        nickname: host.nickname,
        avatar: host.avatar ?? null,
        isHost: true,
        isReady: false,
        sessionToken: hostToken,
      });
      roomPayload = await getRoomPayload(code);
      created = true;
    } catch (error) {
      req.log.warn({ err: error, attempt }, "Room code collision or insert failure");
    }
  }

  if (!roomPayload) {
    res.status(500).json({ error: "Impossible de créer le salon" });
    return;
  }

  res.status(201).json(CreateRoomResponse.parse({ ...roomPayload, sessionToken: hostToken }));
});

router.get("/rooms/:code", async (req, res): Promise<void> => {
  const parsed = GetRoomParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Code de groupe invalide." });
    return;
  }

  const roomPayload = await getRoomPayload(parsed.data.code);
  if (!roomPayload) {
    res.status(404).json({ error: "Ce groupe n'existe plus." });
    return;
  }

  res.json(GetRoomResponse.parse(roomPayload));
});

router.post("/rooms/:code", async (req, res): Promise<void> => {
  const params = JoinRoomParams.safeParse(req.params);
  const body = JoinRoomBody.safeParse(normalizeAvatarFields(req.body));
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Informations de joueur invalides" });
    return;
  }

  const [room] = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.code, params.data.code));
  if (!room) {
    res.status(404).json({ error: "Ce groupe n'existe plus." });
    return;
  }
  if (room.status !== "LOBBY") {
    res.status(400).json({ error: "La partie a déjà commencé." });
    return;
  }

  const existing = await db
    .select()
    .from(roomPlayersTable)
    .where(
      and(
        eq(roomPlayersTable.roomId, room.id),
        eq(roomPlayersTable.playerId, body.data.playerId),
      ),
    );

  let playerToken: string;

  if (existing.length === 0) {
    const players = await db
      .select({ id: roomPlayersTable.id })
      .from(roomPlayersTable)
      .where(eq(roomPlayersTable.roomId, room.id));
    const capacity = capacities[room.mode as 7 | 14];
    if (players.length >= capacity) {
      res.status(400).json({ error: "Le groupe est complet." });
      return;
    }
    playerToken = makeSessionToken();
    await db.insert(roomPlayersTable).values({
      id: makeId("player"),
      roomId: room.id,
      playerId: body.data.playerId,
      nickname: body.data.nickname,
      avatar: body.data.avatar ?? null,
      isHost: false,
      isReady: false,
      sessionToken: playerToken,
    });
  } else {
    playerToken = existing[0].sessionToken ?? makeSessionToken();
    if (!existing[0].sessionToken) {
      await db
        .update(roomPlayersTable)
        .set({ sessionToken: playerToken })
        .where(eq(roomPlayersTable.id, existing[0].id));
    }
  }

  const roomPayload = await getRoomPayload(room.code);
  if (!roomPayload) {
    res.status(404).json({ error: "Ce groupe n'existe plus." });
    return;
  }
  res.json(JoinRoomResponse.parse({ ...roomPayload, sessionToken: playerToken }));
});

export default router;



