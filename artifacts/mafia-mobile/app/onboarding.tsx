import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GlowOrb, GlassPanel, PressableScale } from '@/components/cinematic';

const PROFILE_KEY = '@mafia/profile';
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export default function Onboarding() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState('');
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const appear = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(PROFILE_KEY).then((value) => {
        if (!active) return;
        if (value) router.replace('/(tabs)');
        else setChecking(false);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    if (checking) return;
    Animated.timing(appear, { toValue: 1, duration: 640, useNativeDriver: true }).start();
  }, [checking, appear]);

  const continueToRoom = async () => {
    const clean = nickname.trim();
    if (clean.length < 2 || clean.length > 24) {
      setError('Pick a name between 2 and 24 characters.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ nickname: clean, playerId: makeId() }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch {
      setSaving(false);
      setError('Your name could not be saved. Try again.');
    }
  };

  if (checking) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const appearStyle = {
    opacity: appear,
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <GlowOrb size={360} color={colors.glow} style={styles.orb} baseOpacity={0.14} />
      <Animated.View style={[styles.content, appearStyle]}>
        <View style={styles.brand}>
          <View style={[styles.brandLine, { backgroundColor: colors.accent }]} />
          <Text style={[styles.brandText, { color: colors.foreground }]}>MAFIA</Text>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>BEFORE THE DOOR OPENS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>What should{'\n'}we call you?</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Choose the name your friends will see inside the room.</Text>
        </View>
        <View>
          <GlassPanel
            radius={16}
            style={styles.inputPanel}
            borderColor={error ? 'rgba(178,58,58,0.55)' : undefined}
            noSheen
          >
            <TextInput
              testID="nickname-input"
              value={nickname}
              onChangeText={(value) => { setNickname(value); setError(''); }}
              placeholder="Your nickname"
              placeholderTextColor={colors.mutedForeground}
              maxLength={24}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={continueToRoom}
              style={[styles.input, { color: colors.foreground }]}
            />
          </GlassPanel>
          <View style={styles.inputMeta}>
            <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
            <Text style={[styles.count, { color: colors.mutedForeground }]}>{nickname.length}/24</Text>
          </View>
        </View>
        <PressableScale testID="continue-button" disabled={saving} onPress={continueToRoom} style={[styles.button, { backgroundColor: colors.primary }]}>
          {saving ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Enter the room</Text>
              <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
            </>
          )}
        </PressableScale>
        <Text style={[styles.privacy, { color: colors.mutedForeground }]}>Your nickname stays on this device until you change it.</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, overflow: 'hidden' },
  orb: { position: 'absolute', top: -190, left: -110 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 28, justifyContent: 'space-between', paddingBottom: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLine: { width: 24, height: 3, borderRadius: 3 },
  brandText: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: 4 },
  copy: { marginTop: 60 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 2, marginBottom: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 43, letterSpacing: -2.3, lineHeight: 46 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, maxWidth: 300, marginTop: 18 },
  inputPanel: { height: 58, justifyContent: 'center', paddingHorizontal: 17 },
  input: { fontFamily: 'Inter_500Medium', fontSize: 16, padding: 0 },
  inputMeta: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 24, paddingTop: 6 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  count: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  button: { height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  privacy: { textAlign: 'center', fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, paddingHorizontal: 30 },
});
