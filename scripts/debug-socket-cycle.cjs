const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');
const BASE_URL = 'http://localhost:3000';
const ROOM_API = `${BASE_URL}/api/rooms`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createPlayer(profile) {
  const socket = io(BASE_URL, { transports: ['websocket'], autoConnect: false });
  const state = { lobby: null, publicState: null, privateState: null, errors: [], joined: false };

  socket.on('connect', () => {
    console.log(profile.playerId, 'connected');
    socket.emit('lobby:join', {
      code: profile.code,
      playerId: profile.playerId,
      nickname: profile.nickname,
      avatar: profile.avatar,
    });
  });
  socket.on('disconnect', (reason) => console.log(profile.playerId, 'disconnect', reason));
  socket.on('connect_error', (err) => console.log(profile.playerId, 'connect_error', err && err.message));
  socket.on('lobby:joined', (data) => { console.log(profile.playerId, 'lobby:joined', JSON.stringify(data)); state.joined = true; });
  socket.on('lobby:state', (data) => { console.log(profile.playerId, 'lobby:state', JSON.stringify(data)); state.lobby = data; });
  socket.on('lobby:error', (err) => { console.log(profile.playerId, 'lobby:error', JSON.stringify(err)); state.errors.push(['lobby:error', err]); });
  socket.on('game:publicState', (data) => { console.log(profile.playerId, 'game:publicState', JSON.stringify(data)); state.publicState = data; });
  socket.on('game:privateState', (data) => { console.log(profile.playerId, 'game:privateState', JSON.stringify(data)); state.privateState = data; });
  socket.on('game:voteResult', (data) => { console.log(profile.playerId, 'game:voteResult', JSON.stringify(data)); });
  socket.on('game:nightResult', (data) => { console.log(profile.playerId, 'game:nightResult', JSON.stringify(data)); });
  socket.on('game:error', (err) => { console.log(profile.playerId, 'game:error', JSON.stringify(err)); state.errors.push(['game:error', err]); });

  return { profile, socket, state };
}

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
    { playerId: 'host-debug', nickname: 'HostDebug', avatar: null, code: room.code },
    { playerId: 'player2-debug', nickname: 'P2', avatar: null, code: room.code },
    { playerId: 'player3-debug', nickname: 'P3', avatar: null, code: room.code },
  ];

  const players = profiles.map(createPlayer);
  players.forEach((player) => player.socket.open());

  for (const player of players) {
    await waitFor(() => player.state.joined, 10000, `${player.profile.playerId} join`);
  }
  console.log('all players joined');

  players.forEach((player) => {
    player.socket.emit('lobby:setReady', { ready: true });
    console.log(player.profile.playerId, 'set ready');
  });
  await delay(1000);

  players[0].socket.emit('lobby:startGame');
  console.log('host emitted lobby:startGame');

  await waitFor(() => players.some((p) => p.state.publicState !== null), 10000, 'game public state');
  console.log('game public state received');
  console.log('public states:', players.map((p) => ({ id: p.profile.playerId, state: p.state.publicState } )));

  players.forEach((player) => player.socket.disconnect());
}

main().catch((err) => { console.error(err); process.exit(1); });
