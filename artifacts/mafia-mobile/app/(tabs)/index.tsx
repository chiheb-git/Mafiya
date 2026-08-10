import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';

const PROFILE_KEY = '@mafia/profile';
type Profile = { nickname: string; playerId: string };

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const appear = useRef(new Animated.Value(0)).current;
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((value) => {
      if (value) setProfile(JSON.parse(value) as Profile);
    });
    Animated.timing(appear, { toValue: 1, duration: 620, useNativeDriver: true }).start();
  }, [appear]);

  const enter = (destination: '/create' | '/join') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(destination);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.orb, { backgroundColor: colors.primary }]} />
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        style={{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topline}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>PRIVATE ROOM / 01</Text>
            <Text style={[styles.wordmark, { color: colors.foreground }]}>MAFIA</Text>
          </View>
          <Pressable
            accessibilityLabel="Reset nickname"
            testID="reset-profile"
            onPress={() => {
              Haptics.selectionAsync();
              AsyncStorage.removeItem(PROFILE_KEY).then(() => router.replace('/'));
            }}
            style={({ pressed }) => [styles.profileMark, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.profileInitial, { color: colors.accent }]}>{profile?.nickname?.slice(0, 1).toUpperCase() ?? '·'}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: colors.mutedForeground }]}>THE NIGHT IS QUIET.</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Make your{'\n'}move.</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            A private game for the people you trust least. Start a room or slip into one already waiting.
          </Text>
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
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: primary ? colors.primary : colors.card, borderColor: primary ? colors.primary : colors.border, transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
      <View style={[styles.actionIcon, { backgroundColor: primary ? 'rgba(23,17,15,0.16)' : colors.secondary }]}>
        <Feather name={icon} size={21} color={primary ? colors.primaryForeground : colors.accent} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, { color: primary ? colors.primaryForeground : colors.foreground }]}>{title}</Text>
        <Text style={[styles.actionCaption, { color: primary ? 'rgba(23,17,15,0.64)' : colors.mutedForeground }]}>{caption}</Text>
      </View>
      <Feather name="arrow-up-right" size={19} color={primary ? colors.primaryForeground : colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  orb: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -170, right: -120, opacity: 0.08 },
  content: { paddingHorizontal: 24, paddingTop: 24, flexGrow: 1 },
  topline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2.1 },
  wordmark: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: 5, marginTop: 6 },
  profileMark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  profileInitial: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  hero: { marginTop: 88, marginBottom: 48 },
  kicker: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 2.2, marginBottom: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 52, letterSpacing: -2.8, lineHeight: 53 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, maxWidth: 310, marginTop: 20 },
  actions: { gap: 12 },
  action: { minHeight: 82, borderWidth: 1, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center' },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, marginLeft: 14 },
  actionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  actionCaption: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  note: { borderTopWidth: 1, flexDirection: 'row', gap: 9, paddingTop: 18, marginTop: 'auto' },
  noteText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
});
