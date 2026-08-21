import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { GlowOrb, GlassPanel, PressableScale, VideoBackground } from '@/components/cinematic';
import { BloodDrip } from '@/components/cinematic/BloodDrip';

const PROFILE_KEY = '@mafia/profile';
type Profile = { nickname: string; playerId: string };

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const appear = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((value) => {
      if (value) setProfile(JSON.parse(value) as Profile);
    });
    Animated.timing(appear, { toValue: 1, duration: 620, useNativeDriver: true }).start();

    // Slow, continuous 3D-ish idle motion for the wordmark â€” never jarring.
    Animated.loop(
      Animated.sequence([
        Animated.timing(tilt, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(tilt, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [appear, tilt]);

  const enter = (destination: '/create' | '/join') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(destination);
  };

  const rotateY = tilt.interpolate({ inputRange: [0, 1], outputRange: ['-7deg', '7deg'] });
  const rotateX = tilt.interpolate({ inputRange: [0, 1], outputRange: ['4deg', '-4deg'] });
  const wordmarkLift = tilt.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <VideoBackground source={require('@/assets/videos/bg-wolf.mp4')} scrimOpacity={0.38} loop={false} />
      <GlowOrb size={420} color={colors.glow} style={styles.orb} baseOpacity={0.17} />
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        style={{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topline}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>PRIVATE ROOM / 01</Text>
            <View style={styles.wordmarkStage}>
              <Animated.View
                style={{
                  transform: [{ perspective: 900 }, { rotateX }, { rotateY }, { translateY: wordmarkLift }],
                }}
              >
                <Text
                  style={[styles.wordmarkShadow, { color: colors.accentSoft ?? colors.primary }]}
                  pointerEvents="none"
                >
                  MAFIA
                </Text>
                <Text
                  style={[
                    styles.wordmark,
                    {
                      color: colors.foreground,
                      textShadowColor: colors.accent,
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: 18,
                    },
                  ]}
                >
                  MAFIA
                </Text>
              </Animated.View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PressableScale
              accessibilityLabel="Settings"
              testID="open-settings"
              onPress={() => { Haptics.selectionAsync(); router.push('/settings'); }}
              scaleTo={0.9}
            >
              <GlassPanel radius={20} style={styles.profileMark} noSheen>
                <Feather name="settings" size={17} color={colors.accent} />
              </GlassPanel>
            </PressableScale>
            <PressableScale
              accessibilityLabel="Profile"
              testID="open-profile"
              onPress={() => { Haptics.selectionAsync(); router.push('/profile'); }}
              scaleTo={0.9}
            >
              <GlassPanel radius={20} style={styles.profileMark} noSheen>
                <Text style={[styles.profileInitial, { color: colors.accent }]}>{profile?.nickname?.slice(0, 1).toUpperCase() ?? '?'}</Text>
              </GlassPanel>
            </PressableScale>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: colors.mutedForeground }]}>THE NIGHT IS QUIET.</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Make your{'\n'}
            <Text
              style={{
                color: colors.accent,
                textShadowColor: colors.accent,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 26,
              }}
            >
              move.
            </Text>
          </Text>
          <Animated.View
            style={[
              styles.titleUnderline,
              {
                backgroundColor: colors.accent,
                width: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 46] }),
              },
            ]}
          />
        </View>

        <View style={styles.actions}>
          <ActionButton
            icon="plus"
            title="Create a room"
            caption="You set the rules"
            colors={colors}
            onPress={() => enter('/create')}
            primary
            testID="create-room"
          />
          <ActionButton
            icon="corner-down-left"
            title="Join a room"
            caption="You know the code"
            colors={colors}
            onPress={() => enter('/join')}
            testID="join-room"
          />
        </View>

        <View style={[styles.note, { borderTopColor: colors.border }]}>
          <Feather name="lock" size={14} color={colors.accent} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>No public lobbies. No spectators. Just your circle.</Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

