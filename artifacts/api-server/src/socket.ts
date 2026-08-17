import { Server, type ServerOptions, type Socket } from "socket.io";
import type http from "http";
import crypto from "node:crypto";
import { and, eq } from "@workspace/db";
import {
  roomPlayersTable,
  roomsTable,
  db,
} from "@workspace/db";
import {
  GameState,
  NightActionPayload,
  advanceSpeaker,
  beginVote,
  canSubmitVote,
  createGameState,
  getCurrentSpeaker,
  getPhaseSnapshot,
  getPrivateState,
  getPublicState,
  getRequiredNightActors,
  passSpeaking,
  resolveNight,
  resolveVotes,
  submitNightAction,
  submitVote,
  allVotesCast,
  advanceFromResult,
} from "./game";

const MAX_CHAT_ENTRIES = 120;
const SPEAKING_TICK_MS = 1000;

export type LobbyPlayerState = {
  playerId: string;
  nickname: string;
  avatar: string | null;
  isHost: boolean;
  isReady: boolean;
  microphoneOn: boolean;
  connected: boolean;
};

export type LobbyChatEntry = {
  id: string;
  playerId: string;
  nickname: string;
  avatar: string | null;
  timestamp: string;
  message: string;
};

export type LobbyState = {
  code: string;
  mode: 7 | 14;
  capacity: number;
  status: "LOBBY" | "STARTED";
  createdAt: Date;
  players: LobbyPlayerState[];
  chat: LobbyChatEntry[];
  hostId: string | null;
};

const lobbyStates = new Map<string, {
  code: string;
  mode: 7 | 14;
  capacity: number;
  status: "LOBBY" | "STARTED";
  createdAt: Date;
  players: Map<string, LobbyPlayerState>;
  chat: LobbyChatEntry[];
  socketsByPlayer: Map<string, Set<Socket>>;
}>();

const gameStates = new Map<string, GameState>();
const speakingTimers = new Map<string, NodeJS.Timeout>();

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function makeSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function sanitizeMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 280);
  return normalized;
}

function ensureRoomState(code: string, roomData: {
  code: string;
  mode: 7 | 14;
  capacity: number;
  status: "LOBBY" | "STARTED";
  createdAt: Date;
  players: LobbyPlayerState[];
}) {
  let state = lobbyStates.get(code);
  if (!state) {
    state = {
      code: roomData.code,
      mode: roomData.mode,
      capacity: roomData.capacity,
      status: roomData.status,
      createdAt: roomData.createdAt,
      players: new Map(roomData.players.map((player) => [player.playerId, player])),
      chat: [],
      socketsByPlayer: new Map(),
    };
    lobbyStates.set(code, state);
  }
  return state;
}

function buildLobbyStatePayload(code: string) {
  const state = lobbyStates.get(code);
  if (!state) return null;
  const players = Array.from(state.players.values()).sort((left, right) => {
    if (left.isHost && !right.isHost) return -1;
    if (!left.isHost && right.isHost) return 1;
    return left.nickname.localeCompare(right.nickname, "en", { sensitivity: "base" });
  });
  const hostId = players.find((player) => player.isHost)?.playerId ?? null;

  return {
    code: state.code,
    mode: state.mode,
    capacity: state.capacity,
    status: state.status,
    createdAt: state.createdAt,
    players,
    chat: state.chat,
    hostId,
  } as LobbyState;
}

async function loadRoomFromDatabase(code: string) {
  const [room] = await db.select().from(roomsTable).where(eq(roomsTable.code, code));
  if (!room) return null;

  const players = await db.select({
    playerId: roomPlayersTable.playerId,
    nickname: roomPlayersTable.nickname,
    avatar: roomPlayersTable.avatar,
    isHost: roomPlayersTable.isHost,
    isReady: roomPlayersTable.isReady,
  }).from(roomPlayersTable).where(eq(roomPlayersTable.roomId, room.id)).orderBy(roomPlayersTable.joinedAt);

  return {
    code: room.code,
    mode: room.mode as 7 | 14,
    capacity: room.mode === 7 ? 7 : 14,
    status: room.status as "LOBBY" | "STARTED",
    createdAt: room.createdAt,
    players: players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      avatar: player.avatar,
      isHost: player.isHost,
      isReady: player.isReady,
      microphoneOn: false,
      connected: false,
    })),
  };
}

