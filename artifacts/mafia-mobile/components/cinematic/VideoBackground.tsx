import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';

type VideoBackgroundProps = {
  /** Result of require('@/assets/videos/xxx.mp4') */
  source: any;
  /** 0..1 darkness of the scrim on top of the video, for text legibility */
  scrimOpacity?: number;
  children?: React.ReactNode;
};

/**
 * Full-bleed looping, muted video used as an atmospheric background layer
 * (e.g. the wolf prowling behind the Home screen) instead of a one-shot
 * intro. Web renders a native <video> tag (autoPlay/loop/muted are the
 * only reliable way to autoplay on web); native renders expo-video's
 * VideoView. A dark gradient scrim sits on top so foreground text stays
 * readable regardless of what's happening in the footage.
 */
export function VideoBackground({ source, scrimOpacity = 0.72, children }: VideoBackgroundProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* @ts-ignore - native HTML video element for web rendering */}
          <video
            src={source}
            autoPlay
            muted
            loop
            playsInline
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
      <NativeVideoLayer source={source} />
      <LinearGradient
        pointerEvents="none"
        colors={[`rgba(10,10,10,${scrimOpacity})`, `rgba(10,10,10,${Math.min(1, scrimOpacity + 0.18)})`]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

function NativeVideoLayer({ source }: { source: any }) {
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
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
