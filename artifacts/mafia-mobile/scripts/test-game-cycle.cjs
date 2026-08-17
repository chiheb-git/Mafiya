const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const ROOM_API = `${BASE_URL}/api/rooms`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoom(host) {
  const body = { mode: 7, host: { playerId: host.playerId, nickname: host.nickname } };
  if (host.avatar) {
    body.host.avatar = host.avatar;
  }

  const res = await fetch(ROOM_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Room create failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function createPlayerSocket(profile, code) {
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
    chat: [],
  };

  socket.on('connect', () => {
    socket.emit('lobby:join', {
      code,
      playerId: profile.playerId,
      nickname: profile.nickname,
      avatar: profile.avatar ?? null,
    });
  });

  socket.on('lobby:state', (payload) => {
    state.lobby = payload;
  });
  socket.on('lobby:error', (err) => { state.errors.push(['lobby:error', err]); });
  socket.on('game:publicState', (payload) => { state.publicState = payload; });
  socket.on('game:privateState', (payload) => { state.privateState = payload; });
  socket.on('game:voteResult', (payload) => { state.lastVoteResult = payload; });
  socket.on('game:nightResult', (payload) => { state.lastNightResult = payload; });
  socket.on('lobby:chatMessage', (entry) => { state.chat.push(entry); });
  socket.on('game:error', (err) => { state.errors.push(['game:error', err]); });

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
    await waitFor(() => player.state.lobby !== null, 5000, `${player.profile.playerId} lobby state`);
  }
}

async function run() {
  const hostProfile = { playerId: 'host-1', nickname: 'Host1', avatar: null };
  console.log('Creating room...');
  const room = await createRoom(hostProfile);
  console.log('Room created:', room.code);

  const players = [
    { playerId: hostProfile.playerId, nickname: hostProfile.nickname, avatar: null },
    { playerId: 'player-2', nickname: 'J2', avatar: null },
    { playerId: 'player-3', nickname: 'J3', avatar: null },
    { playerId: 'player-4', nickname: 'J4', avatar: null },
  ].map((profile) => createPlayerSocket(profile, room.code));

  await openPlayers(players);
  console.log('All players joined lobby.');

  players.forEach((player) => player.socket.emit('lobby:setReady', { ready: true }));
  await delay(500);
  console.log('All players set ready.');

  const host = players.find((p) => p.profile.playerId === 'host-1');
  host.socket.emit('lobby:startGame');
  console.log('Host started game.');

  await waitFor(() => players.every((p) => p.state.publicState !== null), 10000, 'game public state for all');
  console.log('Game started, public state:', players[0].state.publicState);

  await waitFor(() => players.some((p) => p.state.publicState?.phase === 'DAY_DISCUSSION'), 10000, 'DAY_DISCUSSION');
  console.log('In discussion phase.');

  host.socket.emit('game:beginVote');
  console.log('Host requested beginVote.');

  await waitFor(() => players.some((p) => p.state.publicState?.phase === 'DAY_VOTE'), 10000, 'DAY_VOTE');
  console.log('Vote phase entered.');

  const alivePlayers = players.filter((p) => p.state.publicState?.alivePlayerIds?.includes(p.profile.playerId));
  if (!alivePlayers.length) throw new Error('No alive players');

  const voteTarget = alivePlayers.find((p) => p.profile.playerId !== host.profile.playerId)?.profile.playerId || alivePlayers[0].profile.playerId;
  players.forEach((player) => player.socket.emit('game:submitVote', { targetId: voteTarget }));
  console.log('All votes submitted.');

  await waitFor(() => players.some((p) => p.state.lastVoteResult !== null), 10000, 'vote result');
  console.log('Vote result:', players[0].state.lastVoteResult);

  host.socket.emit('game:advancePhase');
  console.log('Host advanced phase after vote.');

  await waitFor(() => players.some((p) => p.state.publicState?.phase === 'NIGHT_ACTIONS'), 10000, 'NIGHT_ACTIONS');
  console.log('Night phase entered.');

  for (const player of players) {
    const actions = player.state.privateState?.availableActions ?? [];
    if (actions.length) {
      const actionType = actions.includes('PASS') ? 'PASS' : actions[0];
      const action = actionType === 'PASS' ? { type: 'PASS' } : { type: actionType, target: players[0].profile.playerId };
      player.socket.emit('game:submitNightAction', { action });
      console.log(`${player.profile.playerId} submitted night action`, action);
    }
  }

  await waitFor(() => players.some((p) => p.state.lastNightResult !== null), 10000, 'night result');
  console.log('Night result:', players[0].state.lastNightResult);

  console.log('Final public state:', players[0].state.publicState);
  players.forEach((player) => player.socket.disconnect());
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