type RoomRecord = {
  id: string;
  code: string;
  mode: number;
  status: string;
  createdAt: Date;
};

type RoomPlayerRecord = {
  id: string;
  roomId: string;
  playerId: string;
  nickname: string;
  avatar: string | null;
  isHost: boolean;
  isReady: boolean;
  sessionToken: string | null;
};

async function getRoomAndPlayer(code: string, playerId: string): Promise<{ room: RoomRecord | null; player: RoomPlayerRecord | null; }> {
  const [room] = await db.select({
    id: roomsTable.id,
    code: roomsTable.code,
    mode: roomsTable.mode,
    status: roomsTable.status,
    createdAt: roomsTable.createdAt,
  }).from(roomsTable).where(eq(roomsTable.code, code));

  if (!room) {
    return { room: null, player: null };
  }

  const [player] = await db.select({
    id: roomPlayersTable.id,
    roomId: roomPlayersTable.roomId,
    playerId: roomPlayersTable.playerId,
    nickname: roomPlayersTable.nickname,
    avatar: roomPlayersTable.avatar,
    isHost: roomPlayersTable.isHost,
    isReady: roomPlayersTable.isReady,
    sessionToken: roomPlayersTable.sessionToken,
  }).from(roomPlayersTable).where(and(eq(roomPlayersTable.roomId, room.id), eq(roomPlayersTable.playerId, playerId)));

  return { room, player: player ?? null };
}

function broadcastLobbyState(io: Server, code: string) {
  const payload = buildLobbyStatePayload(code);
  if (!payload) return;
  io.to(code).emit("lobby:state", payload);
}

function clearSpeakingTimer(code: string) {
  const existing = speakingTimers.get(code);
  if (existing) {
    clearInterval(existing);
    speakingTimers.delete(code);
  }
}

function scheduleSpeakingTimer(io: Server, code: string) {
  clearSpeakingTimer(code);
  const interval = setInterval(() => {
    const gameState = gameStates.get(code);
    if (!gameState || gameState.phase !== "DAY_DISCUSSION") {
      clearSpeakingTimer(code);
      return;
    }
    if (gameState.speakingEndsAt && Date.now() >= gameState.speakingEndsAt) {
      advanceSpeaker(gameState);
      broadcastGameState(io, code);
      if (!getCurrentSpeaker(gameState)) {
        clearSpeakingTimer(code);
      }
    }
  }, SPEAKING_TICK_MS);
  speakingTimers.set(code, interval);
}

function startGameForRoom(io: Server, code: string) {
  const roomState = lobbyStates.get(code);
  if (!roomState || roomState.status !== "LOBBY") return false;
  const playerIds = Array.from(roomState.players.keys());
  if (playerIds.length === 0) return false;

  const gameState = createGameState(playerIds, roomState.mode);
  gameStates.set(code, gameState);
  roomState.status = "STARTED";
  broadcastLobbyState(io, code);
  broadcastGameState(io, code);
  if (gameState.phase === "DAY_DISCUSSION") {
    scheduleSpeakingTimer(io, code);
  }
  return true;
}

function broadcastGameState(io: Server, code: string) {
  const gameState = gameStates.get(code);
  if (!gameState) return;
  const publicState = getPublicState(gameState);
  io.to(code).emit("game:publicState", publicState);
  broadcastPrivateGameStates(io, code);
}

function broadcastPrivateGameStates(io: Server, code: string) {
  const gameState = gameStates.get(code);
  const roomState = lobbyStates.get(code);
  if (!gameState || !roomState) return;

  for (const [playerId, sockets] of roomState.socketsByPlayer.entries()) {
    const privateState = getPrivateState(gameState, playerId);
    if (!privateState) continue;
    for (const socket of sockets) {
      socket.emit("game:privateState", privateState);
    }
  }
}

