import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassPanel, PressableScale } from '@/components/cinematic';

const MAX_INTRO_MS = 12000;

export default function IntroVideo() {
  const navigated = useRef(false);
  const [soundOn, setSoundOn] = useState(false);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const soundButtonAppear = useRef(new Animated.Value(0)).current;

  const goNext = () => {
    if (navigated.current) return;
    navigated.current = true;
    router.replace('/onboarding' as any);
  };

  useEffect(() => {
    const fallback = setTimeout(goNext, MAX_INTRO_MS);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    Animated.timing(soundButtonAppear, { toValue: 1, duration: 900, delay: 500, useNativeDriver: true }).start();
  }, [soundButtonAppear]);

  const enableSound = () => {
    setSoundOn(true);
    if (Platform.OS === 'web' && webVideoRef.current) {
      webVideoRef.current.muted = false;
    } else if (player) {
      player.muted = false;
    }
  };

  const soundButtonStyle = {
    opacity: soundButtonAppear,
    transform: [{ translateY: soundButtonAppear.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.screen}>
        {/* @ts-ignore - native HTML video element for web rendering */}
        <video
          ref={webVideoRef}
          src={require('@/assets/videos/intro.mp4')}
          autoPlay
          muted
          playsInline
          onEnded={goNext}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(10,10,10,0.55)']} style={styles.bottomScrim} />
        {!soundOn ? (
          <Animated.View style={[styles.soundButtonWrap, soundButtonStyle]}>
            <PressableScale onPress={enableSound} style={styles.soundButtonPressable}>
              <GlassPanel radius={22} style={styles.soundButton} noSheen>
                <Feather name="volume-x" size={15} color="#F2EDE2" />
                <Text style={styles.soundText}>Activer le son</Text>
              </GlassPanel>
            </PressableScale>
          </Animated.View>
        ) : null}
      </View>
    );
  }

  const player = useVideoPlayer(require('@/assets/videos/intro.mp4'), (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.play();
  });

  useEffect(() => {
    const subscription = player.addListener('playToEnd', goNext);
    return () => subscription.remove();
  }, [player]);

  return (
    <View style={styles.screen}>
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(10,10,10,0.55)']} style={styles.bottomScrim} />
      {!soundOn ? (
        <Animated.View style={[styles.soundButtonWrap, soundButtonStyle]}>
          <PressableScale onPress={enableSound} style={styles.soundButtonPressable}>
            <GlassPanel radius={22} style={styles.soundButton} noSheen>
              <Feather name="volume-x" size={15} color="#F2EDE2" />
              <Text style={styles.soundText}>Activer le son</Text>
            </GlassPanel>
          </PressableScale>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  video: { flex: 1 },
  bottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 },
  soundButtonWrap: { position: 'absolute', bottom: 48, alignSelf: 'center' },
  soundButtonPressable: { borderRadius: 22 },
  soundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderColor: 'rgba(242,237,226,0.18)',
  },
  soundText: { color: '#F2EDE2', fontSize: 12, letterSpacing: 0.5, fontFamily: 'Inter_500Medium' },
});
