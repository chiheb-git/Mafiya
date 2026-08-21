import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useCreateRoom, RoomInputMode } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { GlassPanel, PressableScale, VideoBackground } from '@/components/cinematic';
import { PrimaryButton } from '@/components/cinematic/PrimaryButton';

const PROFILE_KEY = '@mafia/profile';
type Profile = { nickname: string; playerId: string };

export default function CreateRoom() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const createRoom = useCreateRoom();
  const [mode, setMode] = useState<7 | 14>(7);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((value) => { if (value) setProfile(JSON.parse(value) as Profile); });
    Animated.timing(appear, { toValue: 1, duration: 620, useNativeDriver: true }).start();
  }, []);

  const submit = () => {
    if (!profile) { setError('Your nickname is missing. Return to the beginning.'); return; }
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createRoom.mutate({ data: { mode: mode === 7 ? RoomInputMode.NUMBER_7 : RoomInputMode.NUMBER_14, host: { playerId: profile.playerId, nickname: profile.nickname } } }, {
      onSuccess: async (room: any) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (room.sessionToken) {
          await AsyncStorage.setItem(`@mafia/session/${room.code}`, room.sessionToken);
        }
        router.replace(`/room/${room.code}`);
      },
      onError: () => { setError('The room stayed locked. Check your connection and try again.'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); },
    });
  };

  const appearStyle = {
    opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <VideoBackground source={require('@/assets/videos/bg-wolf.mp4')} scrimOpacity={0.42} loop={false} />
      <Header colors={colors} title="Create room" />
      <Animated.View style={[styles.content, appearStyle]}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>SET THE TABLE</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          How many{'\n'}
          <Text
            style={{
              color: colors.accent,
              textShadowColor: colors.accent,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 22,
            }}
          >
            players?
          </Text>
        </Text>
        <Animated.View
          style={[
            styles.titleUnderline,
            { backgroundColor: colors.accent, width: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 46] }) },
          ]}
        />
        <View style={styles.options}>
          <ModeOption selected={mode === 7} value={7} label="The close circle" detail="7 players" colors={colors} onPress={() => setMode(7)} />
          <ModeOption selected={mode === 14} value={14} label="The full table" detail="14 players" colors={colors} onPress={() => setMode(14)} />
        </View>
        <View style={styles.bottom}>
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
          <PrimaryButton
            testID="create-submit"
            label="Open the room"
            icon="arrow-up-right"
            onPress={submit}
            loading={createRoom.isPending}
          />
        </View>
      </Animated.View>
    </View>
  );
}

function Header({ colors, title }: { colors: ReturnType<typeof useColors>; title: string }) {
  return (
    <View style={styles.header}>
      <PressableScale testID="back-button" accessibilityLabel="Go back" onPress={() => router.back()} scaleTo={0.88} style={styles.back}>
        <Feather name="arrow-left" size={20} color={colors.foreground} />
      </PressableScale>
      <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function ModeOption({ selected, value, label, detail, colors, onPress }: { selected: boolean; value: number; label: string; detail: string; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return (
    <PressableScale
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      scaleTo={0.99}
    >
      <GlassPanel
        radius={18}
        style={styles.option}
        borderColor={selected ? 'rgba(138,26,26,0.65)' : undefined}
        tint={selected ? 'rgba(62,20,20,0.5)' : undefined}
        noSheen
      >
        <View style={[styles.number, { backgroundColor: selected ? colors.accent : colors.muted }]}>
          <Text style={[styles.numberText, { color: selected ? colors.accentForeground : colors.mutedForeground }]}>{value}</Text>
        </View>
        <View style={styles.optionCopy}>
          <Text style={[styles.optionLabel, { color: colors.foreground }]}>{label}</Text>
          <Text style={[styles.optionDetail, { color: colors.mutedForeground }]}>{detail}</Text>
        </View>
        {selected && <Feather name="check" size={20} color={colors.accent} />}
      </GlassPanel>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 15 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 43, letterSpacing: -2.3, lineHeight: 46 },
  titleUnderline: { height: 3, borderRadius: 3, marginTop: 18 },
  options: { gap: 12, marginTop: 42 },
  option: { minHeight: 86, padding: 14, flexDirection: 'row', alignItems: 'center' },
  number: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontFamily: 'Inter_700Bold', fontSize: 23 },
  optionCopy: { flex: 1, marginLeft: 15 },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  optionDetail: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  bottom: { marginTop: 'auto' },
  error: { minHeight: 25, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
});
