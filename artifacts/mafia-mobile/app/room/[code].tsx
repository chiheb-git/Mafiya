import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useLobbySocket } from '@/hooks/useLobbySocket';
import { useAudioRecorderState, useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, getRecordingPermissionsAsync, useAudioPlayer } from 'expo-audio';
import { GlassPanel, GlowOrb, PressableScale } from '@/components/cinematic';

export default function RoomCode() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code: string }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code ?? '';
  const [message, setMessage] = useState('');
  const [speakingSecondsLeft, setSpeakingSecondsLeft] = useState<number | null>(null);
  const victoryOpacity = useRef(new Animated.Value(0)).current;
  const victoryScale = useRef(new Animated.Value(0.9)).current;

  const {
    profile,
    lobbyState,
    gamePublicState,
    gamePrivateState,
    gameResult,
    error,
    connected,
    setReady,
    setMic,
    sendMessage,
    startGame,
    beginVote,
    submitVote,
    submitNightAction,
    advancePhase,
    passSpeaking,
  } = useLobbySocket(code);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const ambiencePlayer = useAudioPlayer(require('@/assets/audio/lobby-ambience.mp3'));
  const gunshotPlayer = useAudioPlayer(require('@/assets/audio/gunshot.mp3'));
  const lastEliminatedRef = useRef<string | null>(null);

  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [roleRevealDismissed, setRoleRevealDismissed] = useState(false);
  const [revealSuspense, setRevealSuspense] = useState(true);
  const roleCardScale = useRef(new Animated.Value(0.85)).current;
  const roleCardOpacity = useRef(new Animated.Value(0)).current;

  // --- presentation-only additions (no game logic here) ---------------
  // Tracks which vote target the player just tapped so that card can show
  // a "locking" animation while the real submitVote() call is in flight.
  const [pendingVoteTarget, setPendingVoteTarget] = useState<string | null>(null);
  const speakerPulse = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  // ----------------------------------------------------------------------

  const players = lobbyState?.players ?? [];

  useEffect(() => {
    if (lobbyState?.status !== 'STARTED' || !gamePrivateState?.role) return;
    setRevealSuspense(true);
    setRoleRevealDismissed(false);
    roleCardOpacity.setValue(0);
    roleCardScale.setValue(0.85);
    const timer = setTimeout(() => {
      setRevealSuspense(false);
      Animated.parallel([
        Animated.timing(roleCardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(roleCardScale, { toValue: 1, friction: 7, useNativeDriver: true }),
      ]).start();
    }, 10000);
    return () => clearTimeout(timer);
  }, [lobbyState?.status]);



  useEffect(() => {
    const eliminatedId = gameResult?.eliminated;
    if (!eliminatedId) return;
    if (Array.isArray(eliminatedId)) {
      if (eliminatedId.length === 0) return;
    }
    const key = Array.isArray(eliminatedId) ? eliminatedId.join(',') : eliminatedId;
    if (lastEliminatedRef.current === key) return;
    lastEliminatedRef.current = key;
    gunshotPlayer.seekTo(0);
    gunshotPlayer.volume = 0.9;
    gunshotPlayer.play();
  }, [gameResult]);

  useEffect(() => {
    if (gamePublicState?.phase === 'FINISHED') {
      victoryOpacity.setValue(0);
      victoryScale.setValue(0.9);
      Animated.parallel([
        Animated.timing(victoryOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.spring(victoryScale, { toValue: 1, friction: 6, useNativeDriver: true }),
      ]).start();
    }
  }, [gamePublicState?.phase]);

  useEffect(() => {
    const endsAt = gamePublicState?.speakingEndsAt;
    if (!endsAt) {
      setSpeakingSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSpeakingSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [gamePublicState?.speakingEndsAt, gamePublicState?.currentSpeakerId]);

  const me = useMemo(
    () => players.find((player) => player.playerId === profile?.playerId) ?? null,
    [players, profile?.playerId],
  );

  const allReady = useMemo(
    () => players.length > 0 && players.every((player) => player.isReady),
    [players],
  );

  const shareRoom = async () => {
    try {
      await Share.share({ message: `Join my MAFIA room with code ${code}.` });
    } catch {
      /* share dismissed */
    }
  };

  const alivePlayerIds = new Set(gamePublicState?.alivePlayerIds ?? players.map((player) => player.playerId));
  const alivePlayers = players.filter((player) => alivePlayerIds.has(player.playerId));
  const isAlive = gamePrivateState?.isAlive ?? true;
  const isSpectator = lobbyState?.status === 'STARTED' && !alivePlayerIds.has(profile?.playerId ?? '');
  const currentPhase = gamePublicState?.phase ?? 'DAY_DISCUSSION';
  const currentRole = gamePrivateState?.role ?? 'Inconnu';
  const currentSummary = gamePublicState?.lastSummary ?? '';
  const hasVoted = Boolean(gamePrivateState?.hasVoted);
  const canSubmitAction = Boolean(gamePrivateState?.canAct && selectedAction);
  const selectedRequiresTarget = selectedAction && selectedAction !== 'PASS';
  const targetList = alivePlayers.filter((player) => player.playerId !== profile?.playerId);

  const playerStatusLabel = isSpectator ? 'Spectateur' : isAlive ? 'En jeu' : 'Éliminé';
  const actionTitle = currentPhase === 'NIGHT_ACTIONS' ? 'Action de nuit' : currentPhase === 'DAY_VOTE' ? 'Vote' : 'Phase de jeu';
  const phaseLabel = {
    DAY_DISCUSSION: 'Discussion du jour',
    DAY_VOTE: 'Vote',
    DAY_RESULT: 'Résultat du jour',
    NIGHT_ACTIONS: 'Nuit',
    FINISHED: 'Fin de la partie',
  }[currentPhase];

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setMessage('');
  };

  const handleSubmitAction = () => {
    if (!selectedAction) return;
    if (selectedRequiresTarget && !selectedTarget) return;
    submitNightAction(
      selectedAction === 'PASS'
        ? { type: 'PASS' }
        : { type: selectedAction as any, target: selectedTarget! },
    );
    setSelectedAction(null);
    setSelectedTarget(null);
  };

  // presentation-only: reset the local "locking" indicator whenever the
  // phase changes (new vote round) — never touches game state.
  useEffect(() => {
    setPendingVoteTarget(null);
  }, [currentPhase]);

  // presentation-only: slow halo pulse behind whoever is currently speaking
  useEffect(() => {
    if (!gamePublicState?.currentSpeakerId) return;
    speakerPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(speakerPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(speakerPulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [gamePublicState?.currentSpeakerId]);

  // presentation-only: shimmer sweep across the role-reveal card
  useEffect(() => {
    if (revealSuspense) return;
    shimmer.setValue(0);
    const loop = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 2600, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [revealSuspense]);

  if (!code) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Invalid room code.</Text>
      </View>
    );
  }

  if (!profile || !lobbyState || !me) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.statusText, { color: colors.mutedForeground, marginTop: 16 }]}>Connecting to lobby…</Text>
      </View>
    );
  }

  if (lobbyState.status === 'STARTED' && !gamePublicState) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.statusText, { color: colors.mutedForeground, marginTop: 16 }]}>Chargement de l'état du jeu…</Text>
      </View>
    );
  }

  const showRoleReveal = lobbyState.status === 'STARTED' && Boolean(gamePrivateState?.role) && !roleRevealDismissed;
  const isMafiaRole = gamePrivateState?.role === 'MAFIA_ALPHA' || gamePrivateState?.role === 'MAFIA_MUT' || gamePrivateState?.role === 'MAFIA_SOLDIER';
  const roleLabel: Record<string, string> = {
    MAFIA_ALPHA: 'ALPHA',
    MAFIA_MUT: 'MUT',
    MAFIA_SOLDIER: 'MAFIA',
    MIRE: 'MIRE',
    FILS: 'LE FILS',
    SECOURISTE: 'SECOURISTE',
    TIREUR: 'TIREUR',
    VILLAGER: 'CITOYEN',
  };

  const winnerIsMafia = gamePublicState?.winner === 'MAFIA';
  const shimmerTranslate = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-260, 260] });
  const speakerHaloScale = speakerPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const speakerHaloOpacity = speakerPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <React.Fragment>
      {showRoleReveal ? (
        <View style={styles.revealOverlay}>
          <GlowOrb size={420} color={isMafiaRole ? '#8A1A1A' : '#4A4A4A'} baseOpacity={0.18} style={styles.revealGlow} />
          {revealSuspense ? (
            <Animated.View style={styles.revealSuspenseBox}>
              <ActivityIndicator color="#8A1A1A" style={{ marginBottom: 18 }} />
              <Text style={styles.revealSuspenseText}>LA NUIT TOMBE...</Text>
              <Text style={styles.revealSuspenseSub}>Votre rôle vous sera révélé sous peu</Text>
            </Animated.View>
          ) : (
            <Animated.View style={{ opacity: roleCardOpacity, transform: [{ scale: roleCardScale }], alignItems: 'center', paddingHorizontal: 32 }}>
              <View style={[styles.roleCard, { borderColor: isMafiaRole ? '#8a1a1a' : '#3a3a3a', backgroundColor: isMafiaRole ? '#160707' : '#101010' }]}>
                <View style={styles.roleCardShimmerClip}>
                  <Animated.View style={[styles.roleCardShimmer, { transform: [{ translateX: shimmerTranslate }, { rotate: '18deg' }] }]}>
                    <LinearGradient
                      colors={['transparent', 'rgba(242,237,226,0.10)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ flex: 1 }}
                    />
                  </Animated.View>
                </View>
                <View style={[styles.roleCardBadge, { borderColor: isMafiaRole ? '#8A1A1A' : '#4A4A4A' }]}>
                  <Feather name={isMafiaRole ? 'target' : 'shield'} size={20} color={isMafiaRole ? '#C94A4A' : '#F2EDE2'} />
                </View>
                <Text style={[styles.roleCardEyebrow, { color: isMafiaRole ? '#c94a4a' : '#9a9086' }]}>
                  {isMafiaRole ? "VOUS ÊTES L'UN DES MAFIEUX" : 'VOUS ÊTES UN CITOYEN'}
                </Text>
                <Text style={[styles.roleCardTitle, { color: '#f2ede2' }]}>
                  {roleLabel[gamePrivateState?.role ?? ''] ?? gamePrivateState?.role}
                </Text>
                <View style={[styles.roleCardDivider, { backgroundColor: isMafiaRole ? 'rgba(138,26,26,0.4)' : 'rgba(154,144,134,0.25)' }]} />
                <Text style={styles.roleCardDescription}>{gamePrivateState?.roleDescription}</Text>
              </View>
              <PressableScale
                testID="dismiss-role-reveal"
                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setRoleRevealDismissed(true); }}
                style={[styles.revealButton, { backgroundColor: isMafiaRole ? '#8a1a1a' : colors.primary }]}
              >
                <Text style={styles.revealButtonText}>Entrer dans la partie</Text>
              </PressableScale>
            </Animated.View>
          )}
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={120}
      >
        <View style={styles.header}>
          <PressableScale testID="back-button" onPress={() => router.replace('/(tabs)')} scaleTo={0.88} style={styles.back}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </PressableScale>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{lobbyState.status === 'STARTED' ? 'Mafia Game' : 'Lobby'}</Text>
          <PressableScale testID="share-room" onPress={shareRoom} scaleTo={0.88} style={styles.back}>
            <Feather name="share-2" size={18} color={colors.mutedForeground} />
          </PressableScale>
        </View>

        <FlatList
          data={[]}
          ListHeaderComponent={
            <View style={styles.content}>
              <GlassPanel radius={20} style={styles.banner}>
                <Text style={[styles.roomLabel, { color: colors.mutedForeground }]}>ROOM CODE</Text>
                <Text selectable style={[styles.roomCode, { color: colors.foreground }]}>{code}</Text>
                <View style={styles.roomMeta}>
                  <Text style={[styles.roomMetaText, { color: colors.mutedForeground }]}>Players {lobbyState.players.length}/{lobbyState.capacity}</Text>
                  <View style={styles.statusPill}>
                    <View style={[styles.statusDot, { backgroundColor: lobbyState.status === 'LOBBY' ? colors.accent : colors.destructive }]} />
                    <Text style={[styles.roomMetaText, { color: lobbyState.status === 'LOBBY' ? colors.accent : colors.destructive }]}>{lobbyState.status}</Text>
                  </View>
                </View>
              </GlassPanel>

              {lobbyState.status === 'STARTED' ? (
                <GlassPanel radius={20} style={styles.gameHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{phaseLabel}</Text>
                  <Text style={[styles.sectionStatus, { color: colors.mutedForeground }]}>{currentSummary || 'En attente d actions...'}</Text>
                  <View style={styles.gameHeaderRow}>
                    <View style={[styles.tinyBadge, { borderColor: colors.border }]}>
                      <Text style={[styles.gameSubtext, { color: colors.mutedForeground }]}>{playerStatusLabel}</Text>
                    </View>
                    <View style={[styles.tinyBadge, { borderColor: colors.accentSoft }]}>
                      <Text style={[styles.gameSubtext, { color: colors.accent }]}>{currentRole}</Text>
                    </View>
                  </View>
                  {gameResult ? (
                    <Text style={[styles.summaryText, { color: colors.foreground }]}>{gameResult.summary}</Text>
                  ) : null}
                </GlassPanel>
              ) : null}

              {error ? (
                <GlassPanel radius={18} tint="rgba(90,20,20,0.45)" borderColor="rgba(178,58,58,0.6)" style={styles.errorBanner} noSheen>
                  <Text style={[styles.errorText, { color: colors.foreground }]}>{error}</Text>
                </GlassPanel>
              ) : null}

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{lobbyState.status === 'STARTED' ? 'Le cercle' : 'Players'}</Text>
                <View style={styles.connectedPill}>
                  <View style={[styles.statusDot, { backgroundColor: connected ? '#5C7A5E' : colors.destructive }]} />
                  <Text style={[styles.sectionStatus, { color: colors.mutedForeground }]}>{connected ? 'Connected' : 'Disconnected'}</Text>
                </View>
              </View>

              <PlayerCircle
                players={lobbyState.players}
                alivePlayerIds={alivePlayerIds}
                showAliveState={lobbyState.status === 'STARTED'}
                currentSpeakerId={gamePublicState?.currentSpeakerId}
                speakerHaloScale={speakerHaloScale}
                speakerHaloOpacity={speakerHaloOpacity}
                colors={colors}
              />

              {lobbyState.status === 'LOBBY' ? (
                <GlassPanel radius={20} style={styles.controls}>
                  <Text style={[styles.controlLabel, { color: colors.mutedForeground }]}>YOU</Text>
                  <View style={styles.controlRow}>
                    <PressableScale
                      testID="ready-toggle"
                      onPress={() => { Haptics.selectionAsync(); setReady(!me.isReady); }}
                      scaleTo={0.97}
                      style={[styles.actionButton, { backgroundColor: me.isReady ? colors.primary : colors.secondary }]}
                    >
                      <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{me.isReady ? 'Je suis prêt' : 'Pas prêt'}</Text>
                    </PressableScale>
                    <PressableScale
                      testID="mic-toggle"
                      onPress={async () => {
                        Haptics.selectionAsync();
                        if (!me.microphoneOn) {
                          try {
                            const current = await getRecordingPermissionsAsync();
                            const granted = current.granted || (await requestRecordingPermissionsAsync()).granted;
                            if (!granted) {
                              setMicPermissionDenied(true);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                              return;
                            }
                            setMicPermissionDenied(false);
                          } catch (err) {
                            setMicPermissionDenied(true);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            return;
                          }
                        }
                        setMic(!me.microphoneOn);
                      }}
                      scaleTo={0.9}
                      style={[styles.micButton, { backgroundColor: me.microphoneOn ? colors.primary : colors.secondary }]}
                    >
                      <Feather name={me.microphoneOn ? 'mic' : 'mic-off'} size={18} color={colors.primaryForeground} />
                    </PressableScale>
                  </View>
                  {micPermissionDenied ? (
                    <Text style={{ color: colors.destructive, marginTop: 8, fontSize: 12 }}>Permission microphone refusée. Vérifie les réglages de ton navigateur ou appareil.</Text>
                  ) : null}
                  {me.isHost ? (
                    <PressableScale
                      testID="start-game"
                      onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); startGame(); }}
                      disabled={!allReady}
                      style={[styles.startButton, { backgroundColor: allReady ? colors.primary : colors.border }]}
                    >
                      <Text style={[styles.startButtonText, { color: colors.primaryForeground }]}>{allReady ? 'Démarrer la partie' : 'En attente de tous les joueurs prêts'}</Text>
                    </PressableScale>
                  ) : null}
                </GlassPanel>
              ) : null}

              {lobbyState.status === 'STARTED' ? (
                <GlassPanel radius={20} style={styles.controls}>
                  <Text style={[styles.controlLabel, { color: colors.mutedForeground }]}>{actionTitle}</Text>
                  {currentPhase === 'DAY_DISCUSSION' ? (
                    <View>
                      {gamePublicState?.currentSpeakerId ? (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={[styles.controlLabel, { color: colors.mutedForeground }]}>AU TOUR DE</Text>
                          <Text style={[styles.gameText, { color: colors.foreground, fontSize: 18, marginBottom: 4 }]}>
                            {players.find((player) => player.playerId === gamePublicState.currentSpeakerId)?.nickname ?? gamePublicState.currentSpeakerId}
                          </Text>
                          <Text style={[styles.gameSubtext, { color: colors.accent, fontFamily: 'Inter_600SemiBold', fontSize: 20 }]}>
                            {speakingSecondsLeft !== null ? `${speakingSecondsLeft}s` : ''}
                          </Text>
                          {gamePrivateState?.isMyTurnToSpeak ? (
                            <PressableScale
                              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); passSpeaking(); }}
                              style={[styles.startButton, { backgroundColor: colors.secondary, marginTop: 10 }]}
                            >
                              <Text style={[styles.startButtonText, { color: colors.foreground }]}>Je passe</Text>
                            </PressableScale>
                          ) : null}
                        </View>
                      ) : (
                        <Text style={[styles.gameText, { color: colors.foreground }]}>Discussion en cours. Attendez que l'hôte démarre le vote.</Text>
                      )}
                      {me.isHost ? (
                        <PressableScale
                          onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); beginVote(); }}
                          style={[styles.startButton, { backgroundColor: colors.primary }]}
                        >
                          <Text style={[styles.startButtonText, { color: colors.primaryForeground }]}>Lancer le vote</Text>
                        </PressableScale>
                      ) : null}
                    </View>
                  ) : null}

                  {currentPhase === 'DAY_VOTE' ? (
                    <View>
                      {!isAlive || isSpectator ? (
                        <Text style={[styles.gameText, { color: colors.foreground }]}>
                          {isSpectator
                            ? 'Vous observez le vote en tant que spectateur.'
                            : 'Vous êtes éliminé, vous ne pouvez plus voter.'}
                        </Text>
                      ) : hasVoted ? (
                        <View style={styles.votedRow}>
                          <Feather name="lock" size={14} color={colors.accent} />
                          <Text style={[styles.gameText, { color: colors.foreground, marginBottom: 0 }]}>Vote envoyé.</Text>
                        </View>
                      ) : !gamePrivateState?.canVote ? (
                        <Text style={[styles.gameText, { color: colors.foreground }]}>Vous êtes muet ou ne pouvez pas voter cette phase.</Text>
                      ) : (
                        <Text style={[styles.gameText, { color: colors.foreground }]}>Choisissez un joueur à éliminer.</Text>
                      )}
                      {isAlive && !isSpectator && !hasVoted && gamePrivateState?.canVote ? (
                        <View style={styles.targetList}>
                          {alivePlayers.filter((player) => player.playerId !== profile?.playerId).map((player) => {
                            const isLocking = pendingVoteTarget === player.playerId;
                            return (
                              <PressableScale
                                key={player.playerId}
                                onPress={() => {
                                  setPendingVoteTarget(player.playerId);
                                  submitVote(player.playerId);
                                }}
                                scaleTo={0.95}
                                style={[styles.targetButton, { backgroundColor: isLocking ? colors.accent : colors.secondary }]}
                              >
                                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{player.nickname}</Text>
                                {isLocking ? <Feather name="lock" size={14} color={colors.primaryForeground} /> : null}
                              </PressableScale>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {currentPhase === 'DAY_RESULT' ? (
                    <View>
                      <Text style={[styles.gameText, { color: colors.foreground }]}>{currentSummary}</Text>
                      {me.isHost ? (
                        <PressableScale
                          onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); advancePhase(); }}
                          style={[styles.startButton, { backgroundColor: colors.primary }]}
                        >
                          <Text style={[styles.startButtonText, { color: colors.primaryForeground }]}>Passer à la nuit</Text>
                        </PressableScale>
                      ) : null}
                    </View>
                  ) : null}

                  {currentPhase === 'NIGHT_ACTIONS' ? (
                    <View>
                      {!isAlive || isSpectator ? (
                        <Text style={[styles.gameText, { color: colors.foreground }]}>Vous n'avez aucune action cette nuit.</Text>
                      ) : gamePrivateState?.nightActionSubmitted ? (
                        <Text style={[styles.gameText, { color: colors.foreground }]}>Action soumise. Attendez les autres joueurs.</Text>
                      ) : (
                        <Text style={[styles.gameText, { color: colors.foreground }]}>Choisissez votre action de nuit.</Text>
                      )}
                      {isAlive && !isSpectator ? (
                        <>
                          <View style={styles.actionList}>
                            {(gamePrivateState?.availableActions ?? []).map((action) => (
                              <PressableScale
                                key={action}
                                onPress={() => { setSelectedAction(action); if (action === 'PASS') setSelectedTarget(null); }}
                                scaleTo={0.97}
                                style={[styles.actionButton, { backgroundColor: selectedAction === action ? colors.primary : colors.secondary, marginBottom: 10 }]}
                              >
                                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{action.replace('_', ' ')}</Text>
                              </PressableScale>
                            ))}
                          </View>
                          {selectedRequiresTarget ? (
                            <View style={styles.targetList}>
                              {targetList.map((player) => {
                                const isSelected = selectedTarget === player.playerId;
                                return (
                                  <PressableScale
                                    key={player.playerId}
                                    onPress={() => setSelectedTarget(player.playerId)}
                                    scaleTo={0.95}
                                    style={[styles.targetButton, { backgroundColor: isSelected ? colors.accent : colors.secondary }]}
                                  >
                                    <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{player.nickname}</Text>
                                    {isSelected ? <Feather name="crosshair" size={14} color={colors.primaryForeground} /> : null}
                                  </PressableScale>
                                );
                              })}
                            </View>
                          ) : null}
                          <PressableScale
                            onPress={handleSubmitAction}
                            disabled={!canSubmitAction}
                            style={[styles.startButton, { backgroundColor: canSubmitAction ? colors.primary : colors.border }]}
                          >
                            <Text style={[styles.startButtonText, { color: colors.primaryForeground }]}>Soumettre</Text>
                          </PressableScale>
                        </>
                      ) : null}
                    </View>
                  ) : null}

                  {currentPhase === 'FINISHED' ? (
                    <Animated.View style={{ opacity: victoryOpacity, transform: [{ scale: victoryScale }], alignItems: 'center', paddingVertical: 12 }}>
                      <LinearGradient
                        pointerEvents="none"
                        colors={winnerIsMafia ? ['rgba(138,26,26,0.28)', 'transparent'] : ['rgba(90,120,94,0.22)', 'transparent']}
                        style={styles.victoryWash}
                      />
                      <View style={[styles.victoryLine, { backgroundColor: winnerIsMafia ? colors.destructive : colors.accent }]} />
                      <Text style={[styles.victoryTitle, { color: colors.foreground }]}>
                        {winnerIsMafia ? 'LA MAFIA A GAGNÉ' : 'LES CITOYENS ONT GAGNÉ'}
                      </Text>
                      <Text style={[styles.victorySubtitle, { color: colors.mutedForeground }]}>
                        {winnerIsMafia ? "Personne n'est en sécurité." : 'La vérité a été révélée.'}
                      </Text>
                      <Text style={[styles.gameText, { color: colors.mutedForeground, marginTop: 18 }]}>{gamePrivateState?.roleDescription}</Text>
                    </Animated.View>
                  ) : null}
                </GlassPanel>
              ) : null}

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Chat</Text>
                <Text style={[styles.sectionStatus, { color: colors.mutedForeground }]}>{lobbyState.chat.length} messages</Text>
              </View>
            </View>
          }
          scrollEventThrottle={16}
          renderItem={null}
          ListFooterComponent={
            <GlassPanel radius={20} style={styles.chatPanel}>
              <FlatList
                data={[...lobbyState.chat].reverse()}
                keyExtractor={(item) => item.id}
                inverted
                contentContainerStyle={styles.chatList}
                renderItem={({ item }) => (
                  <View style={styles.chatMessage}>
                    <Text style={[styles.chatName, { color: colors.accent }]}>{item.nickname}</Text>
                    <Text style={[styles.chatText, { color: colors.foreground }]}>{item.message}</Text>
                    <Text style={[styles.chatTime, { color: colors.mutedForeground }]}>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                )}
              />
              <View style={styles.chatInputRow}>
                <View style={[styles.chatInputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <TextInput
                    testID="chat-input"
                    placeholder="Écrire un message…"
                    placeholderTextColor={colors.mutedForeground}
                    value={message}
                    onChangeText={setMessage}
                    onSubmitEditing={handleSend}
                    style={[styles.chatInput, { color: colors.foreground }]}
                    returnKeyType="send"
                  />
                </View>
                <PressableScale testID="chat-send" onPress={handleSend} scaleTo={0.9} style={[styles.sendButton, { backgroundColor: colors.primary }]}>
                  <Feather name="send" size={18} color={colors.primaryForeground} />
                </PressableScale>
              </View>
            </GlassPanel>
          }
        />
      </KeyboardAvoidingView>
    </React.Fragment>
  );
}

// ---------------------------------------------------------------------------
// Presentation-only helper: renders the roster as a circle ("table
// circulaire") instead of a vertical list. Reads the same player fields the
// original vertical list read (isHost, isReady, microphoneOn, connected) —
// no new data is required from useLobbySocket.
// ---------------------------------------------------------------------------
type RingPlayer = {
  playerId: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  microphoneOn: boolean;
  connected: boolean;
};

function PlayerCircle({
  players,
  alivePlayerIds,
  showAliveState,
  currentSpeakerId,
  speakerHaloScale,
  speakerHaloOpacity,
  colors,
}: {
  players: RingPlayer[];
  alivePlayerIds: Set<string>;
  showAliveState: boolean;
  currentSpeakerId?: string | null;
  speakerHaloScale: Animated.Animated | any;
  speakerHaloOpacity: Animated.Animated | any;
  colors: ReturnType<typeof useColors>;
}) {
  const [size, setSize] = useState(0);
  const count = players.length || 1;
  const avatarSize = count > 9 ? 42 : count > 5 ? 50 : 58;
  const ringSize = Math.max(220, Math.min(320, size));
  const radius = ringSize / 2 - avatarSize / 2 - 6;
  const center = ringSize / 2;

  return (
    <View
      style={styles.ringWrap}
      onLayout={(e) => setSize(e.nativeEvent.layout.width)}
    >
      <View style={{ width: ringSize, height: ringSize, alignSelf: 'center' }}>
        <View
          pointerEvents="none"
          style={[
            styles.ringGuide,
            { width: ringSize - avatarSize, height: ringSize - avatarSize, borderRadius: (ringSize - avatarSize) / 2, top: avatarSize / 2, left: avatarSize / 2, borderColor: colors.border },
          ]}
        />
        {players.map((player, index) => {
          const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
          const x = center + radius * Math.cos(angle) - avatarSize / 2;
          const y = center + radius * Math.sin(angle) - avatarSize / 2;
          const alive = alivePlayerIds.has(player.playerId);
          const isSpeaking = currentSpeakerId === player.playerId;

          return (
            <View key={player.playerId} style={{ position: 'absolute', left: x, top: y, width: avatarSize, height: avatarSize, alignItems: 'center' }}>
              {isSpeaking ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.speakHalo,
                    {
                      width: avatarSize + 20,
                      height: avatarSize + 20,
                      borderRadius: (avatarSize + 20) / 2,
                      borderColor: colors.accent,
                      opacity: speakerHaloOpacity,
                      transform: [{ scale: speakerHaloScale }],
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.ringAvatar,
                  {
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: avatarSize / 2,
                    backgroundColor: player.isHost ? colors.primary : showAliveState && !alive ? colors.destructive : colors.secondary,
                    borderColor: isSpeaking ? colors.accent : 'rgba(242,237,226,0.10)',
                    opacity: showAliveState && !alive ? 0.45 : 1,
                  },
                ]}
              >
                <Text style={[styles.ringAvatarText, { color: player.isHost ? colors.primaryForeground : colors.accent, fontSize: avatarSize > 50 ? 16 : 13 }]}>
                  {player.nickname.slice(0, 1).toUpperCase()}
                </Text>
                {player.isHost ? (
                  <View style={[styles.ringHostDot, { backgroundColor: colors.accent }]} />
                ) : null}
                <View style={[styles.ringMicDot, { backgroundColor: player.microphoneOn ? colors.accent : colors.muted }]}>
                  <MaterialIcons name={player.microphoneOn ? 'mic' : 'mic-off'} size={9} color={player.microphoneOn ? colors.primaryForeground : colors.mutedForeground} />
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.ringName, { color: colors.mutedForeground }]}>{player.nickname}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  revealOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050505' },
  revealGlow: { position: 'absolute' },
  revealSuspenseBox: { alignItems: 'center' },
  revealSuspenseText: { color: '#8a1a1a', fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 4 },
  revealSuspenseSub: { color: '#6a6258', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10, letterSpacing: 0.5 },
  roleCard: { width: 288, borderWidth: 1, borderRadius: 22, padding: 30, alignItems: 'center', overflow: 'hidden' },
  roleCardShimmerClip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  roleCardShimmer: { position: 'absolute', top: -60, bottom: -60, width: 90 },
  roleCardBadge: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  roleCardEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.5, marginBottom: 14, textAlign: 'center' },
  roleCardTitle: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: 3, marginBottom: 16, textAlign: 'center' },
  roleCardDivider: { width: 40, height: 1, marginBottom: 16 },
  roleCardDescription: { color: '#9a9086', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  revealButton: { marginTop: 28, height: 54, paddingHorizontal: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  revealButtonText: { color: '#f2ede2', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  screen: { flex: 1 },
  victoryWash: { position: 'absolute', top: -20, left: -40, right: -40, height: 220 },
  victoryLine: { width: 40, height: 3, borderRadius: 3, marginBottom: 18 },
  victoryTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -1, textAlign: 'center', marginBottom: 8 },
  victorySubtitle: { fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  content: { paddingHorizontal: 24, paddingBottom: 30 },
  banner: { padding: 20, marginBottom: 20 },
  roomLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2 },
  roomCode: { fontFamily: 'Inter_700Bold', fontSize: 32, letterSpacing: 5, marginTop: 10 },
  roomMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  roomMetaText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  errorBanner: { padding: 14, marginBottom: 18 },
  errorText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 18 },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14, letterSpacing: 1 },
  sectionStatus: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ringWrap: { alignItems: 'center', paddingVertical: 16 },
  ringGuide: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed' },
  ringAvatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ringAvatarText: { fontFamily: 'Inter_700Bold' },
  ringHostDot: { position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#0A0A0A' },
  ringMicDot: { position: 'absolute', bottom: -3, right: -3, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0A0A0A' },
  ringName: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 6, maxWidth: 64, textAlign: 'center' },
  speakHalo: { position: 'absolute', borderWidth: 2 },
  controls: { padding: 18, marginTop: 22 },
  controlLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 12 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actionButton: { flex: 1, borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  micButton: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  startButton: { marginTop: 16, borderRadius: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  startButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'center' },
  votedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  chatPanel: { padding: 16, marginBottom: 24 },
  chatList: { paddingBottom: 10 },
  chatMessage: { marginBottom: 14 },
  chatName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 4 },
  chatText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 20 },
  chatTime: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  chatInputWrap: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, justifyContent: 'center', height: 52 },
  chatInput: { fontFamily: 'Inter_500Medium', fontSize: 14, padding: 0 },
  sendButton: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  gameHeader: { padding: 18, marginBottom: 18 },
  gameHeaderRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tinyBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  gameSubtext: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  summaryText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 10 },
  gameText: { fontFamily: 'Inter_500Medium', fontSize: 13, marginBottom: 12 },
  targetList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  targetButton: { borderRadius: 16, minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', gap: 8 },
  actionList: { marginTop: 12 },
});
