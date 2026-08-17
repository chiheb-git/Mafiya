import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle } from 'react-native';

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: ViewStyle | ViewStyle[] | ((state: { pressed: boolean }) => ViewStyle | ViewStyle[]);
  /** how far it sinks in, 0.9–0.99 reads as "premium", never lower */
  scaleTo?: number;
  disabledOpacity?: number;
};

/**
 * Drop-in replacement for the project's `Pressable` + `({ pressed }) =>
 * ({ opacity: pressed ? x : 1 })` pattern. Same API (testID, onPress,
 * disabled, children, style-as-function all still work), but the press
 * feedback is a slow spring scale instead of an instant opacity snap —
 * reads as deliberate/cinematic rather than "cartoon".
 */
export function PressableScale({ style, onPressIn, onPressOut, scaleTo = 0.97, disabled, disabledOpacity = 0.6, children, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = (e: any) => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
    onPressIn?.(e);
  };
  const pressOut = (e: any) => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
    onPressOut?.(e);
  };

  return (
    <Pressable disabled={disabled} onPressIn={pressIn} onPressOut={pressOut} {...rest}>
      {(state) => (
        <Animated.View
          style={[
            { transform: [{ scale }] },
            disabled ? { opacity: disabledOpacity } : null,
            typeof style === 'function' ? style(state) : style,
          ]}
        >
          {typeof children === 'function' ? (children as any)(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}

export default PressableScale;
