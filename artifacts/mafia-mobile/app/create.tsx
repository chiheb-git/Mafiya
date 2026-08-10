import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useCreateRoom, RoomInputMode } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const PROFILE_KEY = '@mafia/profile';
type Profile = { nickname: string; playerId: string };

export default function CreateRoom() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const createRoom = useCreateRoom();
  const [mode, setMode] = useState<7 | 14>(7);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { AsyncStorage.getItem(PROFILE_KEY).then((value) => { if (value) setProfile(JSON.parse(value) as Profile); }); }, []);
  const submit = () => {
    if (!profile) { setError('Your nickname is missing. Return to the beginning.'); return; }
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createRoom.mutate({ data: { mode: mode === 7 ? RoomInputMode.NUMBER_7 : RoomInputMode.NUMBER_14, host: { playerId: profile.playerId, nickname: profile.nickname } } }, {
      onSuccess: (room) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.replace(`/room/${room.code}`); },
      onError: () => { setError('The room stayed locked. Check your connection and try again.'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); },
    });
  };
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Header colors={colors} title="Create room" />
    <View style={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>SET THE TABLE</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>How many{'\n'}players?</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Choose the size of your circle. You can share the room code next.</Text>
      <View style={styles.options}>
        <ModeOption selected={mode === 7} value={7} label="The close circle" detail="7 players" colors={colors} onPress={() => setMode(7)} />
        <ModeOption selected={mode === 14} value={14} label="The full table" detail="14 players" colors={colors} onPress={() => setMode(14)} />
      </View>
      <View style={styles.bottom}><Text style={[styles.error, { color: colors.destructive }]}>{error}</Text><Pressable testID="create-submit" disabled={createRoom.isPending} onPress={submit} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed || createRoom.isPending ? 0.72 : 1 }]}>{createRoom.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Open the room</Text><Feather name="arrow-up-right" size={18} color={colors.primaryForeground} /></>}</Pressable></View>
    </View>
  </View>;
}

function Header({ colors, title }: { colors: ReturnType<typeof useColors>; title: string }) {
  return <View style={styles.header}><Pressable testID="back-button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text><View style={{ width: 40 }} /></View>;
}
function ModeOption({ selected, value, label, detail, colors, onPress }: { selected: boolean; value: number; label: string; detail: string; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  return <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => [styles.option, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.secondary : colors.card, opacity: pressed ? 0.8 : 1 }]}><View style={[styles.number, { backgroundColor: selected ? colors.accent : colors.muted }]}><Text style={[styles.numberText, { color: selected ? colors.accentForeground : colors.mutedForeground }]}>{value}</Text></View><View style={styles.optionCopy}><Text style={[styles.optionLabel, { color: colors.foreground }]}>{label}</Text><Text style={[styles.optionDetail, { color: colors.mutedForeground }]}>{detail}</Text></View>{selected && <Feather name="check" size={20} color={colors.accent} />}</Pressable>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 20 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 15 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 43, letterSpacing: -2.3, lineHeight: 46 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, maxWidth: 310, marginTop: 18 },
  options: { gap: 12, marginTop: 42 },
  option: { minHeight: 86, borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center' },
  number: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontFamily: 'Inter_700Bold', fontSize: 23 },
  optionCopy: { flex: 1, marginLeft: 15 },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  optionDetail: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  bottom: { marginTop: 'auto' },
  error: { minHeight: 25, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  button: { height: 58, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});