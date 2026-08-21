import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';

type Drip = { left: number; delay: number; duration: number; length: number; width: number };

type Props = {
  count?: number;
  spanWidth?: number;
  dripAreaHeight?: number;
  color?: string;
  highlightColor?: string;
  style?: ViewStyle;
};

/**
 * A handful of slow, thin blood drips that stretch downward, bead into a
 * drop, fall, and fade â€” then loop. Built from plain Animated.View shapes
 * (no SVG dependency) so it stays cheap and drop-in anywhere. Kept subtle
 * by design: thin strands, dark blood-red, staggered timing â€” a detail,
 * not a special effect.
 */
export function BloodDrip({
  count = 4,
  spanWidth = 200,
  dripAreaHeight = 70,
  color = '#5C1414',
  highlightColor = '#A6242A',
  style,
}: Props) {
  const drips = useRef<Drip[]>(
    Array.from({ length: count }, (_, i) => {
      const slot = spanWidth / count;
      return {
        left: slot * i + slot * 0.5 + (Math.random() - 0.5) * slot * 0.5,
        delay: i * 700 + Math.random() * 500,
        duration: 3400 + Math.random() * 2000,
        length: 16 + Math.random() * 26,
        width: 2 + Math.random() * 1.2,
      };
    }),
  ).current;

  return (
    <View pointerEvents="none" style={[styles.container, { width: spanWidth, height: dripAreaHeight }, style]}>
      {drips.map((drip, i) => (
        <SingleDrip key={i} drip={drip} color={color} highlightColor={highlightColor} />
      ))}
    </View>
  );
}

function SingleDrip({ drip, color, highlightColor }: { drip: Drip; color: string; highlightColor: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(drip.delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: drip.duration,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(600 + Math.random() * 900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, drip]);

  // 0 -> strand grows from nothing; 0.4 -> fully grown, drop starts falling;
  // 1 -> drop has fallen and faded out.
  const strandScale = progress.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });
  const strandOpacity = progress.interpolate({ inputRange: [0, 0.08, 0.85, 1], outputRange: [0, 0.9, 0.9, 0.3] });
  const dropTranslate = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, drip.length * 2.4],
  });
  const dropOpacity = progress.interpolate({
    inputRange: [0, 0.38, 0.46, 0.92, 1],
    outputRange: [0, 0, 1, 1, 0],
  });

  return (
    <View style={[styles.dripSlot, { left: drip.left }]}>
      <Animated.View
        style={[
          styles.strand,
          {
            width: drip.width,
            height: drip.length,
            backgroundColor: color,
            opacity: strandOpacity,
            transform: [{ scaleY: strandScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.drop,
          {
            width: drip.width + 2.5,
            height: drip.width + 2.5,
            backgroundColor: highlightColor,
            top: drip.length - (drip.width + 2.5) / 2,
            opacity: dropOpacity,
            transform: [{ translateY: dropTranslate }, { rotate: '45deg' }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', overflow: 'visible' },
  dripSlot: { position: 'absolute', top: 0, alignItems: 'center' },
  strand: {
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    // @ts-ignore - transformOrigin is supported on recent RN versions
    transformOrigin: 'top',
  },
  drop: {
    position: 'absolute',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    borderBottomLeftRadius: 999,
  },
});

export default BloodDrip;