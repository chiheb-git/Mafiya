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
  const state = { joined: false, lobby: null, publicState: null, privateState: null };
  socket.on('lobby:joined', () => { state.joined = true; });
  socket.on('lobby:state', (d) => { state.lobby = d; });
  socket.on('lobby:error', (e) => { console.log(profile.playerId, 'lobby:error', e); });
  socket.on('game:publicState', (d) => { state.publicState = d; });
  socket.on('game:privateState', (d) => { state.privateState = d; console.log(profile.playerId, 'received privateState role=', d.role, 'phase=', d.phase, 'isAlive=', d.isAlive); });
  socket.on('connect', () => { socket.emit('lobby:join', { code, playerId: profile.playerId, nickname: profile.nickname, avatar: null, sessionToken }); });
  return { profile, socket, state, sessionToken };
}

async function waitFor(predicate, timeout = 8000, label = 'wait') {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function run() {
  console.log('=== TEST DE RECONNEXION : joueur vivant ===\n');

  const hostProfile = { playerId: 'host-r', nickname: 'HostR' };
  const room = await createRoom(hostProfile);
  console.log('Salon créé:', room.code);

  const profiles = [
    { profile: hostProfile, token: room.sessionToken },
  ];
  for (let i = 2; i <= 7; i += 1) {
    const p = { playerId: `player-r${i}`, nickname: `P${i}` };
    const joined = await joinRoom(room.code, p);
    profiles.push({ profile: p, token: joined.sessionToken });
  }

  const players = profiles.map(({ profile, token }) => makeSocket(profile, room.code, token));
  players.forEach((p) => p.socket.open());
  await Promise.all(players.map((p) => waitFor(() => p.state.joined, 8000, `${p.profile.playerId} joined`)));
  console.log('Tous les joueurs ont rejoint le lobby.');

  players.forEach((p) => p.socket.emit('lobby:setReady', { ready: true }));
  await waitFor(() => players.every((p) => p.state.lobby?.players?.every((s) => s.isReady)), 8000, 'all ready');

  const host = players[0];
  host.socket.emit('lobby:startGame');
  await waitFor(() => players.every((p) => p.state.publicState !== null), 8000, 'game started for all');
  console.log('Partie démarrée. Phase:', players[0].state.publicState.phase);

  // Pick a live, non-host player to disconnect mid-game
  const target = players[3]; // player-r4
  console.log(`\n--- Déconnexion de ${target.profile.playerId} en pleine partie ---`);
  const roleBefore = target.state.privateState?.role;
  const tokenUsed = target.sessionToken;
  target.socket.disconnect();
  await delay(1000);

  console.log(`--- Reconnexion de ${target.profile.playerId} avec son token ---`);
  const reconnected = makeSocket(target.profile, room.code, tokenUsed);
  reconnected.socket.open();
  await waitFor(() => reconnected.state.joined, 8000, 'reconnect joined');
  await waitFor(() => reconnected.state.privateState !== null, 8000, 'reconnect privateState');

  console.log('\nRôle avant déconnexion:', roleBefore);
  console.log('Rôle après reconnexion:', reconnected.state.privateState.role);
  console.log('Phase après reconnexion:', reconnected.state.publicState?.phase);

  if (reconnected.state.privateState.role !== roleBefore) {
    throw new Error('ÉCHEC: le rôle a changé après reconnexion !');
  }
  if (!reconnected.state.publicState || reconnected.state.publicState.phase !== players[0].state.publicState.phase) {
    throw new Error('ÉCHEC: la phase de jeu ne correspond pas après reconnexion !');
  }

  console.log('\n=== RECONNEXION JOUEUR VIVANT: SUCCÈS ===');
  players.forEach((p) => p.socket.disconnect());
  reconnected.socket.disconnect();
}

run().catch((err) => {
  console.error('\n!!! TEST DE RECONNEXION ÉCHOUÉ !!!', err.message);
  process.exit(1);
});
