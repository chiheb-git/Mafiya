export type GameRole =
  | "MAFIA_ALPHA"
  | "MAFIA_MUT"
  | "MAFIA_SOLDIER"
  | "MIRE"
  | "FILS"
  | "SECOURISTE"
  | "TIREUR"
  | "VILLAGER";

export type GameMode = 7 | 14;

export const mafiaRoles = ["MAFIA_ALPHA", "MAFIA_MUT", "MAFIA_SOLDIER"] as const;
export const specialRoles = ["MIRE", "FILS", "SECOURISTE", "TIREUR"] as const;

const rolesByMode: Record<GameMode, GameRole[]> = {
  7: ["MAFIA_ALPHA", "MAFIA_MUT", "MIRE", "FILS", "SECOURISTE", "TIREUR"],
  14: ["MAFIA_ALPHA", "MAFIA_MUT", "MAFIA_SOLDIER", "MIRE", "FILS", "SECOURISTE", "TIREUR"],
};

const SPEAKING_TURN_MS = 60000;

export type GamePhase =
  | "DAY_DISCUSSION"
  | "DAY_VOTE"
  | "DAY_RESULT"
  | "NIGHT_ACTIONS"
  | "FINISHED";

export type GameWinner = "MAFIA" | "VILLAGERS";

export type NightActionType =
  | "MAFIA_KILL"
  | "MAFIA_MUTE"
  | "MIRE_INSPECT"
  | "FILS_INVESTIGATE"
  | "SECOURISTE_PROTECT"
  | "TIREUR_SHOOT"
  | "PASS";

export type NightActionPayload =
  | { type: "MAFIA_KILL"; target: string }
  | { type: "MAFIA_MUTE"; target: string }
  | { type: "MIRE_INSPECT"; target: string }
  | { type: "FILS_INVESTIGATE"; target: string }
  | { type: "SECOURISTE_PROTECT"; target: string }
  | { type: "TIREUR_SHOOT"; target: string }
  | { type: "PASS" };

export type GameState = {
  mode: GameMode;
  phase: GamePhase;
  day: number;
  roles: Map<string, GameRole>;
  alive: Set<string>;
  mutedUntilDay: Map<string, number>;
  shotUsed: Set<string>;
  voteBallots: Map<string, string>;
  nightActionsSubmitted: Set<string>;
  nightActions: {
    mafiaKillTarget?: string;
    mafiaMuteTarget?: string;
    protectedTarget?: string;
    shooterTarget?: string;
    shooterId?: string;
    inspectionTarget?: string;
    investigationTarget?: string;
  };
  mireRevealed: boolean;
  tieBreakerCandidates?: string[];
  speakingOrder: string[];
  speakingIndex: number;
  speakingEndsAt: number | null;
  lastSummary?: string;
  winner?: GameWinner;
};

export type GamePublicState = {
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
  winner?: GameWinner;
};

export type GamePrivateState = {
  role: GameRole;
  isAlive: boolean;
  phase: GamePhase;
  day: number;
  canVote: boolean;
  canAct: boolean;
  isMyTurnToSpeak: boolean;
  availableActions: NightActionType[];
  voteWeight: number;
  hasShot: boolean;
  muted: boolean;
  hasVoted: boolean;
  nightActionSubmitted: boolean;
  roleDescription: string;
  inspectionResult?: string;
  investigationResult?: string;
  winner?: GameWinner;
};

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function assignRoles(playerIds: string[], mode: GameMode): Map<string, GameRole> {
  const shuffled = shuffle(playerIds);
  const roles = [...rolesByMode[mode]];
  const assignments = new Map<string, GameRole>();

  for (let i = 0; i < shuffled.length; i += 1) {
    const role = i < roles.length ? roles[i] : "VILLAGER";
    assignments.set(shuffled[i], role);
  }

  return assignments;
}

function initSpeakingOrder(state: GameState) {
  state.speakingOrder = shuffle(Array.from(state.alive));
  state.speakingIndex = 0;
  state.speakingEndsAt = state.speakingOrder.length > 0 ? Date.now() + SPEAKING_TURN_MS : null;
}

