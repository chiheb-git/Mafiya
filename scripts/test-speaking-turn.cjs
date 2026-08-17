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
  console.log('=== TEST TOUR DE PAROLE ===\n');

  const hostProfile = { playerId: 'sp-host', nickname: 'SpHost' };
  const room = await createRoom(hostProfile);
  console.log('Salon cree:', room.code);

  const profiles = [{ profile: hostProfile, token: room.sessionToken }];
  for (let i = 2; i <= 7; i += 1) {
    const p = { playerId: `sp-p${i}`, nickname: `P${i}` };
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

  await waitFor(() => Boolean(players[0].state.publicState?.currentSpeakerId), 10000, 'first speaker assigned');
  const firstSpeakerId = players[0].state.publicState.currentSpeakerId;
  console.log('\nPremier orateur:', firstSpeakerId);
  console.log('speakingEndsAt present:', Boolean(players[0].state.publicState.speakingEndsAt));

  const speakerIndex = players.findIndex((p) => p.profile.playerId === firstSpeakerId);
  if (speakerIndex === -1) throw new Error('Orateur introuvable dans la liste des joueurs');

  const speakerPrivate = players[speakerIndex].state.privateState;
  if (!speakerPrivate?.isMyTurnToSpeak) {
    throw new Error('ECHEC: le joueur designe comme orateur ne voit pas isMyTurnToSpeak=true');
  }
  console.log('isMyTurnToSpeak confirme pour', firstSpeakerId);

  console.log('\n--- Le premier orateur clique sur "je passe" ---');
  players[speakerIndex].socket.emit('game:passSpeaking');

  await waitFor(() => players[0].state.publicState?.currentSpeakerId !== firstSpeakerId, 10000, 'speaker advanced after pass');
  const secondSpeakerId = players[0].state.publicState.currentSpeakerId;
  console.log('Nouvel orateur apres "je passe":', secondSpeakerId);

  if (secondSpeakerId === firstSpeakerId) {
    throw new Error('ECHEC: l\'orateur n\'a pas change apres "je passe"');
  }

  console.log('\n--- Un joueur qui n\'est PAS l\'orateur essaie de passer (doit etre rejete) ---');
  const wrongIndex = players.findIndex((p) => p.profile.playerId !== secondSpeakerId);
  let rejected = false;
  players[wrongIndex].socket.once('game:error', (err) => { rejected = true; console.log('Rejet recu:', err); });
  players[wrongIndex].socket.emit('game:passSpeaking');
  await delay(1000);
  if (!rejected) {
    throw new Error('ECHEC: un joueur qui n\'est pas l\'orateur a pu passer son tour sans erreur');
  }

  console.log('\n=== TEST TOUR DE PAROLE: SUCCES ===');
  players.forEach((p) => p.socket.disconnect());
}

run().catch((err) => {
  console.error('\n!!! TEST TOUR DE PAROLE ECHOUE !!!', err.message);
  process.exit(1);
});
