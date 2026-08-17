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

function connectAndJoin(code, playerId, nickname, sessionToken) {
  return new Promise((resolve) => {
    const socket = io(BASE_URL, { transports: ['websocket'], autoConnect: false });
    const result = { joined: false, error: null };

    socket.on('lobby:joined', (payload) => {
      result.joined = true;
      result.payload = payload;
    });
    socket.on('lobby:error', (err) => {
      result.error = err;
    });

    socket.on('connect', () => {
      socket.emit('lobby:join', { code, playerId, nickname, avatar: null, sessionToken });
    });

    socket.open();

    setTimeout(() => {
      socket.disconnect();
      resolve(result);
    }, 2000);
  });
}

async function run() {
  console.log('=== TEST DE SÉCURITÉ : usurpation de playerId ===\n');

  const hostProfile = { playerId: 'victim-host', nickname: 'Victim' };
  const room = await createRoom(hostProfile);
  console.log('Salon créé:', room.code);
  console.log('Token légitime reçu:', room.sessionToken ? '(présent)' : '(ABSENT — problème)');

  // Test 1: le vrai hôte se connecte avec son vrai token -> doit réussir
  console.log('\n--- Test 1: connexion légitime avec le bon token ---');
  const legit = await connectAndJoin(room.code, 'victim-host', 'Victim', room.sessionToken);
  console.log('Résultat:', legit.joined ? 'ACCEPTÉ (attendu)' : 'REJETÉ (ANORMAL)', legit.error ?? '');
  if (!legit.joined) {
    throw new Error('ÉCHEC: la connexion légitime aurait dû réussir');
  }

  // Test 2: un attaquant tente de se connecter avec le même playerId mais SANS token -> doit échouer
  console.log('\n--- Test 2: usurpation SANS token ---');
  const noToken = await connectAndJoin(room.code, 'victim-host', 'Attacker', undefined);
  console.log('Résultat:', noToken.joined ? 'ACCEPTÉ (ÉCHEC SÉCURITÉ)' : 'REJETÉ (attendu)', noToken.error ?? '');
  if (noToken.joined) {
    throw new Error('ÉCHEC CRITIQUE: usurpation sans token acceptée !');
  }

  // Test 3: un attaquant tente avec un FAUX token -> doit échouer
  console.log('\n--- Test 3: usurpation avec un faux token ---');
  const fakeToken = await connectAndJoin(room.code, 'victim-host', 'Attacker', 'faux_token_invente_1234567890');
  console.log('Résultat:', fakeToken.joined ? 'ACCEPTÉ (ÉCHEC SÉCURITÉ)' : 'REJETÉ (attendu)', fakeToken.error ?? '');
  if (fakeToken.joined) {
    throw new Error('ÉCHEC CRITIQUE: usurpation avec faux token acceptée !');
  }

  // Test 4: un nouveau joueur (jamais vu) rejoint sans token -> doit réussir (comportement normal)
  console.log('\n--- Test 4: nouveau joueur légitime sans token préalable ---');
  const newPlayer = await connectAndJoin(room.code, 'brand-new-player', 'Newcomer', undefined);
  console.log('Résultat:', newPlayer.joined ? 'ACCEPTÉ (attendu)' : 'REJETÉ (ANORMAL)', newPlayer.error ?? '');
  if (!newPlayer.joined) {
    throw new Error('ÉCHEC: un nouveau joueur aurait dû pouvoir rejoindre normalement');
  }

  console.log('\n=== TOUS LES TESTS DE SÉCURITÉ SONT PASSÉS ===');
}

run().catch((err) => {
  console.error('\n!!! TEST DE SÉCURITÉ ÉCHOUÉ !!!', err.message);
  process.exit(1);
});