export function createGameState(playerIds: string[], mode: GameMode): GameState {
  const state: GameState = {
    mode,
    phase: "DAY_DISCUSSION",
    day: 1,
    roles: assignRoles(playerIds, mode),
    alive: new Set(playerIds),
    mutedUntilDay: new Map(),
    shotUsed: new Set(),
    voteBallots: new Map(),
    nightActionsSubmitted: new Set(),
    nightActions: {},
    mireRevealed: false,
    tieBreakerCandidates: undefined,
    speakingOrder: [],
    speakingIndex: 0,
    speakingEndsAt: null,
    lastSummary: `Jour 1 : la discussion commence.`,
  };
  initSpeakingOrder(state);
  return state;
}

export function isMafiaRole(role: GameRole): boolean {
  return mafiaRoles.includes(role as typeof mafiaRoles[number]);
}

export function getAliveCounts(state: GameState) {
  let mafiaCount = 0;
  let villagerCount = 0;
  for (const playerId of state.alive) {
    const role = state.roles.get(playerId);
    if (!role) continue;
    if (isMafiaRole(role)) {
      mafiaCount += 1;
    } else {
      villagerCount += 1;
    }
  }
  return { mafiaCount, villagerCount };
}

export function getGameWinner(state: GameState): GameWinner | undefined {
  const { mafiaCount, villagerCount } = getAliveCounts(state);
  if (mafiaCount === 0 && villagerCount > 0) {
    return "VILLAGERS";
  }
  if (mafiaCount >= villagerCount && mafiaCount > 0) {
    return "MAFIA";
  }
  return undefined;
}

export function getCurrentSpeaker(state: GameState): string | null {
  if (state.phase !== "DAY_DISCUSSION") return null;
  const candidate = state.speakingOrder[state.speakingIndex];
  if (!candidate || !state.alive.has(candidate)) return null;
  return candidate;
}

export function advanceSpeaker(state: GameState): boolean {
  if (state.phase !== "DAY_DISCUSSION") return false;
  let nextIndex = state.speakingIndex + 1;
  while (nextIndex < state.speakingOrder.length && !state.alive.has(state.speakingOrder[nextIndex])) {
    nextIndex += 1;
  }
  state.speakingIndex = nextIndex;
  if (nextIndex >= state.speakingOrder.length) {
    state.speakingEndsAt = null;
  } else {
    state.speakingEndsAt = Date.now() + SPEAKING_TURN_MS;
  }
  return true;
}

export function passSpeaking(state: GameState, playerId: string): boolean {
  const current = getCurrentSpeaker(state);
  if (!current || current !== playerId) return false;
  return advanceSpeaker(state);
}

export function getPublicState(state: GameState): GamePublicState {
  const { mafiaCount, villagerCount } = getAliveCounts(state);
  const currentSpeakerId = getCurrentSpeaker(state) ?? undefined;
  return {
    phase: state.phase,
    day: state.day,
    aliveCount: state.alive.size,
    mafiaCount,
    villagerCount,
    alivePlayerIds: Array.from(state.alive),
    tieBreakerCandidates: state.tieBreakerCandidates,
    currentSpeakerId,
    speakingEndsAt: currentSpeakerId ? state.speakingEndsAt ?? undefined : undefined,
    lastSummary: state.lastSummary,
    winner: state.winner,
  };
}

export function getPrivateState(
  state: GameState,
  playerId: string,
): GamePrivateState | null {
  const role = state.roles.get(playerId);
  const isAlive = state.alive.has(playerId);
  if (!role) return null;

  const canVote = isAlive && state.phase === "DAY_VOTE" && state.mutedUntilDay.get(playerId) !== state.day;
  const canAct = isAlive && state.phase === "NIGHT_ACTIONS";
  const roleDescription = getRoleDescription(role);
  const voteWeight = role === "MIRE" && state.mireRevealed ? 3 : 1;
  const isMyTurnToSpeak = isAlive && getCurrentSpeaker(state) === playerId;

  const availableActions: NightActionType[] = [];
  if (canAct) {
    if (role === "MAFIA_ALPHA") {
      availableActions.push("MAFIA_KILL", "PASS");
    }
    if (role === "MAFIA_MUT") {
      availableActions.push("MAFIA_MUTE", "PASS");
    }
    if (role === "MIRE") {
      availableActions.push("MIRE_INSPECT", "PASS");
    }
    if (role === "FILS") {
      availableActions.push("FILS_INVESTIGATE", "PASS");
    }
    if (role === "SECOURISTE") {
      availableActions.push("SECOURISTE_PROTECT", "PASS");
    }
    if (role === "TIREUR" && !state.shotUsed.has(playerId)) {
      availableActions.push("TIREUR_SHOOT", "PASS");
    }
  }

  const inspectionResult = role === "MIRE" ? getInspectionResult(state, playerId) : undefined;
  const investigationResult = role === "FILS" ? getInvestigationResult(state, playerId) : undefined;

  return {
    role,
    isAlive,
    phase: state.phase,
    day: state.day,
    canVote,
    canAct,
    isMyTurnToSpeak,
    availableActions,
    voteWeight,
    hasShot: state.shotUsed.has(playerId),
    muted: state.mutedUntilDay.get(playerId) === state.day,
    hasVoted: state.voteBallots.has(playerId),
    nightActionSubmitted: state.nightActionsSubmitted.has(playerId),
    roleDescription,
    inspectionResult,
    investigationResult,
    winner: state.winner,
  };
}

