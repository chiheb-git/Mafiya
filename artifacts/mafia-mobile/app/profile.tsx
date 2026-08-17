import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GlassPanel, PressableScale } from '@/components/cinematic';

const PROFILE_KEY = '@mafia/profile';
type Profile = { nickname: string; playerId: string };

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((value) => {
      if (value) {
        const parsed = JSON.parse(value) as Profile;
        setProfile(parsed);
        setNickname(parsed.nickname);
      }
    });
  }, []);

  const save = async () => {
    const clean = nickname.trim();
    if (clean.length < 2 || clean.length > 24) {
      setError('Choisis un pseudo entre 2 et 24 caractères.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!profile) return;
    setSaving(true);
    setError('');
    try {
      const updated = { ...profile, nickname: clean };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
      setProfile(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setError('Le pseudo n\'a pas pu être enregistré.');
    } finally {
      setSaving(false);
    }
  };

  const resetProfile = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    await AsyncStorage.removeItem(PROFILE_KEY);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <PressableScale testID="back-button" onPress={() => router.back()} scaleTo={0.88} style={styles.back}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </PressableScale>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Profil</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.avatarRing, { borderColor: colors.accentSoft }]}>
          <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.avatarInitial, { color: colors.accent }]}>{profile?.nickname?.slice(0, 1).toUpperCase() ?? '?'}</Text>
          </View>
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>PSEUDO</Text>
        <GlassPanel radius={16} style={styles.inputPanel} borderColor={error ? 'rgba(178,58,58,0.55)' : undefined} noSheen>
          <TextInput
            testID="profile-nickname-input"
            value={nickname}
            onChangeText={(value) => { setNickname(value); setError(''); }}
            placeholder="Ton pseudo"
            placeholderTextColor={colors.mutedForeground}
            maxLength={24}
            style={[styles.input, { color: colors.foreground }]}
          />
        </GlassPanel>
        <View style={styles.inputMeta}>
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
          <Text style={[styles.count, { color: colors.mutedForeground }]}>{nickname.length}/24</Text>
        </View>

        <PressableScale testID="profile-save" disabled={saving} onPress={save} style={[styles.button, { backgroundColor: colors.primary }]}>
          {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Enregistrer</Text>}
        </PressableScale>

        <View style={styles.bottom}>
          <PressableScale testID="profile-reset" onPress={resetProfile} scaleTo={0.98}>
            <GlassPanel radius={16} style={[styles.resetButton, { borderColor: colors.destructive }]} noSheen>
              <Feather name="log-out" size={16} color={colors.destructive} />
              <Text style={[styles.resetText, { color: colors.destructive }]}>
                {confirmReset ? 'Confirmer la réinitialisation' : 'Réinitialiser le profil'}
              </Text>
            </GlassPanel>
          </PressableScale>
          {confirmReset ? (
            <Text style={[styles.warning, { color: colors.mutedForeground }]}>
              Ceci effacera ton pseudo local. Appuie à nouveau pour confirmer.
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  avatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 36, padding: 6 },
  avatar: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: 'Inter_700Bold', fontSize: 32 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 10 },
  inputPanel: { height: 58, justifyContent: 'center', paddingHorizontal: 17 },
  input: { fontFamily: 'Inter_500Medium', fontSize: 16, padding: 0 },
  inputMeta: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 24, paddingTop: 6, marginBottom: 20 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  count: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  button: { height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  bottom: { marginTop: 'auto', paddingBottom: 20 },
  resetButton: { height: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  resetText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  warning: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 16 },
});
