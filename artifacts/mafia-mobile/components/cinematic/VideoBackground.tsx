import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';

type VideoBackgroundProps = {
  /** Result of require('@/assets/videos/xxx.mp4') */
  source: any;
  /** 0..1 darkness of the scrim on top of the video, for text legibility */
  scrimOpacity?: number;
  /** true (default): loops forever. false: plays once and freezes on the last frame. */
  loop?: boolean;
  children?: React.ReactNode;
};

/**
 * Full-bleed video used as an atmospheric background layer.
 *
 * Web uses a plain HTML5 <video> (the same proven pattern as the intro
 * screen) because it fills the container reliably with objectFit: cover —
 * expo-video's VideoView does not size correctly on web in this project.
 * Native uses expo-video's VideoView. Looping is handled manually via
 * onEnded on web (the native `loop` attribute silently suppresses the
 * `ended` event, so a manual restart is the only reliable cross-browser
 * approach) and via `instance.loop` on native.
 */
export function VideoBackground({ source, scrimOpacity = 0.4, loop = true, children }: VideoBackgroundProps) {
  if (Platform.OS === 'web') {
    const loopHandlers = loop
      ? {
          onEnded: (e: any) => {
            const el = e.currentTarget;
            el.currentTime = 0;
            el.play().catch(() => {});
          },
        }
      : {};

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* @ts-ignore - native HTML video element for web rendering */}
          <video
            src={source}
            autoPlay
            muted
            playsInline
            {...loopHandlers}
            onError={(e: any) => console.warn('[VideoBackground] failed to load', source, e)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <LinearGradient
            colors={[`rgba(10,10,10,${scrimOpacity})`, `rgba(10,10,10,${Math.min(1, scrimOpacity + 0.18)})`]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        {children}
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <NativeVideoLayer source={source} loop={loop} />
      <LinearGradient
        pointerEvents="none"
        colors={[`rgba(10,10,10,${scrimOpacity})`, `rgba(10,10,10,${Math.min(1, scrimOpacity + 0.18)})`]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

function NativeVideoLayer({ source, loop }: { source: any; loop: boolean }) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = loop;
    instance.muted = true;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      pointerEvents="none"
    />
  );
}

export default VideoBackground;
