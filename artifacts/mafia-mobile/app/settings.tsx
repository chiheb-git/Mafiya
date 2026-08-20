import React from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GlassPanel, PressableScale, VideoBackground } from '@/components/cinematic';

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const openAppSettings = () => {
    Haptics.selectionAsync();
    if (Platform.OS === 'web' || typeof Linking.openSettings !== 'function') {
      return;
    }
    Linking.openSettings();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <VideoBackground source={require('@/assets/videos/bg-wolf.mp4')} scrimOpacity={0.42} />
      <View style={styles.header}>
        <PressableScale testID="back-button" onPress={() => router.back()} scaleTo={0.88} style={styles.back}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </PressableScale>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Paramètres</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>APPAREIL</Text>
        <PressableScale testID="open-app-settings" onPress={openAppSettings} scaleTo={0.99}>
          <GlassPanel radius={16} style={styles.row} noSheen>
            <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="mic" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>Permission micro</Text>
              <Text style={[styles.rowCaption, { color: colors.mutedForeground }]}>Gérer dans les réglages système</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </GlassPanel>
        </PressableScale>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 32 }]}>À PROPOS</Text>
        <GlassPanel radius={16} style={styles.row} noSheen>
          <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
            <Feather name="info" size={18} color={colors.accent} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>MAFIA</Text>
            <Text style={[styles.rowCaption, { color: colors.mutedForeground }]}>Version 1.0.0</Text>
          </View>
        </GlassPanel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 12 },
  row: { minHeight: 68, padding: 14, flexDirection: 'row', alignItems: 'center' },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, marginLeft: 14 },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  rowCaption: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
});
