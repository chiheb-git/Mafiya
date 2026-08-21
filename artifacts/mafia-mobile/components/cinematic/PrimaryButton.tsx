import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { PressableScale } from './PressableScale';
import { BloodDrip } from './BloodDrip';

type Props = {
  testID?: string;
  label: string;
  icon?: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/**
 * The single, consistent "premium" CTA used across the app: blood-red
 * gradient fill, a 1px glass highlight along the top edge, a light sweep
 * that plays once on mount and then repeats sparingly, and a couple of
 * thin blood drips tucked away from the label so they never compete with
 * the text. Every screen's main action button should use this instead of
 * a bespoke button, so the "premium thriller" feel stays identical
 * everywhere rather than drifting screen to screen.
 */
export function PrimaryButton({ testID, label, icon, onPress, disabled, loading }: Props) {
  const colors = useColors();
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      sweep.setValue(0);
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1300,
        delay: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) setTimeout(run, 5400);
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [sweep]);

  const sweepTranslate = sweep.interpolate({ inputRange: [0, 1], outputRange: [-120, 360] });
  const isBusy = Boolean(disabled || loading);

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={isBusy}
      scaleTo={0.98}
      style={[styles.shadowWrap, { opacity: isBusy ? 0.75 : 1 }]}
    >
      <LinearGradient
        colors={[colors.primary, colors.accentSoft ?? colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.button}
      >
        <View pointerEvents="none" style={styles.topHighlight} />
        <Animated.View
          pointerEvents="none"
          style={[styles.sweep, { transform: [{ translateX: sweepTranslate }, { rotate: '20deg' }] }]}
        />
        <BloodDrip
          count={2}
          spanWidth={54}
          dripAreaHeight={32}
          color={colors.accentSoft ?? colors.primary}
          highlightColor="#E8B8A8"
          style={styles.drip}
        />
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <>
            <Text style={[styles.label, { color: colors.primaryForeground }]}>{label}</Text>
            {icon ? <Feather name={icon} size={18} color={colors.primaryForeground} /> : null}
          </>
        )}
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: 16,
    shadowColor: '#8A1A1A',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  button: {
    height: 58,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  sweep: {
    position: 'absolute',
    top: -20,
    width: 36,
    height: 100,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  drip: { position: 'absolute', top: 0, right: 46, zIndex: 1 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});

export default PrimaryButton;