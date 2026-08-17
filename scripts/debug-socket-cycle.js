const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');
const BASE_URL = 'http://localhost:3000';
const ROOM_API = `${BASE_URL}/api/rooms`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRoom() {
  const res = await fetch(ROOM_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 7, host: { playerId: 'host-debug', nickname: 'HostDebug', avatar: null } }),
  });
  const text = await res.text();
  console.log('create status', res.status, text);
  if (!res.ok) throw new Error('create failed');
  return JSON.parse(text);
}

function makeSocket(profile) {
  const socket = io(BASE_URL, { transports: ['websocket'], autoConnect: false });
  const state = { lobby: null, publicState: null, privateState: null, errors: [] };
  socket.on('connect', () => console.log(profile.playerId, 'connected'));
  socket.on('disconnect', (reason) => console.log(profile.playerId, 'disconnect', reason));
  socket.on('lobby:joined', (d) => console.log(profile.playerId, 'lobby:joined', d));
  socket.on('lobby:state', (d) => { console.log(profile.playerId, 'lobby:state', JSON.stringify(d)); state.lobby = d; });
  socket.on('lobby:error', (err) => { console.log(profile.playerId, 'lobby:error', JSON.stringify(err)); state.errors.push(['lobby:error', err]); });
  socket.on('game:publicState', (d) => { console.log(profile.playerId, 'game:publicState', JSON.stringify(d)); state.publicState = d; });
  socket.on('game:privateState', (d) => { console.log(profile.playerId, 'game:privateState', JSON.stringify(d)); state.privateState = d; });
  socket.on('game:voteResult', (d) => console.log(profile.playerId, 'game:voteResult', JSON.stringify(d)));
  socket.on('game:nightResult', (d) => console.log(profile.playerId, 'game:nightResult', JSON.stringify(d)));
  socket.on('game:error', (err) => { console.log(profile.playerId, 'game:error', JSON.stringify(err)); state.errors.push(['game:error', err]); });
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

async function main() {
  const room = await createRoom();
  console.log('created room', room.code);
  const profiles = [
    { playerId: 'host-debug', nickname: 'HostDebug', avatar: null },
    { playerId: 'player2-debug', nickname: 'P2', avatar: null },
    { playerId: 'player3-debug', nickname: 'P3', avatar: null },
  ];
  const players = profiles.map((profile) => makeSocket(profile));
  players.forEach((player) => player.socket.open());
  await Promise.all(players.map((player) => waitFor(() => player.state.lobby !== null, 10000, `${player.profile.playerId} joined`)));
  console.log('all joined');
  players.forEach((player) => {
    player.socket.emit('lobby:setReady', { ready: true });
    console.log(player.profile.playerId, 'set ready');
  });
  await delay(1000);
  players[0].socket.emit('lobby:startGame');
  console.log('sent lobby:startGame');
  await waitFor(() => players.some((p) => p.state.publicState !== null), 10000, 'first publicState');
  console.log('public state arrived');
  await delay(2000);
  players.forEach((player) => player.socket.disconnect());
}

main().catch((err) => { console.error(err); process.exit(1); });