type Theme = ReturnType<typeof useColors>;
function ActionButton({ icon, title, caption, colors, onPress, primary, testID }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; caption: string; colors: Theme; onPress: () => void; primary?: boolean; testID: string }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!primary) return;
    const run = () => {
      sweep.setValue(0);
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1400,
        delay: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        // Repeats occasionally rather than constantly â€” a premium accent,
        // not a distraction.
        setTimeout(run, 5200);
      });
    };
    run();
  }, [primary, sweep]);

  const sweepTranslate = sweep.interpolate({ inputRange: [0, 1], outputRange: [-140, 420] });

  const body = (
    <>
      <View
        style={[
          styles.actionIcon,
          { backgroundColor: primary ? 'rgba(242,237,226,0.14)' : colors.secondary },
          primary ? styles.actionIconPrimaryShadow : null,
        ]}
      >
        <Feather name={icon} size={21} color={primary ? colors.primaryForeground : colors.accent} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, { color: primary ? colors.primaryForeground : colors.foreground }]}>{title}</Text>
        <Text style={[styles.actionCaption, { color: primary ? 'rgba(242,237,226,0.72)' : colors.mutedForeground }]}>{caption}</Text>
      </View>
      <Feather name="arrow-up-right" size={19} color={primary ? colors.primaryForeground : colors.mutedForeground} />
    </>
  );

  if (primary) {
    return (
      <PressableScale testID={testID} onPress={onPress} scaleTo={0.985}>
        <View style={styles.actionPrimaryShadowWrap}>
          <LinearGradient colors={[colors.primary, colors.accentSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.action}>
            <View pointerEvents="none" style={styles.actionTopHighlight} />
            <Animated.View
              pointerEvents="none"
              style={[styles.actionSweep, { transform: [{ translateX: sweepTranslate }, { rotate: '20deg' }] }]}
            />
            <BloodDrip
              count={3}
              spanWidth={90}
              dripAreaHeight={40}
              color={colors.accentSoft ?? colors.primary}
              highlightColor="#E8B8A8"
              style={styles.actionDripPrimary}
            />
            {body}
          </LinearGradient>
        </View>
      </PressableScale>
    );
  }

  return (
    <PressableScale testID={testID} onPress={onPress} scaleTo={0.985}>
      <GlassPanel radius={18} style={styles.action} noSheen>
        <BloodDrip
          count={3}
          spanWidth={90}
          dripAreaHeight={40}
          color={colors.primary}
          highlightColor={colors.accent}
          style={styles.actionDripSecondary}
        />
        {body}
      </GlassPanel>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  orb: { position: 'absolute', top: -230, right: -160 },
  content: { paddingHorizontal: 24, paddingTop: 24, flexGrow: 1 },
  topline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2.1 },
  wordmarkStage: { marginTop: 4 },
  wordmark: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: 5 },
  wordmarkShadow: {
    position: 'absolute',
    top: 2.5,
    left: 2,
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    letterSpacing: 5,
    opacity: 0.55,
  },
  profileMark: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  hero: { marginTop: 88, marginBottom: 56 },
  kicker: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 2.2, marginBottom: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 52, letterSpacing: -2.8, lineHeight: 53 },
  titleUnderline: { height: 3, borderRadius: 3, marginTop: 22 },
  actions: { gap: 12 },
  actionPrimaryShadowWrap: {
    borderRadius: 18,
    shadowColor: '#8A1A1A',
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  action: { minHeight: 82, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  actionTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actionSweep: {
    position: 'absolute',
    top: -30,
    width: 46,
    height: 160,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  actionDripPrimary: { position: 'absolute', top: 0, right: 58, zIndex: 1 },
  actionDripSecondary: { position: 'absolute', top: 0, right: 58, zIndex: 1 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionIconPrimaryShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  actionCopy: { flex: 1, marginLeft: 14 },
  actionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  actionCaption: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  note: { borderTopWidth: 1, flexDirection: 'row', gap: 9, paddingTop: 18, marginTop: 'auto' },
  noteText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
});