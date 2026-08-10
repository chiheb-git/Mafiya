import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useJoinRoom } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const PROFILE_KEY = '@mafia/profile';
type Profile = { nickname: string; playerId: string };

export default function JoinRoom() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const joinRoom = useJoinRoom();
  const [code, setCode] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { AsyncStorage.getItem(PROFILE_KEY).then((value) => { if (value) setProfile(JSON.parse(value) as Profile); }); }, []);
  const submit = () => {
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 10) {
      setError('Room codes are exactly 10 digits.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!profile) { setError('Your nickname is missing. Return to the beginning.'); return; }
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    joinRoom.mutate({ code: clean, data: { playerId: profile.playerId, nickname: profile.nickname } }, {
      onSuccess: (room) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.replace(`/room/${room.code}`); },
      onError: () => { setError('That code did not open a room. Check the digits and try again.'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); },
    });
  };
  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.header}><Pressable testID="back-button" onPress={() => router.back()} style={styles.back}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>Join room</Text><View style={{ width: 40 }} /></View>
    <View style={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>A SECRET IS WAITING</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Enter the{'\n'}room code.</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>Ask your host for the ten digits. They are the only way in.</Text>
      <TextInput testID="room-code-input" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, 10)); setError(''); }} keyboardType="number-pad" maxLength={10} placeholder="0000000000" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border }]} />
      <View style={styles.codeMeta}><Text style={[styles.error, { color: colors.destructive }]}>{error}</Text><Text style={[styles.count, { color: colors.mutedForeground }]}>{code.length} / 10</Text></View>
      <View style={styles.bottom}><Pressable testID="join-submit" disabled={joinRoom.isPending} onPress={submit} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed || joinRoom.isPending ? 0.72 : 1 }]}>{joinRoom.isPending ? <ActivityIndicator color={colors.primaryForeground} /> : <><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Unlock room</Text><Feather name="lock" size={17} color={colors.primaryForeground} /></>}</Pressable><View style={styles.hint}><Feather name="shield" size={14} color={colors.accent} /><Text style={[styles.hintText, { color: colors.mutedForeground }]}>Codes are private to your group.</Text></View></View>
    </View>
  </View>;
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
  input: { marginTop: 42, height: 70, borderWidth: 1, borderRadius: 18, paddingHorizontal: 17, fontFamily: 'Inter_600SemiBold', fontSize: 25, letterSpacing: 5 },
  codeMeta: { minHeight: 29, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 7 },
  error: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  count: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  bottom: { marginTop: 'auto' },
  button: { height: 58, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  hint: { justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 17 },
  hintText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
});