function getRoleDescription(role: GameRole) {
  switch (role) {
    case "MAFIA_ALPHA":
      return "Alpha dirige la mafia : choisissez une cible a eliminer la nuit.";
    case "MAFIA_MUT":
      return "Mut peut faire taire un joueur la nuit et aide la mafia.";
    case "MAFIA_SOLDIER":
      return "Membre de la mafia sans capacite speciale : votez et discutez avec vos complices.";
    case "MIRE":
      return "Mire inspecte un joueur la nuit pour decouvrir s'il est mafia.";
    case "FILS":
      return "Fils enquete la nuit pour savoir si un joueur est mafia.";
    case "SECOURISTE":
      return "Secouriste protege un joueur la nuit contre l'attaque de la mafia.";
    case "TIREUR":
      return "Tireur peut tirer une fois la nuit sur un joueur suspect.";
    case "VILLAGER":
      return "Villageois ordinaire : participez a la discussion et au vote.";
    default:
      return "Role inconnu.";
  }
}

function getInspectionResult(state: GameState, playerId: string): string | undefined {
  if (state.phase !== "DAY_RESULT") return undefined;
  const target = state.nightActions.inspectionTarget;
  if (!target) return undefined;
  const role = state.roles.get(target);
  if (!role) return undefined;
  return isMafiaRole(role) ? "MAFIA" : "CIVIL";
}

function getInvestigationResult(state: GameState, playerId: string): string | undefined {
  if (state.phase !== "DAY_RESULT") return undefined;
  const target = state.nightActions.investigationTarget;
  if (!target) return undefined;
  const role = state.roles.get(target);
  if (!role) return undefined;
  return isMafiaRole(role) ? "MAFIA" : "CIVIL";
}

export function canSubmitVote(state: GameState, playerId: string) {
  return (
    state.phase === "DAY_VOTE" &&
    state.alive.has(playerId) &&
    state.mutedUntilDay.get(playerId) !== state.day
  );
}

export function submitVote(state: GameState, playerId: string, target: string) {
  if (!canSubmitVote(state, playerId)) {
    return false;
  }
  if (!state.alive.has(target)) {
    return false;
  }
  if (state.tieBreakerCandidates && !state.tieBreakerCandidates.includes(target)) {
    return false;
  }
  state.voteBallots.set(playerId, target);
  return true;
}

export function allVotesCast(state: GameState) {
  return Array.from(state.alive).every(
    (playerId) => state.mutedUntilDay.get(playerId) === state.day || state.voteBallots.has(playerId),
  );
}

