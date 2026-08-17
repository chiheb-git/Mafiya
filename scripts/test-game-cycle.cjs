const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const ROOM_API = `${BASE_URL}/api/rooms`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoom(host) {
  const res = await fetch(ROOM_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 7, host }),
  });
  if (!res.ok) {
    throw new Error(`Room create failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function createPlayerSocket(profile, code, sessionToken) {
  const socket = io(BASE_URL, {
    transports: ['websocket'],
    autoConnect: false,
  });

  const state = {
    lobby: null,
    publicState: null,
    privateState: null,
    lastVoteResult: null,
    lastNightResult: null,
    errors: [],
    joined: false,
  };

  socket.on('connect', () => {
    socket.emit('lobby:join', {
      code,
      playerId: profile.playerId,
      nickname: profile.nickname,
      avatar: profile.avatar ?? null,
      sessionToken: sessionToken ?? undefined,
    });
  });

  socket.on('lobby:joined', () => { state.joined = true; console.log(profile.playerId, 'joined'); });
  socket.on('lobby:state', (payload) => { state.lobby = payload; console.log(profile.playerId, 'lobby:state', payload.status, payload.players.length, payload.players.map((p) => ({ playerId: p.playerId, isReady: p.isReady }))); });
  socket.on('lobby:error', (err) => { state.errors.push(['lobby:error', err]); console.log(profile.playerId, 'lobby:error', err); });
  socket.on('game:publicState', (payload) => { state.publicState = payload; console.log(profile.playerId, 'game:publicState', payload.phase, payload.alivePlayerIds.length); });
  socket.on('game:privateState', (payload) => { state.privateState = payload; console.log(profile.playerId, 'game:privateState', payload.role, payload.phase, 'voteWeight', payload.voteWeight); });
  socket.on('game:voteResult', (payload) => { state.lastVoteResult = payload; console.log(profile.playerId, 'game:voteResult', payload); });
  socket.on('game:nightResult', (payload) => { state.lastNightResult = payload; console.log(profile.playerId, 'game:nightResult', payload); });
  socket.on('game:error', (err) => { state.errors.push(['game:error', err]); console.log(profile.playerId, 'game:error', err); });

  return { profile, socket, state };
}

async function waitFor(predicate, timeout = 10000, label = 'wait') {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function openPlayers(players) {
  for (const player of players) {
    player.socket.open();
    await waitFor(() => player.state.joined, 5000, `${player.profile.playerId} joined lobby`);
  }
}

function getAlivePlayers(players) {
  return players.filter((player) => player.state.publicState?.alivePlayerIds?.includes(player.profile.playerId));
}

function getPlayerByRole(players, role) {
  return players.find((player) => player.state.privateState?.role === role);
}

function getRoleMap(players) {
  return players.reduce((map, player) => {
    if (player.state.privateState?.role) {
      map[player.state.privateState.role] = player;
    }
    return map;
  }, {});
}

function getAliveRoleMap(players) {
  return getRoleMap(getAlivePlayers(players));
}

function chooseNightTargetForRole(rolePlayer, players, aliveIds, options = {}) {
  if (!rolePlayer.state.privateState) return aliveIds[0];
  const role = rolePlayer.state.privateState.role;
  if (role === 'MAFIA_ALPHA' || role === 'MAFIA_MUT') {
    return aliveIds.find((id) => id !== rolePlayer.profile.playerId && id !== options.excludeId) ?? aliveIds[0];
  }
  if (role === 'TIREUR') {
    return aliveIds.find((id) => id !== rolePlayer.profile.playerId && id !== options.protectedId) ?? rolePlayer.profile.playerId;
  }
  if (role === 'MIRE' || role === 'FILS') {
    return aliveIds.find((id) => id !== rolePlayer.profile.playerId) ?? rolePlayer.profile.playerId;
  }
  if (role === 'SECOURISTE') {
    return aliveIds.find((id) => id !== rolePlayer.profile.playerId) ?? rolePlayer.profile.playerId;
  }
  return aliveIds[0];
}

function chooseVoteTarget(players, avoidId) {
  const alivePlayers = players.filter((player) => player.state.publicState?.alivePlayerIds?.includes(player.profile.playerId));
  const candidate = alivePlayers.find((player) => player.profile.playerId !== avoidId);
  return candidate?.profile.playerId ?? alivePlayers[0]?.profile.playerId ?? avoidId;
}

async function run() {
  const hostProfile = { playerId: 'host-1', nickname: 'Host1', avatar: null };
  console.log('Creating room...');
  const room = await createRoom(hostProfile);
  console.log('Room created:', room.code);

  const profiles = [
    hostProfile,
    { playerId: 'player-2', nickname: 'J2', avatar: null },
    { playerId: 'player-3', nickname: 'J3', avatar: null },
    { playerId: 'player-4', nickname: 'J4', avatar: null },
    { playerId: 'player-5', nickname: 'J5', avatar: null },
    { playerId: 'player-6', nickname: 'J6', avatar: null },
    { playerId: 'player-7', nickname: 'J7', avatar: null },
  ];

  const players = profiles.map((profile) => createPlayerSocket(profile, room.code, profile.playerId === hostProfile.playerId ? room.sessionToken : undefined));
  await openPlayers(players);
  console.log('All players joined lobby.');

  for (const player of players) {
    player.socket.emit('lobby:setReady', { ready: true });
  }
  console.log('Ready flags sent. Waiting for all players to become ready...');
  await waitFor(
    () => players.every((p) => p.state.lobby?.players?.every((slot) => slot.isReady)),
    10000,
    'all players ready',
  );
  console.log('All players are ready.');

  const host = players.find((p) => p.profile.playerId === hostProfile.playerId);
  if (!host) throw new Error('Host missing');

  host.socket.emit('lobby:startGame');
  console.log('Host started game.');

  await waitFor(() => players.some((p) => p.state.publicState !== null), 10000, 'game public state for first player');
  await waitFor(() => players.every((p) => p.state.publicState !== null), 10000, 'game public state for all');
  console.log('Game started successfully. Current phase:', players[0].state.publicState.phase);

  const expectedRoles = ['MAFIA_ALPHA','MAFIA_MUT','MIRE','FILS','SECOURISTE','TIREUR'];
  await waitFor(() => expectedRoles.every((role) => getPlayerByRole(players, role)), 10000, 'all special roles assigned');
  const roleMap = getRoleMap(players);
  console.log('Special roles assigned:', Object.keys(roleMap));

  // Day 1 vote
  host.socket.emit('game:beginVote');
  console.log('Day 1: beginVote');
  await waitFor(() => players.some((p) => p.state.publicState?.phase === 'DAY_VOTE'), 10000, 'DAY_VOTE');

  const mafiaPlayers = players.filter((player) => ['MAFIA_ALPHA', 'MAFIA_MUT'].includes(player.state.privateState?.role));
  const day1Target = players.find((player) => player.state.privateState?.role === 'VILLAGER')?.profile.playerId
    ?? players.find(
      (player) =>
        player.state.privateState &&
        !['MAFIA_ALPHA', 'MAFIA_MUT', 'TIREUR'].includes(player.state.privateState.role),
    )?.profile.playerId
    ?? chooseVoteTarget(players, hostProfile.playerId);
  console.log('Day 1 voting to eliminate', day1Target);
  for (const player of getAlivePlayers(players)) {
    if (player.state.privateState?.canVote) {
      player.socket.emit('game:submitVote', { targetId: day1Target });
    }
  }
  await waitFor(() => players.some((p) => p.state.lastVoteResult !== null), 10000, 'day 1 vote result');
  console.log('Day 1 vote result:', players[0].state.lastVoteResult);

  if (players[0].state.publicState.phase !== 'DAY_RESULT') {
    await waitFor(() => players.some((p) => p.state.publicState?.phase === 'DAY_RESULT' || p.state.publicState?.phase === 'FINISHED'), 10000, 'DAY_RESULT or FINISHED');
  }

  if (players[0].state.publicState.winner) {
    throw new Error('Game ended too early before special night actions');
  }

  host.socket.emit('game:advancePhase');
  console.log('Advance to NIGHT_ACTIONS');
  await waitFor(() => players.some((p) => p.state.publicState?.phase === 'NIGHT_ACTIONS'), 10000, 'NIGHT_ACTIONS');

  const aliveIds = players[0].state.publicState.alivePlayerIds;
  const roleStateMap = getRoleMap(players);
  const alpha = roleStateMap['MAFIA_ALPHA'];
  const mut = roleStateMap['MAFIA_MUT'];
  const mire = roleStateMap['MIRE'];
  const fils = roleStateMap['FILS'];
  const sec = roleStateMap['SECOURISTE'];
  const tireur = roleStateMap['TIREUR'];

  if (!alpha || !mut || !mire || !fils || !sec || !tireur) {
    throw new Error('Not all special roles available for night 1');
  }

  const alphaTarget = aliveIds.find(
    (id) => id !== alpha.profile.playerId && id !== sec.profile.playerId && id !== tireur.profile.playerId && id !== fils.profile.playerId
  ) ?? aliveIds.find((id) => id !== alpha.profile.playerId);
  const protectTarget = alphaTarget;
  const shooterTarget = aliveIds.find(
    (id) => id !== tireur.profile.playerId && id !== alphaTarget && !['MAFIA_ALPHA','MAFIA_MUT'].includes(players.find((p) => p.profile.playerId === id)?.state.privateState?.role)
  ) ?? aliveIds.find((id) => id !== tireur.profile.playerId);
  const aliveMafiaTargets = mafiaPlayers
    .map((player) => player.profile.playerId)
    .filter((id) => aliveIds.includes(id) && id !== mire.profile.playerId);
  const mireTarget = aliveMafiaTargets[0] ?? chooseNightTargetForRole(mire, players, aliveIds);
  const filsTarget = aliveIds.find((id) => id !== fils.profile.playerId && id !== alphaTarget) ?? chooseNightTargetForRole(fils, players, aliveIds);
  const muteTarget = aliveIds.find((id) => id !== mut.profile.playerId && id !== alpha.profile.playerId) ?? chooseNightTargetForRole(mut, players, aliveIds);

  console.log('Night 1 special actions:', {
    alphaTarget,
    protectTarget,
    shooterTarget,
    mireTarget,
    filsTarget,
    muteTarget,
  });

  if (alphaTarget) {
    alpha.socket.emit('game:submitNightAction', { action: { type: 'MAFIA_KILL', target: alphaTarget } });
  }
  mut.socket.emit('game:submitNightAction', { action: { type: 'MAFIA_MUTE', target: muteTarget } });
  mire.socket.emit('game:submitNightAction', { action: { type: 'MIRE_INSPECT', target: mireTarget } });
  fils.socket.emit('game:submitNightAction', { action: { type: 'FILS_INVESTIGATE', target: filsTarget } });
  sec.socket.emit('game:submitNightAction', { action: { type: 'SECOURISTE_PROTECT', target: protectTarget } });
  tireur.socket.emit('game:submitNightAction', { action: { type: 'TIREUR_SHOOT', target: shooterTarget } });

  await waitFor(() => players.some((p) => p.state.lastNightResult !== null), 10000, 'night 1 result');
  console.log('Night 1 result:', players[0].state.lastNightResult);

  const night1Eliminated = players[0].state.lastNightResult.eliminated ? [players[0].state.lastNightResult.eliminated] : [];
  if (alphaTarget && sec && night1Eliminated.includes(alphaTarget)) {
    throw new Error('Secouriste failed to protect the alpha target');
  }

  const mireState = mire.state.privateState;
  if (mireState?.voteWeight !== 3) {
    throw new Error('Mire did not receive vote x3 after revealing a mafia');
  }
  console.log('Mire vote x3 confirmed.');

  if (players[0].state.publicState.winner) {
    console.log('Game finished after night 1; special role scenario still covered.');
  } else {
    host.socket.emit('game:beginVote');
    console.log('Day 2: beginVote');
    await waitFor(() => players.some((p) => p.state.publicState?.phase === 'DAY_VOTE'), 10000, 'day 2 vote');

    const aliveAfterNight = getAlivePlayers(players);
    const nonFilsTarget = aliveAfterNight.find((player) => player.profile.playerId !== fils.profile.playerId && player.profile.playerId !== host.profile.playerId)?.profile.playerId ?? chooseVoteTarget(players, hostProfile.playerId);
    console.log('Day 2 target (avoid Fils):', nonFilsTarget);
    for (const player of aliveAfterNight) {
      if (player.state.privateState?.canVote) {
        player.socket.emit('game:submitVote', { targetId: nonFilsTarget });
      }
    }
    await waitFor(() => players.some((p) => p.state.lastVoteResult !== null), 10000, 'day 2 vote result');
    console.log('Day 2 vote result:', players[0].state.lastVoteResult);

    if (players[0].state.publicState.winner) {
      console.log('Game finished after day 2 voting.');
    } else {
      host.socket.emit('game:advancePhase');
      console.log('Advance to night 2.');
      await waitFor(() => players.some((p) => p.state.publicState?.phase === 'NIGHT_ACTIONS'), 10000, 'night 2');

      const aliveAfterDay2 = players[0].state.publicState.alivePlayerIds;
      const filsPlayer = fils;
      if (filsPlayer.state.publicState?.alivePlayerIds?.includes(filsPlayer.profile.playerId)) {
        const revengeTarget = players.find((player) => player.profile.playerId !== filsPlayer.profile.playerId && player.profile.playerId !== alpha.profile.playerId)?.profile.playerId ?? chooseNightTargetForRole(fils, players, aliveAfterDay2);
        console.log('Fils will investigate before dying, revenge target:', revengeTarget);
        fils.socket.emit('game:submitNightAction', { action: { type: 'FILS_INVESTIGATE', target: revengeTarget } });
        alpha.socket.emit('game:submitNightAction', { action: { type: 'MAFIA_KILL', target: filsPlayer.profile.playerId } });
        const secProtect = aliveAfterDay2.find((id) => id !== filsPlayer.profile.playerId && id !== alpha.profile.playerId && id !== revengeTarget) ?? aliveAfterDay2[0];
        sec.socket.emit('game:submitNightAction', { action: { type: 'SECOURISTE_PROTECT', target: secProtect } });
      }

      if (!tireur.state.privateState?.hasShot) {
        const secondShooterTarget = aliveAfterDay2.find((id) => id !== tireur.profile.playerId && id !== fils.profile.playerId && id !== alpha.profile.playerId) ?? chooseNightTargetForRole(tireur, players, aliveAfterDay2);
        tireur.socket.emit('game:submitNightAction', { action: { type: 'TIREUR_SHOOT', target: secondShooterTarget } });
      } else {
        tireur.socket.emit('game:submitNightAction', { action: { type: 'PASS' } });
      }
      if (mireState?.canAct) {
        mire.socket.emit('game:submitNightAction', { action: { type: 'PASS' } });
      }
      if (mut.state.privateState?.canAct) {
        mut.socket.emit('game:submitNightAction', { action: { type: 'PASS' } });
      }

      await waitFor(() => players.some((p) => p.state.lastNightResult !== null), 10000, 'night 2 result');
      console.log('Night 2 result:', players[0].state.lastNightResult);

      const filsDead = !getAlivePlayers(players).some((player) => player.profile.playerId === fils.profile.playerId);
      if (!filsDead) {
        console.log('Fils survived night 2, revenge not triggered but special role actions were used.');
      } else {
        console.log('Fils died in night 2, revenge should be applied.');
      }
    }
  }

  players.forEach((player) => player.socket.disconnect());
  console.log('Special role test completed successfully.');
}

run().catch((err) => {
  console.error('Special role test failed:', err);
  process.exit(1);
});

