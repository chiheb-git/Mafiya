import React from 'react';
import { Stack } from 'expo-router';

// IMPORTANT: iOS 26 uses NativeTabs for native tabs with liquid glass support.
// NativeTabs intentionally does NOT use custom design tokens — liquid glass
// is a system-level appearance provided by iOS and cannot be overridden.
// Custom brand colors are applied only on the ClassicTabLayout path (older iOS / Android / web).
export default function TabLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
