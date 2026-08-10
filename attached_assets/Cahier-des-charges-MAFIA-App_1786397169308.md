# 🎭 CAHIER DES CHARGES — APPLICATION MOBILE "MAFIA"

## Contexte du projet

Je souhaite développer une **véritable application mobile multijoueur en temps réel**, basée sur le jeu social "Mafia", destinée à une **publication réelle sur le Google Play Store**. Il ne s'agit pas d'un prototype ou d'une maquette : je veux un produit fonctionnel de bout en bout, avec un vrai backend, une vraie synchronisation temps réel, et une expérience utilisateur premium et cinématographique.

---

## 1. Stack technique imposée

### Mobile
- React Native + Expo
- TypeScript
- Expo Router
- Zustand ou Redux Toolkit (état global)
- React Native Reanimated (animations)
- Lottie (animations spécifiques)
- Expo AV ou équivalent (gestion audio)
- Priorité Android, architecture prête pour iOS

### Backend
- Node.js + TypeScript
- Express
- Socket.IO (temps réel — source de vérité absolue du jeu)

### Base de données
- **Stockage local (sur l'appareil)** : préférences utilisateur, pseudo, paramètres, cache léger (ex. AsyncStorage / SQLite local)
- **Base de données en ligne (PostgreSQL + Prisma ORM)** : toutes les données critiques de partie — comptes, salons, rôles, votes, actions, historique, statuts des joueurs

> Règle d'or : le téléphone d'un joueur ne doit **jamais** être la source de vérité pour une règle de jeu (rôle, vote, élimination, timer). Le serveur valide tout.

---

## 2. Parcours utilisateur et règles du jeu

### 2.1 Première ouverture
- Écran d'accueil premium avec logo **MAFIA**
- Saisie obligatoire du **pseudo** à la première utilisation, enregistré localement (jamais redemandé ensuite)
- Accès ultérieur à la modification du pseudo, de l'avatar et des paramètres

### 2.2 Choix du mode de partie
Deux formats disponibles, choisis par le créateur du salon :
- **Mode 7 joueurs** → 5 Citoyens / 2 Mafia
- **Mode 14 joueurs** → 11 Citoyens / 3 Mafia

### 2.3 Créer / Rejoindre un groupe
- **Créer un groupe** : génère automatiquement un **code unique à 10 chiffres**
- **Rejoindre un groupe** : saisie du code pour accéder au salon existant
- Le serveur vérifie le nombre exact de places défini par le mode choisi (ex. mode 7 → le 8ᵉ joueur est automatiquement refusé, "GROUPE COMPLET")
- Le créateur du salon devient automatiquement **Chef du groupe**

### 2.4 Lobby (salon d'attente)
- Liste des joueurs avec avatar, pseudo, statut (prêt / en attente)
- Le Chef du groupe est identifié visuellement (icône/couronne)
- Communication disponible pour tout le groupe :
  - **Chat textuel** (message écrit, horodaté)
  - **Chat vocal** (micro activable/désactivable individuellement, façon appel vocal classique)
- La partie ne peut démarrer que si **tous** les joueurs ont cliqué sur "Prêt" — impossible de contourner cette règle

### 2.5 Attribution des rôles
- Distribution **aléatoire et secrète**, gérée exclusivement côté serveur
- Chaque joueur ne reçoit que les informations le concernant (jamais la liste complète des rôles)
- Séquence de révélation cinématique : signal sonore ("Les mafia, regardez votre téléphone"), puis écran de rôle
- Les membres de la Mafia voient en plus l'identité de leurs coéquipiers

### 2.6 Objectifs
- **Citoyens** : démasquer et éliminer tous les membres de la Mafia
- **Mafia** : semer le doute pour faire éliminer les Citoyens par le vote

### 2.7 Boucle de jeu (cycle par manche)

1. **Discussion** — tour par tour
   - Chaque joueur dispose de **60 secondes** de parole
   - Un bouton **"Je passe"** permet de terminer son tour avant la fin du temps
   - À la fin du temps (ou au "je passe"), la parole passe automatiquement au joueur suivant

2. **Vote**
   - Tous les joueurs vivants votent pour un suspect via une liste affichée à tous
   - Le joueur ayant obtenu le plus de votes est éliminé : son rôle est révélé publiquement
   - Le joueur éliminé devient **spectateur** (peut continuer à regarder, plus jamais interagir)
   - En cas d'égalité : second tour de vote entre les joueurs à égalité ; si l'égalité persiste, personne n'est éliminé et la partie passe à la nuit suivante

3. **Nuit** — durée totale **60 secondes**, séquence strictement ordonnée côté serveur :
   - **Phase Alpha** : l'Alpha (chef de la Mafia) choisit une victime parmi les joueurs vivants. Bouton "Passer" réservé uniquement à l'Alpha.
   - **Phase Mut** (juste après l'Alpha, durée max **30 secondes**, avec bouton "Passer") : le Mut choisit un joueur (Citoyen, Mafia, ou lui-même) qui sera rendu muet — micro bloqué — durant la prochaine phase de discussion
   - Résolution automatique par le serveur : annonce "L'Alpha a éliminé [nom]" (sauf sauvetage, voir Secouriste)

### 2.8 Conditions de victoire
- **Victoire Citoyens** : tous les membres de la Mafia sont éliminés
- **Victoire Mafia** : le nombre de Mafia vivants atteint (ou dépasse) le nombre de Citoyens vivants

---

## 3. Rôles spéciaux

### Côté Mafia

| Rôle | Capacité |
|---|---|
| **Alpha** | Chef de la Mafia. Chaque nuit, choisit la victime à éliminer dans une liste des joueurs vivants. Seul rôle avec bouton "Passer" visible pendant la phase de nuit. |
| **Mut** | Chaque nuit, juste après l'Alpha, rend un joueur muet (Citoyen, Mafia ou lui-même) pour la prochaine discussion (max 30 s, micro bloqué). Bouton "Passer" disponible. |

### Côté Citoyens

| Rôle | Capacité |
|---|---|
| **Mire** | Peut se révéler publiquement en jeu comme "Mire". Une fois révélée, son vote compte pour **3 voix**. |
| **Le Fils** | S'il est éliminé (par vote ou par la Mafia), il choisit immédiatement un autre joueur vivant qui est éliminé avec lui. |
| **Secouriste** | Après le choix de l'Alpha, peut désigner un joueur à protéger. Si sa cible correspond à la victime de l'Alpha, celle-ci est sauvée et reste en jeu. Ordre de résolution serveur : 1) Alpha choisit → 2) Secouriste choisit → 3) résolution → 4) annonce du résultat. |
| **Tireur** | Dispose d'**une seule balle** pour toute la partie (bouton "Tirer"). S'il tire sur un membre de la Mafia : celle-ci est éliminée et le Tireur survit. S'il tire sur un Citoyen : le Tireur **et** la cible sont éliminés tous les deux. Capacité définitivement consommée après usage. |

