import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { getGetRoomQueryKey, useGetRoom } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

export default function RoomCode() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code: string }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code ?? '';
  const queryClient = useQueryClient();
  const roomQuery = useGetRoom(code, { query: { queryKey: getGetRoomQueryKey(code), enabled: !!code } });
  const room = roomQuery.data;
  const capacity = room?.capacity ?? room?.mode ?? 0;
  const players = room?.players ?? [];

  const shareRoom = async () => {
    try {
      await Share.share({ message: `Join my MAFIA room with code ${code}.` });
    } catch { /* share dismissed */ }
  };
  const refresh = () => {
    Haptics.selectionAsync();
    queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(code) });
  };

  if (roomQuery.isPending) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  if (roomQuery.isError || !room) return <View style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 32 }]}><Feather name="cloud-off" size={28} color={colors.destructive} /><Text style={[styles.errorTitle, { color: colors.foreground }]}>The room is out of reach.</Text><Text style={[styles.errorBody, { color: colors.mutedForeground }]}>It may have closed, or the connection went quiet.</Text><Pressable onPress={() => roomQuery.refetch()} style={[styles.retry, { borderColor: colors.border }]}><Text style={[styles.retryText, { color: colors.foreground }]}>Try again</Text></Pressable></View>;

  return <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <View style={styles.header}><Pressable testID="back-button" onPress={() => router.replace('/(tabs)')} style={styles.back}><Feather name="arrow-left" size={20} color={colors.foreground} /></Pressable><Text style={[styles.headerTitle, { color: colors.foreground }]}>Room found</Text><Pressable testID="refresh-room" onPress={refresh} style={styles.back}><Feather name="refresh-cw" size={18} color={colors.mutedForeground} /></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.confirm}><View style={[styles.check, { backgroundColor: colors.accent }]}><Feather name="check" size={21} color={colors.accentForeground} /></View><Text style={[styles.eyebrow, { color: colors.accent }]}>YOU'RE INSIDE</Text><Text style={[styles.title, { color: colors.foreground }]}>The room is{'\n'}waiting.</Text><Text style={[styles.body, { color: colors.mutedForeground }]}>Pass the code around quietly. The host will start when the table is full.</Text></View>
      <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>ROOM CODE</Text><Text selectable style={[styles.code, { color: colors.foreground }]}>{code}</Text><View style={styles.codeActions}><Pressable onPress={shareRoom} style={[styles.smallButton, { backgroundColor: colors.secondary }]}><Feather name="send" size={14} color={colors.accent} /><Text style={[styles.smallText, { color: colors.foreground }]}>Share code</Text></Pressable></View></View>
      <View style={styles.playersHead}><Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>AT THE TABLE</Text><Text style={[styles.capacity, { color: colors.mutedForeground }]}>{players.length} / {capacity}</Text></View>
      <View style={styles.playerList}>{players.map((player) => <View key={player.playerId} style={[styles.player, { borderBottomColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: player.isHost ? colors.primary : colors.secondary }]}><Text style={[styles.avatarText, { color: player.isHost ? colors.primaryForeground : colors.accent }]}>{player.nickname.slice(0, 1).toUpperCase()}</Text></View><Text style={[styles.playerName, { color: colors.foreground }]}>{player.nickname}</Text>{player.isHost && <View style={[styles.hostPill, { backgroundColor: colors.secondary }]}><Text style={[styles.hostText, { color: colors.accent }]}>HOST</Text></View>}</View>)}</View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  content: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 25 },
  confirm: { alignItems: 'flex-start' },
  check: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 14 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 43, letterSpacing: -2.3, lineHeight: 46 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 18, maxWidth: 320 },
  codeCard: { borderWidth: 1, borderRadius: 20, padding: 20, marginTop: 35 },
  codeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2 },
  code: { fontFamily: 'Inter_700Bold', fontSize: 31, letterSpacing: 5, marginTop: 10 },
  codeActions: { flexDirection: 'row', gap: 9, marginTop: 19 },
  smallButton: { height: 36, borderRadius: 11, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  smallText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  playersHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36, marginBottom: 9 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2 },
  capacity: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  playerList: {},
  player: { minHeight: 56, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  playerName: { fontFamily: 'Inter_500Medium', fontSize: 14, marginLeft: 12, flex: 1 },
  hostPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 },
  hostText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  errorTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, marginTop: 18 },
  errorBody: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 9 },
  retry: { marginTop: 22, borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 22 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});