export function resolveVotes(state: GameState): { eliminated: string | null; summary: string; winner?: GameWinner; tieBreaker?: string[] } {
  const voteCounts = new Map<string, number>();
  for (const [voterId, target] of state.voteBallots.entries()) {
    const voterRole = state.roles.get(voterId);
    const weight = voterRole === "MIRE" && state.mireRevealed ? 3 : 1;
    voteCounts.set(target, (voteCounts.get(target) ?? 0) + weight);
  }

  let highest = 0;
  for (const count of voteCounts.values()) {
    if (count > highest) highest = count;
  }
  const topCandidates = Array.from(voteCounts.entries())
    .filter(([, count]) => count === highest && highest > 0)
    .map(([playerId]) => playerId);

  const wasTieBreakerRound = Boolean(state.tieBreakerCandidates);

  if (topCandidates.length > 1) {
    state.voteBallots.clear();

    if (wasTieBreakerRound) {
      state.tieBreakerCandidates = undefined;
      const summary = `Egalite persistante entre ${topCandidates.join(", ")}. Personne n'est elimine aujourd'hui.`;
      const winner = getGameWinner(state);
      if (winner) {
        state.phase = "FINISHED";
        state.winner = winner;
        state.lastSummary = `${summary} ${winner === "MAFIA" ? "La mafia gagne." : "Les villageois gagnent."}`;
      } else {
        state.phase = "DAY_RESULT";
        state.lastSummary = summary;
      }
      return { eliminated: null, summary: state.lastSummary, winner: state.winner };
    }

    state.tieBreakerCandidates = topCandidates;
    state.phase = "DAY_VOTE";
    const summary = `Egalite entre ${topCandidates.join(", ")}. Nouveau vote restreint a ces joueurs.`;
    state.lastSummary = summary;
    return { eliminated: null, summary, tieBreaker: topCandidates };
  }

  const validElimination = topCandidates.length === 1 && state.alive.has(topCandidates[0]) ? topCandidates[0] : null;
  if (validElimination) {
    state.alive.delete(validElimination);
  }

  state.voteBallots.clear();
  state.tieBreakerCandidates = undefined;

  const eliminatedName = validElimination ? `Le joueur ${validElimination} a ete elimine.` : "Aucune elimination aujourd'hui.";
  const summary = `Vote termine. ${eliminatedName}`;
  const winner = getGameWinner(state);
  if (winner) {
    state.phase = "FINISHED";
    state.lastSummary = `${summary} ${winner === "MAFIA" ? "La mafia gagne." : "Les villageois gagnent."}`;
    state.winner = winner;
  } else {
    state.phase = "DAY_RESULT";
    state.lastSummary = summary;
  }

  return { eliminated: validElimination, summary: state.lastSummary, winner: state.winner };
}

export function getRequiredNightActors(state: GameState): string[] {
  const required: string[] = [];
  for (const playerId of state.alive) {
    const role = state.roles.get(playerId);
    if (!role) continue;
    switch (role) {
      case "MAFIA_ALPHA":
      case "MAFIA_MUT":
      case "MIRE":
      case "FILS":
      case "SECOURISTE":
        required.push(playerId);
        break;
      case "TIREUR":
        if (!state.shotUsed.has(playerId)) {
          required.push(playerId);
        }
        break;
      default:
        break;
    }
  }
  return required;
}

export function submitNightAction(state: GameState, playerId: string, action: NightActionPayload) {
  if (state.phase !== "NIGHT_ACTIONS") {
    return false;
  }
  if (!state.alive.has(playerId)) {
    return false;
  }
  const role = state.roles.get(playerId);
  if (!role) return false;

  let accepted = false;
  switch (action.type) {
    case "MAFIA_KILL":
      if (role !== "MAFIA_ALPHA") return false;
      if (!state.alive.has(action.target)) return false;
      state.nightActions.mafiaKillTarget = action.target;
      accepted = true;
      break;
    case "MAFIA_MUTE":
      if (role !== "MAFIA_MUT") return false;
      if (!state.alive.has(action.target)) return false;
      state.nightActions.mafiaMuteTarget = action.target;
      accepted = true;
      break;
    case "MIRE_INSPECT":
      if (role !== "MIRE") return false;
      if (!state.alive.has(action.target)) return false;
      state.nightActions.inspectionTarget = action.target;
      if (isMafiaRole(state.roles.get(action.target)!)) {
        state.mireRevealed = true;
      }
      accepted = true;
      break;
    case "FILS_INVESTIGATE":
      if (role !== "FILS") return false;
      if (!state.alive.has(action.target)) return false;
      state.nightActions.investigationTarget = action.target;
      accepted = true;
      break;
    case "SECOURISTE_PROTECT":
      if (role !== "SECOURISTE") return false;
      if (!state.alive.has(action.target)) return false;
      state.nightActions.protectedTarget = action.target;
      accepted = true;
      break;
    case "TIREUR_SHOOT":
      if (role !== "TIREUR") return false;
      if (state.shotUsed.has(playerId)) return false;
      if (!state.alive.has(action.target)) return false;
      state.nightActions.shooterTarget = action.target;
      state.nightActions.shooterId = playerId;
      state.shotUsed.add(playerId);
      accepted = true;
      break;
    case "PASS":
      if (
        !["MAFIA_ALPHA", "MAFIA_MUT", "MIRE", "FILS", "SECOURISTE"].includes(role) &&
        !(role === "TIREUR" && !state.shotUsed.has(playerId))
      ) {
        return false;
      }
      accepted = true;
      break;
    default:
      return false;
  }

  if (accepted) {
    state.nightActionsSubmitted.add(playerId);
  }
  return accepted;
}

