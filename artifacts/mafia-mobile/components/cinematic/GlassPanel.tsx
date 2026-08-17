import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type GlassPanelProps = ViewProps & {
  style?: ViewStyle | ViewStyle[];
  /** hairline border color override */
  borderColor?: string;
  /** background tint override (rgba recommended so the glass reads through) */
  tint?: string;
  radius?: number;
  /** turn off the top sheen highlight */
  noSheen?: boolean;
};

/**
 * Dark glassmorphism surface: translucent charcoal fill + hairline border +
 * a very subtle top-to-bottom sheen. No native blur — the translucency
 * alone is enough to read as "glass" against the near-black backgrounds
 * and is essentially free performance-wise.
 */
export function GlassPanel({ style, borderColor, tint, radius = 20, noSheen, children, ...rest }: GlassPanelProps) {
  return (
    <View
      style={[
        styles.base,
        {
          borderRadius: radius,
          backgroundColor: tint ?? 'rgba(19,17,16,0.72)',
          borderColor: borderColor ?? 'rgba(242,237,226,0.09)',
        },
        style,
      ]}
      {...rest}
    >
      {!noSheen ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(242,237,226,0.05)', 'rgba(242,237,226,0)']}
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1, overflow: 'hidden' },
});

export default GlassPanel;
