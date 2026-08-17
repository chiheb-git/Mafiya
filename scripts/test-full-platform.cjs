const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const ROOM_API = `${BASE_URL}/api/rooms`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const results = [];
function report(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} - ${name}${detail ? ' : ' + detail : ''}`);
}

// Neon (base HTTP serverless) peut avoir un hoquet reseau transitoire meme
// hors "cold start". On retente une fois avant d'abandonner, pour ne pas
// faire echouer tout le test a cause d'un blip d'une seconde.
async function fetchWithRetry(url, options, retries = 2, backoffMs = 600) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await delay(backoffMs * (attempt + 1));
    }
  }
  throw lastErr;
}

async function createRoom(mode, host) {
  const res = await fetchWithRetry(ROOM_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, host }),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function joinRoom(code, body) {
  const res = await fetchWithRetry(`${ROOM_API}/${code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function makeSocket(profile, code, sessionToken) {
  const socket = io(BASE_URL, { transports: ['websocket'], autoConnect: false });
  const state = {
    joined: false,
    lobby: null,
    publicState: null,
    privateState: null,
    lastVoteResult: null,
    lastNightResult: null,
    errors: [],
  };
  socket.on('lobby:joined', () => { state.joined = true; });
  socket.on('lobby:state', (d) => { state.lobby = d; });
  socket.on('lobby:error', (e) => { state.errors.push(['lobby:error', e]); });
  socket.on('game:publicState', (d) => { state.publicState = d; });
  socket.on('game:privateState', (d) => { state.privateState = d; });
  socket.on('game:voteResult', (d) => { state.lastVoteResult = d; });
  socket.on('game:nightResult', (d) => { state.lastNightResult = d; });
  socket.on('game:error', (e) => { state.errors.push(['game:error', e]); });
  socket.on('connect', () => {
    socket.emit('lobby:join', { code, playerId: profile.playerId, nickname: profile.nickname, avatar: null, sessionToken });
  });
  return { profile, socket, state, sessionToken };
}

async function waitFor(predicate, timeout = 12000, label = 'wait') {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error(`Timeout waiting for ${label}`);
}

// Ouvre les sockets un par un (petit ecart) plutot que tous d'un coup :
// chaque connexion declenche une lecture DB cote serveur, et Neon HTTP
// n'aime pas les rafales de dizaines de requetes simultanees.
async function openSocketsStaggered(players, gapMs = 120) {
  for (const p of players) {
    p.socket.open();
    await delay(gapMs);
  }
}

async function setupPlayers(mode, prefix) {
  const hostProfile = { playerId: `${prefix}-host`, nickname: 'Host' };
  const room = await createRoom(mode, hostProfile);
  const profiles = [{ profile: hostProfile, token: room.sessionToken }];
  for (let i = 2; i <= mode; i += 1) {
    const p = { playerId: `${prefix}-p${i}`, nickname: `P${i}` };
    const joined = await joinRoom(room.code, p);
    profiles.push({ profile: p, token: joined.sessionToken });
    await delay(150); // laisse Neon respirer entre chaque creation/jointure REST
  }
  const players = profiles.map(({ profile, token }) => makeSocket(profile, room.code, token));
  await openSocketsStaggered(players, 120);
  await Promise.all(players.map((p) => waitFor(() => p.state.joined, 12000, `${p.profile.playerId} joined`)));
  players.forEach((p) => p.socket.emit('lobby:setReady', { ready: true }));
  await waitFor(() => players.every((p) => p.state.lobby?.players?.every((s) => s.isReady)), 12000, 'all ready');
  return { room, players };
}

async function testHealthCheck() {
  const res = await fetchWithRetry(`${BASE_URL}/api/healthz`);
  const ok = res.ok;
  report('Serveur backend accessible (healthz)', ok);
  return ok;
}

async function testRoomCreationSpeed() {
  const start = Date.now();
  const room = await createRoom(7, { playerId: 'speed-test', nickname: 'Speed' });
  const elapsed = Date.now() - start;
  // Le premier appel apres demarrage reveille la connexion Neon (cold start,
  // couramment 5-8s). On tolere jusqu'a 15s pour ne pas confondre un
  // comportement normal avec une regression.
  const ok = Boolean(room.code) && elapsed < 15000;
  report('Creation de salon (connexion DB, cold start tolere)', ok, `${elapsed}ms`);
  return ok;
}

async function testSecurity() {
  try {
    const room = await createRoom(7, { playerId: 'sec-host', nickname: 'SecHost' });
    const legit = makeSocket({ playerId: 'sec-host', nickname: 'SecHost' }, room.code, room.sessionToken);
    legit.socket.open();
    await waitFor(() => legit.state.joined, 8000, 'legit join');
    legit.socket.disconnect();

    const impostor = makeSocket({ playerId: 'sec-host', nickname: 'Impostor' }, room.code, 'fake-token-123');
    impostor.socket.open();
    await delay(2000);
    const blocked = !impostor.state.joined && impostor.state.errors.length > 0;
    impostor.socket.disconnect();

    report('Securite anti-usurpation (token invalide rejete)', blocked);
    return blocked;
  } catch (err) {
    report('Securite anti-usurpation', false, err.message);
    return false;
  }
}

async function testMode14RoleDistribution() {
  try {
    const { players } = await setupPlayers(14, 'm14');
    players[0].socket.emit('lobby:startGame');
    await waitFor(
      () => players.every((p) => p.state.publicState !== null && p.state.privateState !== null),
      12000,
      'mode14 game started',
    );
    const mafiaCount = players.filter((p) =>
      ['MAFIA_ALPHA', 'MAFIA_MUT', 'MAFIA_SOLDIER'].includes(p.state.privateState.role),
    ).length;
    const ok = mafiaCount === 3 && players.length === 14;
    report('Mode 14 joueurs : repartition 3 Mafia / 11 non-Mafia', ok, `${mafiaCount} mafia trouves`);
    players.forEach((p) => p.socket.disconnect());
    return ok;
  } catch (err) {
    report('Mode 14 joueurs : repartition des roles', false, err.message);
    return false;
  }
}

async function testFullCycleMode7() {
  try {
    const { players } = await setupPlayers(7, 'cyc');
    players[0].socket.emit('lobby:startGame');
    await waitFor(
      () => players.every((p) => p.state.publicState !== null && p.state.privateState !== null),
      12000,
      'cycle game started',
    );

    const mafiaCount = players.filter((p) => ['MAFIA_ALPHA', 'MAFIA_MUT'].includes(p.state.privateState.role)).length;
    report('Cycle complet - roles assignes (7 joueurs, 2 mafia)', mafiaCount === 2);

    const ids = players.map((p) => p.profile.playerId);
    players[0].socket.emit('game:beginVote');
    await waitFor(() => players.every((p) => p.state.publicState?.phase === 'DAY_VOTE'), 12000, 'vote phase');
    for (const p of players) p.socket.emit('game:submitVote', { targetId: ids[1] });
    await waitFor(() => players[0].state.lastVoteResult !== null, 12000, 'vote result');
    report('Cycle complet - vote et elimination', players[0].state.lastVoteResult.eliminated === ids[1]);

    players[0].socket.emit('game:advancePhase');
    await waitFor(() => players.every((p) => p.state.publicState?.phase === 'NIGHT_ACTIONS'), 12000, 'night phase');
    report('Cycle complet - transition vers la nuit', true);

    const alive = players.filter((p) => p.state.publicState.alivePlayerIds.includes(p.profile.playerId));
    const roleMap = {};
    alive.forEach((p) => { roleMap[p.state.privateState.role] = p; });
    const requiredRoles = ['MAFIA_ALPHA', 'MAFIA_MUT', 'MIRE', 'FILS', 'SECOURISTE', 'TIREUR'];
    const allPresent = requiredRoles.every((r) => roleMap[r]);
    if (allPresent) {
      const aliveIds = players[0].state.publicState.alivePlayerIds;
      const target = aliveIds.find((id) => id !== roleMap.MAFIA_ALPHA.profile.playerId) ?? aliveIds[0];
      roleMap.MAFIA_ALPHA.socket.emit('game:submitNightAction', { action: { type: 'MAFIA_KILL', target } });
      roleMap.MAFIA_MUT.socket.emit('game:submitNightAction', { action: { type: 'MAFIA_MUTE', target } });
      roleMap.MIRE.socket.emit('game:submitNightAction', { action: { type: 'MIRE_INSPECT', target } });
      roleMap.FILS.socket.emit('game:submitNightAction', { action: { type: 'FILS_INVESTIGATE', target } });
      roleMap.SECOURISTE.socket.emit('game:submitNightAction', { action: { type: 'SECOURISTE_PROTECT', target } });
      roleMap.TIREUR.socket.emit('game:submitNightAction', { action: { type: 'TIREUR_SHOOT', target } });
      await waitFor(() => players[0].state.lastNightResult !== null, 12000, 'night result');
      report('Cycle complet - actions de nuit (6 roles speciaux)', true);
    } else {
      report('Cycle complet - actions de nuit', false, 'roles speciaux manquants apres elimination');
    }

    players.forEach((p) => p.socket.disconnect());
    return true;
  } catch (err) {
    report('Cycle complet mode 7', false, err.message);
    return false;
  }
}

async function testTieBreaker() {
  try {
    const { players } = await setupPlayers(7, 'tie');
    players[0].socket.emit('lobby:startGame');
    await waitFor(() => players.every((p) => p.state.publicState !== null), 12000, 'tie game started');
    const ids = players.map((p) => p.profile.playerId);

    players[0].socket.emit('game:beginVote');
    await waitFor(() => players.every((p) => p.state.publicState?.phase === 'DAY_VOTE'), 12000, 'tie vote phase');
    for (let i = 0; i < 3; i += 1) players[i].socket.emit('game:submitVote', { targetId: ids[0] });
    for (let i = 3; i < 6; i += 1) players[i].socket.emit('game:submitVote', { targetId: ids[1] });
    players[6].socket.emit('game:submitVote', { targetId: ids[2] });
    await waitFor(() => players[0].state.lastVoteResult !== null, 12000, 'tie first result');
    const tieDetected = Boolean(players[0].state.lastVoteResult.tieBreaker);
    report('Egalite de vote - detection et second tour', tieDetected);

    players.forEach((p) => p.socket.disconnect());
    return tieDetected;
  } catch (err) {
    report('Egalite de vote', false, err.message);
    return false;
  }
}

async function testHostTransfer() {
  try {
    const hostProfile = { playerId: 'ht-host', nickname: 'HtHost' };
    const room = await createRoom(7, hostProfile);
    const p2profile = { playerId: 'ht-p2', nickname: 'P2' };
    const joined2 = await joinRoom(room.code, p2profile);

    const host = makeSocket(hostProfile, room.code, room.sessionToken);
    const player2 = makeSocket(p2profile, room.code, joined2.sessionToken);
    await openSocketsStaggered([host, player2], 150);
    await Promise.all([host, player2].map((p) => waitFor(() => p.state.joined, 8000, `${p.profile.playerId} joined`)));
    await waitFor(() => player2.state.lobby?.hostId === 'ht-host', 8000, 'initial host');

    host.socket.disconnect();
    await waitFor(() => player2.state.lobby?.hostId === 'ht-p2', 8000, 'host transferred');
    report("Transfert d'hote a la deconnexion", player2.state.lobby.hostId === 'ht-p2');
    player2.socket.disconnect();
    return true;
  } catch (err) {
    report("Transfert d'hote", false, err.message);
    return false;
  }
}

async function testSpeakingTurn() {
  try {
    const { players } = await setupPlayers(7, 'sp');
    players[0].socket.emit('lobby:startGame');
    await waitFor(() => players.every((p) => p.state.publicState !== null), 12000, 'speaking game started');
    await waitFor(() => Boolean(players[0].state.publicState?.currentSpeakerId), 12000, 'first speaker');
    const firstSpeakerId = players[0].state.publicState.currentSpeakerId;
    const speakerIndex = players.findIndex((p) => p.profile.playerId === firstSpeakerId);
    players[speakerIndex].socket.emit('game:passSpeaking');
    await waitFor(() => players[0].state.publicState?.currentSpeakerId !== firstSpeakerId, 8000, 'speaker advanced');
    report('Tour de parole - passage via "je passe"', true);
    players.forEach((p) => p.socket.disconnect());
    return true;
  } catch (err) {
    report('Tour de parole', false, err.message);
    return false;
  }
}

async function testReconnection() {
  try {
    const { room, players } = await setupPlayers(7, 'rec');
    players[0].socket.emit('lobby:startGame');
    await waitFor(
      () => players.every((p) => p.state.publicState !== null && p.state.privateState !== null),
      12000,
      'reconnect game started',
    );

    const target = players[3];
    const roleBefore = target.state.privateState.role;

    target.socket.disconnect();
    await delay(1000);

    const reconnected = makeSocket(target.profile, room.code, target.sessionToken);
    reconnected.socket.open();
    await waitFor(() => reconnected.state.joined, 8000, 'reconnect joined');
    await waitFor(() => reconnected.state.privateState !== null, 8000, 'reconnect privateState');

    const ok = reconnected.state.privateState.role === roleBefore;
    report('Reconnexion joueur vivant (role/etat preserves)', ok);

    players.filter((p) => p !== target).forEach((p) => p.socket.disconnect());
    reconnected.socket.disconnect();
    return ok;
  } catch (err) {
    report('Reconnexion joueur vivant', false, err.message);
    return false;
  }
}

async function run() {
  console.log('=== TEST COMPLET DE LA PLATEFORME MAFIA ===\n');

  const suite = [
    testHealthCheck,
    testRoomCreationSpeed,
    testSecurity,
    testMode14RoleDistribution,
    testFullCycleMode7,
    testTieBreaker,
    testHostTransfer,
    testSpeakingTurn,
    testReconnection,
  ];

  for (const test of suite) {
    await test();
    await delay(800); // laisse la connexion DB "respirer" entre deux gros tests
  }

  console.log('\n=== RAPPORT FINAL ===');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  results.forEach((r) => {
    console.log(`${r.passed ? 'âœ“' : 'âœ—'} ${r.name}${r.detail ? ' - ' + r.detail : ''}`);
  });
  console.log(`\n${passed}/${total} tests reussis`);

  if (passed === total) {
    console.log('\n=== PLATEFORME VALIDEE : TOUS LES TESTS PASSENT ===');
    process.exit(0);
  } else {
    console.log('\n=== ATTENTION : CERTAINS TESTS ONT ECHOUE ===');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\n!!! ERREUR FATALE DU SCRIPT DE TEST !!!', err.message);
  process.exit(1);
});