export function resolveNight(state: GameState): { eliminated: string[]; summary: string; winner?: GameWinner } {
  const eliminated: Set<string> = new Set();
  const protectedTarget = state.nightActions.protectedTarget;
  const killTarget = state.nightActions.mafiaKillTarget;
  const shooterTarget = state.nightActions.shooterTarget;
  const muteTarget = state.nightActions.mafiaMuteTarget;

  if (killTarget && state.alive.has(killTarget)) {
    if (killTarget !== protectedTarget) {
      eliminated.add(killTarget);
    }
  }
  if (shooterTarget && state.alive.has(shooterTarget)) {
    if (shooterTarget !== protectedTarget) {
      eliminated.add(shooterTarget);
      const shooterId = state.nightActions.shooterId;
      if (shooterId && state.alive.has(shooterId) && !isMafiaRole(state.roles.get(shooterTarget)!)) {
        eliminated.add(shooterId);
      }
    }
  }

  const filsDead = Array.from(eliminated).some((playerId) => state.roles.get(playerId) === "FILS");
  if (filsDead && state.nightActions.investigationTarget) {
    const revengeTarget = state.nightActions.investigationTarget;
    if (state.alive.has(revengeTarget) && revengeTarget !== state.nightActions.shooterId) {
      eliminated.add(revengeTarget);
    }
  }

  for (const playerId of eliminated) {
    state.alive.delete(playerId);
  }

  if (muteTarget && state.alive.has(muteTarget)) {
    state.mutedUntilDay.set(muteTarget, state.day + 1);
  }

  const lines: string[] = [];
  if (killTarget) {
    lines.push(`La mafia a vise ${killTarget}.`);
    if (killTarget === protectedTarget) {
      lines.push(`Mais ${protectedTarget} a ete protege par le Secouriste.`);
    }
  }
  if (shooterTarget) {
    lines.push(`Le Tireur a tire sur ${shooterTarget}.`);
    if (shooterTarget === protectedTarget) {
      lines.push(`Mais ${protectedTarget} a ete protege.`);
    }
  }
  if (eliminated.size === 0) {
    lines.push("Personne n'a ete elimine cette nuit.");
  }
  if (muteTarget) {
    lines.push(`${muteTarget} est incapable de voter demain.`);
  }

  state.day += 1;
  const summary = `Nuit ${state.day - 1} : ${lines.join(" ")}`;
  state.lastSummary = summary;
  const winner = getGameWinner(state);
  if (winner) {
    state.phase = "FINISHED";
    state.winner = winner;
    state.lastSummary = `${summary} ${winner === "MAFIA" ? "La mafia gagne." : "Les villageois gagnent."}`;
  } else {
    state.phase = "DAY_DISCUSSION";
    initSpeakingOrder(state);
  }

  state.nightActions = {};
  state.nightActionsSubmitted.clear();
  state.voteBallots.clear();
  state.tieBreakerCandidates = undefined;

  return { eliminated: Array.from(eliminated), summary: state.lastSummary, winner: state.winner };
}

export function beginVote(state: GameState): boolean {
  if (state.phase !== "DAY_DISCUSSION") return false;
  state.phase = "DAY_VOTE";
  state.tieBreakerCandidates = undefined;
  state.speakingEndsAt = null;
  state.lastSummary = `Jour ${state.day} : vote en cours.`;
  state.voteBallots.clear();
  return true;
}

export function advanceFromResult(state: GameState): boolean {
  if (state.phase !== "DAY_RESULT") return false;
  if (state.winner) {
    state.phase = "FINISHED";
    return true;
  }
  state.phase = "NIGHT_ACTIONS";
  state.lastSummary = `Nuit ${state.day} : les actions commencent.`;
  state.nightActions = {};
  state.nightActionsSubmitted.clear();
  return true;
}

export function getPhaseSnapshot(state: GameState): GamePhase {
  return state.phase;
}

export function getPlayerPublicRole(state: GameState, playerId: string) {
  const role = state.roles.get(playerId);
  return role && state.alive.has(playerId) ? undefined : undefined;
}

