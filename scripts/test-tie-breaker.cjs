const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const ROOM_API = `${BASE_URL}/api/rooms`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoom(host) {
  const res = await fetch(ROOM_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 7, host }) });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function joinRoom(code, body) {
  const res = await fetch(`${ROOM_API}/${code}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function makeSocket(profile, code, sessionToken) {
  const socket = io(BASE_URL, { transports: ['websocket'], autoConnect: false });
  const state = { joined: false, lobby: null, publicState: null, privateState: null, lastVoteResult: null };
  socket.on('lobby:joined', () => { state.joined = true; });
  socket.on('lobby:state', (d) => { state.lobby = d; });
  socket.on('lobby:error', (e) => { console.log(profile.playerId, 'lobby:error', e); });
  socket.on('game:publicState', (d) => { state.publicState = d; });
  socket.on('game:privateState', (d) => { state.privateState = d; });
  socket.on('game:voteResult', (d) => { state.lastVoteResult = d; console.log(profile.playerId, 'voteResult:', JSON.stringify(d)); });
  socket.on('connect', () => { socket.emit('lobby:join', { code, playerId: profile.playerId, nickname: profile.nickname, avatar: null, sessionToken }); });
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

async function run() {
  console.log('=== TEST EGALITE DE VOTE ===\n');

  const hostProfile = { playerId: 'tie-host', nickname: 'TieHost' };
  const room = await createRoom(hostProfile);
  console.log('Salon cree:', room.code);

  const profiles = [{ profile: hostProfile, token: room.sessionToken }];
  for (let i = 2; i <= 7; i += 1) {
    const p = { playerId: `tie-p${i}`, nickname: `P${i}` };
    const joined = await joinRoom(room.code, p);
    profiles.push({ profile: p, token: joined.sessionToken });
  }

  const players = profiles.map(({ profile, token }) => makeSocket(profile, room.code, token));
  players.forEach((p) => p.socket.open());
  await Promise.all(players.map((p) => waitFor(() => p.state.joined, 10000, `${p.profile.playerId} joined`)));

  players.forEach((p) => p.socket.emit('lobby:setReady', { ready: true }));
  await waitFor(() => players.every((p) => p.state.lobby?.players?.every((s) => s.isReady)), 10000, 'all ready');

  players[0].socket.emit('lobby:startGame');
  await waitFor(() => players.every((p) => p.state.publicState !== null), 10000, 'game started');
  console.log('Partie demarree.\n');

  const ids = players.map((p) => p.profile.playerId);

  players[0].socket.emit('game:beginVote');
  await waitFor(() => players.every((p) => p.state.publicState?.phase === 'DAY_VOTE'), 10000, 'DAY_VOTE');

  // Force a tie: 3 vote for ids[0], 3 vote for ids[1], 1 votes for ids[0] to break... 
  // Actually to force an exact tie among 7 voters: 3 vote ids[0], 3 vote ids[1], 1 votes ids[2] (irrelevant, low count)
  console.log('--- Premier tour: on force une egalite entre', ids[0], 'et', ids[1], '---');
  for (let i = 0; i < 3; i += 1) players[i].socket.emit('game:submitVote', { targetId: ids[0] });
  for (let i = 3; i < 6; i += 1) players[i].socket.emit('game:submitVote', { targetId: ids[1] });
  players[6].socket.emit('game:submitVote', { targetId: ids[2] });

  await waitFor(() => players[0].state.lastVoteResult !== null, 10000, 'first vote result');
  const firstResult = players[0].state.lastVoteResult;
  console.log('\nResultat 1er tour:', JSON.stringify(firstResult));

  if (!firstResult.tieBreaker || firstResult.tieBreaker.length < 2) {
    throw new Error('ECHEC: une egalite aurait du etre detectee au premier tour');
  }
  console.log('Egalite detectee correctement, candidats:', firstResult.tieBreaker);

  await waitFor(() => players.every((p) => p.state.publicState?.phase === 'DAY_VOTE' && p.state.publicState?.tieBreakerCandidates?.length === 2), 10000, 'tie-breaker reopened');
  console.log('Le vote a bien ete rouvert, restreint aux candidats a egalite.\n');

  console.log('--- Second tour: tout le monde vote pour', ids[0], '(devrait eliminer', ids[0], ') ---');
  for (const p of players) {
    p.state.lastVoteResult = null;
  }
  for (const p of players) {
    p.socket.emit('game:submitVote', { targetId: ids[0] });
  }

  await waitFor(() => players[0].state.lastVoteResult !== null, 10000, 'second vote result');
  const secondResult = players[0].state.lastVoteResult;
  console.log('\nResultat 2e tour:', JSON.stringify(secondResult));

  if (secondResult.eliminated !== ids[0]) {
    throw new Error(`ECHEC: ${ids[0]} aurait du etre elimine au second tour, mais resultat = ${JSON.stringify(secondResult)}`);
  }

  console.log('\n=== TEST EGALITE DE VOTE: SUCCES ===');
  players.forEach((p) => p.socket.disconnect());
}

run().catch((err) => {
  console.error('\n!!! TEST EGALITE ECHOUE !!!', err.message);
  process.exit(1);
});
