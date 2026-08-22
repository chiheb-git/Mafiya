import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@mafia/profile';

type Profile = {
  playerId: string;
  nickname: string;
  avatar?: string | null;
};

type LobbyPlayerState = {
  playerId: string;
  nickname: string;
  avatar: string | null;
  isHost: boolean;
  isReady: boolean;
  microphoneOn: boolean;
  connected: boolean;
};

type LobbyChatEntry = {
  id: string;
  playerId: string;
  nickname: string;
  avatar: string | null;
  timestamp: string;
  message: string;
};

type LobbyState = {
  code: string;
  mode: 7 | 14;
  capacity: number;
  status: 'LOBBY' | 'STARTED';
  createdAt: string;
  players: LobbyPlayerState[];
  chat: LobbyChatEntry[];
  hostId: string | null;
};

type GamePhase =
  | 'DAY_DISCUSSION'
  | 'DAY_VOTE'
  | 'DAY_RESULT'
  | 'NIGHT_ACTIONS'
  | 'FINISHED';

type GamePublicState = {
  phase: GamePhase;
  day: number;
  aliveCount: number;
  mafiaCount: number;
  villagerCount: number;
  alivePlayerIds: string[];
  tieBreakerCandidates?: string[];
  currentSpeakerId?: string;
  speakingEndsAt?: number;
  lastSummary?: string;
  winner?: 'MAFIA' | 'VILLAGERS';
};

type GamePrivateState = {
  role: string;
  isAlive: boolean;
  phase: GamePhase;
  day: number;
  canVote: boolean;
  canAct: boolean;
  isMyTurnToSpeak: boolean;
  availableActions: Array<
    | 'MAFIA_KILL'
    | 'MAFIA_MUTE'
    | 'MIRE_INSPECT'
    | 'FILS_INVESTIGATE'
    | 'SECOURISTE_PROTECT'
    | 'TIREUR_SHOOT'
    | 'PASS'
  >;
  voteWeight: number;
  hasShot: boolean;
  muted: boolean;
  hasVoted: boolean;
  nightActionSubmitted: boolean;
  roleDescription: string;
  inspectionResult?: string;
  investigationResult?: string;
  winner?: 'MAFIA' | 'VILLAGERS';
};

type GameResult = {
  eliminated: string | null;
  summary: string;
  winner?: 'MAFIA' | 'VILLAGERS';
  tieBreaker?: string[];
};

type NightActionPayload =
  | { type: 'PASS' }
  | { type: 'MAFIA_KILL' | 'MAFIA_MUTE' | 'MIRE_INSPECT' | 'FILS_INVESTIGATE' | 'SECOURISTE_PROTECT' | 'TIREUR_SHOOT'; target: string };

const STORAGE_BASE_URL_KEY = '@mafia/baseUrl';

export function setBaseUrl(url: string | null) {
  if (url) {
    AsyncStorage.setItem(STORAGE_BASE_URL_KEY, url).catch(() => null);
  } else {
    AsyncStorage.removeItem(STORAGE_BASE_URL_KEY).catch(() => null);
  }
}

export function useLobbySocket(code: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gamePublicState, setGamePublicState] = useState<GamePublicState | null>(null);
  const [gamePrivateState, setGamePrivateState] = useState<GamePrivateState | null>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const baseUrl = useMemo(() => {
    if (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DOMAIN) {
      return process.env.EXPO_PUBLIC_DOMAIN;
    }
    return null;
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((value) => {
      if (!value) {
        setError('User profile missing. Return to onboarding.');
        return;
      }
      setProfile(JSON.parse(value) as Profile);
    });
  }, []);

  useEffect(() => {
    if (!profile || !code) return;

    const url = baseUrl || 'http://localhost:3000';
    const socketClient = io(url, {
      transports: ['polling', 'websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    socketClient.on('connect', () => {
      setConnected(true);
      setError(null);
      AsyncStorage.getItem(`@mafia/session/${code}`).then((storedToken) => {
        socketClient.emit('lobby:join', {
          code,
          playerId: profile.playerId,
          nickname: profile.nickname,
          avatar: profile.avatar ?? null,
          sessionToken: storedToken ?? undefined,
        });
      });
    });

    socketClient.on('disconnect', () => {
      setConnected(false);
    });

    socketClient.on('connect_error', (err: any) => {
      setConnected(false);
      setError('Connexion echouee: ' + (err?.message || 'erreur inconnue') + ' (url: ' + url + ')');
    });

    socketClient.on('lobby:state', (payload: LobbyState) => {
      setLobbyState(payload);
      if (payload.status === 'STARTED' && !gamePublicState) {
        socketClient.emit('game:requestState');
      }
    });

    socketClient.on('lobby:joined', (payload: { playerId: string; code: string; sessionToken?: string }) => {
      setError(null);
      if (payload.sessionToken) {
        AsyncStorage.setItem(`@mafia/session/${code}`, payload.sessionToken).catch(() => null);
      }
    });

    socketClient.on('lobby:chatMessage', (entry: LobbyChatEntry) => {
      setLobbyState((current) => {
        if (!current) return current;
        return { ...current, chat: [...current.chat, entry].slice(-120) };
      });
    });

    socketClient.on('lobby:error', (payload: { error: string }) => {
      setError(payload.error);
    });

    socketClient.on('lobby:gameStarted', () => {
      setLobbyState((current) => {
        if (!current) return current;
        return { ...current, status: 'STARTED' };
      });
      socketClient.emit('game:requestState');
    });

    socketClient.on('game:publicState', (payload: GamePublicState) => {
      setGamePublicState(payload);
      setGameResult(null);
    });

    socketClient.on('game:privateState', (payload: GamePrivateState) => {
      setGamePrivateState(payload);
    });

    socketClient.on('game:voteResult', (payload: GameResult) => {
      setGameResult(payload);
    });

    socketClient.on('game:nightResult', (payload: GameResult) => {
      setGameResult(payload);
    });

    socketClient.on('game:error', (payload: { error: string }) => {
      setError(payload.error);
    });

    socketClient.open();
    setSocket(socketClient);

    return () => {
      socketClient.disconnect();
      setSocket(null);
    };
  }, [profile, code, baseUrl]);

  const sendMessage = (message: string) => {
    if (!socket) return;
    socket.emit('lobby:sendMessage', { message });
  };

  const setReady = (ready: boolean) => {
    if (!socket) return;
    socket.emit('lobby:setReady', { ready });
  };

  const setMic = (microphoneOn: boolean) => {
    if (!socket) return;
    socket.emit('lobby:setMic', { microphoneOn });
  };

  const startGame = () => {
    if (!socket) return;
    socket.emit('lobby:startGame');
  };

  const beginVote = () => {
    if (!socket) return;
    socket.emit('game:beginVote');
  };

  const submitVote = (targetId: string) => {
    if (!socket) return;
    socket.emit('game:submitVote', { targetId });
  };

  const submitNightAction = (action: NightActionPayload) => {
    if (!socket) return;
    socket.emit('game:submitNightAction', { action });
  };

  const advancePhase = () => {
    if (!socket) return;
    socket.emit('game:advancePhase');
  };

  const passSpeaking = () => {
    if (!socket) return;
    socket.emit('game:passSpeaking');
  };

  return {
    profile,
    lobbyState,
    gamePublicState,
    gamePrivateState,
    gameResult,
    error,
    connected,
    setReady,
    setMic,
    sendMessage,
    startGame,
    beginVote,
    submitVote,
    submitNightAction,
    advancePhase,
    passSpeaking,
  };
}



