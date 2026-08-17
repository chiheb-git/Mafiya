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
  const state = { joined: false, lobby: null };
  socket.on('lobby:joined', () => { state.joined = true; });
  socket.on('lobby:state', (d) => { state.lobby = d; });
  socket.on('lobby:error', (e) => { console.log(profile.playerId, 'lobby:error', e); });
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
  console.log('=== TEST TRANSFERT HOTE ===\n');

  const hostProfile = { playerId: 'orig-host', nickname: 'OrigHost' };
  const room = await createRoom(hostProfile);
  console.log('Salon cree:', room.code);

  const p2 = { playerId: 'p2', nickname: 'P2' };
  const p3 = { playerId: 'p3', nickname: 'P3' };
  const joined2 = await joinRoom(room.code, p2);
  const joined3 = await joinRoom(room.code, p3);

  const host = makeSocket(hostProfile, room.code, room.sessionToken);
  const player2 = makeSocket(p2, room.code, joined2.sessionToken);
  const player3 = makeSocket(p3, room.code, joined3.sessionToken);

  [host, player2, player3].forEach((p) => p.socket.open());
  await Promise.all([host, player2, player3].map((p) => waitFor(() => p.state.joined, 8000, `${p.profile.playerId} joined`)));
  await waitFor(() => player2.state.lobby?.hostId === 'orig-host', 8000, 'initial host confirmed');
  console.log('Hote initial confirme:', player2.state.lobby.hostId);

  console.log('\n--- Deconnexion de l\'hote original ---');
  host.socket.disconnect();

  await waitFor(() => player2.state.lobby?.hostId && player2.state.lobby.hostId !== 'orig-host', 8000, 'host transferred');
  console.log('Nouvel hote:', player2.state.lobby.hostId);

  const hostFlags = player2.state.lobby.players.filter((p) => p.isHost);
  if (hostFlags.length !== 1) {
    throw new Error(`ECHEC: il devrait y avoir exactement 1 hote, trouve ${hostFlags.length}`);
  }
  if (player2.state.lobby.hostId === 'orig-host') {
    throw new Error('ECHEC: le statut hote n\'a pas ete transfere');
  }

  console.log('\n=== TEST TRANSFERT HOTE: SUCCES ===');
  player2.socket.disconnect();
  player3.socket.disconnect();
}

run().catch((err) => {
  console.error('\n!!! TEST TRANSFERT HOTE ECHOUE !!!', err.message);
  process.exit(1);
});