---

## 4. Spectateurs

Un joueur éliminé (vote, Mafia, ou capacité) devient spectateur :
- Peut continuer à observer les phases, timers et joueurs vivants
- Ne peut plus voter, utiliser de capacité, parler pendant les phases réservées aux joueurs actifs, ni influencer la partie de quelque façon que ce soit

---

## 5. Exigences temps réel (Socket.IO)

Le serveur doit gérer intégralement :
- Création/jointure/départ de salon, statut READY, démarrage de partie
- Synchronisation des phases et des **chronomètres** (jamais de `setTimeout` local seul — le client n'affiche que ce que le serveur lui envoie : phase actuelle, heure de début, durée)
- Tours de parole, votes (secrets jusqu'à révélation), actions de nuit, mute, éliminations
- Distribution et confidentialité des rôles
- **Reconnexion** : en cas de perte de connexion, la partie continue ; au retour du joueur, récupération automatique de son rôle, de la phase en cours, du timer et de son statut vivant/mort — jamais de redémarrage de partie à cause d'une déconnexion

### Sécurité côté serveur (obligatoire)
- Validation systématique des données et des permissions (ex. un Citoyen ne peut jamais déclencher une action Mafia ; un joueur mort ne peut pas voter)
- Rate limiting, sanitation du chat, protection contre l'injection
- Le frontend ne fait que **demander** une action ; le serveur **valide et exécute**
- Aucune clé/secret en dur dans le code (variables d'environnement)

---

## 6. Direction artistique

Identité visuelle **dark cinematic**, mystérieuse et immersive :
- Palette : noir profond, gris charbon, rouge sang très sombre en accent, blanc cassé pour les textes
- Effets : glassmorphism sombre, fumée, brouillard animé, particules, lueurs rouges discrètes, vignettage
- Animations lentes et fluides (fade, zoom lent, parallaxe, cartes qui se retournent), jamais rapides ni "cartoon"
- Haptic feedback sur les moments clés (vote, élimination, révélation, victoire)
- Design audio : ambiances (vent, pluie, ville nocturne), tension (battement de cœur), effets d'action (vote, élimination, révélation), silences volontaires avant les révélations
- Principe UX : **80 % atmosphère / 20 % interface** — mais boutons, timers et actions disponibles doivent rester immédiatement clairs et lisibles, même dans un design très sombre
- À proscrire : couleurs pastel, bleu clair, interfaces blanches, style enfantin/cartoon, boutons génériques

### Écrans minimum à livrer
Splash • Onboarding/pseudo • Home • Créer groupe • Rejoindre groupe • Code du groupe • Lobby • Chat • Voice room • Ready room • Révélation du rôle • Nuit • Discussion • Tour de parole • Vote • Résultat du vote • Action Alpha • Action Mut • Action Secouriste • Action Tireur • Action du Fils • Élimination • Spectateur • Victoire Citoyens • Victoire Mafia • Paramètres • Profil

---

## 7. Architecture attendue

```
/mobile
  /app /components /screens /features /store /services /hooks /utils /assets /audio /animations /types
/backend
  /src /controllers /services /socket /middleware /game /roles /phases /voting /database /utils
/database
```

Base de données (PostgreSQL/Prisma) — tables minimum : `users`, `rooms`, `room_players`, `games`, `game_players`, `roles`, `game_phases`, `votes`, `night_actions`, `chat_messages`, `game_events`, `player_status`.

Le jeu doit être piloté par une **vraie machine à états** côté serveur (LOBBY → ROLE_REVEAL → NIGHT → DISCUSSION → VOTING → VOTE_RESULT → CHECK_WINNER → NIGHT…), empêchant toute action impossible pendant une phase donnée.

---

## 8. Préparation Google Play Store

- Package ID configurable, icône, splash, versioning, build de production via EAS
- Permissions minimales (micro demandé uniquement au moment où il est nécessaire)
- Politique de confidentialité, description et captures d'écran Play Store

---

## 9. Ordre de développement souhaité

1. Architecture du projet
2. Onboarding + pseudo + Home
3. Création / jointure de groupe
4. Lobby + chat
5. Synchronisation temps réel
6. Système de jeu 7 joueurs
7. Système de jeu 14 joueurs
8. Rôles spéciaux (Alpha, Mut, Mire, Fils, Secouriste, Tireur)
9. Chat vocal
10. Animations + sons
11. Reconnexion + sécurité
12. Tests
13. Build Android de production

Pour chaque fonctionnalité : 1) logique backend → 2) événements Socket.IO → 3) validations serveur → 4) interface mobile → 5) connexion frontend/backend → 6) test multi-joueurs → 7) correctifs → 8) fonctionnalité suivante. Ne jamais livrer une interface sans logique backend fonctionnelle derrière.

---

## 10. Résultat final attendu

Une application mobile **MAFIA**, fonctionnelle de bout en bout (pas une maquette), permettant à un groupe d'amis de jouer en temps réel en mode 7 ou 14 joueurs, avec vrai multijoueur, vrai chat, vrai vocal, vrais timers serveur, vrais votes, vraies actions de nuit, reconnexion fiable, sécurité serveur complète, et une identité visuelle premium prête pour une publication réelle sur le Google Play Store.
