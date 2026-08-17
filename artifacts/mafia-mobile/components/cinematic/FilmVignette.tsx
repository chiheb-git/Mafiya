import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type FilmVignetteProps = {
  /** 0..1 overall darkening strength at the edges */
  intensity?: number;
};

/**
 * Cheap vignette: four edge gradients fading to transparent toward the
 * center. Reads as a soft cinematic frame without a native blur pass or a
 * radial-gradient dependency (expo-linear-gradient only draws linear
 * gradients, so we fake "radial" by layering the four edges).
 */
export function FilmVignette({ intensity = 0.55 }: FilmVignetteProps) {
  const dark = `rgba(0,0,0,${intensity})`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[dark, 'transparent']} style={styles.top} />
      <LinearGradient colors={['transparent', dark]} style={styles.bottom} />
      <LinearGradient colors={[dark, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.left} />
      <LinearGradient colors={['transparent', dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.right} />
    </View>
  );
}

const EDGE = 140;

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, height: EDGE },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: EDGE },
  left: { position: 'absolute', top: 0, bottom: 0, left: 0, width: EDGE * 0.7 },
  right: { position: 'absolute', top: 0, bottom: 0, right: 0, width: EDGE * 0.7 },
});

export default FilmVignette;
