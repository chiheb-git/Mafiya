import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';

type GlowOrbProps = {
  size?: number;
  color?: string;
  style?: ViewStyle | ViewStyle[];
  /** 0..1, how visible the glow is at rest */
  baseOpacity?: number;
  /** disable the slow pulse loop */
  static?: boolean;
};

/**
 * Soft radial-looking glow built from three concentric, decreasingly-opaque
 * circles. Avoids native blur (expensive on mid-range Android) and avoids
 * radial-gradient libraries — just layered flat circles, animated with a
 * slow opacity/scale breathing loop via the native driver.
 */
export function GlowOrb({ size = 320, color = '#8A1A1A', style, baseOpacity = 0.16, static: isStatic = false }: GlowOrbProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isStatic) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 3400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 3400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, isStatic]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [baseOpacity, baseOpacity * 1.6] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { width: size, height: size, borderRadius: size / 2, opacity, transform: [{ scale }] },
        styles.wrap,
        style,
      ]}
    >
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.14 }]} />
      <Animated.View style={[styles.ring, { width: size * 0.68, height: size * 0.68, borderRadius: (size * 0.68) / 2, backgroundColor: color, opacity: 0.22 }]} />
      <Animated.View style={[styles.ring, { width: size * 0.36, height: size * 0.36, borderRadius: (size * 0.36) / 2, backgroundColor: color, opacity: 0.3 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
});

export default GlowOrb;