function sendGameStateToSocket(socket: Socket, code: string, playerId: string) {
  const gameState = gameStates.get(code);
  if (!gameState) return;
  const publicState = getPublicState(gameState);
  const privateState = getPrivateState(gameState, playerId);
  socket.emit("game:publicState", publicState);
  if (privateState) {
    socket.emit("game:privateState", privateState);
  }
}

export function attachSocketServer(server: http.Server, ioOptions?: Partial<ServerOptions>) {
  const io = new Server(server, {
    cors: { origin: true },
    allowEIO3: false,
    ...ioOptions,
  });

  io.on("connection", (socket) => {
    socket.on("lobby:join", async (payload: { code: string; playerId: string; nickname: string; avatar?: string | null; sessionToken?: string }) => {
      const cleanCode = String(payload?.code ?? "").trim();
      const playerId = String(payload?.playerId ?? "").trim();
      const nickname = String(payload?.nickname ?? "").trim().slice(0, 24);
      const avatar = payload?.avatar ? String(payload.avatar).slice(0, 120) : null;
      const providedToken = payload?.sessionToken ? String(payload.sessionToken) : null;

      if (!/^[0-9]{10}$/.test(cleanCode) || !playerId || nickname.length < 2) {
        socket.emit("lobby:error", { error: "Informations de salon invalides" });
        return;
      }

      const { room, player } = await getRoomAndPlayer(cleanCode, playerId);
      if (!room) {
        socket.emit("lobby:error", { error: "Ce groupe n'existe plus." });
        return;
      }

      let authorizedToken: string;

      if (!player) {
        if (room.status !== "LOBBY") {
          socket.emit("lobby:error", { error: "La partie a déjà commencé." });
          return;
        }

        const existing = await db.select({ id: roomPlayersTable.id })
          .from(roomPlayersTable)
          .where(eq(roomPlayersTable.roomId, room.id));

        if (room.mode !== 7 && room.mode !== 14) {
          socket.emit("lobby:error", { error: "Mode de salon invalide" });
          return;
        }

        if (existing.length >= (room.mode === 7 ? 7 : 14)) {
          socket.emit("lobby:error", { error: "Le groupe est complet." });
          return;
        }

        authorizedToken = makeSessionToken();
        await db.insert(roomPlayersTable).values({
          id: makeId("player"),
          roomId: room.id,
          playerId,
          nickname,
          avatar,
          isHost: false,
          isReady: false,
          sessionToken: authorizedToken,
        });
      } else if (!player.sessionToken) {
        authorizedToken = makeSessionToken();
        await db.update(roomPlayersTable)
          .set({ sessionToken: authorizedToken })
          .where(eq(roomPlayersTable.id, player.id));
      } else {
        if (!providedToken || providedToken !== player.sessionToken) {
          socket.emit("lobby:error", { error: "Session invalide. Reconnectez-vous depuis le lobby." });
          return;
        }
        authorizedToken = player.sessionToken;
      }

      const persistedState = await loadRoomFromDatabase(cleanCode);
      if (!persistedState) {
        socket.emit("lobby:error", { error: "Une erreur est survenue" });
        return;
      }

      const state = ensureRoomState(cleanCode, persistedState);
      const existingPlayer = state.players.get(playerId);
      const playerState: LobbyPlayerState = existingPlayer
        ? { ...existingPlayer, nickname, avatar: avatar ?? existingPlayer.avatar, connected: true }
        : {
            playerId,
            nickname,
            avatar,
            isHost: false,
            isReady: false,
            microphoneOn: false,
            connected: true,
          };

      state.players.set(playerId, playerState);
      if (!state.socketsByPlayer.has(playerId)) {
        state.socketsByPlayer.set(playerId, new Set());
      }
      state.socketsByPlayer.get(playerId)?.add(socket);

      socket.data.roomCode = cleanCode;
      socket.data.playerId = playerId;
      socket.join(cleanCode);

      broadcastLobbyState(io, cleanCode);
      socket.emit("lobby:joined", { playerId, code: cleanCode, sessionToken: authorizedToken });
      if (state.status === "STARTED") {
        sendGameStateToSocket(socket, cleanCode, playerId);
      }
    });

    socket.on("lobby:setReady", async (payload: { ready: boolean }) => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      const ready = Boolean(payload?.ready);

      const { room, player } = await getRoomAndPlayer(roomCode, playerId);
      if (!room || !player) return;
      if (room.status !== "LOBBY") {
        socket.emit("lobby:error", { error: "La partie a déjà commencé." });
        return;
      }

      await db.update(roomPlayersTable).set({ isReady: ready }).where(eq(roomPlayersTable.id, player.id));
      const state = lobbyStates.get(roomCode);
      if (state?.players.has(playerId)) {
        state.players.get(playerId)!.isReady = ready;
      }
      broadcastLobbyState(io, roomCode);
    });

    socket.on("lobby:setMic", (payload: { microphoneOn: boolean }) => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      const microphoneOn = Boolean(payload?.microphoneOn);
      const state = lobbyStates.get(roomCode);
      if (!state || !state.players.has(playerId)) return;
      state.players.get(playerId)!.microphoneOn = microphoneOn;
      broadcastLobbyState(io, roomCode);
    });

    socket.on("lobby:sendMessage", (payload: { message: string }) => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      const state = lobbyStates.get(roomCode);
      const player = state?.players.get(playerId);
      if (!state || !player) return;
      const message = sanitizeMessage(payload?.message);
      if (!message) return;

      const entry: LobbyChatEntry = {
        id: makeId("chat"),
        playerId,
        nickname: player.nickname,
        avatar: player.avatar,
        timestamp: new Date().toISOString(),
        message,
      };
      state.chat.push(entry);
      if (state.chat.length > MAX_CHAT_ENTRIES) {
        state.chat.splice(0, state.chat.length - MAX_CHAT_ENTRIES);
      }
      io.to(roomCode).emit("lobby:chatMessage", entry);
      broadcastLobbyState(io, roomCode);
    });

    socket.on("lobby:startGame", async () => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;

      const state = lobbyStates.get(roomCode);
      if (!state) return;
      const player = state.players.get(playerId);
      if (!player?.isHost) {
        socket.emit("lobby:error", { error: "Seul l'hôte peut démarrer la partie" });
        return;
      }
      if (state.status !== "LOBBY") {
        socket.emit("lobby:error", { error: "La partie a déjà commencé." });
        return;
      }
      const allReady = Array.from(state.players.values()).every((slot) => slot.isReady);
      if (!allReady) {
        socket.emit("lobby:error", { error: "Tous les joueurs doivent être prêts." });
        return;
      }

      await db.update(roomsTable).set({ status: "STARTED" }).where(eq(roomsTable.code, roomCode));
      if (!startGameForRoom(io, roomCode)) {
        socket.emit("lobby:error", { error: "Impossible de démarrer la partie" });
        return;
      }

      io.to(roomCode).emit("lobby:gameStarted", { code: roomCode, startedAt: new Date().toISOString() });
    });

    socket.on("game:requestState", () => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      sendGameStateToSocket(socket, roomCode, playerId);
    });

    socket.on("game:passSpeaking", () => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      const gameState = gameStates.get(roomCode);
      if (!gameState) {
        socket.emit("game:error", { error: "Partie introuvable" });
        return;
      }
      if (!passSpeaking(gameState, playerId)) {
        socket.emit("game:error", { error: "Ce n'est pas votre tour de parole" });
        return;
      }
      broadcastGameState(io, roomCode);
      if (!getCurrentSpeaker(gameState)) {
        clearSpeakingTimer(roomCode);
      }
    });

    socket.on("game:beginVote", async () => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      const roomState = lobbyStates.get(roomCode);
      const gameState = gameStates.get(roomCode);
      const player = roomState?.players.get(playerId);
      if (!roomState || !gameState || !player?.isHost) {
        socket.emit("game:error", { error: "Action non autorisée" });
        return;
      }
      if (!beginVote(gameState)) {
        socket.emit("game:error", { error: "Impossible de lancer le vote" });
        return;
      }
      clearSpeakingTimer(roomCode);
      broadcastGameState(io, roomCode);
    });

    socket.on("game:submitVote", async (payload: { targetId: string }) => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      const targetId = String(payload?.targetId ?? "").trim();
      if (!roomCode || !playerId || !targetId) return;

      const gameState = gameStates.get(roomCode);
      if (!gameState) {
        socket.emit("game:error", { error: "Partie introuvable" });
        return;
      }
      if (!canSubmitVote(gameState, playerId)) {
        socket.emit("game:error", { error: "Vote non autorisé" });
        return;
      }
      if (!submitVote(gameState, playerId, targetId)) {
        socket.emit("game:error", { error: "Vote non valide" });
        return;
      }

      if (allVotesCast(gameState)) {
        const result = resolveVotes(gameState);
        io.to(roomCode).emit("game:voteResult", result);
      }
      broadcastGameState(io, roomCode);
    });

    socket.on("game:submitNightAction", async (payload: { action: NightActionPayload }) => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      const action = payload?.action;
      if (!roomCode || !playerId || !action) return;

      const gameState = gameStates.get(roomCode);
      if (!gameState) {
        socket.emit("game:error", { error: "Partie introuvable" });
        return;
      }
      if (gameState.phase !== "NIGHT_ACTIONS" || !gameState.alive.has(playerId)) {
        socket.emit("game:error", { error: "Action de nuit non autorisée" });
        return;
      }
      if (!submitNightAction(gameState, playerId, action)) {
        socket.emit("game:error", { error: "Action de nuit invalide" });
        return;
      }

      const requiredActors = getRequiredNightActors(gameState);
      if (requiredActors.every((actorId) => gameState.nightActionsSubmitted.has(actorId))) {
        const result = resolveNight(gameState);
        io.to(roomCode).emit("game:nightResult", result);
        if (getPhaseSnapshot(gameState) === "DAY_DISCUSSION") {
          scheduleSpeakingTimer(io, roomCode);
        }
      }
      broadcastGameState(io, roomCode);
    });

    socket.on("game:advancePhase", async () => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      const roomState = lobbyStates.get(roomCode);
      const gameState = gameStates.get(roomCode);
      const player = roomState?.players.get(playerId);
      if (!roomState || !gameState || !player?.isHost) {
        socket.emit("game:error", { error: "Action non autorisée" });
        return;
      }
      if (!advanceFromResult(gameState)) {
        socket.emit("game:error", { error: "Impossible de passer à la phase suivante" });
        return;
      }
      broadcastGameState(io, roomCode);
    });

    socket.on("disconnect", async () => {
      const roomCode = String(socket.data.roomCode ?? "");
      const playerId = String(socket.data.playerId ?? "");
      if (!roomCode || !playerId) return;
      const state = lobbyStates.get(roomCode);
      if (!state) return;
      const playerSockets = state.socketsByPlayer.get(playerId);
      playerSockets?.delete(socket);
      if (playerSockets && playerSockets.size > 0) return;

      const player = state.players.get(playerId);
      if (!player) return;
      player.connected = false;

      if (player.isHost) {
        const gameState = gameStates.get(roomCode);
        const candidates = Array.from(state.players.values()).filter((candidate) => {
          if (candidate.playerId === playerId) return false;
          if (!candidate.connected) return false;
          if (gameState && !gameState.alive.has(candidate.playerId)) return false;
          return true;
        });
        const newHost = candidates[0];
        if (newHost) {
          player.isHost = false;
          newHost.isHost = true;
          try {
            const { room } = await getRoomAndPlayer(roomCode, playerId);
            if (room) {
              await db.update(roomPlayersTable).set({ isHost: false }).where(and(eq(roomPlayersTable.roomId, room.id), eq(roomPlayersTable.playerId, playerId)));
              await db.update(roomPlayersTable).set({ isHost: true }).where(and(eq(roomPlayersTable.roomId, room.id), eq(roomPlayersTable.playerId, newHost.playerId)));
            }
          } catch (error) {
            // Etat memoire deja a jour ; la DB se resynchronisera au prochain reload complet.
          }
        }
      }

      broadcastLobbyState(io, roomCode);
    });
  });

  return io;
}




