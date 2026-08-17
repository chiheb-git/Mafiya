const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const ROOM_API = `${BASE_URL}/api/rooms`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoom(host) {
  const res = await fetch(ROOM_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 14, host }) });
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
  socket.on('game:privateState', (d) => { state.privateState = d; });
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
  console.log('=== TEST MODE 14 JOUEURS ===\n');

  const hostProfile = { playerId: 'host-14', nickname: 'Host14' };
  const room = await createRoom(hostProfile);
  console.log('Salon créé (mode', room.mode, '):', room.code);
  if (room.mode !== 14) throw new Error(`Mode incorrect: attendu 14, reçu ${room.mode}`);
  if (room.capacity !== 14) throw new Error(`Capacité incorrecte: attendu 14, reçu ${room.capacity}`);

  const profiles = [{ profile: hostProfile, token: room.sessionToken }];
  for (let i = 2; i <= 14; i += 1) {
    const p = { playerId: `p14-${i}`, nickname: `P${i}` };
    const joined = await joinRoom(room.code, p);
    profiles.push({ profile: p, token: joined.sessionToken });
  }
  console.log('14 joueurs inscrits en base.');

  const players = profiles.map(({ profile, token }) => makeSocket(profile, room.code, token));
  players.forEach((p) => p.socket.open());
  await Promise.all(players.map((p) => waitFor(() => p.state.joined, 10000, `${p.profile.playerId} joined`)));
  console.log('Tous les 14 joueurs ont rejoint le lobby.');

  players.forEach((p) => p.socket.emit('lobby:setReady', { ready: true }));
  await waitFor(() => players.every((p) => p.state.lobby?.players?.every((s) => s.isReady)), 10000, 'all ready');
  console.log('Tous prêts.');

  players[0].socket.emit('lobby:startGame');
  await waitFor(() => players.every((p) => p.state.publicState !== null && p.state.privateState !== null), 10000, 'game started for all');
  console.log('Partie démarrée avec', players[0].state.publicState.alivePlayerIds.length, 'joueurs vivants.\n');

  const roleCounts = {};
  players.forEach((p) => {
    const role = p.state.privateState.role;
    roleCounts[role] = (roleCounts[role] ?? 0) + 1;
  });
  console.log('Répartition des rôles:', roleCounts);

  const mafiaCount = (roleCounts['MAFIA_ALPHA'] ?? 0) + (roleCounts['MAFIA_MUT'] ?? 0) + (roleCounts['MAFIA_SOLDIER'] ?? 0);
  const villagerCount = roleCounts['VILLAGER'] ?? 0;
  console.log('\nTotal Mafia:', mafiaCount, '(attendu: 3)');
  console.log('Total Villageois génériques:', villagerCount);
  console.log('Total joueurs:', players.length, '(attendu: 14)');

  if (mafiaCount !== 3) {
    throw new Error(`ÉCHEC: le mode 14 devrait avoir 3 Mafia, mais en a ${mafiaCount}. Le moteur de rôles ne scale pas selon le mode.`);
  }

  console.log('\n=== MODE 14 JOUEURS: RÉPARTITION CORRECTE ===');
  players.forEach((p) => p.socket.disconnect());
}

run().catch((err) => {
  console.error('\n!!! TEST MODE 14 ÉCHOUÉ !!!', err.message);
  process.exit(1);
});

